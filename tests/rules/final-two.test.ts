import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import {
  forfeit,
  legalCards,
  pickUpWastePile,
  playCard,
  startPlay,
  type PlayEvent,
  type PlayState,
} from '../../src/rules/play.ts';

const c = (suit: Suit, rank: number): Card =>
  ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const J = (n: number): Card => ({ kind: 'joker', id: `joker-${n}` });
const ids = (cards: readonly Card[] | undefined) => (cards ?? []).map((x) => x.id).sort();

function run(state: PlayState, moves: [string, string][]) {
  let s = state;
  const events: PlayEvent[] = [];
  for (const [p, id] of moves) {
    const r = playCard(s, p, id);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}
const ended = (events: readonly PlayEvent[]) => events.find((e) => e.type === 'roundEnded');

/** A 3-player game already down to b and c, with a waste pile. */
function finalTwo(b: Card[], c2: Card[], leader: string): PlayState {
  const s = startPlay(['a', 'b', 'c'], { a: [], b, c: c2 }, leader);
  return { ...s, finished: ['a'], wastePile: [c('diamonds', 2), c('diamonds', 3)] };
}

test('normal final-two trick (no last card): usual rules, higher card leads', () => {
  const s = finalTwo([c('hearts', 5), c('clubs', 2)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after } = run(s, [
    ['b', 'hearts-5'],
    ['c', 'hearts-9'],
  ]);
  assert.equal(after.turn, 'c');
  assert.equal(after.wastePile.length, 4);
});

test('last card lower than the other player\'s: they win the round', () => {
  const s = finalTwo([c('hearts', 5)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-5'],
    ['c', 'hearts-9'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
  assert.equal(end.loser, 'c');
});

test('last card higher: must pick up the waste pile or forfeit', () => {
  const s = finalTwo([c('hearts', 13)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after, events } = run(s, [
    ['b', 'hearts-13'],
    ['c', 'hearts-9'],
  ]);
  assert.ok(events.some((e) => e.type === 'finalTwoChoice' && e.player === 'b'));
  assert.equal(after.pendingFinalTwo, 'b');
  assert.equal(after.turn, null);
  assert.throws(() => playCard(after, 'c', 'clubs-3'), /choice/);
  assert.throws(() => pickUpWastePile(after, 'c'));
  assert.throws(() => forfeit(after, 'c'));

  // Pick up: whole waste pile (including this trick), b leads, b can forfeit later.
  const up = pickUpWastePile(after, 'b').state;
  assert.deepEqual(ids(up.hands['b']), ['diamonds-2', 'diamonds-3', 'hearts-13', 'hearts-9']);
  assert.deepEqual(up.wastePile, []);
  assert.equal(up.turn, 'b');
  assert.deepEqual(up.forfeitAllowed, ['b']);

  // Later forfeit, at any time, while two are left.
  const r = forfeit(up, 'b');
  const end = ended(r.events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
  assert.equal(end.forfeitedBy, 'b');
  assert.throws(() => forfeit(up, 'c'), /cannot forfeit/);
});

test('last card higher: forfeit straight away', () => {
  const s = finalTwo([c('hearts', 13)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after } = run(s, [
    ['b', 'hearts-13'],
    ['c', 'hearts-9'],
  ]);
  const end = ended(forfeit(after, 'b').events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});

test('the rule applies from the first trick in a 2-player game', () => {
  const s = startPlay(['a', 'b'], { a: [c('spades', 14)], b: [c('spades', 2), c('clubs', 3)] }, 'a');
  const { s: after } = run(s, [
    ['a', 'spades-14'],
    ['b', 'spades-2'],
  ]);
  assert.equal(after.pendingFinalTwo, 'a');
});

test('last card is a slap: the slapper wins', () => {
  const s = finalTwo([c('hearts', 5), c('clubs', 2)], [c('spades', 9)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-5'],
    ['c', 'spades-9'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});




test('one joker played first (not last card): the other plays any card, then leads', () => {
  const s = finalTwo([J(1), c('clubs', 2)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after } = run(s, [
    ['b', 'joker-1'],
    ['c', 'hearts-9'],
  ]);
  assert.equal(after.turn, 'c');
});

test('both play jokers without going out: missed round, first player leads again', () => {
  const s = finalTwo([J(1), c('clubs', 2), c('clubs', 5)], [J(2), c('clubs', 3), c('clubs', 6)], 'b');
  const { s: after } = run(s, [
    ['b', 'joker-1'],
    ['c', 'joker-2'],
  ]);
  assert.equal(after.turn, 'b');
});

test('both go out in the same trick: the lower card wins', () => {
  const s = finalTwo([c('hearts', 13)], [c('hearts', 9)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-13'],
    ['c', 'hearts-9'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});



test('joker led, other player now on their last normal card: a joker may still answer it', () => {
  // b leads a joker and is then down to one normal card; c may answer with a joker.
  const s = finalTwo([J(1), c('clubs', 2)], [J(2), c('hearts', 9), c('clubs', 3)], 'b');
  const r1 = playCard(s, 'b', 'joker-1');
  assert.ok(legalCards(r1.state, 'c').some((x) => x.id === 'joker-2'), 'c may answer the joker with a joker');
  const { s: after } = run(s, [['b', 'joker-1'], ['c', 'joker-2']]);
  assert.equal(after.turn, 'b', 'missed round: b played first, so b leads again');
  // Next trick: b is on their last normal card, so c can't play a joker any more.
  assert.equal(after.hands.c?.some((x) => x.id === 'joker-2'), false);
});

test('joker led: the other player may also play a normal card, then leads', () => {
  const s = finalTwo([J(1), c('clubs', 2)], [J(2), c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after } = run(s, [['b', 'joker-1'], ['c', 'hearts-9']]);
  assert.equal(after.turn, 'c');
});

// User's example (2026-11-07): both players on a joker and one normal card. No block.
test('both on a joker and one normal card: either may lead a joker', () => {
  const s = finalTwo([J(1), c('clubs', 2)], [J(2), c('hearts', 9)], 'b');
  assert.deepEqual(ids(legalCards(s, 'b')), ['clubs-2', 'joker-1']);
});

test('joker led, the other plays their last normal card: their joker is thrown away and they win', () => {
  const s = finalTwo([J(1), c('clubs', 2)], [J(2), c('hearts', 9)], 'b');
  const { events } = run(s, [['b', 'joker-1'], ['c', 'hearts-9']]);
  assert.ok(events.some((e) => e.type === 'jokersDiscarded' && e.player === 'c'));
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});

test('both lead jokers, then both play their last normal card: the lower card wins', () => {
  const s = finalTwo([J(1), c('hearts', 2)], [J(2), c('hearts', 9)], 'b');
  const { s: mid } = run(s, [['b', 'joker-1'], ['c', 'joker-2']]);
  assert.equal(mid.turn, 'b', 'missed round: b led first, so b leads again');
  const { events } = run(mid, [['b', 'hearts-2'], ['c', 'hearts-9']]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
});

test('a last card answered by a joker goes out unopposed and wins', () => {
  // b leads their last normal card (b's joker is thrown away); c answers with a joker.
  const s = finalTwo([c('hearts', 13), J(1)], [J(2), c('hearts', 9), c('clubs', 3)], 'b');
  const r = playCard(s, 'b', 'hearts-13');
  assert.ok(legalCards(r.state, 'c').some((x) => x.id === 'joker-2'), 'jokers are never blocked');
  const { events } = run(r.state, [['c', 'joker-2']]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
});

test('jokers allowed in the final two while both players have two or more normal cards', () => {
  const s = finalTwo([J(1), c('hearts', 9), c('clubs', 3)], [c('hearts', 13), c('clubs', 4)], 'b');
  assert.ok(legalCards(s, 'b').some((x) => x.id === 'joker-1'));
});

test('a last normal card with only jokers left counts as the last card (jokers thrown away)', () => {
  // b holds a 5 and a joker; c has two normal cards so b's joker is not blocked, but b plays the 5.
  const s = finalTwo([c('hearts', 5), J(1)], [c('hearts', 9), c('clubs', 3)], 'b');
  const r = playCard(s, 'b', 'hearts-5');
  assert.ok(r.events.some((e) => e.type === 'jokersDiscarded' && e.player === 'b' && e.count === 1));
  assert.deepEqual(r.state.hands['b'], []);
  assert.deepEqual(ids(r.state.usedJokers), ['joker-1']);
  // c can't answer with a joker now anyway; lower last card: b wins.
  const end = ended(playCard(r.state, 'c', 'hearts-9').events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
});

test('last normal card higher: jokers still thrown away when picking up the waste pile', () => {
  const s = finalTwo([c('hearts', 13), J(1)], [c('hearts', 9), c('clubs', 3)], 'b');
  const { s: after } = run(s, [
    ['b', 'hearts-13'],
    ['c', 'hearts-9'],
  ]);
  assert.equal(after.pendingFinalTwo, 'b');
  const up = pickUpWastePile(after, 'b').state;
  assert.ok(!(up.hands['b'] ?? []).some((x) => x.kind === 'joker'));
  assert.deepEqual(ids(up.usedJokers), ['joker-1']);
});
