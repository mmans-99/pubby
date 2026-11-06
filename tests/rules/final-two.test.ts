import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import {
  forfeit,
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

test('joker as last card when leading: out at once, wins', () => {
  const s = finalTwo([J(1)], [c('hearts', 9), c('clubs', 3)], 'b');
  const r = playCard(s, 'b', 'joker-1');
  const end = ended(r.events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
  assert.equal(r.state.turn, null);
});

test('joker as last card when following: wins', () => {
  const s = finalTwo([c('hearts', 9), c('clubs', 3)], [J(1)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-9'],
    ['c', 'joker-1'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});

test('other player answers a last card with a joker: the last card wins', () => {
  const s = finalTwo([c('hearts', 13)], [J(1), c('clubs', 3)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-13'],
    ['c', 'joker-1'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
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
  const s = finalTwo([J(1), c('clubs', 2)], [J(2), c('clubs', 3)], 'b');
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

test('both go out, one on a joker: the joker wins', () => {
  const s = finalTwo([c('hearts', 2)], [J(1)], 'b');
  const { events } = run(s, [
    ['b', 'hearts-2'],
    ['c', 'joker-1'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
});

test('joker answered with a last-card joker (first joker not last): last joker wins', () => {
  const s = finalTwo([J(1), c('clubs', 2)], [J(2)], 'b');
  const { events } = run(s, [
    ['b', 'joker-1'],
    ['c', 'joker-2'],
  ]);
  const end = ended(events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'c', 'b']);
  assert.equal(end.sharedSecondLast, null);
});

test('both final players down to a single joker: both out, shared second-last place', () => {
  const s = finalTwo([J(1)], [J(2)], 'b');
  const r = playCard(s, 'b', 'joker-1');
  const end = ended(r.events);
  assert.ok(end && end.type === 'roundEnded');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
  assert.deepEqual(end.sharedSecondLast, ['b', 'c']);
  assert.deepEqual(ids(r.state.usedJokers), ['joker-1', 'joker-2']);
  assert.deepEqual(r.state.hands['c'], []);
});
