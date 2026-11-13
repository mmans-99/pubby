/** Scroll places (CODE.md 9aa Part A, 2.31). Pure: screenKey has no DOM, so no browser is needed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenKey } from '../../src/ui/scrollkeep.ts';

/** A game screen in a given phase and round, with the extra fields the real state has (ready players, votes). */
function game(phase: string, round: number, extra: Record<string, unknown> = {}) {
  return { screen: 'game', game: { session: { phase, round, ...extra } } };
}

test('screenKey: the same key while only the contents change (ready-ups, votes, moves)', () => {
  const before = game('results', 1, { ready: ['a'], vote: null });
  const after = game('results', 1, { ready: ['a', 'b'], vote: { kind: 'reshuffle' } });
  assert.equal(screenKey(before), screenKey(after));
});

test('screenKey: a new key when the phase or the round changes, so the screen opens at the top', () => {
  assert.notEqual(screenKey(game('results', 1)), screenKey(game('playing', 1)));
  assert.notEqual(screenKey(game('results', 1)), screenKey(game('results', 2)));
});

test('screenKey: a new key when the screen changes', () => {
  assert.notEqual(screenKey(game('results', 1)), screenKey({ screen: 'home', game: null }));
  assert.equal(screenKey({ screen: 'home', game: null }), 'home');
  assert.equal(screenKey({ screen: 'setup' }), 'setup');
});
