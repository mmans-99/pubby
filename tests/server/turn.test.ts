import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, dropPort53, relayLogin, turnAnswer, stunOnly, TURN_MONTHLY_LIMIT, TURN_TTL_S, type FetchLike } from '../../server/src/core/turn.ts';
import { DirectoryCore } from '../../server/src/core/directory.ts';
import { RoomCore } from '../../server/src/core/room.ts';

const NOV = Date.UTC(2026, 10, 19, 12, 0, 0);
const DEC = Date.UTC(2026, 11, 1, 0, 0, 0);
const HOST = 'HOSTTOKEN_0000000000AA';
const PASS = 'PASSHASH';
const settings = { roomId: 'k7m2xq9p', name: 'Cat table', hostName: 'Cat', version: '3.0.0', passHash: PASS, createdAt: NOV };

/** A fake fetch that answers with `body` (or fails) and records what it was asked. */
function fakeFetch(body: unknown, ok = true) {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok, json: async () => body };
  };
  return { fn, calls };
}

test('monthKey: the calendar month in UTC, zero-padded', () => {
  assert.equal(monthKey(NOV), '2026-11');
  assert.equal(monthKey(DEC), '2026-12');
  assert.equal(monthKey(Date.UTC(2027, 0, 1)), '2027-01');
});

test('dropPort53: URLs on port 53 are removed, others kept', () => {
  const out = dropPort53([
    { urls: ['turn:turn.example.com:53?transport=udp', 'turn:turn.example.com:3478?transport=udp'], username: 'u', credential: 'c' },
    { urls: 'turns:turn.example.com:53?transport=tcp' },
    { urls: 'stun:stun.example.com:3478' },
  ]);
  assert.deepEqual(out, [
    { urls: 'turn:turn.example.com:3478?transport=udp', username: 'u', credential: 'c' },
    { urls: 'stun:stun.example.com:3478' },
  ]);
});

test('dropPort53: accepts one server, not only a list', () => {
  assert.deepEqual(dropPort53({ urls: 'stun:a.example.com:3478' }), [{ urls: 'stun:a.example.com:3478' }]);
  assert.deepEqual(dropPort53(undefined), []);
});

