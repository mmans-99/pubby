import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { createSession } from '../../src/session/session.ts';
import type { Session, SessionSetup } from '../../src/session/types.ts';
import { chooseReady } from '../../src/ai/moves.ts';
import { act, dealAll, playRound, setupFor } from './helpers.ts';

/** A game played to the results screen of round 1. */
function toResults(n: number, seed: number, waitForAll: boolean | undefined): Session {
  const rng = seededRng(seed);
  const setup: SessionSetup = { ...setupFor(n), ...(waitForAll === undefined ? {} : { waitForAll }) };
  let s = dealAll(createSession(setup, rng).session, rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  return playRound(s, rng);
}

test('waitForAll off (one phone): advance works with nobody ready, as before', () => {
  const rng = seededRng(31);
  const s = toResults(4, 31, false);
  assert.equal(s.phase, 'results');
  assert.equal(s.ready.length, 0);
  assert.equal(act(s, { type: 'advance', by: 'p1' }, rng).round, 2);
});

test('waitForAll on: advance fails and names everyone not ready', () => {
  const rng = seededRng(32);
  let s = toResults(3, 32, true);
  assert.throws(() => act(s, { type: 'advance', by: 'p1' }, rng), /Waiting for Player 1, Player 2 and Player 3/);
  s = act(s, { type: 'readyUp', by: 'p2' }, rng);
  assert.throws(() => act(s, { type: 'advance', by: 'p1' }, rng), /Waiting for Player 1 and Player 3/);
});

test('waitForAll on: works once every player is ready', () => {
  const rng = seededRng(33);
  let s = toResults(3, 33, true);
  for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  assert.equal(act(s, { type: 'advance', by: 'p1' }, rng).round, 2);
});

test('waitForAll on: the host can ready and advance (two actions, as the one-tap button sends)', () => {
  const rng = seededRng(34);
  let s = toResults(2, 34, true);
  s = act(s, { type: 'readyUp', by: 'p2' }, rng);
  s = act(s, { type: 'readyUp', by: 'p1' }, rng);
  assert.equal(act(s, { type: 'advance', by: 'p1' }, rng).round, 2);
});

test('waitForAll on: End the game is never held', () => {
  const rng = seededRng(35);
  const s = toResults(3, 35, true);
  assert.equal(s.ready.length, 0);
  assert.equal(act(s, { type: 'endSession', by: 'p1' }, rng).phase, 'gameOver');
});

test('after the next round the ready list is empty again', () => {
  const rng = seededRng(36);
  let s = toResults(3, 36, true);
  for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  assert.deepEqual(s.ready, []);
});

test('computer player: on results it readies itself', () => {
  const s = toResults(3, 37, true);
  const seen = { me: 'p2', view: s.order.length ? { phase: 'results', players: [{ id: 'p2', ready: false }] } : null } as never;
  assert.deepEqual(chooseReady(seen), { type: 'readyUp', by: 'p2' });
});
