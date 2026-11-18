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

test('ask: not stuck (picked up only once) means no ask', () => {
  const p = leadPosition();
  p.memory.trickCount = 5;
  p.memory.pickups = 1;
  p.memory.slappedMe.p3 = 3;
  assert.equal(chooseTakeAsk(p.seen, p.memory, seededRng(1)), null);
});

test('ask: stuck after two pick-ups and two slaps by one player asks that player', () => {
  const p = leadPosition();
  p.memory.trickCount = 5;
  p.memory.pickups = 2;
  p.memory.slappedMe.p3 = 2;
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, seededRng(1))), 'p3');
});

test('ask: stuck by holding far more cards than the others, and asks the player with a missing suit', () => {
  const p = leadPosition({ my: 9, others: 3 });
  p.memory.trickCount = 5;
  p.memory.pickups = 2;
  p.memory.voids.p2!.add('hearts');
  p.memory.voids.p2!.add('spades');
  assert.equal(askedFor(chooseTakeAsk(p.seen, p.memory, seededRng(1))), 'p2');
});

test('ask: needs at least three tricks played, and to be the player about to lead', () => {
  const p = leadPosition();
  p.memory.pickups = 2;
  p.memory.slappedMe.p3 = 2;
  p.memory.trickCount = 2;
  assert.equal(chooseTakeAsk(p.seen, p.memory, seededRng(1)), null);
  const notMyTurn = leadPosition();
  notMyTurn.memory.trickCount = 5;
  notMyTurn.memory.pickups = 2;
  notMyTurn.memory.slappedMe.p3 = 2;
  const other = { ...notMyTurn.seen, view: { ...notMyTurn.seen.view, turn: 'p2' as PlayerId } };
  assert.equal(chooseTakeAsk(other, notMyTurn.memory, seededRng(1)), null);
});

test('ask: Normal asks once a round, Hard may ask twice', () => {
  const normal = leadPosition({ level: 'normal' });
  normal.memory.trickCount = 5;
  normal.memory.pickups = 2;
  normal.memory.slappedMe.p3 = 2;
  normal.memory.asks = 1;
  assert.equal(chooseTakeAsk(normal.seen, normal.memory, seededRng(1)), null);

  const hard = leadPosition({ level: 'hard' });
  hard.memory.trickCount = 5;
  hard.memory.pickups = 2;
  hard.memory.slappedMe.p3 = 2;
  hard.memory.asks = 1;
  assert.equal(askedFor(chooseTakeAsk(hard.seen, hard.memory, seededRng(1))), 'p3');
});

test('ask: the bars are as set (Easy 3.5, Normal 2.5, Hard 2.0)', () => {
  assert.deepEqual(ASK_BAR, { easy: 3.5, normal: 2.5, hard: 2.0 });
});

test('ask: Easy asks rarely (a 30% chance on top of the bar); Normal asks every time it is stuck', () => {
  let easy = 0;
  let normal = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const e = leadPosition({ level: 'easy' });
    e.memory.trickCount = 5;
    e.memory.pickups = 2;
    e.memory.slappedMe.p3 = 2;
    if (chooseTakeAsk(e.seen, e.memory, seededRng(seed))) easy++;
    const n = leadPosition({ level: 'normal' });
    n.memory.trickCount = 5;
    n.memory.pickups = 2;
    n.memory.slappedMe.p3 = 2;
    if (chooseTakeAsk(n.seen, n.memory, seededRng(seed))) normal++;
  }
  assert.equal(normal, 200);
  assert.ok(easy > 20 && easy < 100, `easy asked ${easy} of 200`);
});

test('ask: while a request of mine is still open, I do not ask again', () => {
  const p = leadPosition();
  p.memory.trickCount = 5;
  p.memory.pickups = 2;
  p.memory.slappedMe.p3 = 2;
  const open = { ...p.seen, session: { ...p.seen.session, takeRequests: [{ requester: 'p2', target: 'p4', agreed: false }] } };
  assert.equal(chooseTakeAsk(open, p.memory, seededRng(1)), null);
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
