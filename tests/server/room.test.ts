import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore, LIMITS, type Effect } from '../../server/src/core/room.ts';
import { frame, FRAME_MAX } from '../../src/net/relayproto.ts';

const T0 = 1_000_000_000;
const MIN = 60_000;
const HOST = 'HOSTTOKEN_0000000000AA';
const PASS = 'PASSHASH';
const settings = { roomId: 'k7m2xq9p', name: 'Cat table', hostName: 'Cat', version: '2.17', passHash: PASS, createdAt: T0 };

const sent = (e: Effect[], sock: string): string[] =>
  e.flatMap((x) => ('send' in x && x.send === sock ? [x.text] : []));
const closedWith = (e: Effect[], sock: string): { code: number; reason: string } | undefined => {
  const hit = e.find((x) => 'close' in x && x.close === sock);
  return hit && 'close' in hit ? { code: hit.code, reason: hit.reason } : undefined;
};
const has = (e: Effect[], kind: 'save' | 'forget'): boolean => e.some((x) => kind in x);

/** A room with the host connected on socket "h1". */
function roomWithHost(now = T0) {
  const { core } = RoomCore.create(settings, HOST, now);
  core.connect(HOST, 'h1', now);
  return core;
}
function joinOk(core: RoomCore, ip: string, now: number): string {
  const r = core.tryPasscode(ip, PASS, '2.17', now);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no token');
  return r.joinToken;
}

test('create: the room is listed at once with one seat, and it expires after the idle time', () => {
  const { effects } = RoomCore.create(settings, HOST, T0);
  const list = effects.find((x) => 'list' in x);
  assert.deepEqual(list, {
    list: { roomId: 'k7m2xq9p', name: 'Cat table', hostName: 'Cat', seats: 1, maxSeats: 8, version: '2.17', createdAt: T0 },
  });
  assert.ok(has(effects, 'save'));
  assert.deepEqual(effects.find((x) => 'alarm' in x), { alarm: T0 + LIMITS.idleMs });
});

test('tryPasscode: right passcode gives a join token; wrong passcode and version are refused', () => {
  const core = roomWithHost();
  assert.equal(core.tryPasscode('a', PASS, '2.17', T0).ok, true);
  const wrong = core.tryPasscode('a', 'NOPE', '2.17', T0);
  assert.deepEqual(wrong.ok === false && wrong.error, 'wrong-passcode');
  const version = core.tryPasscode('a', PASS, '2.16', T0);
  assert.deepEqual(version.ok === false && version.error, 'version');
  assert.deepEqual(version.ok === false && version.need, '2.17');
});

test('wrong passcodes: 5 per address in 5 minutes, then even the right one is refused until the window passes', () => {
  const core = roomWithHost();
  for (let i = 0; i < 5; i++) core.tryPasscode('1.2.3.4', 'NOPE', '2.17', T0);
  const blocked = core.tryPasscode('1.2.3.4', PASS, '2.17', T0 + 1000);
  assert.equal(blocked.ok === false && blocked.error, 'too-many-tries');
  assert.equal(core.tryPasscode('5.6.7.8', PASS, '2.17', T0 + 1000).ok, true, 'another address is not blocked');
  assert.equal(core.tryPasscode('1.2.3.4', PASS, '2.17', T0 + 5 * MIN).ok, true, 'the window has passed');
});

test('wrong passcodes: 20 per room in 10 minutes, from any addresses', () => {
  const core = roomWithHost();
  for (let i = 0; i < 20; i++) core.tryPasscode(`ip${i}`, 'NOPE', '2.17', T0);
  const blocked = core.tryPasscode('new', PASS, '2.17', T0);
  assert.equal(blocked.ok === false && blocked.error, 'too-many-tries');
});

test('full at 8 seats: the host plus 7, counting join tokens that no phone has used yet', () => {
  const core = roomWithHost();
  for (let i = 0; i < 7; i++) joinOk(core, `ip${i}`, T0);
  const r = core.tryPasscode('x', PASS, '2.17', T0);
  assert.equal(r.ok === false && r.error, 'full');
  // An unused token expires after 2 minutes, which frees its seat.
  assert.equal(core.tryPasscode('x', PASS, '2.17', T0 + LIMITS.tokenMs).ok, true);
});

