import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck,
  jokerCount,
  missingSuits,
  standardCards,
  cardLabel,
  isJoker,
  type Card,
} from '../../src/rules/cards.ts';
import { seededRng, shuffle } from '../../src/rules/rng.ts';

test('one standard deck: 52 unique cards, 13 per suit', () => {
  const cards = standardCards();
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((c) => c.id)).size, 52);
  for (const suit of ['clubs', 'diamonds', 'hearts', 'spades']) {
    assert.equal(cards.filter((c) => c.suit === suit).length, 13);
  }
});

test('Ace is high: rank 14 beats King 13, 2 is lowest', () => {
  const ranks = standardCards().filter((c) => c.suit === 'spades').map((c) => c.rank);
  assert.equal(Math.max(...ranks), 14);
  assert.equal(Math.min(...ranks), 2);
  assert.equal(cardLabel({ kind: 'standard', id: 'spades-14', suit: 'spades', rank: 14 }), 'A♠');
});

test('joker count: 2 for 2-5 players, 3 for 6-8, 0 when the rule is off', () => {
  for (const n of [2, 3, 4, 5]) assert.equal(jokerCount(n, true), 2);
  for (const n of [6, 7, 8]) assert.equal(jokerCount(n, true), 3);
  for (let n = 2; n <= 8; n++) assert.equal(jokerCount(n, false), 0);
});

test('deck is one 52-card deck for every player count, plus jokers', () => {
  for (let n = 2; n <= 8; n++) {
    assert.equal(createDeck(n, true).length, 52 + jokerCount(n, true));
    assert.equal(createDeck(n, false).length, 52);
  }
});

test('player count outside 2-8 is rejected', () => {
  assert.throws(() => createDeck(1, true), RangeError);
  assert.throws(() => createDeck(9, true), RangeError);
});

test('seeded shuffle is repeatable and keeps every card', () => {
  const deck = createDeck(4, true);
  const a = shuffle(deck, seededRng(42));
  const b = shuffle(deck, seededRng(42));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, deck);
  assert.deepEqual(
    a.map((c) => c.id).sort(),
    deck.map((c) => c.id).sort(),
  );
});

test('missing suits ignore jokers', () => {
  const hand: Card[] = [
    { kind: 'standard', id: 'hearts-5', suit: 'hearts', rank: 5 },
    { kind: 'joker', id: 'joker-1' },
  ];
  assert.deepEqual(missingSuits(hand), ['clubs', 'diamonds', 'spades']);
  assert.ok(isJoker(hand[1] as Card));
});