test('relayLogin: asks Cloudflare with the key, the token and a 3-hour ttl, then returns the servers', async () => {
  const { fn, calls } = fakeFetch({ iceServers: [{ urls: ['turn:t.example.com:3478'], username: 'u', credential: 'c' }] });
  const answer = await relayLogin('KEY1', 'API_SECRET', fn);
  assert.equal(answer.relay, true);
  assert.deepEqual(answer.iceServers, [{ urls: 'turn:t.example.com:3478', username: 'u', credential: 'c' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://rtc.live.cloudflare.com/v1/turn/keys/KEY1/credentials/generate-ice-servers');
  assert.equal(calls[0]?.init.method, 'POST');
  assert.equal(calls[0]?.init.headers['Authorization'], 'Bearer API_SECRET');
  assert.equal(JSON.parse(calls[0]?.init.body ?? '{}').ttl, TURN_TTL_S);
  assert.equal(TURN_TTL_S, 10800);
});

test('relayLogin: a failed call, a bad answer or a thrown error gives STUN only', async () => {
  assert.deepEqual(await relayLogin('K', 'A', fakeFetch({}, false).fn), stunOnly());
  assert.deepEqual(await relayLogin('K', 'A', fakeFetch({ iceServers: [] }).fn), stunOnly());
  const boom: FetchLike = async () => { throw new Error('network'); };
  assert.deepEqual(await relayLogin('K', 'A', boom), stunOnly());
});

test('relayLogin: only port-53 URLs left gives STUN only', async () => {
  const { fn } = fakeFetch({ iceServers: [{ urls: 'turn:t.example.com:53' }] });
  assert.equal((await relayLogin('K', 'A', fn)).relay, false);
});

test('turnAnswer: no secrets → STUN only, and the credit is not used', async () => {
  let taken = 0;
  const credit = async () => { taken += 1; return true; };
  const { fn, calls } = fakeFetch({});
  assert.deepEqual(await turnAnswer(undefined, 'A', credit, fn), stunOnly());
  assert.deepEqual(await turnAnswer('K', undefined, credit, fn), stunOnly());
  assert.equal(taken, 0);
  assert.equal(calls.length, 0);
});

test('turnAnswer: credit used up → STUN only, without calling Cloudflare', async () => {
  const { fn, calls } = fakeFetch({ iceServers: [{ urls: 'turn:t.example.com:3478' }] });
  assert.deepEqual(await turnAnswer('K', 'A', async () => false, fn), stunOnly());
  assert.equal(calls.length, 0);
});

test('turnAnswer: credit given and secrets set → the relay answer', async () => {
  const { fn } = fakeFetch({ iceServers: [{ urls: 'turn:t.example.com:3478', username: 'u', credential: 'c' }] });
  const answer = await turnAnswer('K', 'A', async () => true, fn);
  assert.equal(answer.relay, true);
});

test('monthly cap: the 3001st credit in a month is refused, and the next month works again', () => {
  const d = new DirectoryCore();
  for (let i = 0; i < TURN_MONTHLY_LIMIT; i++) assert.equal(d.takeTurnCredit('2026-11', TURN_MONTHLY_LIMIT), true, `credit ${i + 1}`);
  assert.equal(d.takeTurnCredit('2026-11', TURN_MONTHLY_LIMIT), false, 'the 3001st');
  assert.equal(d.takeTurnCredit('2026-12', TURN_MONTHLY_LIMIT), true, 'a new month starts at zero');
});

test('monthly cap: the count survives a save and reload, and only the current month is kept', () => {
  const d = new DirectoryCore();
  assert.equal(d.takeTurnCredit('2026-11', 2), true);
  assert.equal(d.takeTurnCredit('2026-11', 2), true);
  const back = DirectoryCore.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.equal(back.takeTurnCredit('2026-11', 2), false, 'two used, still in November');
  assert.equal(back.takeTurnCredit('2026-12', 2), true);
  assert.equal(back.takeTurnCredit('2026-11', 2), true, 'November is forgotten once December starts');
});

test('a credit does not mark the room list as changed', () => {
  const d = new DirectoryCore();
  d.takeTurnCredit('2026-11', TURN_MONTHLY_LIMIT);
  assert.equal(d.changed(), false);
});

test('an old stored directory with no turn counts still loads', () => {
  const back = DirectoryCore.fromJSON({ entries: [], reserved: [], makes: [] });
  assert.equal(back.takeTurnCredit('2026-11', 1), true);
});

test('knowsToken: the host token always; a join token while young or in use; never a kicked one; never a stranger', () => {
  const { core } = RoomCore.create(settings, HOST, NOV);
  assert.equal(core.knowsToken(HOST, NOV), true);
  assert.equal(core.knowsToken('NOT_A_TOKEN', NOV), false);
  const r = core.tryPasscode('1.1.1.1', PASS, '3.0.0', NOV);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(core.knowsToken(r.joinToken, NOV + 1000), true, 'young and unused');
  assert.equal(core.knowsToken(r.joinToken, NOV + 10 * 60_000), false, 'unused and old: expired');
  core.connect(r.joinToken, 's1', NOV + 2000);
  assert.equal(core.knowsToken(r.joinToken, NOV + 20 * 60_000), true, 'in use: stays valid');
});

test('knowsToken: a room that has no core is refused', () => {
  const { core } = RoomCore.create(settings, HOST, NOV);
  assert.equal(core.knowsToken('', NOV), false);
});

test('stunOnly: the answer is the Cloudflare STUN server, and not a relay', () => {
  assert.deepEqual(stunOnly(), { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relay: false });
});
