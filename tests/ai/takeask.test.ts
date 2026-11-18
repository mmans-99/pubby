// CODE.md 9an.2 (2.38, Part B): computer players ask for cards only when stuck, pick the player they
// can't get past, and sometimes refuse a person who keeps slapping them, with a taunt.
// Positions are hand-made (position.ts); the memory counters are set from public events or directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seededRng } from '../../src/rules/rng.ts';
import { ASK_BAR, chooseTakeAnswer, chooseTakeAsk, REFUSE_RATE } from '../../src/ai/moves.ts';
import { newMemory, remember } from '../../src/ai/memory.ts';
import { reactionFor, LAUGH } from '../../src/ai/react.ts';
import type { Level, Persona, Personality } from '../../src/ai/persona.ts';
import type { AiSeen } from '../../src/ai/seen.ts';
import type { PlayerId, SessionEvent } from '../../src/session/types.ts';
import { cards, position } from './position.ts';

const ORDER = ['p1', 'p2', 'p3', 'p4'];
const START = { type: 'roundStarted' as const, round: 1, dealer: 'p1', ultimate: false };

/** Me (p1) on the lead with 4 cards; each other player holds 4 too, so nobody is far behind. */
function leadPosition(opts: { level?: Level; personality?: Personality; my?: number; others?: number } = {}) {
  const others = opts.others ?? 4;
  const my = opts.my ?? 4;
  const hand = (n: number, suit: string) => Array.from({ length: n }, (_, i) => `${suit}-${i + 2}`);
  return position({
    order: ORDER,
    me: 'p1',
    hands: {
      p1: cards(...hand(my, 'hearts')),
      p2: cards(...hand(others, 'clubs')),
      p3: cards(...hand(others, 'spades')),
      p4: cards(...hand(others, 'diamonds')),
    },
    leader: 'p1',
    turn: 'p1',
    events: [START],
    level: opts.level ?? 'normal',
    personality: opts.personality ?? 'counter',
  });
}

/** Mark who is a person (no computer flag) in the bot's view of the session. */
function withPeople(seen: AiSeen, humans: readonly PlayerId[]): AiSeen {
  return {
    ...seen,
    session: {
      ...seen.session,
      players: seen.session.players.map((p) => ({ ...p, computer: !humans.includes(p.id) })),
    },
  };
}

function askedFor(action: unknown): string | undefined {
  const a = action as { type?: string; target?: string } | null;
  return a?.type === 'requestTake' ? a.target : undefined;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

// 9ap.C (2.38.2): fixed "random" numbers for the chance roll. `sure` is below every level's chance (so a stuck
// computer asks); `never` is above it (so it plays a card instead).
const sure = (): number => 0;
const never = (): number => 0.999;

/** Stuck at trick 6 with three pick-ups and two slaps by p3 (passes the stuck rule at every level). */
function stuckAt(level: Level = 'normal', trick = 6) {
  const p = leadPosition({ level });
  p.memory.trickCount = trick;
  p.memory.pickups = 3;
  p.memory.slappedMe.p3 = 2;
  return p;
}

test('ask: not stuck (picked up only once, slapped three times) means no ask', () => {
  const p = leadPosition();
  p.memory.trickCount = 6;
  p.memory.pickups = 1;
  p.memory.slappedMe.p3 = 3;
  assert.equal(chooseTakeAsk(p.seen, p.memory, sure), null);
});

test('ask: one slap and three pick-ups is not stuck (needs two slaps or far more cards)', () => {
  const p = leadPosition();
  p.memory.trickCount = 6;
  p.memory.pickups = 3;
  p.memory.slappedMe.p3 = 1;
  assert.equal(chooseTakeAsk(p.seen, p.memory, sure), null);
});

test('ask: stuck after three pick-ups and two slaps by one player asks that player', () => {
  const p = stuckAt();
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, sure)), 'p3');
});

test('ask: stuck by holding twice the others (8+ cards), and asks the player with a missing suit', () => {
  const p = leadPosition({ my: 9, others: 3 });
  p.memory.trickCount = 6;
  p.memory.pickups = 3;
  p.memory.voids.p2!.add('hearts');
  p.memory.voids.p2!.add('spades');
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, sure)), 'p2');
});

test('ask: twice the others but under 8 cards is not stuck', () => {
  const p = leadPosition({ my: 6, others: 2 });
  p.memory.trickCount = 6;
  p.memory.pickups = 3;
  assert.equal(chooseTakeAsk(p.seen, p.memory, sure), null);
});

test('ask: waits until trick 6, and only the player about to lead asks', () => {
  const early = stuckAt('normal', 5);
  assert.equal(chooseTakeAsk(early.seen, early.memory, sure), null);
  const notMyTurn = stuckAt();
  const other = { ...notMyTurn.seen, view: { ...notMyTurn.seen.view, turn: 'p2' as PlayerId } };
  assert.equal(chooseTakeAsk(other, notMyTurn.memory, sure), null);
});

