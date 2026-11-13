// CODE.md 9m.3 (names.ts): at least 60 names, all different, and pickNames
// never repeats a name already taken in the game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_NAMES, botNamesProblem, pickNames } from '../../src/ai/names.ts';
import { mixedLevel, MIXED_LEVELS } from '../../src/ai/persona.ts';
import { seededRng } from '../../src/rules/rng.ts';

test('the name list has at least 60 different names', () => {
  assert.ok(BOT_NAMES.length >= 60);
  assert.equal(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size, BOT_NAMES.length);
});

test('pickNames gives different names, none already taken (ignoring case)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const taken = ['aisha', 'RAVI', 'Mei'];
    const names = pickNames(7, taken, seededRng(seed));
    assert.equal(names.length, 7);
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 7);
    for (const n of names) assert.ok(!taken.map((t) => t.toLowerCase()).includes(n.toLowerCase()));
  }
});

test('pickNames refuses when there are not enough names left', () => {
  assert.throws(() => pickNames(BOT_NAMES.length, ['Aisha'], seededRng(1)));
});

// Slice C (CODE.md 9m.7): the setup screen checks names before a game starts.

test('botNamesProblem accepts different names that are not the person\'s name', () => {
  assert.equal(botNamesProblem(['Aisha', 'Ravi'], 'Sam'), null);
  assert.equal(botNamesProblem([], 'Sam'), null);
});

test('botNamesProblem refuses an empty name, a long name, and duplicates (ignoring case)', () => {
  assert.match(botNamesProblem(['Aisha', '  '], 'Sam') ?? '', /needs a name/);
  assert.match(botNamesProblem(['Aisha'.repeat(5)], 'Sam') ?? '', /up to 16 letters/);
  assert.match(botNamesProblem(['Mei', 'MEI'], 'Sam') ?? '', /both be called MEI/);
});

test('botNamesProblem refuses a computer player with the person\'s name', () => {
  assert.match(botNamesProblem(['sam'], 'Sam') ?? '', /both be called sam/);
  assert.equal(botNamesProblem(['Sam'], null), null, 'no person chosen yet: nothing to clash with');
});

test('Mixed draws Easy, Normal or Hard (slice D)', () => {
  assert.deepEqual([...MIXED_LEVELS], ['easy', 'normal', 'hard']);
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) seen.add(mixedLevel(seededRng(seed)));
  assert.deepEqual([...seen].sort(), ['easy', 'hard', 'normal']);
});
