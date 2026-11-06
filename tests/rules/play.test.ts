import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { legalCards, playCard, startPlay, type PlayState } from '../../src/rules/play.ts';

const c = (suit: Suit, rank: number): Card =>
  ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const J = (n: number): Card => ({ kind: 'joker', id: `joker-${n}` });
const ids = (cards: readonly Card[] | undefined) => (cards ?? []).map((x) => x.id).sort();

function run(state: PlayState, moves: [string, string][]) {
  let s = state;
  const events = [];
  for (const [p, id] of moves) {
    const r = playCard(s, p, id);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

test('must follow suit when able; any card when not', () => {
  const s = startPlay(['a', 'b'], { a: [c('hearts', 5)], b: [c('hearts', 9), c('spades', 2)] }, 'a');
  const s2 = playCard(s, 'a', 'hearts-5').state;
  assert.deepEqual(ids(legalCards(s2, 'b')), ['hearts-9']);
  assert.throws(() => playCard(s2, 'b', 'spades-2'), /follow/);
  assert.throws(() => playCard(s2, 'a', 'hearts-5'), /turn/);
});

test('normal trick: cards to waste pile, highest of led suit leads (Ace high)', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 14), c('clubs', 3)],
      c: [c('hearts', 13), c('clubs', 4)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-14'],
    ['c', 'hearts-13'],
  ]);
  assert.equal(after.turn, 'b');
  assert.deepEqual(ids(after.wastePile), ['hearts-13', 'hearts-14', 'hearts-5']);
  assert.ok(events.some((e) => e.type === 'trickResolved' && e.nextLeader === 'b'));
});

test('slap: trick stops, highest led-suit player picks up every card and leads', () => {
  const s = startPlay(
    ['a', 'b', 'c', 'd'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 12), c('clubs', 3)],
      c: [c('spades', 9), c('clubs', 4)], // no hearts
      d: [c('hearts', 14), c('clubs', 5)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-12'],
    ['c', 'spades-9'], // SLAP - d never plays
  ]);
  const slap = events.find((e) => e.type === 'slapped');
  assert.deepEqual(slap, { type: 'slapped', slapper: 'c', slapped: 'b', cardsPickedUp: 3 });
  assert.deepEqual(ids(after.hands['b']), ['clubs-3', 'hearts-12', 'hearts-5', 'spades-9']);
  assert.equal(after.turn, 'b');
  assert.deepEqual(after.wastePile, []);
  assert.equal(after.hands['d']?.length, 2); // d did not play
});

test('going out and round end: finishing order and loser', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5)], b: [c('hearts', 9)], c: [c('hearts', 2), c('clubs', 2)] },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-9'],
    ['c', 'hearts-2'],
  ]);
  assert.equal(after.loser, 'c');
  assert.equal(after.turn, null);
  const end = events.find((e) => e.type === 'roundEnded');
  assert.deepEqual(end, {
    type: 'roundEnded',
    finishingOrder: ['a', 'b', 'c'],
    loser: 'c',
    sharedSecondLast: null,
    forfeitedBy: null,
  });
  assert.throws(() => playCard(after, 'c', 'clubs-2'), /over/);
});

test('highest card player is out: next highest card of the led suit leads', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 14)], // goes out on the Ace
      c: [c('hearts', 10), c('clubs', 4)],
    },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-14'],
    ['c', 'hearts-10'],
  ]);
  assert.deepEqual(after.finished, ['b']);
  assert.equal(after.turn, 'c');
});

test('slapped player who had played their last card picks up and stays in', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 14)], // leads their last card
      b: [c('spades', 3), c('clubs', 3)], // no hearts: slaps
      c: [c('hearts', 2), c('clubs', 4)],
    },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-14'],
    ['b', 'spades-3'],
  ]);
  assert.deepEqual(after.finished, []);
  assert.deepEqual(ids(after.hands['a']), ['hearts-14', 'spades-3']);
  assert.equal(after.turn, 'a');
});

test('joker: skips the turn, leaves the game, never enters the waste pile', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [J(1), c('hearts', 9)], // has hearts but can still play the joker
      c: [c('hearts', 3), c('clubs', 4)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'joker-1'],
    ['c', 'hearts-3'],
  ]);
  assert.ok(events.some((e) => e.type === 'jokerPlayed' && e.player === 'b' && !e.asLeader));
  assert.deepEqual(ids(after.usedJokers), ['joker-1']);
  assert.ok(!after.wastePile.some((x) => x.id === 'joker-1'));
  assert.equal(after.turn, 'a'); // highest heart: a's 5
  assert.deepEqual(ids(after.hands['b']), ['hearts-9']);
});

test('joker as the lead: next player clockwise starts the trick with any card', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [J(1), c('hearts', 5)], b: [c('spades', 9), c('hearts', 2)], c: [c('spades', 3), c('clubs', 4)] },
    'a',
  );
  const r1 = playCard(s, 'a', 'joker-1');
  assert.equal(r1.state.turn, 'b');
  assert.equal(r1.state.trick.ledSuit, null);
  assert.equal(legalCards(r1.state, 'b').length, 2);
  const { s: after } = run(r1.state, [
    ['b', 'spades-9'],
    ['c', 'spades-3'],
  ]);
  // a skipped this trick with the joker; b wins with the 9 of spades.
  assert.equal(after.turn, 'b');
  assert.deepEqual(ids(after.wastePile), ['spades-3', 'spades-9']);
});

test('going out on a joker counts as going out', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('clubs', 9)], b: [J(1)], c: [c('hearts', 3), c('clubs', 4)] },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'joker-1'],
    ['c', 'hearts-3'],
  ]);
  assert.deepEqual(after.finished, ['b']);
  assert.equal(after.loser, null);
});

test('play functions never change the state passed in', () => {
  const s = startPlay(['a', 'b'], { a: [c('hearts', 5)], b: [c('hearts', 9), c('spades', 2)] }, 'a');
  const before = JSON.stringify(s);
  playCard(s, 'a', 'hearts-5');
  assert.equal(JSON.stringify(s), before);
});
