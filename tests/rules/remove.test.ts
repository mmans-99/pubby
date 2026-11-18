import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { canForfeit, playCard, removeFromPlay, startPlay, type PlayState } from '../../src/rules/play.ts';

// 9an.8 (Part H): removing a player during a round (CODE.md 9an.8 H-d, H-k).

const c = (suit: Suit, rank: number): Card =>
  ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const J = (n: number): Card => ({ kind: 'joker', id: `joker-${n}` });
const ids = (cards: readonly Card[] | undefined) => (cards ?? []).map((x) => x.id).sort();

test('between tricks, on their own turn: the next holder clockwise leads, their cards leave the game', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 2)], b: [c('hearts', 5), c('spades', 6)], c: [c('hearts', 7)] },
    'b',
  );
  const r = removeFromPlay(s, 'b');
  assert.equal(r.state.turn, 'c');
  assert.deepEqual(r.state.order, ['a', 'c']);
  assert.equal(r.state.hands['b'], undefined);
  assert.deepEqual(r.state.trick.participants, ['c', 'a']);
  assert.equal(r.state.over, false);
  assert.deepEqual(r.state.wastePile, []);
});

test('between tricks, not their turn: the turn stays where it was', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 2)], b: [c('hearts', 5)], c: [c('hearts', 7), c('clubs', 3)] },
    'a',
  );
  const r = removeFromPlay(s, 'c');
  assert.equal(r.state.turn, 'a');
  assert.deepEqual(r.state.order, ['a', 'b']);
  assert.deepEqual(r.state.trick.participants, ['a', 'b']);
});

test('mid-trick, their turn: the next player to act takes over', () => {
  const s = startPlay(
    ['a', 'b', 'c', 'd'],
    { a: [c('hearts', 5), c('spades', 2)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)], d: [c('hearts', 4), c('spades', 5)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  assert.equal(afterB.turn, 'c');
  const r = removeFromPlay(afterB, 'c');
  assert.equal(r.state.turn, 'd');
  assert.deepEqual(r.state.trick.acted, ['a', 'b']);
  assert.equal(r.state.trick.plays.some((x) => x.player === 'c'), false);
});

test('mid-trick, their turn, everyone else has acted: the trick resolves by the highest card left', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('spades', 2)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  const r = removeFromPlay(afterB, 'c');
  // The trick started with three, so it closes under normal rules: b's 9 leads.
  assert.equal(r.state.turn, 'b');
  assert.equal(r.state.trick.participants.includes('c'), false);
  assert.deepEqual(ids(r.state.wastePile), ['hearts-5', 'hearts-9']);
  assert.ok(r.events.some((e) => e.type === 'trickResolved' && e.nextLeader === 'b'));
  assert.equal(r.events.some((e) => e.type === 'finalTwoChoice'), false);
});

test('a card they played on the felt leaves the game (not the waste pile)', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('spades', 2)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  // b played hearts-9 and is not to act: removing b takes their card off the felt.
  const r = removeFromPlay(afterB, 'b');
  assert.deepEqual(r.state.trick.plays.map((x) => x.card.id), ['hearts-5']);
  assert.equal(r.state.turn, 'c');
  assert.deepEqual(r.state.wastePile, []);
  assert.equal(r.state.usedJokers.length, 0);
});

test('they led and only jokers followed: the led suit clears and the next player starts with any card', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('spades', 2)], b: [J(1), c('spades', 3)], c: [c('clubs', 3), c('clubs', 4)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'joker-1').state;
  assert.equal(afterB.turn, 'c');
  const r = removeFromPlay(afterB, 'a');
  assert.equal(r.state.trick.ledSuit, null);
  assert.equal(r.state.turn, 'c');
  assert.deepEqual(r.state.trick.plays, []);
  // c can now play any card, not only a heart.
  assert.deepEqual(ids(r.state.hands['c']), ['clubs-3', 'clubs-4']);
});

test('a trick that started with three finishes under normal rules after a removal', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('spades', 2)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  const r = removeFromPlay(afterB, 'c');
  // Two players are left in the trick but the trick started with three: no pick-up choice.
  assert.equal(r.state.pendingFinalTwo, null);
  assert.equal(r.state.turn, 'b');
  assert.equal(r.state.over, false);
});

test('a pending pick-up choice: removing either player ends the round with the other as loser', () => {
  // a lays a higher last card than b, so a must pick up or forfeit.
  const s = startPlay(['a', 'b'], { a: [c('hearts', 10)], b: [c('hearts', 3), c('hearts', 4)] }, 'a');
  const afterA = playCard(s, 'a', 'hearts-10').state;
  const pending = playCard(afterA, 'b', 'hearts-3').state;
  assert.equal(pending.pendingFinalTwo, 'a');
  const r = removeFromPlay(pending, 'a');
  assert.equal(r.state.over, true);
  assert.equal(r.state.loser, 'b');
  // a's card leaves the pile; b's card (already on the pile) is counted once.
  assert.deepEqual(ids(r.state.wastePile), ['hearts-3']);
  assert.ok(r.events.some((e) => e.type === 'roundEnded' && e.loser === 'b' && !e.finishingOrder.includes('a')));
});

test('one player left holding cards: the round ends, that player is the loser, the removed player is not in the order', () => {
  const s = startPlay(['a', 'b'], { a: [c('hearts', 2)], b: [c('spades', 5)] }, 'b');
  const r = removeFromPlay(s, 'a');
  assert.equal(r.state.over, true);
  assert.equal(r.state.loser, 'b');
  const ended = r.events.find((e) => e.type === 'roundEnded');
  assert.ok(ended && ended.type === 'roundEnded');
  assert.deepEqual([...ended.finishingOrder], ['b']);
});

test('aside jokers of a removed player leave the game, and are not discarded into used jokers', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), J(1)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)] },
    'a',
  );
  const afterA = playCard(s, 'a', 'hearts-5').state;
  assert.deepEqual(ids(afterA.asideJokers?.['a']), ['joker-1']);
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  const r = removeFromPlay(afterB, 'a');
  assert.equal(r.state.asideJokers?.['a'], undefined);
  assert.equal(r.state.usedJokers.some((x) => x.id === 'joker-1'), false);
  assert.equal(r.state.hands['a'], undefined);
});

test('canForfeit with two left after a removal', () => {
  const s = startPlay(['a', 'b', 'c'], { a: [c('hearts', 2)], b: [c('hearts', 5)], c: [c('hearts', 7)] }, 'a');
  const r = removeFromPlay(s, 'c');
  assert.equal(canForfeit(r.state, 'a'), true);
  assert.equal(canForfeit(r.state, 'b'), true);
});

test('removing the player who is out (already finished) keeps the round going', () => {
  // a goes out first in a three-player round; then c is removed.
  const s0 = startPlay(['a', 'b', 'c'], { a: [c('hearts', 5)], b: [c('hearts', 9), c('spades', 3)], c: [c('hearts', 3), c('spades', 4)] }, 'a');
  const afterA = playCard(s0, 'a', 'hearts-5').state;
  const afterB = playCard(afterA, 'b', 'hearts-9').state;
  const afterC = playCard(afterB, 'c', 'hearts-3').state;
  // Trick ended: b led the next trick (highest heart). Check a is out.
  assert.deepEqual(afterC.finished, ['a']);
  const r = removeFromPlay(afterC, 'a');
  assert.deepEqual(r.state.finished, ['a']);
  assert.equal(r.state.over, false);
  assert.deepEqual(r.state.order, ['b', 'c']);
});
