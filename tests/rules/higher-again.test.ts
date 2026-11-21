// 9ar.2 (K): the waste pile can be picked up once per round. A second higher last card ends the round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { pickUpWastePile, playCard, startPlay, type PlayEvent, type PlayState } from '../../src/rules/play.ts';

const c = (suit: Suit, rank: number): Card => ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const ended = (events: readonly PlayEvent[]) => events.find((e) => e.type === 'roundEnded');
const choice = (events: readonly PlayEvent[]) => events.some((e) => e.type === 'finalTwoChoice');

/**
 * a is out. b holds 9 of hearts; c holds 2 and 10 of hearts (both follow hearts, so no slap).
 * The pile holds 2 and 3 of diamonds.
 */
function start(): PlayState {
  const s = startPlay(['a', 'b', 'c'], { a: [], b: [c('hearts', 9)], c: [c('hearts', 2), c('hearts', 10)] }, 'b');
  return { ...s, finished: ['a'], wastePile: [c('diamonds', 2), c('diamonds', 3)] };
}

/** b's 9 is higher than c's 2: b must pick up or forfeit. */
function firstHigher(): PlayState {
  const r1 = playCard(start(), 'b', 'hearts-9');
  const r2 = playCard(r1.state, 'c', 'hearts-2');
  assert.equal(r2.state.pendingFinalTwo, 'b');
  return r2.state;
}

test('a fresh round has the pick-up unused', () => {
  assert.equal(start().finalTwoPickUpUsed, false);
});

test('first higher last card still gives the pick-up or forfeit choice', () => {
  const r1 = playCard(start(), 'b', 'hearts-9');
  const r2 = playCard(r1.state, 'c', 'hearts-2');
  assert.ok(choice(r2.events));
  assert.equal(ended(r2.events), undefined);
});

test('picking up sets the used flag and gives the hand back to play', () => {
  const picked = pickUpWastePile(firstHigher(), 'b');
  assert.equal(picked.state.finalTwoPickUpUsed, true);
  assert.equal(picked.state.pendingFinalTwo, null);
  assert.equal(picked.state.hands.b?.length, 4, 'b gets the whole pile back');
});

test('after the one pick-up, a higher last card again ends the round with no choice', () => {
  const picked = pickUpWastePile(firstHigher(), 'b');
  const r3 = playCard(picked.state, 'b', 'hearts-2'); // b leads 2h (the led suit is hearts)
  const r4 = playCard(r3.state, 'c', 'hearts-10'); // c's last card, higher again
  const end = ended(r4.events);
  assert.ok(end && end.type === 'roundEnded', 'the round ends');
  assert.equal(end.reason, 'secondHigher');
  assert.equal(end.loser, 'c', 'the higher player takes last place');
  assert.deepEqual(end.finishingOrder, ['a', 'b', 'c']);
  assert.equal(choice(r4.events), false, 'no pick-up choice is offered');
  assert.equal(r4.state.pendingFinalTwo, null);
});

test('a lower last card ends the round normally, with no reason', () => {
  // b holds 2 of hearts, c holds 9 of hearts: b goes out on the lower card and wins.
  const s = startPlay(['a', 'b', 'c'], { a: [], b: [c('hearts', 2)], c: [c('hearts', 9)] }, 'b');
  const r1 = playCard({ ...s, finished: ['a'], wastePile: [] }, 'b', 'hearts-2');
  const r2 = playCard(r1.state, 'c', 'hearts-9');
  const end = ended(r2.events);
  assert.ok(end && end.type === 'roundEnded');
  assert.equal(end.reason, undefined);
  assert.equal(choice(r2.events), false);
});
