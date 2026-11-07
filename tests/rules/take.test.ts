import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { betweenTricks, playCard, startPlay, takeAllowed, takeCards } from '../../src/rules/play.ts';

const c = (suit: Suit, rank: number): Card => ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;

const hands = () => ({
  a: [c('hearts', 2), c('hearts', 9)],
  b: [c('hearts', 5), c('spades', 3), c('clubs', 4)],
  c: [c('hearts', 7), c('diamonds', 8)],
  d: [c('hearts', 10), c('clubs', 9)],
});

test('take-cards: requester gets every card, the target goes out with the next place', () => {
  const s = startPlay(['a', 'b', 'c', 'd'], hands(), 'a');
  const r = takeCards(s, 'c', 'b');
  assert.equal(r.state.hands['b']!.length, 0);
  assert.equal(r.state.hands['c']!.length, 5);
  assert.deepEqual(r.state.finished, ['b']);
  assert.deepEqual(r.events, [
    { type: 'cardsTaken', requester: 'c', target: 'b', count: 3 },
    { type: 'playerOut', player: 'b', place: 1 },
  ]);
  assert.equal(r.state.turn, 'a');
  assert.deepEqual(r.state.trick.participants, ['a', 'c', 'd']);
});

test('take-cards: if the leader is taken, the next player clockwise holding cards leads', () => {
  const s = startPlay(['a', 'b', 'c', 'd'], hands(), 'b');
  const r = takeCards(s, 'd', 'b');
  assert.equal(r.state.turn, 'c');
});

test('take-cards: only between tricks, never with two players left, not from yourself or an out player', () => {
  let s = startPlay(['a', 'b', 'c', 'd'], hands(), 'a');
  assert.ok(betweenTricks(s));
  s = playCard(s, 'a', 'hearts-2').state;
  assert.ok(!betweenTricks(s));
  assert.throws(() => takeCards(s, 'c', 'b'), /between tricks/);
  assert.match(takeAllowed(s, 'c', 'c') ?? '', /own/);
  const two = startPlay(['a', 'b', 'c'], { a: [c('hearts', 2)], b: [c('hearts', 3)], c: [] }, 'a');
  assert.match(takeAllowed(two, 'a', 'b') ?? '', /two players/);
  assert.match(takeAllowed(two, 'a', 'c') ?? '', /out/);
});