test('started: no new joins, and the room leaves the list', () => {
  const core = roomWithHost();
  const r = core.frame('h1', frame({ c: 'update', seats: 2, started: true }), T0);
  assert.deepEqual(r.find((x) => 'list' in x), { list: null });
  const t = core.tryPasscode('a', PASS, '2.17', T0);
  assert.equal(t.ok === false && t.error, 'started');
});

test('the host connects and gets ready and the list entry', () => {
  const { core } = RoomCore.create(settings, HOST, T0);
  const r = core.connect(HOST, 'h1', T0);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(sent(r.effects, 'h1'), [frame({ c: 'ready', roomId: 'k7m2xq9p' })]);
  assert.ok(r.effects.some((x) => 'list' in x && x.list !== null));
});

test('a phone joins with its token: ready gets link o1, and the host is told it joined', () => {
  const core = roomWithHost();
  const token = joinOk(core, 'a', T0);
  const r = core.connect(token, 'j1', T0 + 1000);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(sent(r.effects, 'j1'), [frame({ c: 'ready', link: 'o1' })]);
  assert.deepEqual(sent(r.effects, 'h1'), [frame({ c: 'joined', link: 'o1' })]);
});

test('unknown tokens, kicked tokens and unused tokens after 2 minutes are refused with 4003', () => {
  const core = roomWithHost();
  assert.deepEqual(core.connect('nope', 'x', T0), { ok: false, code: 4003, reason: 'not-allowed' });
  const late = joinOk(core, 'a', T0);
  assert.equal(core.connect(late, 'j1', T0 + LIMITS.tokenMs).ok, false);
  const token = joinOk(core, 'b', T0);
  core.connect(token, 'j2', T0);
  core.frame('h1', frame({ c: 'kick', link: 'o1' }), T0);
  assert.equal(core.connect(token, 'j3', T0).ok, false);
});

test('a token issued before the game started cannot connect after it', () => {
  const core = roomWithHost();
  const token = joinOk(core, 'a', T0);
  core.frame('h1', frame({ c: 'update', seats: 2, started: true }), T0);
  assert.equal(core.connect(token, 'j1', T0).ok, false);
});

test('relay both ways: the payload reaches the other side byte for byte, newlines included', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  const payload = '{"t":"game"}\nline two\n\nline four';
  const down = core.frame('h1', frame({ c: 'to', to: 'o1' }, payload), T0);
  assert.deepEqual(sent(down, 'j1'), [frame({ c: 'down' }, payload)]);
  const up = core.frame('j1', frame({ c: 'up' }, payload), T0);
  assert.deepEqual(sent(up, 'h1'), [frame({ c: 'from', from: 'o1' }, payload)]);
});

test('a 200,000-character payload with newlines is passed on whole', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  const payload = 'x\n'.repeat(100_000);
  const down = core.frame('h1', frame({ c: 'to', to: 'o1' }, payload), T0);
  assert.deepEqual(sent(down, 'j1'), [frame({ c: 'down' }, payload)]);
});

test('"to" an absent link is dropped without an error', () => {
  const core = roomWithHost();
  assert.deepEqual(core.frame('h1', frame({ c: 'to', to: 'o9' }, 'x'), T0).filter((x) => 'close' in x), []);
});

test('kick: the phone gets "kicked" and its socket is closed 4001; its token is refused after that', () => {
  const core = roomWithHost();
  const token = joinOk(core, 'a', T0);
  core.connect(token, 'j1', T0);
  const e = core.frame('h1', frame({ c: 'kick', link: 'o1' }), T0);
  assert.deepEqual(sent(e, 'j1'), [frame({ c: 'kicked' })]);
  assert.deepEqual(closedWith(e, 'j1'), { code: 4001, reason: 'kicked' });
  assert.equal(core.connect(token, 'j2', T0 + 1).ok, false);
});

