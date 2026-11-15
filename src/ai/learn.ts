/**
 * Computer players that learn from the people they play against, within one
 * game (CODE.md 9z, option 1). Pure: no randomness, no hands, no session state.
 *
 * Fairness (CODE.md 9z.1 item 3, 9z.2): only the public events this file reads
 * are used: roundStarted, cardPlayed, jokerPlayed, jokersDiscarded, slapped and
 * trickResolved. Every other event is ignored. A person's hand, the hidden
 * decks, the secret missing suit (including the old `suits` field) and the
 * swapped cards never reach this file, so they cannot change a habit table.
 * Computer seats are never counted (they only feed the trick state). Nothing
 * here is stored; the driver drops the table when the game ends.
 */

import type { StandardCard, Suit } from '../rules/cards.ts';
import type { LogEntry, PlayerId, SessionEvent } from '../session/types.ts';
import type { Level } from './persona.ts';

export type HabitName = 'boldFollow' | 'highLead' | 'earlyJoker';

export interface Tally {
  chances: number;
  yes: number;
}

export type PersonTally = Record<HabitName, Tally>;

/** A follow whose trick is still open: it is a chance only if someone played after it. */
interface PendingFollow {
  player: PlayerId;
  /** How many plays came before this one in the trick. */
  index: number;
  yes: boolean;
}

/** One habit table for one game, shared by every computer player on the phone. */
export interface Habits {
  /** Tallies per person. Computer seats have no entry. */
  readonly people: Record<PlayerId, PersonTally>;
  /** Tricks finished this round. A new round resets it; the tallies stay. */
  roundTricks: number;
  /** Cards and jokers played so far in the current trick. */
  plays: number;
  /** Suit of the first standard card of the current trick. */
  ledSuit: Suit | null;
  /** Highest rank of led-suit cards played so far in the current trick (0 = none yet). */
  topLed: number;
  pending: PendingFollow[];
}

/** The numbers that turn habits into weights. Changing them changes play, so they are tuned in one place. */
export interface LearnTuning {
  /** What the normal bot does on average in the arena. Placeholders until measured (CODE.md 9z.6 step 2). */
  readonly neutral: Readonly<Record<HabitName, number>>;
  /** Chances a person needs before a habit counts for them. */
  readonly minimum: Readonly<Record<HabitName, number>>;
  /** How far a table rate moves a weight, per unit of difference from neutral. */
  readonly gain: number;
  /** Largest shift either way, before the factor is applied. */
  readonly shiftCap: number;
  /** Lowest learned weight, as a share of the base weight. */
  readonly minFactor: number;
  /** Highest learned weight, as a share of the base weight. */
  readonly maxFactor: number;
  /** A joker played in one of the first this-many tricks of a round counts as early. */
  readonly earlyJokerTricks: number;
}

export const LEARN_TUNING: LearnTuning = {
  neutral: { boldFollow: 0.5, highLead: 0.3, earlyJoker: 0.5 },
  minimum: { boldFollow: 6, highLead: 6, earlyJoker: 3 },
  gain: 0.4,
  shiftCap: 0.2,
  minFactor: 0.5,
  maxFactor: 1.5,
  earlyJokerTricks: 5,
};

/** The weights a personality has (same shape as PERSONALITY_WEIGHTS in persona.ts). */
export interface PersonalityWeights {
  risk: number;
  jokerSave: number;
  reactRate: number;
  reshuffleBar: number;
}

export interface LearnedFactors {
  /** Multiplies `risk`. Below 1 when the table plays boldly. */
  readonly risk: number;
  /** Multiplies `jokerSave`. Above 1 when the table plays jokers early. */
  readonly jokerSave: number;
}

/** Ace is the top rank; J, Q and K are 11 to 13. */
const FACE_OR_ACE = 11;

function emptyTally(): PersonTally {
  return {
    boldFollow: { chances: 0, yes: 0 },
    highLead: { chances: 0, yes: 0 },
    earlyJoker: { chances: 0, yes: 0 },
  };
}

function clearTrick(h: Habits): void {
  h.plays = 0;
  h.ledSuit = null;
  h.topLed = 0;
  h.pending = [];
}

/** An empty table. `order` is every seat; `computerIds` are the seats with the public computer tag. */
export function newHabits(order: readonly PlayerId[], computerIds: readonly PlayerId[]): Habits {
  const computers = new Set(computerIds);
  const people: Record<PlayerId, PersonTally> = {};
  for (const p of order) if (!computers.has(p)) people[p] = emptyTally();
  return { people, roundTricks: 0, plays: 0, ledSuit: null, topLed: 0, pending: [] };
}

function addChance(t: PersonTally, name: HabitName, yes: boolean): void {
  const tally = t[name];
  tally.chances++;
  if (yes) tally.yes++;
}

/** Trick over (or a slap ended it): a follow counts only if someone played after it. */
function scoreFollows(h: Habits): void {
  for (const f of h.pending) {
    const t = h.people[f.player];
    if (t && h.plays > f.index + 1) addChance(t, 'boldFollow', f.yes);
  }
  h.pending = [];
}

