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
  let laughs = 0;
  for (let s = 1; s <= 200; s++) {
    const r = reactionFor(slap('p2', 'p3'), 'p1', ['p2', 'p3'], windup, seededRng(s), PHRASES);
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
