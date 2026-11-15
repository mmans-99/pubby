// CODE.md 9z.6 step 1 (learn.test.ts): the habit counts from hand-made public
// events, minimum evidence, the ±20% bound and the 50–150% clamp, Easy and
// null tables, what survives a round, rebuild equals step-by-step, and the
// hidden-card test (a learned value never depends on a hidden card).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rank, StandardCard, Suit } from '../../src/rules/cards.ts';
import type { LogEntry, PlayerId, SessionEvent } from '../../src/session/types.ts';
import {
  LEARN_TUNING,
  learnedFactors,
  learnedWeights,
  newHabits,
  noteHabits,
  rebuildHabits,
  type Habits,
  type PersonalityWeights,
  type PersonTally,
} from '../../src/ai/learn.ts';

const ORDER = ['p1', 'p2', 'p3'];
const BASE: PersonalityWeights = { risk: 1.4, jokerSave: 0.7, reactRate: 0.9, reshuffleBar: 1.1 };

function sc(suit: Suit, rank: number): StandardCard {
  return { kind: 'standard', id: `${suit}-${rank}`, suit, rank: rank as Rank };
}

const roundStart = (round = 1): SessionEvent => ({ type: 'roundStarted', round, dealer: 'p1', ultimate: false });
const played = (player: PlayerId, suit: Suit, rank: number): SessionEvent => ({
  type: 'cardPlayed',
  player,
  card: sc(suit, rank),
});
const joker = (player: PlayerId): SessionEvent => ({ type: 'jokerPlayed', player, asLeader: false });
const discarded = (player: PlayerId, count: number): SessionEvent => ({ type: 'jokersDiscarded', player, count });
const trickEnd = (): SessionEvent => ({ type: 'trickResolved', nextLeader: null });
const slap = (slapper: PlayerId, slapped: PlayerId): SessionEvent => ({
  type: 'slapped',
  slapper,
  slapped,
  cardsPickedUp: 3,
});

/** A full trick with three plays: p2 leads, then p3 and p1 follow. p3 is a bold follow (3 > 2); p1 is last, so no chance. */
const oneTrick = (): SessionEvent[] => [
  played('p2', 'hearts', 2),
  played('p3', 'hearts', 3),
  played('p1', 'hearts', 4),
  trickEnd(),
];

function run(events: readonly SessionEvent[], order = ORDER, computers: PlayerId[] = []): Habits {
  const h = newHabits(order, computers);
  noteHabits(h, events);
  return h;
}

function at(h: Habits, p: PlayerId): PersonTally {
  const t = h.people[p];
  if (!t) throw new Error(`${p} should be counted`);
  return t;
}