/** Take public events in order. Reads only the events listed in the file comment. */
export function noteHabits(h: Habits, events: readonly SessionEvent[], tuning: LearnTuning = LEARN_TUNING): void {
  for (const e of events) {
    switch (e.type) {
      case 'roundStarted':
        h.roundTricks = 0;
        clearTrick(h);
        break;
      case 'cardPlayed': {
        const t = h.people[e.player];
        const card: StandardCard = e.card;
        if (t && h.plays === 0) {
          // Started the trick with a normal card (a card after someone else's joker lead does not come here).
          addChance(t, 'highLead', card.rank >= FACE_OR_ACE);
        } else if (t && h.ledSuit !== null && card.suit === h.ledSuit) {
          // A follow. Its yes is decided against the top led card before this one.
          h.pending.push({ player: e.player, index: h.plays, yes: card.rank > h.topLed });
        }
        // The first standard card sets the led suit (a joker lead does not).
        if (h.ledSuit === null) h.ledSuit = card.suit;
        if (card.suit === h.ledSuit) h.topLed = Math.max(h.topLed, card.rank);
        h.plays++;
        break;
      }
      case 'jokerPlayed': {
        const t = h.people[e.player];
        if (t) addChance(t, 'earlyJoker', h.roundTricks + 1 <= tuning.earlyJokerTricks);
        h.plays++;
        break;
      }
      case 'jokersDiscarded': {
        // Each joker thrown away is a chance that was not played early.
        const t = h.people[e.player];
        if (t) for (let i = 0; i < e.count; i++) addChance(t, 'earlyJoker', false);
        break;
      }
      case 'slapped':
        // The slapper's card is the last play; trickResolved follows in the same action.
        scoreFollows(h);
        break;
      case 'trickResolved':
        scoreFollows(h);
        // A trick ends with no plays only for the final-two pick-up, which is not a trick.
        if (h.plays > 0) h.roundTricks++;
        clearTrick(h);
        break;
      default:
        break;
    }
  }
}

/** The table from a whole game's log (Carry on). Same result as noting each event in turn. */
export function rebuildHabits(
  log: readonly LogEntry[],
  order: readonly PlayerId[],
  computerIds: readonly PlayerId[],
  tuning: LearnTuning = LEARN_TUNING,
): Habits {
  const h = newHabits(order, computerIds);
  for (const entry of log) noteHabits(h, [entry.event], tuning);
  return h;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Average rate of the people who have reached the habit's minimum. Null when nobody has. */
export function tableRate(h: Habits, name: HabitName, tuning: LearnTuning = LEARN_TUNING): number | null {
  let sum = 0;
  let n = 0;
  for (const t of Object.values(h.people)) {
    const tally = t[name];
    if (tally.chances > 0 && tally.chances >= tuning.minimum[name]) {
      sum += tally.yes / tally.chances;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/** The shift for one habit, or null when no person has reached its minimum (no effect). */
function shiftFor(h: Habits, name: HabitName, tuning: LearnTuning): number | null {
  const rate = tableRate(h, name, tuning);
  if (rate === null) return null;
  return clamp(tuning.gain * (rate - tuning.neutral[name]), -tuning.shiftCap, tuning.shiftCap);
}

/**
 * The two factors for this table. `risk` averages the shifts of the two risk
 * habits that are in effect; `jokerSave` uses the joker habit. No habit in
 * effect gives 1.
 */
export function learnedFactors(h: Habits | null, tuning: LearnTuning = LEARN_TUNING): LearnedFactors {
  if (h === null) return { risk: 1, jokerSave: 1 };
  const riskShifts = [shiftFor(h, 'boldFollow', tuning), shiftFor(h, 'highLead', tuning)].filter(
    (s): s is number => s !== null,
  );
  const riskShift = riskShifts.length > 0 ? riskShifts.reduce((a, b) => a + b, 0) / riskShifts.length : 0;
  const jokerShift = shiftFor(h, 'earlyJoker', tuning) ?? 0;
  return { risk: 1 - riskShift, jokerSave: 1 + jokerShift };
}

function bounded(base: number, factor: number, tuning: LearnTuning): number {
  return clamp(base * factor, base * tuning.minFactor, base * tuning.maxFactor);
}

/**
 * A computer player's weights for this game. Easy never learns, and a null
 * table (learning off) gives back `base` itself. Only `risk` and `jokerSave`
 * can change; `reactRate` and `reshuffleBar` never do.
 */
export function learnedWeights<W extends PersonalityWeights>(
  base: W,
  level: Level,
  h: Habits | null,
  tuning: LearnTuning = LEARN_TUNING,
): W {
  if (level === 'easy' || h === null) return base;
  const f = learnedFactors(h, tuning);
  return {
    ...base,
    risk: bounded(base.risk, f.risk, tuning),
    jokerSave: bounded(base.jokerSave, f.jokerSave, tuning),
  };
}
