// 9ak.3 (2.37): a player can take back "I'm ready" on the results screen, until the host moves on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { createSession } from '../../src/session/session.ts';
import type { Session, SessionSetup } from '../../src/session/types.ts';
import { phoneActions } from '../../src/net/netgame.ts';
import { act, dealAll, playRound, setupFor, startedRound } from './helpers.ts';

/** A game played to the results screen of round 1, with the wait-for-everyone rule on. */
function toResults(n: number, seed: number): Session {
  const rng = seededRng(seed);
  const setup: SessionSetup = { ...setupFor(n), waitForAll: true };
  let s = dealAll(createSession(setup, rng).session, rng);
  s = startedRound(s, rng, 'p1');
  return playRound(s, rng);
}

test('unready removes a ready player from the ready list', () => {
  const rng = seededRng(41);
  let s = toResults(3, 41);
  s = act(s, { type: 'readyUp', by: 'p2' }, rng);
  assert.deepEqual(s.ready, ['p2']);
  s = act(s, { type: 'unready', by: 'p2' }, rng);
  assert.deepEqual(s.ready, []);
});

test('unready when not ready is a no-op', () => {
  const rng = seededRng(42);
  const s = toResults(3, 42);
  assert.deepEqual(act(s, { type: 'unready', by: 'p2' }, rng), s);
});

test('the host cannot unready: the host starts the next round', () => {
  const rng = seededRng(43);
  let s = toResults(3, 43);
  s = act(s, { type: 'readyUp', by: 'p1' }, rng);
  assert.throws(() => act(s, { type: 'unready', by: 'p1' }, rng), /The host starts the next round/);
});

test('unready is refused outside the results screen', () => {
  const rng = seededRng(44);
  const s = dealAll(createSession(setupFor(3), rng).session, rng);
  assert.throws(() => act(s, { type: 'unready', by: 'p2' }, rng));
});

test('after an unready, advance waits for everyone again', () => {
  const rng = seededRng(45);
  let s = toResults(3, 45);
  for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  s = act(s, { type: 'unready', by: 'p3' }, rng);
  assert.throws(() => act(s, { type: 'advance', by: 'p1' }, rng), /Waiting for Player 3/);
  s = act(s, { type: 'readyUp', by: 'p3' }, rng);
  assert.equal(act(s, { type: 'advance', by: 'p1' }, rng).round, 2);
});

test('a phone may send unready for itself, never for someone else', () => {
  assert.deepEqual(phoneActions([{ type: 'unready', by: 'p2' }], 'p2'), { actions: [{ type: 'unready', by: 'p2' }] });
  assert.ok('why' in phoneActions([{ type: 'unready', by: 'p1' }], 'p2'));
});
