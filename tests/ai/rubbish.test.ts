// CODE.md 9ap.D (2.38.2): computer players call "Deal again?" when their hand is rubbish, and vote yes on a
// reshuffle when their hand is worse than average. Easy calls only half as often (a coin toss).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { chooseCallVote, chooseVote } from '../../src/ai/moves.ts';
import type { Level, Persona } from '../../src/ai/persona.ts';
import type { AiSeen } from '../../src/ai/seen.ts';
import { cards, position } from './position.ts';

const ORDER = ['p1', 'p2', 'p3', 'p4'];
const START = { type: 'roundStarted' as const, round: 1, dealer: 'p1', ultimate: false };

/** High cards in all four suits: a rubbish hand (handBadness about 0.8; higher is worse). */
const HIGH = cards('spades-14', 'hearts-13', 'clubs-12', 'diamonds-14', 'hearts-11', 'spades-13', 'clubs-14', 'diamonds-12');
/** Low cards in all four suits: a good hand (handBadness about -0.8). */
const LOW = cards('spades-2', 'hearts-3', 'clubs-4', 'diamonds-2', 'hearts-5', 'spades-3', 'clubs-2', 'diamonds-4');

/** Me (p1) with `hand`, in a round, with the window and vote fields set as the test needs. */
function at(hand: ReturnType<typeof cards>, opts: { level?: Level; personality?: Persona['personality'] } = {}, view: Record<string, unknown> = {}) {
  const p = position({
    order: ORDER,
    me: 'p1',
    hands: {
      p1: hand,
      p2: cards('clubs-5', 'clubs-6', 'clubs-7', 'clubs-9'),
      p3: cards('spades-5', 'spades-6', 'spades-7', 'spades-9'),
      p4: cards('diamonds-5', 'diamonds-6', 'diamonds-7', 'diamonds-9'),
    },
    leader: 'p2',
    turn: 'p2',
    events: [START],
    level: opts.level ?? 'normal',
    personality: opts.personality ?? 'counter',
  });
  const seen = { ...p.seen, view: { ...p.seen.view, ...view } } as AiSeen;
  return { seen, persona: p.persona };
}

const WINDOW = { canCallReshuffle: true };
const VOTE = (kind: 'reshuffle' | 'target' | 'ultimate') => ({
  kind, calledBy: 'p2', value: null, voted: [], myBallot: null, awaitingHost: false,
});

test('call: a rubbish hand (high cards) calls Deal again (Normal, in the reshuffle window)', () => {
  const a = at(HIGH, { level: 'normal' }, WINDOW);
  assert.deepEqual(chooseCallVote(a.seen, a.persona, seededRng(1)), { type: 'callVote', by: 'p1', kind: 'reshuffle' });
});

test('call: a good hand (low cards) does not call', () => {
  const a = at(LOW, { level: 'normal' }, WINDOW);
  assert.equal(chooseCallVote(a.seen, a.persona, seededRng(1)), null);
});

test('call: no call when the window is shut (already used this round, or not in the reshuffle phase)', () => {
  const a = at(HIGH, { level: 'normal' }, { canCallReshuffle: false });
  assert.equal(chooseCallVote(a.seen, a.persona, seededRng(1)), null);
});

test('call: Easy calls on about half of the rubbish hands (a coin toss)', () => {
  let calls = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = at(HIGH, { level: 'easy' }, WINDOW);
    if (chooseCallVote(a.seen, a.persona, seededRng(seed))) calls++;
  }
  assert.ok(calls > 70 && calls < 130, `easy called ${calls} of 200`);
});

test('vote: on a reshuffle, a worse-than-average hand votes yes and a better one votes no', () => {
  const bad = at(HIGH, {}, { vote: VOTE('reshuffle') });
  assert.deepEqual(chooseVote(bad.seen, bad.persona, seededRng(1)), { type: 'castVote', by: 'p1', ballot: 'yes' });
  const good = at(LOW, {}, { vote: VOTE('reshuffle') });
  assert.deepEqual(chooseVote(good.seen, good.persona, seededRng(1)), { type: 'castVote', by: 'p1', ballot: 'no' });
});
