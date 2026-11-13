import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_CHARS, encodeParts, Rejoin } from '../../src/net/chunk.ts';

/** Sends every text through a Rejoin, the way a link receives them. */
function receive(texts: string[]): unknown[] {
  const r = new Rejoin();
  const out: unknown[] = [];
  for (const t of texts) {
    const m = r.take(JSON.parse(t));
    if (m !== null) out.push(m);
  }
  return out;
}

test('a short message is sent as its JSON text, in one piece', () => {
  const msg = { t: 'ping' };
  assert.deepEqual(encodeParts(msg, CHUNK_CHARS, 1), [JSON.stringify(msg)]);
  assert.deepEqual(receive(encodeParts(msg, CHUNK_CHARS, 1)), [msg]);
});

test('a long message is split into parts and put back together (Nearby size)', () => {
  const msg = { t: 'game', text: 'x'.repeat(CHUNK_CHARS * 3 + 17) };
  const parts = encodeParts(msg, CHUNK_CHARS, 7);
  assert.equal(parts.length, 4);
  assert.deepEqual(receive(parts), [msg]);
});

test('online-size parts keep their order and their message', () => {
  const big = { a: Array.from({ length: 5000 }, (_, i) => ({ i, s: 'q"uo\\te' })) };
  const small = { t: 'ping' };
  const parts = encodeParts(big, 4000, 2);
  assert.ok(parts.length > 1);
  assert.deepEqual(receive([...parts, JSON.stringify(small)]), [big, small]);
});

test('a part out of order starts the message again', () => {
  const msg = { t: 'game', text: 'y'.repeat(100) };
  const parts = encodeParts(msg, 40, 3);
  const p0 = parts[0]!, p1 = parts[1]!, p2 = parts[2]!;
  const rest = parts.slice(3);
  assert.ok(rest.length >= 1);
  // Part 1 arrives before part 0: dropped, and the whole message sent after it still gets through.
  assert.deepEqual(receive([p1, ...parts]), [msg]);
  // A gap (part 2 straight after part 0) starts over and delivers nothing.
  assert.deepEqual(receive([p0, p2, ...rest]), []);
});

test('text that is not a part passes straight through', () => {
  const r = new Rejoin();
  assert.deepEqual(r.take({ t: 'lobby', you: 'host' }), { t: 'lobby', you: 'host' });
  assert.equal(r.take('hello'), 'hello');
});

test('a bad part is refused and does not break the next message', () => {
  const r = new Rejoin();
  assert.equal(r.take({ '~part': 1, i: 0, n: 2, d: 5 }), null);
  assert.deepEqual(r.take({ t: 'after' }), { t: 'after' });
});
