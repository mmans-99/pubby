/** 2.34.6 (CODE.md 9ah.3): "You are the Ultimate Badboy!!" needs all four aces. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { hasFourAces } from '../../src/ui/cards.ts';

const c = (suit: Suit, rank: number): Card => ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const J = (n: number): Card => ({ kind: 'joker', id: `joker-${n}` });
const aces = (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]).map((s) => c(s, 14));

test('four aces, with other cards and jokers: yes', () => {
  assert.equal(hasFourAces(aces), true);
  assert.equal(hasFourAces([c('hearts', 2), ...aces, J(1), c('clubs', 13)]), true);
});

test('three aces (or kings, or jokers instead): no', () => {
  assert.equal(hasFourAces(aces.slice(0, 3)), false);
  assert.equal(hasFourAces([...aces.slice(0, 3), c('clubs', 13), J(1), J(2)]), false);
  assert.equal(hasFourAces([]), false);
});
