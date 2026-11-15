// CODE.md 9af.5 (PROJECT.md 12r): computer players do not lead into a suit someone is known to be
// missing (a slap showed it) when they hold a safe suit. Hand-made positions from position.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import type { Persona } from '../../src/ai/persona.ts';
import { chooseCard } from '../../src/ai/moves.ts';
import { knownSlap } from '../../src/ai/eval.ts';
import { sampleDeals } from '../../src/ai/sample.ts';
import { cards, position } from './position.ts';

const ORDER = ['p1', 'p2', 'p3'];
const START = { type: 'roundStarted' as const, round: 1, dealer: 'p1', ultimate: false };
const hard: Persona = { level: 'hard', personality: 'counter' };
const normal: Persona = { level: 'normal', personality: 'counter' };

function cardOf(action: unknown): string | undefined {
  const a = action as { type?: string; cardId?: string } | null;
  return a?.type === 'playCard' ? a.cardId : undefined;
}

test('knownSlap: true for a known missing suit with no known card of it; false otherwise', () => {
  const p = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('hearts-3', 'clubs-5'), p2: cards('clubs-7', 'clubs-8'), p3: cards('diamonds-2') },
    events: [START],
  });
  // Nothing shown yet: no known missing suit.
  assert.equal(knownSlap(p.memory, p.seen, 'hearts'), false);
  // p2 missing hearts (a slap showed it): true.
  p.memory.voids.p2!.add('hearts');
  assert.equal(knownSlap(p.memory, p.seen, 'hearts'), true);
  // Me: my own void never counts.
  p.memory.voids.p1!.add('spades');
  assert.equal(knownSlap(p.memory, p.seen, 'spades'), false);
  // A player with no cards left does not count.
  p.memory.voids.p3!.add('diamonds');
  const empty = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('hearts-3'), p2: [], p3: cards('diamonds-2') },
    events: [START],
  });
  empty.memory.voids.p2!.add('hearts');
  assert.equal(knownSlap(empty.memory, empty.seen, 'hearts'), false);
});

test('knownSlap: a known card of the suit cancels the void', () => {
  const p = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('hearts-3'), p2: cards('clubs-7', 'clubs-8'), p3: cards('diamonds-2') },
    events: [START],
  });
  p.memory.voids.p2!.add('clubs');
  assert.equal(knownSlap(p.memory, p.seen, 'clubs'), true);
  // p2 is later known to hold a club (a card they picked up): no longer a known slap.
  p.memory.known.p2!.set('clubs-9', cards('clubs-9')[0]!);
  assert.equal(knownSlap(p.memory, p.seen, 'clubs'), false);
});

test('Hard never leads a known missing suit when a safe suit is in hand (20 seeds)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const p = position({
      order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
      // p2 is known to be out of hearts, and holds only clubs. I hold hearts and spades.
      hands: { p1: cards('hearts-3', 'hearts-13', 'spades-5'), p2: cards('clubs-7', 'clubs-8'), p3: cards('diamonds-2', 'diamonds-4') },
      events: [START],
      personality: 'counter',
    });
    p.memory.voids.p2!.add('hearts');
    const id = cardOf(chooseCard(p.seen, p.memory, { ...hard }, seededRng(seed)));
    assert.ok(id !== undefined && !id.startsWith('hearts'), `seed ${seed}: Hard led ${id}`);
  }
});

test('final two, other player on one card: leads a suit they are not known to be missing', () => {
  // p2 (one card) is known to be out of clubs. My lowest card is a club, so Normal leads my diamond.
  const p = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('clubs-3', 'diamonds-9'), p2: cards('hearts-12'), p3: [] },
    events: [START],
    personality: 'counter',
  });
  p.memory.voids.p2!.add('clubs');
  assert.equal(cardOf(chooseCard(p.seen, p.memory, normal, seededRng(1))), 'diamonds-9');
});

test('final two: when every suit I hold is a known missing suit, leads my lowest card', () => {
  const p = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('clubs-3', 'clubs-9'), p2: cards('hearts-12'), p3: [] },
    events: [START],
    personality: 'counter',
  });
  p.memory.voids.p2!.add('clubs');
  assert.equal(cardOf(chooseCard(p.seen, p.memory, normal, seededRng(1))), 'clubs-3');
});

test('deals: no imagined hand holds a suit its owner is known to be missing (200 deals)', () => {
  const p = position({
    order: ORDER, me: 'p1', leader: 'p1', turn: 'p1',
    hands: { p1: cards('hearts-3', 'spades-5', 'clubs-5'), p2: cards('clubs-7', 'clubs-8'), p3: cards('diamonds-2', 'diamonds-4') },
    events: [START],
  });
  p.memory.voids.p2!.add('hearts');
  p.memory.voids.p2!.add('spades');
  p.memory.voids.p3!.add('hearts');
  const deals = sampleDeals(p.memory, p.seen, 200, seededRng(3));
  assert.equal(deals.length, 200);
  let bad = 0;
  for (const d of deals) {
    for (const [owner, hand] of Object.entries(d)) {
      if (hand.some((c) => 'suit' in c && p.memory.voids[owner]?.has(c.suit))) bad++;
    }
  }
  assert.equal(bad, 0, `${bad} imagined hands broke a known missing suit`);
});
