// CODE.md 9an.6 (2.38, Part F-1): the felt's trick is rebuilt from the session's plays.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trickFromPlay } from '../../src/ui/cards.ts';
import type { Card } from '../../src/rules/cards.ts';

const c = (id: string, rank: number, suit: 'hearts' | 'spades' | 'clubs' | 'diamonds'): Card =>
  ({ kind: 'standard', id, rank, suit }) as unknown as Card;

test('three cards on the trick and an empty felt log: all three come back', () => {
  const plays = [
    { player: 'p1', card: c('h7', 7, 'hearts') },
    { player: 'p2', card: c('s10', 10, 'spades') },
    { player: 'p3', card: c('c2', 2, 'clubs') },
  ];
  const out = trickFromPlay(plays);
  assert.deepEqual(out.map((x) => x.player), ['p1', 'p2', 'p3']);
  assert.deepEqual(out.map((x) => x.card), ['h7', 's10', 'c2']);
});

test('jokers the phone already logged are kept after the session cards', () => {
  const out = trickFromPlay([{ player: 'p1', card: c('h7', 7, 'hearts') }], [{ player: 'p2', card: 'joker', label: 'Joker' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.card, 'h7');
  assert.deepEqual(out[1], { player: 'p2', card: 'joker', label: 'Joker' });
});

test('an empty trick gives an empty felt', () => {
  assert.deepEqual(trickFromPlay([]), []);
});