test('close: every phone gets "closed", every socket closes, the room leaves the list and is forgotten', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  const e = core.frame('h1', frame({ c: 'close' }), T0);
  assert.deepEqual(sent(e, 'j1'), [frame({ c: 'closed' })]);
  assert.deepEqual(closedWith(e, 'j1'), { code: 1000, reason: 'closed' });
  assert.deepEqual(closedWith(e, 'h1'), { code: 1000, reason: 'closed' });
  assert.ok(e.some((x) => 'list' in x && x.list === null));
  assert.ok(has(e, 'forget'));
  const after = core.tryPasscode('a', PASS, '2.17', T0);
  assert.equal(after.ok === false && after.error, 'no-room');
});

test('the host drops and comes back inside the grace time: joiners see host-gone, then the room is back', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  const gone = core.closed('h1', T0 + 5000);
  assert.deepEqual(sent(gone, 'j1'), [frame({ c: 'host-gone' })]);
  // CODE.md 9u A4.2: the room stays on the list, marked away.
  assert.ok(gone.some((x) => 'list' in x && x.list?.away === true));
  const back = core.connect(HOST, 'h2', T0 + 10_000);
  assert.equal(back.ok, true);
  if (back.ok) assert.ok(back.effects.some((x) => 'list' in x && x.list !== null));
});

test('the room waits out the host grace time, then closes', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  core.closed('h1', T0);
  const early = core.alarm(T0 + LIMITS.hostGraceMs - 1);
  assert.deepEqual(early, [{ alarm: T0 + LIMITS.hostGraceMs }]);
  const late = core.alarm(T0 + LIMITS.hostGraceMs);
  assert.deepEqual(sent(late, 'j1'), [frame({ c: 'closed' })]);
  assert.ok(has(late, 'forget'));
});

test('an idle room (no message at all for 30 minutes) closes; a busy one does not', () => {
  const idle = roomWithHost();
  assert.deepEqual(idle.alarm(T0 + LIMITS.idleMs - 1), [{ alarm: T0 + LIMITS.idleMs }]);
  assert.ok(has(idle.alarm(T0 + LIMITS.idleMs), 'forget'));

  const busy = roomWithHost();
  busy.frame('h1', frame({ c: 'update', seats: 1, started: false }), T0 + 29 * MIN);
  assert.deepEqual(busy.alarm(T0 + LIMITS.idleMs), [{ alarm: T0 + 29 * MIN + LIMITS.idleMs }]);
});

test('a room closes 12 hours after it was made, even while messages flow', () => {
  const core = roomWithHost();
  for (let t = T0; t < T0 + LIMITS.maxAgeMs; t += 10 * MIN) {
    core.frame('h1', frame({ c: 'update', seats: 1, started: false }), t);
  }
  assert.ok(has(core.alarm(T0 + LIMITS.maxAgeMs), 'forget'));
});

test('bad frames: the sender is closed 4002; a frame over FRAME_MAX is closed 1009', () => {
  const core = roomWithHost();
  const token = joinOk(core, 'a', T0);
  core.connect(token, 'j1', T0);
  assert.deepEqual(closedWith(core.frame('h1', 'hello without newline', T0), 'h1'), { code: 4002, reason: 'bad-frame' });
  assert.deepEqual(closedWith(core.frame('j1', frame({ c: 'to', to: 'o1' }), T0), 'j1'), { code: 4002, reason: 'bad-frame' });
  assert.deepEqual(closedWith(core.frame('j1', 'ping', T0), 'j1'), { code: 4002, reason: 'bad-frame' });
  assert.deepEqual(closedWith(core.frame('h1', frame({ c: 'update', seats: 99, started: false }), T0), 'h1'), { code: 4002, reason: 'bad-frame' });
  assert.deepEqual(closedWith(core.frame('j1', 'x'.repeat(FRAME_MAX + 1), T0), 'j1'), { code: 1009, reason: 'too-big' });
});

