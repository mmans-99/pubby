// CODE.md 9m.9 (moves.test.ts): hand-made positions for the rules of thumb.
// Each test names the situation and the move the rules of thumb make.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import type { Persona } from '../../src/ai/persona.ts';
import { chooseCard, chooseFinalTwo, chooseSwap, chooseTakeAnswer, chooseVote } from '../../src/ai/moves.ts';
import { cards, position, standard } from './position.ts';

const ORDER = ['p1', 'p2', 'p3'];
const START = { type: 'roundStarted' as const, round: 1, dealer: 'p1', ultimate: false };

function playOf(id: string, player: string) {
  return { type: 'cardPlayed' as const, player, card: standard(id) };
}

function cardOf(action: unknown): string | undefined {
  const a = action as { type?: string; cardId?: string } | null;
  return a?.type === 'playCard' ? a.cardId : undefined;
}

const normal: Persona = { level: 'normal', personality: 'counter' };
const careful: Persona = { level: 'normal', personality: 'careful' };

test('following: plays low under the top card when someone after me may be void (a known void)', () => {
  // p3 leads hearts-9. I am p1 (p2 is still to play after me and is known void in hearts).
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('hearts-10', 'hearts-3', 'clubs-5'), p2: cards('clubs-7', 'clubs-8'), p3: cards('clubs-2') },
    leader: 'p3',
    turn: 'p1',
    plays: [{ player: 'p3', cardId: 'hearts-9' }],
    events: [START, playOf('hearts-9', 'p3')],
    personality: 'counter',
  });
  p.memory.voids.p2!.add('hearts'); // known void (a slap shows it; missing suits are secret)
  // My 10 would be the top card: I play my highest card under 9, which is the 3.
  assert.equal(cardOf(chooseCard(p.seen, p.memory, p.persona, seededRng(1))), 'hearts-3');
});

test('following: dumps my highest card of the suit when I am last to play', () => {
  // Trick order: p2 leads hearts-4, p3 follows with hearts-6. I am p1, last to play.
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('hearts-13', 'hearts-3'), p2: cards('clubs-7'), p3: cards('clubs-2') },
    leader: 'p2',
    turn: 'p1',
    plays: [{ player: 'p2', cardId: 'hearts-4' }, { player: 'p3', cardId: 'hearts-6' }],
    events: [START, playOf('hearts-4', 'p2'), playOf('hearts-6', 'p3')],
  });
  assert.equal(cardOf(chooseCard(p.seen, p.memory, normal, seededRng(1))), 'hearts-13');
});

test('slapping: with no hearts, slaps with my singleton high card', () => {
  // Trick led hearts-5. I hold no hearts: my singleton ace is the card to slap with.
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('spades-14', 'clubs-5', 'clubs-7'), p2: cards('hearts-9'), p3: cards('clubs-2') },
    leader: 'p2',
    turn: 'p1',
    plays: [{ player: 'p2', cardId: 'hearts-9' }],
    events: [START, playOf('hearts-9', 'p2')],
  });
  assert.equal(cardOf(chooseCard(p.seen, p.memory, careful, seededRng(1))), 'spades-14');
});

test('slapping: never a joker while I hold a standard card', () => {
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('joker-1', 'clubs-2', 'spades-9'), p2: cards('hearts-9'), p3: cards('clubs-3') },
    leader: 'p2',
    turn: 'p1',
    plays: [{ player: 'p2', cardId: 'hearts-9' }],
    events: [START, playOf('hearts-9', 'p2')],
    jokers: true,
  });
  const move = chooseCard(p.seen, p.memory, careful, seededRng(1));
  assert.notEqual(move && (move as { cardId?: string }).cardId, 'joker-1');
});

test('leading: with a single joker and every suit risky, a joker can be led', () => {
  // Everyone else is known void in every suit I hold, so every lead is risky.
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('joker-1', 'clubs-9', 'hearts-8'), p2: cards('diamonds-2'), p3: cards('spades-3') },
    leader: 'p1',
    turn: 'p1',
    events: [START],
    jokers: true,
  });
  for (const who of ['p2', 'p3'] as const) {
    p.memory.voids[who]!.add('clubs');
    p.memory.voids[who]!.add('hearts');
  }
  // Reckless scales every risk above 0.7, so a joker lead is chosen.
  const move = chooseCard(p.seen, p.memory, { level: 'normal', personality: 'reckless' }, seededRng(1)) as { type: string; cardId: string };
  assert.equal(move.type, 'playCard');
  assert.equal(move.cardId, 'joker-1');
});