function near(a: number, b: number): void {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} should be ${b}`);
}

/** A table with chosen tallies for one person (for the weight maths, not the counting). */
function tableWith(p1: Partial<Record<'boldFollow' | 'highLead' | 'earlyJoker', { chances: number; yes: number }>>): Habits {
  const h = newHabits(ORDER, []);
  for (const [name, tally] of Object.entries(p1)) {
    if (tally) at(h, 'p1')[name as 'boldFollow' | 'highLead' | 'earlyJoker'] = { ...tally };
  }
  return h;
}

// --- Counting each habit -----------------------------------------------------

test('bold follow: a follow above the top led card is a yes when someone plays after it', () => {
  const h = run([roundStart(), played('p2', 'hearts', 5), played('p1', 'hearts', 9), played('p3', 'hearts', 3), trickEnd()]);
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 1, yes: 1 });
});

test('bold follow: the last card of a trick is not a chance (nobody played after it)', () => {
  const h = run([roundStart(), played('p2', 'hearts', 5), played('p1', 'hearts', 9), trickEnd()]);
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 0, yes: 0 });
});

test('bold follow: a low follow is a chance with no yes', () => {
  const h = run([roundStart(), played('p2', 'hearts', 9), played('p1', 'hearts', 3), played('p3', 'hearts', 4), trickEnd()]);
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 1, yes: 0 });
});

test('bold follow: a slap ends the trick, and the off-suit slapping card is not a follow', () => {
  const h = run([
    roundStart(),
    played('p2', 'hearts', 5),
    played('p1', 'hearts', 9),
    played('p3', 'clubs', 2),
    slap('p3', 'p1'),
    trickEnd(),
  ]);
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 1, yes: 1 });
  assert.deepEqual(at(h, 'p3').boldFollow, { chances: 0, yes: 0 });
});

test('bold follow: a joker lead does not make the first standard card a follow', () => {
  const h = run([roundStart(), joker('p2'), played('p1', 'hearts', 14), played('p3', 'hearts', 3), trickEnd()]);
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 0, yes: 0 });
  assert.deepEqual(at(h, 'p1').highLead, { chances: 0, yes: 0 });
});

test('high lead: leading J, Q, K or A is a yes; a lower lead is a chance with no yes', () => {
  const h = run([roundStart(), played('p1', 'spades', 11), trickEnd(), played('p1', 'hearts', 10), played('p2', 'hearts', 2), played('p3', 'hearts', 3), trickEnd()]);
  assert.deepEqual(at(h, 'p1').highLead, { chances: 2, yes: 1 });
});

test('high lead: a card after someone else\'s joker lead does not count', () => {
  const h = run([roundStart(), joker('p2'), played('p1', 'hearts', 14), trickEnd()]);
  assert.deepEqual(at(h, 'p1').highLead, { chances: 0, yes: 0 });
});

test('early joker: a joker in trick 5 of the round is a yes; in trick 6 it is not', () => {
  const four = [...oneTrick(), ...oneTrick(), ...oneTrick(), ...oneTrick()];
  const five = [...four, ...oneTrick()];
  const early = run([roundStart(), ...four, joker('p1')]);
  assert.deepEqual(at(early, 'p1').earlyJoker, { chances: 1, yes: 1 });
  const late = run([roundStart(), ...five, joker('p1')]);
  assert.deepEqual(at(late, 'p1').earlyJoker, { chances: 1, yes: 0 });
});

test('early joker: each joker thrown away with the last normal card is a chance, never a yes', () => {
  const h = run([roundStart(), played('p1', 'hearts', 4), discarded('p1', 2)]);
  assert.deepEqual(at(h, 'p1').earlyJoker, { chances: 2, yes: 0 });
});

test('computer seats are never counted, but their cards still set the led suit and top card', () => {
  const h = run(
    [roundStart(), played('p2', 'hearts', 5), played('c1', 'hearts', 12), played('p1', 'hearts', 9), played('p3', 'hearts', 3), trickEnd(), joker('c1')],
    ORDER,
    ['c1'],
  );
  assert.equal(h.people.c1, undefined);
  // p1's 9 is below c1's 12 (the top card), so the follow is a chance with no yes.
  assert.deepEqual(at(h, 'p1').boldFollow, { chances: 1, yes: 0 });
});

test('a trick end with no plays (the final-two pick-up) is not counted as a trick', () => {
  // Five empty trick ends would push the joker past trick 5 if they counted.
  const h = run([roundStart(), trickEnd(), trickEnd(), trickEnd(), trickEnd(), trickEnd(), joker('p1')]);
  assert.deepEqual(at(h, 'p1').earlyJoker, { chances: 1, yes: 1 });
});

// --- Minimum evidence and the weights ----------------------------------------

test('five bold follows: base weights; six: risk nudged down (the table plays boldly)', () => {
  const five = learnedWeights(BASE, 'normal', tableWith({ boldFollow: { chances: 5, yes: 5 } }));
  assert.deepEqual(five, BASE);
  const six = learnedWeights(BASE, 'normal', tableWith({ boldFollow: { chances: 6, yes: 6 } }));
  near(six.risk, BASE.risk * 0.8);
  assert.equal(six.jokerSave, BASE.jokerSave);
  assert.equal(six.reactRate, BASE.reactRate);
  assert.equal(six.reshuffleBar, BASE.reshuffleBar);
});

test('jokers need 3 chances, not 6', () => {
  assert.deepEqual(learnedWeights(BASE, 'normal', tableWith({ earlyJoker: { chances: 2, yes: 2 } })), BASE);
  const three = learnedWeights(BASE, 'normal', tableWith({ earlyJoker: { chances: 3, yes: 3 } }));
  near(three.jokerSave, BASE.jokerSave * 1.2);
  assert.equal(three.risk, BASE.risk);
});

test('the table is the average of the people who reached the minimum only', () => {
  const h = newHabits(ORDER, []);
  at(h, 'p1').boldFollow = { chances: 6, yes: 6 }; // rate 1, counts
  at(h, 'p2').boldFollow = { chances: 6, yes: 0 }; // rate 0, counts
  at(h, 'p3').boldFollow = { chances: 5, yes: 0 }; // too few chances, ignored
  // Average of 1 and 0 is 0.5. With a neutral rate of 0.5 for bold follows there is no shift.
  // (The real neutral is measured in step 2, so this test passes its own tuning.)
  const tuning = { ...LEARN_TUNING, neutral: { ...LEARN_TUNING.neutral, boldFollow: 0.5 } };
  assert.deepEqual(learnedWeights(BASE, 'normal', h, tuning), BASE);
});

test('the nudge stays within 80% to 120% of the base at the real tuning', () => {
  const tables = [
    tableWith({ boldFollow: { chances: 10, yes: 10 }, highLead: { chances: 10, yes: 10 }, earlyJoker: { chances: 10, yes: 10 } }),
    tableWith({ boldFollow: { chances: 10, yes: 0 }, highLead: { chances: 10, yes: 0 }, earlyJoker: { chances: 10, yes: 0 } }),
  ];
  for (const h of tables) {
    const w = learnedWeights(BASE, 'hard', h);
    assert.ok(w.risk >= BASE.risk * 0.8 - 1e-9 && w.risk <= BASE.risk * 1.2 + 1e-9, `risk ${w.risk}`);
    assert.ok(w.jokerSave >= BASE.jokerSave * 0.8 - 1e-9 && w.jokerSave <= BASE.jokerSave * 1.2 + 1e-9, `jokerSave ${w.jokerSave}`);
  }
});

test('the 50% to 150% clamp holds with a made-up tuning that would push past it', () => {
  const wild = { ...LEARN_TUNING, gain: 10, shiftCap: 5 };
  const h = tableWith({ boldFollow: { chances: 6, yes: 6 }, earlyJoker: { chances: 3, yes: 3 } });
  const factors = learnedFactors(h, wild);
  assert.ok(factors.risk < 0, 'the raw factor goes below zero');
  assert.ok(factors.jokerSave > 1.5, 'the raw joker factor goes past 1.5');
  const w = learnedWeights(BASE, 'normal', h, wild);
  near(w.risk, BASE.risk * 0.5);
  near(w.jokerSave, BASE.jokerSave * 1.5);
});

test('Easy returns the base weights; a null table returns them too (same object)', () => {
  const h = tableWith({ boldFollow: { chances: 6, yes: 6 }, earlyJoker: { chances: 3, yes: 3 } });
  assert.equal(learnedWeights(BASE, 'easy', h), BASE);
  assert.equal(learnedWeights(BASE, 'normal', null), BASE);
  assert.deepEqual(learnedFactors(null), { risk: 1, jokerSave: 1 });
});

test('Hard learns the same way as Normal', () => {
  const h = tableWith({ boldFollow: { chances: 6, yes: 6 } });
  assert.deepEqual(learnedWeights(BASE, 'hard', h), learnedWeights(BASE, 'normal', h));
  assert.notDeepEqual(learnedWeights(BASE, 'hard', h), BASE);
});

// --- What survives a round, and a new game ----------------------------------

test('round start resets the trick count but keeps the tallies; a new game starts empty', () => {
  const h = run([roundStart(1), ...oneTrick(), ...oneTrick(), ...oneTrick(), ...oneTrick(), ...oneTrick(), roundStart(2), joker('p1'), ...oneTrick()]);
  // p1's joker is trick 1 of round 2, so it is early again.
  assert.deepEqual(at(h, 'p1').earlyJoker, { chances: 1, yes: 1 });
  // p3's bold follows from both rounds are kept (6 tricks, each a yes).
  assert.deepEqual(at(h, 'p3').boldFollow, { chances: 6, yes: 6 });
  const fresh = newHabits(ORDER, []);
  assert.deepEqual(at(fresh, 'p3').boldFollow, { chances: 0, yes: 0 });
});

test('reshuffled changes nothing in the table', () => {
  const h = run([roundStart(), ...oneTrick(), { type: 'reshuffled', dealer: 'p2' }, ...oneTrick()]);
  assert.deepEqual(at(h, 'p3').boldFollow, { chances: 2, yes: 2 });
});

test('rebuilding from the log equals noting each event in turn (Carry on)', () => {
  const events: SessionEvent[] = [
    roundStart(1),
    ...oneTrick(),
    joker('p2'),
    played('p1', 'spades', 13),
    discarded('p3', 1),
    slap('p2', 'p1'),
    trickEnd(),
    { type: 'missingSuitDeclared', player: 'p1', suits: ['clubs'] },
    roundStart(2),
    played('p3', 'diamonds', 12),
    played('p1', 'diamonds', 2),
    trickEnd(),
  ];
  const log: LogEntry[] = events.map((event) => ({ round: 1, ultimate: false, event }));
  const stepByStep = newHabits(ORDER, ['p2']);
  for (const e of events) noteHabits(stepByStep, [e]);
  assert.deepEqual(rebuildHabits(log, ORDER, ['p2']), stepByStep);
});

// --- Hidden cards ------------------------------------------------------------

test('hidden-card test: a different hidden card, deck, missing suit or swap never changes a learned value', () => {
  // The learning code takes the public log and nothing else, so each game below is the same public log.
  // The hidden material differs between games and is never passed in.
  const publicLog = (suitsField: Suit[]): LogEntry[] => {
    const events: SessionEvent[] = [
      roundStart(1),
      ...oneTrick(),
      ...oneTrick(),
      joker('p1'),
      { type: 'missingSuitDeclared', player: 'p2', suits: suitsField },
      { type: 'swapped', player: 'p3', count: 2 },
      trickEnd(),
    ];
    return events.map((event) => ({ round: 1, ultimate: false, event }));
  };
  const hiddenA = { hand: { p1: [sc('hearts', 14)] }, hiddenDeck: { p3: [sc('clubs', 2)] }, swapped: { p3: [sc('spades', 13)] } };
  const hiddenB = { hand: { p1: [sc('hearts', 2)] }, hiddenDeck: { p3: [sc('clubs', 14)] }, swapped: { p3: [sc('spades', 3)] } };
  assert.notDeepEqual(hiddenA, hiddenB);

  const a = rebuildHabits(publicLog(['clubs']), ORDER, ['p2']);
  const b = rebuildHabits(publicLog(['hearts', 'spades']), ORDER, ['p2']); // different old suits field
  assert.deepEqual(a, b);
  assert.deepEqual(learnedWeights(BASE, 'normal', a), learnedWeights(BASE, 'normal', b));
});

test('no randomness and no hand fields in learn.ts (code only, comments ignored)', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../src/ai/learn.ts');
  const code = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /rng/i);
  assert.doesNotMatch(code, /\bhands?\b|hiddenDecks?|suits|swapped/);
});