test('ask: Normal asks once a round; Hard may ask twice, with a gap', () => {
  const normal = stuckAt('normal');
  normal.memory.asks = 1;
  assert.equal(chooseTakeAsk(normal.seen, normal.memory, sure), null);

  const hard = stuckAt('hard');
  hard.memory.asks = 1;
  hard.memory.lastAskTrick = 1; // 6 - 1 = 5 tricks since the ask
  hard.memory.pickupsSinceAsk = 2;
  assert.equal(askedFor(chooseTakeAsk(hard.seen, hard.memory, sure)), 'p3');
});

test('ask: a refused computer waits five tricks and two more pick-ups before asking again', () => {
  const p = stuckAt('hard', 7);
  p.memory.asks = 1;
  p.memory.lastAskTrick = 6;
  p.memory.pickups = 5;
  p.memory.pickupsSinceAsk = 0;
  assert.equal(chooseTakeAsk(p.seen, p.memory, sure), null, 'one trick later: no ask');
  p.memory.trickCount = 11;
  p.memory.pickupsSinceAsk = 1;
  assert.equal(chooseTakeAsk(p.seen, p.memory, sure), null, 'five tricks later but one pick-up: no ask');
  p.memory.pickupsSinceAsk = 2;
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, sure)), 'p3');
});

test('ask: the bars are as set (Easy 4.0, Normal 3.0, Hard 2.5)', () => {
  assert.deepEqual(ASK_BAR, { easy: 4.0, normal: 3.0, hard: 2.5 });
});

test('ask: the chance on top of being stuck is 15% Easy, 40% Normal, 60% Hard', () => {
  const asked = { easy: 0, normal: 0, hard: 0 };
  for (let seed = 1; seed <= 400; seed++) {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const p = stuckAt(level);
      if (chooseTakeAsk(p.seen, p.memory, seededRng(seed))) asked[level]++;
    }
  }
  assert.ok(asked.easy > 30 && asked.easy < 90, `easy asked ${asked.easy} of 400`);
  assert.ok(asked.normal > 120 && asked.normal < 200, `normal asked ${asked.normal} of 400`);
  assert.ok(asked.hard > 200 && asked.hard < 280, `hard asked ${asked.hard} of 400`);
});

test('ask: when the chance roll fails, the computer plays a card and can ask on a later lead', () => {
  const p = stuckAt();
  assert.equal(chooseTakeAsk(p.seen, p.memory, never), null);
  // Still stuck on a later lead (the roll is taken again): it asks.
  p.memory.trickCount = 7;
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, sure)), 'p3');
});

test('ask: while a request of mine is still open, I do not ask again', () => {
  const p = stuckAt();
  const open = { ...p.seen, session: { ...p.seen.session, takeRequests: [{ requester: 'p2', target: 'p4', agreed: false }] } };
  assert.equal(chooseTakeAsk(open, p.memory, sure), null);
});

// ---------------------------------------------------------------------------
// Answering: refusing to annoy
// ---------------------------------------------------------------------------

/**
 * I am the bot p3, holding `myCards`. p2 has asked me for cards, and p2 is a person
 * (or a computer, if `asker` says so). `iSlapped` is how often I have slapped p2 this round.
 */
function askedByPerson(opts: { level?: Level; personality?: Personality; iSlapped?: number; myCards?: number; asker?: 'person' | 'computer' } = {}) {
  const hand = (n: number, suit: string) => Array.from({ length: n }, (_, i) => `${suit}-${i + 2}`);
  const p = position({
    order: ORDER,
    me: 'p3',
    hands: {
      p1: cards(...hand(4, 'hearts')),
      p2: cards(...hand(4, 'clubs')),
      p3: cards(...hand(opts.myCards ?? 4, 'spades')),
      p4: cards(...hand(4, 'diamonds')),
    },
    leader: 'p1',
    turn: 'p1',
    events: [START],
    level: opts.level,
    personality: opts.personality ?? 'windup',
    takeRequests: [{ requester: 'p2', target: 'p3', agreed: false }],
  });
  const seen = withPeople(p.seen, opts.asker === 'computer' ? [] : ['p2']);
  p.memory.iSlapped.p2 = opts.iSlapped ?? 0;
  return { seen, memory: p.memory, persona: p.persona };
}

function refusals(opts: Parameters<typeof askedByPerson>[0], seeds = 200): number {
  let n = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const a = askedByPerson(opts);
    const act = chooseTakeAnswer(a.seen, a.memory, a.persona, seededRng(seed)) as { accept?: boolean } | null;
    if (act && act.accept === false) n++;
  }
  return n;
}

test('answer: a person who has slapped me less than twice is never refused', () => {
  assert.equal(refusals({ iSlapped: 1 }), 0);
});

test('answer: a computer asker is never refused, however often I was slapped by it', () => {
  assert.equal(refusals({ iSlapped: 5, asker: 'computer' }), 0);
});

test('answer: not refused when I hold fewer than 3 cards', () => {
  assert.equal(refusals({ iSlapped: 3, myCards: 2 }), 0);
});