test('final two: when I may keep a lower card, leading my lowest card', () => {
  // Two players hold cards. p2 has one card; I lead, so I lead my lowest.
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: { p1: cards('spades-12', 'spades-4'), p2: cards('clubs-2'), p3: [] },
    leader: 'p1',
    turn: 'p1',
    events: [START],
  });
  assert.equal(cardOf(chooseCard(p.seen, p.memory, normal, seededRng(1))), 'spades-4');
});

test('swap: gives away a short suit whose top card is 9 or more, to become void', () => {
  const p = position({
    order: ['p1', 'p2'],
    me: 'p1',
    hands: { p1: cards('diamonds-10', 'clubs-3', 'clubs-4', 'clubs-5', 'hearts-6', 'hearts-7', 'spades-8', 'spades-2'), p2: cards('clubs-6') },
    leader: 'p1',
    turn: 'p1',
    events: [START],
  });
  const action = chooseSwap(p.seen, normal, seededRng(3)) as unknown as { cardIds: string[] };
  assert.ok(action.cardIds.includes('diamonds-10'));
  assert.ok(action.cardIds.length <= 4);
});

test('swap: keeps a good hand (no short suit with a high top card, no Q, K or A)', () => {
  const p = position({
    order: ['p1', 'p2'],
    me: 'p1',
    hands: { p1: cards('clubs-3', 'clubs-4', 'hearts-5', 'hearts-6', 'spades-2', 'diamonds-8'), p2: cards('clubs-6') },
    leader: 'p1',
    turn: 'p1',
    events: [START],
  });
  assert.deepEqual((chooseSwap(p.seen, normal, seededRng(3)) as unknown as { cardIds: string[] }).cardIds, []);
});

test('take-cards: always agrees to a request, answering the first asker in seat order', () => {
  const p = position({
    order: ORDER,
    me: 'p3',
    hands: { p1: cards('clubs-2'), p2: cards('clubs-3'), p3: cards('spades-9', 'hearts-9') },
    leader: 'p1',
    turn: 'p1',
    events: [START],
    takeRequests: [
      { requester: 'p2', target: 'p3', agreed: false },
      { requester: 'p1', target: 'p3', agreed: false },
    ],
  });
  assert.deepEqual(chooseTakeAnswer(p.seen), { type: 'answerTake', by: 'p3', requester: 'p1', accept: true });
});

test('final two: picks up a small pile, forfeits a big one, and is a chance in between', () => {
  const pile = (n: number) => position({
    order: ['p1', 'p2'],
    me: 'p1',
    hands: { p1: cards('clubs-2'), p2: cards('clubs-3') },
    leader: 'p1',
    turn: 'p1',
    events: [START],
    waste: Array.from({ length: n }, (_, i) => ({ kind: 'joker' as const, id: `hidden-w-${i}` })),
    pendingFinalTwo: 'p1',
  });
  const rng = seededRng(4);
  assert.equal(chooseFinalTwo(pile(5).seen, normal, rng).type, 'pickUpWastePile');
  assert.equal(chooseFinalTwo(pile(11).seen, normal, rng).type, 'pickUpWastePile');
  assert.equal(chooseFinalTwo(pile(12).seen, normal, rng).type, 'pickUpWastePile');
  assert.equal(chooseFinalTwo(pile(25).seen, normal, rng).type, 'forfeit');
  assert.equal(chooseFinalTwo(pile(30).seen, normal, rng).type, 'forfeit');
  // Between 12 and 25 the chance of picking up falls from 1 (12 cards) to 0 (25 cards); 18 cards is in between.
  const outcomes = new Set<string>();
  for (let s = 1; s <= 50; s++) outcomes.add(chooseFinalTwo(pile(18).seen, normal, seededRng(s)).type);
  assert.deepEqual([...outcomes].sort(), ['forfeit', 'pickUpWastePile']);
});

test('votes: a bad hand says yes to a reshuffle; a good hand says no', () => {
  const vote = (hand: string[]) => {
    const p = position({
      order: ORDER,
      me: 'p1',
      hands: { p1: cards(...hand), p2: cards('clubs-3'), p3: cards('clubs-4') },
      leader: 'p1',
      turn: 'p1',
      events: [START],
    });
    const withVote = { ...p.seen, view: { ...p.seen.view, vote: { kind: 'reshuffle' as const, calledBy: null, value: null, voted: [], myBallot: null, awaitingHost: false } } };
    return chooseVote(withVote as typeof p.seen, careful, seededRng(1));
  };
  assert.deepEqual(vote(['clubs-14', 'hearts-13', 'spades-14', 'diamonds-12']), { type: 'castVote', by: 'p1', ballot: 'yes' });
  assert.deepEqual(vote(['clubs-3', 'clubs-4', 'hearts-5', 'hearts-6', 'spades-2', 'diamonds-7']), { type: 'castVote', by: 'p1', ballot: 'no' });
});
