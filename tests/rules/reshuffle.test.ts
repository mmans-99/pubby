// 3.0.6 (CODE.md 9ar.1 H): a passed "Deal again" builds a fresh shuffled deck. Over many reshuffles the
// cards a player keeps and the jokers they hold match chance (the maths for a random hand).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, isJoker } from '../../src/rules/cards.ts';
import { seededRng } from '../../src/rules/rng.ts';
import { autoDealAll, autoDealStart } from '../../src/rules/deal.ts';
import { shuffleAndStartDeal, type RoundSetup } from '../../src/rules/round.ts';

const TRIALS = 2000;
const TOLERANCE = 0.03; // 3 points

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function dealHand(setup: RoundSetup, rng: () => number, who: string): { id: string; joker: boolean }[] {
  const state = autoDealAll(autoDealStart(shuffleAndStartDeal(setup, rng, 'auto'), setup.players[0] as string));
  return (state.hands[who] ?? []).map((c) => ({ id: c.id, joker: isJoker(c) }));
}

function check(players: number, seed: number): void {
  const rng = seededRng(seed);
  const setup: RoundSetup = { round: 1, players: ids(players), hostId: 'p1', jokerRuleEnabled: true };
  const who = 'p2';
  const deckSize = createDeck(players, true).length;
  const jokersInDeck = createDeck(players, true).filter(isJoker).length;

  let keptCards = 0;
  let handCards = 0;
  let withJoker = 0;
  let prev = dealHand(setup, rng, who);
  for (let t = 0; t < TRIALS; t++) {
    const cur = dealHand(setup, rng, who);
    const before = new Set(prev.map((c) => c.id));
    keptCards += cur.filter((c) => before.has(c.id)).length;
    handCards += cur.length;
    if (cur.some((c) => c.joker)) withJoker += 1;
    prev = cur;
  }

  // Chance: a random hand of h cards from a deck of N keeps h / N of the cards in another random hand.
  const meanHand = handCards / TRIALS;
  const chanceKept = meanHand / deckSize;
  const observedKept = keptCards / handCards;
  assert.ok(Math.abs(observedKept - chanceKept) < TOLERANCE,
    `${players} players: kept share ${observedKept.toFixed(4)} vs chance ${chanceKept.toFixed(4)}`);

  // Chance of at least one joker in a random hand of h cards: 1 - C(N - J, h) / C(N, h).
  const h = Math.round(meanHand);
  let noJoker = 1;
  for (let i = 0; i < h; i++) noJoker *= (deckSize - jokersInDeck - i) / (deckSize - i);
  const chanceJoker = 1 - noJoker;
  const observedJoker = withJoker / TRIALS;
  assert.ok(Math.abs(observedJoker - chanceJoker) < TOLERANCE,
    `${players} players: joker rate ${observedJoker.toFixed(4)} vs chance ${chanceJoker.toFixed(4)}`);
}

test('2,000 reshuffles, 2 players: kept cards and joker rate match chance', () => {
  check(2, 20260321);
});

test('2,000 reshuffles, 4 players: kept cards and joker rate match chance', () => {
  check(4, 20260322);
});