test('answer: after two slaps a person is sometimes refused, most of all by the windup personality', () => {
  const windup = refusals({ iSlapped: 2, personality: 'windup' });
  const careful = refusals({ iSlapped: 2, personality: 'careful' });
  assert.ok(windup > 0, 'windup refuses some of the time');
  assert.ok(careful < windup, `careful (${careful}) refuses less than windup (${windup})`);
  assert.ok(Math.abs(windup / 200 - REFUSE_RATE.windup) < 0.1, `windup near ${REFUSE_RATE.windup}: ${windup / 200}`);
});

test('answer: Easy refuses half as often as the same personality at Normal', () => {
  const normal = refusals({ iSlapped: 2, personality: 'windup', level: 'normal' });
  const easy = refusals({ iSlapped: 2, personality: 'windup', level: 'easy' });
  assert.ok(easy < normal, `easy ${easy} < normal ${normal}`);
});

// ---------------------------------------------------------------------------
// Taunts
// ---------------------------------------------------------------------------

test('taunt: a refusal to a person gets one of the three taunts from the list', () => {
  const phrases = readFileSync(new URL('../../src/content/catch-phrases.md', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  const e: SessionEvent = { type: 'takeAnswered', requester: 'p2', target: 'p3', accepted: false };
  const persona: Persona = { level: 'normal', personality: 'windup' };
  const idx = reactionFor(e, 'p3', ['p2'], persona, seededRng(3), phrases);
  assert.notEqual(idx, null);
  assert.notEqual(idx, LAUGH);
  const taunts = ['Not a chance!!', 'Keep picking up!!', "Nope, I'm having fun!!"];
  assert.ok(taunts.includes(phrases[idx as number]!), `got ${phrases[idx as number]}`);
});

test('taunt: an accepted take, or a refusal to a computer, gets no taunt', () => {
  const phrases = ['Not a chance!!', 'Keep picking up!!', "Nope, I'm having fun!!"];
  const persona: Persona = { level: 'normal', personality: 'windup' };
  const accepted: SessionEvent = { type: 'takeAnswered', requester: 'p2', target: 'p3', accepted: true };
  assert.equal(reactionFor(accepted, 'p3', ['p2'], persona, seededRng(3), phrases), null);
  const toComputer: SessionEvent = { type: 'takeAnswered', requester: 'p4', target: 'p3', accepted: false };
  assert.equal(reactionFor(toComputer, 'p3', ['p2'], persona, seededRng(3), phrases), null);
});

// ---------------------------------------------------------------------------
// Memory: slaps and pick-ups from public events
// ---------------------------------------------------------------------------

test('memory: counts who slapped me, whom I slapped, and my pick-ups this round', () => {
  const m = newMemory('p1', 'normal', ORDER);
  const events: SessionEvent[] = [
    START,
    { type: 'slapped', slapper: 'p3', slapped: 'p1', cardsPickedUp: 2 } as SessionEvent,
    { type: 'slapped', slapper: 'p3', slapped: 'p1', cardsPickedUp: 2 } as SessionEvent,
    { type: 'slapped', slapper: 'p1', slapped: 'p2', cardsPickedUp: 1 } as SessionEvent,
    { type: 'wastePilePickedUp', player: 'p1', cards: 4 } as SessionEvent,
  ];
  remember(m, events, seededRng(1));
  assert.equal(m.slappedMe.p3, 2);
  assert.equal(m.iSlapped.p2, 1);
  assert.equal(m.pickups, 3);
  // A new round clears them.
  remember(m, [START], seededRng(1));
  assert.equal(m.slappedMe.p3, 0);
  assert.equal(m.pickups, 0);
});

test('memory: my ask records the trick it was made on and restarts the pick-up count (9ap.C)', () => {
  const m = newMemory('p1', 'hard', ORDER);
  remember(m, [START, { type: 'wastePilePickedUp', player: 'p1', cards: 4 } as SessionEvent], seededRng(1));
  assert.equal(m.pickupsSinceAsk, 1);
  remember(m, [{ type: 'takeRequested', requester: 'p1', target: 'p2' } as SessionEvent], seededRng(1));
  assert.equal(m.asks, 1);
  assert.equal(m.lastAskTrick, m.trickCount);
  assert.equal(m.pickupsSinceAsk, 0);
  remember(m, [{ type: 'wastePilePickedUp', player: 'p1', cards: 4 } as SessionEvent], seededRng(1));
  assert.equal(m.pickups, 2);
  assert.equal(m.pickupsSinceAsk, 1);
  // Someone else's ask doesn't count as mine.
  remember(m, [{ type: 'takeRequested', requester: 'p3', target: 'p2' } as SessionEvent], seededRng(1));
  assert.equal(m.asks, 1);
  remember(m, [START], seededRng(1));
  assert.equal(m.lastAskTrick, -99);
  assert.equal(m.pickupsSinceAsk, 0);
});
