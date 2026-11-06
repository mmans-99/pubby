import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../../src/rules/cards.ts';
import { seededRng, shuffle } from '../../src/rules/rng.ts';
import {
  autoDealAll,
  autoDealStart,
  autoDealStep,
  hiddenDeckCount,
  hiddenDeckSize,
  isDealComplete,
  manualDealCard,
  setDealMode,
  startDeal,
} from '../../src/rules/deal.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const deckFor = (n: number) => shuffle(createDeck(n, true), seededRng(7));

test('hidden decks: 2 for 2 players, 1 for 3, none for 4-8', () => {
  assert.equal(hiddenDeckCount(2), 2);
  assert.equal(hiddenDeckCount(3), 1);
  for (let n = 4; n <= 8; n++) assert.equal(hiddenDeckCount(n), 0);
});

test('hidden decks are dealt first, automatically, one player share each', () => {
  // 2 players, 54 cards (52 + 2 jokers): 54 / 4 = 13 each, 28 left for players.
  const two = startDeal(ids(2), deckFor(2));
  assert.equal(hiddenDeckSize(2, 54), 13);
  assert.equal(two.hiddenDecks['hidden-1']?.length, 13);
  assert.equal(two.hiddenDecks['hidden-2']?.length, 13);
  assert.equal(two.remaining.length, 28);
  // 3 players, 54 cards: 54 / 4 = 13, 41 left for players.
  const three = startDeal(ids(3), deckFor(3));
  assert.equal(three.hiddenDecks['hidden-1']?.length, 13);
  assert.equal(three.remaining.length, 41);
  // Joker rule off, 2 players: 52 / 4 = 13 each.
  assert.equal(hiddenDeckSize(2, 52), 13);
  // 4+ players: no hidden decks.
  const four = startDeal(ids(4), deckFor(4));
  assert.deepEqual(four.hiddenDecks, {});
  assert.equal(four.remaining.length, 54);
});

test('dealer only deals to players, never to hidden decks', () => {
  const s = startDeal(ids(2), deckFor(2), 'manual');
  assert.deepEqual(s.seats, ['p1', 'p2']);
  assert.throws(() => manualDealCard(s, 'hidden-1'));
  assert.throws(() => autoDealStart(s, 'hidden-1'));
  const done = autoDealAll(autoDealStart(s, 'p1'));
  assert.equal(done.hiddenDecks['hidden-1']?.length, 13);
  assert.equal((done.hands['p1']?.length ?? 0) + (done.hands['p2']?.length ?? 0), 28);
});

test('auto deal: every card dealt, clockwise from the tapped player', () => {
  for (let n = 2; n <= 8; n++) {
    const deck = deckFor(n);
    const done = autoDealAll(autoDealStart(startDeal(ids(n), deck), 'p2'));
    assert.ok(isDealComplete(done));
    const dealt = [...Object.values(done.hands).flat(), ...Object.values(done.hiddenDecks).flat()];
    assert.equal(dealt.length, deck.length);
    assert.equal(new Set(dealt.map((c) => c.id)).size, deck.length);
    // Uneven hands are allowed, but sizes differ by at most one in a pure auto deal.
    const sizes = Object.values(done.hands).map((h) => h.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

test('auto deal order: first card to tapped seat, then clockwise, wrapping round', () => {
  const deck = deckFor(4);
  let s = autoDealStart(startDeal(ids(4), deck), 'p3');
  s = autoDealStep(s);
  s = autoDealStep(s);
  s = autoDealStep(s);
  assert.deepEqual(s.hands['p3'], [deck[0]]);
  assert.deepEqual(s.hands['p4'], [deck[1]]);
  assert.deepEqual(s.hands['p1'], [deck[2]]);
  assert.equal(s.nextSeat, 'p2');
});

test('dealer can switch to manual mid auto deal, and back', () => {
  const deck = deckFor(4);
  let s = autoDealStart(startDeal(ids(4), deck), 'p1');
  s = autoDealStep(s); // p1
  s = setDealMode(s, 'manual');
  assert.throws(() => autoDealStep(s));
  s = manualDealCard(s, 'p4');
  s = manualDealCard(s, 'p4');
  assert.equal(s.hands['p4']?.length, 2);
  s = setDealMode(s, 'auto');
  s = autoDealStep(s); // resumes at p2
  assert.equal(s.hands['p2']?.length, 1);
  s = autoDealAll(s);
  assert.ok(isDealComplete(s));
});

test('manual deal rejects unknown seats and wrong mode', () => {
  let s = startDeal(ids(2), deckFor(2), 'manual');
  s = manualDealCard(s, 'p2');
  assert.equal(s.hands['p2']?.length, 1);
  assert.throws(() => manualDealCard(s, 'p9'));
  assert.throws(() => manualDealCard(setDealMode(s, 'auto'), 'p1'));
});

test('dealing from an empty pile throws', () => {
  const s = autoDealAll(autoDealStart(startDeal(ids(3), deckFor(3)), 'p1'));
  assert.throws(() => autoDealStep(s));
});

test('bad player lists are rejected', () => {
  assert.throws(() => startDeal(['p1'], deckFor(2)));
  assert.throws(() => startDeal(['p1', 'p1'], deckFor(2)));
  assert.throws(() => startDeal(['p1', 'hidden-1'], deckFor(2)));
});

test('deal functions never change the state passed in', () => {
  const s0 = autoDealStart(startDeal(ids(3), deckFor(3)), 'p1');
  const before = JSON.stringify(s0);
  autoDealStep(s0);
  assert.equal(JSON.stringify(s0), before);
});
