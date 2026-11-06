import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { seededRng } from '../../src/rules/rng.ts';
import {
  decideLeader,
  dealerFor,
  hiddenSwap,
  missingSuitPlayers,
  resolveReactionTap,
  shuffleAndStartDeal,
  swapAllowed,
  type RoundSetup,
} from '../../src/rules/round.ts';
import { autoDealAll, autoDealStart } from '../../src/rules/deal.ts';

const c = (suit: Suit, rank: number): Card =>
  ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const allSuits = (): Card[] => [c('clubs', 2), c('diamonds', 2), c('hearts', 2), c('spades', 2)];

const r1: RoundSetup = { round: 1, players: ['a', 'b', 'c', 'd'], hostId: 'b', jokerRuleEnabled: true };
const r2: RoundSetup = { ...r1, round: 2, previous: { winner: 'c', loser: 'd' } };

test('round 1: host deals; later rounds: previous loser deals', () => {
  assert.equal(dealerFor(r1), 'b');
  assert.equal(dealerFor(r2), 'd');
  assert.throws(() => dealerFor({ ...r1, round: 2 }));
});

test('every round starts with the full deck; hidden decks every round', () => {
  for (const round of [1, 2, 5]) {
    const setup: RoundSetup = { round, players: ['a', 'b'], hostId: 'a', jokerRuleEnabled: true, previous: { winner: 'a', loser: 'b' } };
    const deal = shuffleAndStartDeal(setup, seededRng(round));
    const total = deal.remaining.length + Object.values(deal.hiddenDecks).flat().length;
    assert.equal(total, 54);
    assert.equal(Object.keys(deal.hiddenDecks).length, 2);
  }
});

test('reshuffle gives a different deal from a new shuffle, same full deck', () => {
  const a = shuffleAndStartDeal(r1, seededRng(1));
  const b = shuffleAndStartDeal(r1, seededRng(2));
  assert.notDeepEqual(a.remaining, b.remaining);
  assert.equal(a.remaining.length, b.remaining.length);
});

test('hidden swap every round, only in 2 and 3 player games', () => {
  assert.ok(swapAllowed(2));
  assert.ok(swapAllowed(3));
  for (let n = 4; n <= 8; n++) assert.ok(!swapAllowed(n));
});

test('hidden swap: up to 4 cards out, same number of hidden cards in', () => {
  const deal = autoDealAll(autoDealStart(shuffleAndStartDeal({ ...r1, players: ['a', 'b'], hostId: 'a' }, seededRng(3)), 'a'));
  const hand = deal.hands['a'] as Card[];
  const give = hand.slice(0, 3).map((x) => x.id);
  const res = hiddenSwap(hand, deal.hiddenDecks, give, seededRng(9));
  assert.equal(res.hand.length, hand.length);
  assert.deepEqual(res.removed.map((x) => x.id), give);
  for (const id of give) assert.ok(!res.hand.some((x) => x.id === id));
  const hiddenBefore = Object.values(deal.hiddenDecks).flat().length;
  assert.equal(Object.values(res.hiddenDecks).flat().length, hiddenBefore - 3);
  // Given cards go nowhere: not in hand, not in hidden decks.
  for (const id of give) assert.ok(!Object.values(res.hiddenDecks).flat().some((x) => x.id === id));
  // Swapping none is allowed.
  assert.deepEqual(hiddenSwap(hand, deal.hiddenDecks, [], seededRng(1)).hand, hand);
  // More than 4, or a card not held, is rejected.
  assert.throws(() => hiddenSwap(hand, deal.hiddenDecks, hand.slice(0, 5).map((x) => x.id), seededRng(1)));
  assert.throws(() => hiddenSwap(hand, deal.hiddenDecks, ['nope'], seededRng(1)));
});

test('missing-suit players are found; jokers do not cover a suit', () => {
  const hands = {
    a: allSuits(),
    b: [c('hearts', 3), { kind: 'joker', id: 'joker-1' } as Card],
  };
  assert.deepEqual(missingSuitPlayers(['a', 'b'], hands).map((m) => m.player), ['b']);
});

test('leader: one missing-suit player leads, overriding host and winner', () => {
  const hands = { a: allSuits(), b: allSuits(), c: [c('hearts', 3)], d: allSuits() };
  assert.deepEqual(decideLeader(r1, hands), { kind: 'leader', leader: 'c', reason: 'missingSuit' });
  assert.deepEqual(decideLeader(r2, hands), { kind: 'leader', leader: 'c', reason: 'missingSuit' });
});

test('leader: two or more missing-suit players go to Reaction Tap', () => {
  const hands = { a: [c('clubs', 3)], b: allSuits(), c: [c('hearts', 3)], d: allSuits() };
  assert.deepEqual(decideLeader(r1, hands), { kind: 'reactionTap', players: ['a', 'c'] });
});

test('leader: round 1 host leads; later rounds the winner chooses', () => {
  const hands = { a: allSuits(), b: allSuits(), c: allSuits(), d: allSuits() };
  assert.deepEqual(decideLeader(r1, hands), { kind: 'leader', leader: 'b', reason: 'host' });
  assert.deepEqual(decideLeader(r2, hands), { kind: 'winnerChooses', winner: 'c' });
});

test('Reaction Tap: slowest leads, false start is slowest, ties replay', () => {
  assert.deepEqual(
    resolveReactionTap([
      { player: 'a', ms: 300, falseStart: false },
      { player: 'b', ms: 450, falseStart: false },
    ]),
    { kind: 'decided', slowest: 'b' },
  );
  assert.deepEqual(
    resolveReactionTap([
      { player: 'a', ms: 999, falseStart: false },
      { player: 'b', ms: 0, falseStart: true },
    ]),
    { kind: 'decided', slowest: 'b' },
  );
  assert.deepEqual(
    resolveReactionTap([
      { player: 'a', ms: 400, falseStart: false },
      { player: 'b', ms: 400, falseStart: false },
      { player: 'c', ms: 200, falseStart: false },
    ]),
    { kind: 'replay', players: ['a', 'b'] },
  );
  assert.deepEqual(
    resolveReactionTap([
      { player: 'a', ms: 0, falseStart: true },
      { player: 'b', ms: 0, falseStart: true },
      { player: 'c', ms: 200, falseStart: false },
    ]),
    { kind: 'replay', players: ['a', 'b'] },
  );
});
