// CODE.md 9m.3 (react.ts): reactions only after a slap, from the right seat,
// with the phrase looked up by text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAUGH, reactionFor } from '../../src/ai/react.ts';
import { seededRng } from '../../src/rules/rng.ts';
import type { SessionEvent } from '../../src/session/types.ts';
import { PERSONALITY_WEIGHTS, type Persona } from '../../src/ai/persona.ts';

const PHRASES = ['Hurry up!!', 'You got slapped', 'You got slapped by a kiiid', 'Revenge time!!'];
const windup: Persona = { level: 'normal', personality: 'windup' };
const slap = (slapper: string, slapped: string): SessionEvent => ({ type: 'slapped', slapper, slapped, cardsPickedUp: 2 });

test('a slap by me gets "You got slapped" (or the kiiid version) most of the time for a wind-up player', () => {
  const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) {
    const r = reactionFor(slap('p1', 'p2'), 'p1', ['p1', 'p2'], windup, seededRng(s), PHRASES);
    if (r !== null) seen.add(PHRASES[r] ?? '?');
  }
  assert.ok(seen.size > 0);
  for (const text of seen) assert.ok(['You got slapped', 'You got slapped by a kiiid'].includes(text), text);
});

test('a slap of me gets "Revenge time!!" or nothing', () => {
  for (let s = 1; s <= 100; s++) {
    const r = reactionFor(slap('p2', 'p1'), 'p1', ['p1', 'p2'], windup, seededRng(s), PHRASES);
    assert.ok(r === null || PHRASES[r] === 'Revenge time!!');
  }
});

test('a person slapped while I am not involved gets 😂 now and then, never a phrase', () => {
  const careful: Persona = { level: 'normal', personality: 'careful' };
  let laughs = 0;
  for (let s = 1; s <= 200; s++) {
    const r = reactionFor(slap('p2', 'p3'), 'p1', ['p2', 'p3'], careful, seededRng(s), PHRASES);
    assert.ok(r === null || r === LAUGH);
    if (r === LAUGH) laughs++;
  }
  assert.ok(laughs > 0 && laughs < 200);
});

test('a computer player slapped while I am not involved does not react', () => {
  for (let s = 1; s <= 50; s++) {
    assert.equal(reactionFor(slap('p2', 'p3'), 'p1', ['p1'], windup, seededRng(s), PHRASES), null);
  }
});

test('other events never cause a reaction, and a missing phrase is not sent', () => {
  assert.equal(reactionFor({ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }, 'p1', ['p1'], windup, seededRng(1), PHRASES), null);
  assert.equal(reactionFor(slap('p1', 'p2'), 'p1', ['p2'], windup, seededRng(2), []), null);
  assert.ok(PERSONALITY_WEIGHTS.windup.reactRate > PERSONALITY_WEIGHTS.careful.reactRate);
});

// Antagonism (user, 2026-11-13): computer players taunt people after more events.
const TAUNTS = ['Rigged, I tell you!!', 'Just a bad round!!', "Beginner's luck!!", 'Enjoy it while it lasts!!', 'Pick them up!!', 'Enjoy the pile!!', 'Too slow!!', 'Hurry up!!', 'Bye bye, losers!!', 'Ha! Caught you!!', 'Not so clever now!!', 'Dirty move!!', 'Sit down, sweetheart!!', 'Who dealt this?!', 'Coward!!', 'Oofaa!!!!', 'Nooo, not again!!'];
const count = (ev: SessionEvent, me: string, humans: string[], texts: string[], persona: Persona = windup): number => {
  let n = 0;
  for (let s = 1; s <= 300; s++) {
    const r = reactionFor(ev, me, humans, persona, seededRng(s), texts);
    if (r !== null && r !== LAUGH && texts.includes(texts[r] ?? '')) n++;
  }
  return n;
};

test('a computer player taunts a person who picks up the waste pile', () => {
  const n = count({ type: 'wastePilePickedUp', player: 'p2', cards: 4 }, 'p1', ['p2'], TAUNTS);
  assert.ok(n > 150, `only ${n} of 300`);
});

test('a computer player taunts a person who goes out, and says so every time it goes out itself', () => {
  assert.ok(count({ type: 'playerOut', player: 'p2', place: 1 }, 'p1', ['p2'], TAUNTS) > 150);
  const careful: Persona = { level: 'normal', personality: 'careful' };
  assert.equal(count({ type: 'playerOut', player: 'p1', place: 1 }, 'p1', ['p2'], TAUNTS, careful), 300);
});

test('taking a person\'s cards gets a gloat; having cards taken gets a complaint', () => {
  const gloat = count({ type: 'cardsTaken', requester: 'p1', target: 'p2', count: 3 }, 'p1', ['p2'], TAUNTS);
  assert.ok(gloat > 150, `gloat ${gloat}`);
  const complaint = count({ type: 'cardsTaken', requester: 'p2', target: 'p1', count: 3 }, 'p1', ['p2'], TAUNTS);
  assert.ok(complaint > 0 && complaint < gloat, `complaint ${complaint}`);
});

test('a computer player says so when it loses the round, and teases a person who wins it', () => {
  const careful: Persona = { level: 'normal', personality: 'careful' };
  const lost = count({ type: 'roundEnded', finishingOrder: ['p2', 'p1'], loser: 'p1', sharedSecondLast: null, forfeitedBy: null } as SessionEvent, 'p1', ['p2'], TAUNTS, careful);
  assert.ok(lost > 100 && lost < 300, `own loss ${lost}`);
  const won = count({ type: 'roundEnded', finishingOrder: ['p2', 'p3'], loser: 'p3', sharedSecondLast: null, forfeitedBy: null } as SessionEvent, 'p1', ['p2'], TAUNTS, careful);
  assert.ok(won > 100, `person won ${won}`);
});

test('a person who loses the round gets teased; a person who forfeits gets "Coward!!"', () => {
  assert.ok(count({ type: 'roundEnded', finishingOrder: ['p1', 'p2'], loser: 'p2', sharedSecondLast: null, forfeitedBy: null } as SessionEvent, 'p1', ['p2'], TAUNTS) > 150);
  assert.ok(count({ type: 'forfeited', player: 'p2' }, 'p1', ['p2'], TAUNTS) > 150);
});

test('computer players do not taunt each other', () => {
  assert.equal(count({ type: 'playerOut', player: 'p3', place: 1 }, 'p1', ['p2'], TAUNTS), 0);
});

test('a careful player taunts much less often than a wind-up player', () => {
  const careful: Persona = { level: 'normal', personality: 'careful' };
  const ev: SessionEvent = { type: 'wastePilePickedUp', player: 'p2', cards: 4 };
  assert.ok(count(ev, 'p1', ['p2'], TAUNTS, careful) < count(ev, 'p1', ['p2'], TAUNTS, windup));
});
