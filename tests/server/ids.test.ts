import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoomId, makeToken, passcodeHash, ROOM_ID_ALPHABET, ROOM_ID_LENGTH } from '../../server/src/core/ids.ts';
import { cleanText, originCheck, parseCreate, parseJoin, validPasscode, validVersion } from '../../server/src/core/api.ts';
import { RELAY_PROTOCOL } from '../../src/net/relayproto.ts';

test('room ids: 8 characters, no 0, 1, i, l or o, and no repeats in a small sample', () => {
  assert.equal(ROOM_ID_ALPHABET.length, 31);
  for (const ch of '01ilo') assert.equal(ROOM_ID_ALPHABET.includes(ch), false, `no ${ch}`);
  const ids = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = makeRoomId();
    assert.equal(id.length, ROOM_ID_LENGTH);
    for (const ch of id) assert.ok(ROOM_ID_ALPHABET.includes(ch), `${ch} is allowed`);
    ids.add(id);
  }
  assert.equal(ids.size, 2000);
});

test('tokens: 22 base64url characters, different each time', () => {
  const a = makeToken();
  const b = makeToken();
  assert.equal(a.length, 22);
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
});

test('passcode hash: 64 hex characters, the same for the same room and code, different per room', async () => {
  const h = await passcodeHash('k7m2xq9p', '1234');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await passcodeHash('k7m2xq9p', '1234'), h);
  assert.notEqual(await passcodeHash('k7m2xq9p', '1235'), h);
  assert.notEqual(await passcodeHash('other', '1234'), h, 'the same code in another room hashes differently');
});

test('cleanText: trims, removes control characters, and refuses empty or too long text', () => {
  assert.equal(cleanText('  Cat\u0007 table  ', 20), 'Cat table');
  assert.equal(cleanText('   ', 20), null);
  assert.equal(cleanText('x'.repeat(21), 20), null);
  assert.equal(cleanText('x'.repeat(20), 20), 'x'.repeat(20));
  assert.equal(cleanText(42, 20), null);
});

test('passcode and version formats', () => {
  assert.equal(validPasscode('0042'), true);
  assert.equal(validPasscode('042'), false);
  assert.equal(validPasscode('12a4'), false);
  assert.equal(validVersion('2.17'), true);
  assert.equal(validVersion('2'), false);
  assert.equal(validVersion('2.17.1'), false);
});

test('parseCreate: a good body passes; each bad field gives its error', () => {
  const good = { protocol: RELAY_PROTOCOL, name: "Cat's table", passcode: '4821', hostName: 'Cat', version: '2.17' };
  assert.deepEqual(parseCreate(good), { ok: true, value: { name: "Cat's table", hostName: 'Cat', passcode: '4821', version: '2.17' } });
  assert.deepEqual(parseCreate({ ...good, protocol: 99 }), { ok: false, error: 'protocol' });
  assert.deepEqual(parseCreate({ ...good, name: '' }), { ok: false, error: 'bad-name' });
  assert.deepEqual(parseCreate({ ...good, name: 'x'.repeat(21) }), { ok: false, error: 'bad-name' });
  assert.deepEqual(parseCreate({ ...good, hostName: 'y'.repeat(17) }), { ok: false, error: 'bad-name' });
  assert.deepEqual(parseCreate({ ...good, passcode: '123' }), { ok: false, error: 'bad-passcode' });
  assert.deepEqual(parseCreate({ ...good, version: 'two' }), { ok: false, error: 'bad-request' });
  assert.deepEqual(parseCreate('not an object'), { ok: false, error: 'bad-request' });
});

test('parseJoin: checks the protocol, version and passcode', () => {
  assert.deepEqual(parseJoin({ protocol: RELAY_PROTOCOL, passcode: '1234', version: '2.17' }), {
    ok: true, value: { passcode: '1234', version: '2.17' },
  });
  assert.deepEqual(parseJoin({ protocol: 0, passcode: '1234', version: '2.17' }), { ok: false, error: 'protocol' });
  assert.deepEqual(parseJoin({ protocol: RELAY_PROTOCOL, passcode: 'abcd', version: '2.17' }), { ok: false, error: 'bad-passcode' });
  assert.deepEqual(parseJoin(null), { ok: false, error: 'bad-request' });
});

test('originCheck: no Origin is fine; a listed Origin is allowed; any other is refused', () => {
  const allowed = ['https://mmans-99.github.io'];
  assert.equal(originCheck(null, allowed), 'none');
  assert.equal(originCheck('https://mmans-99.github.io', allowed), 'allowed');
  assert.equal(originCheck('https://evil.example', allowed), 'refused');
});