test('a second host socket replaces the first; the old one closing does not look like a drop', () => {
  const core = roomWithHost();
  const e = core.connect(HOST, 'h2', T0 + 1);
  assert.equal(e.ok, true);
  if (e.ok) assert.deepEqual(closedWith(e.effects, 'h1'), { code: 4000, reason: 'replaced' });
  assert.deepEqual(core.closed('h1', T0 + 2), []);
  assert.deepEqual(core.frame('h2', frame({ c: 'update', seats: 1, started: false }), T0 + 3).filter((x) => 'list' in x).length, 1);
});

test('a phone that drops and rejoins with its token keeps its link id', () => {
  const core = roomWithHost();
  const token = joinOk(core, 'a', T0);
  core.connect(token, 'j1', T0);
  assert.deepEqual(sent(core.closed('j1', T0 + 1), 'h1'), [frame({ c: 'left', link: 'o1' })]);
  const again = core.connect(token, 'j2', T0 + 2);
  assert.equal(again.ok, true);
  if (again.ok) {
    assert.deepEqual(sent(again.effects, 'j2'), [frame({ c: 'ready', link: 'o1' })]);
    assert.deepEqual(sent(again.effects, 'h1'), [frame({ c: 'joined', link: 'o1' })]);
  }
});

test('toJSON and fromJSON in the middle of a game keep link ids, tokens and routing', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  const back = RoomCore.fromJSON(JSON.parse(JSON.stringify(core.toJSON())));
  const down = back.frame('h1', frame({ c: 'to', to: 'o1' }, 'hi'), T0 + 1);
  assert.deepEqual(sent(down, 'j1'), [frame({ c: 'down' }, 'hi')]);
  const second = joinOk(back, 'b', T0 + 2);
  const r = back.connect(second, 'j2', T0 + 3);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(sent(r.effects, 'j2'), [frame({ c: 'ready', link: 'o2' })]);
});

test('a socket the room does not know about is closed 4002', () => {
  const core = roomWithHost();
  assert.deepEqual(core.frame('nobody', frame({ c: 'up' }), T0), [{ close: 'nobody', code: 4002, reason: 'bad-frame' }]);
});

test('lastActive is saved at most once a minute while messages flow', () => {
  const core = roomWithHost();
  // "to" an absent link does nothing else, so any save comes from lastActive.
  const msg = frame({ c: 'to', to: 'o9' }, 'x');
  assert.equal(has(core.frame('h1', msg, T0 + 1000), 'save'), false);
  assert.equal(has(core.frame('h1', msg, T0 + MIN), 'save'), true);
  assert.equal(has(core.frame('h1', msg, T0 + MIN + 1000), 'save'), false);
});

// ---- CODE.md 9u Part A4 (2.25): a host who steps away keeps the room; joiners wait for it.

test('the host drops: the room stays listed, marked away, and joining still works', () => {
  const core = roomWithHost();
  const gone = core.closed('h1', T0 + 5000);
  assert.ok(gone.some((x) => 'list' in x && x.list?.away === true));
  const t = core.tryPasscode('a', PASS, '2.17', T0 + 6000);
  assert.equal(t.ok, true);
});

test('the host comes back: every phone gets joined for its link, and host-back', () => {
  const core = roomWithHost();
  core.connect(joinOk(core, 'a', T0), 'j1', T0);
  core.closed('h1', T0 + 5000);
  const back = core.connect(HOST, 'h2', T0 + 10_000);
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.deepEqual(sent(back.effects, 'h2').filter((s) => s.includes('"joined"')), [frame({ c: 'joined', link: 'o1' })]);
  assert.deepEqual(sent(back.effects, 'j1'), [frame({ c: 'host-back' })]);
  assert.ok(back.effects.some((x) => 'list' in x && x.list?.away !== true));
});

test('a phone that joins while the host is away is told host-gone and waits', () => {
  const core = roomWithHost();
  core.closed('h1', T0 + 5000);
  const token = joinOk(core, 'a', T0 + 6000);
  const r = core.connect(token, 'j1', T0 + 6000);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(sent(r.effects, 'j1'), [frame({ c: 'ready', link: 'o1' }), frame({ c: 'host-gone' })]);
});
