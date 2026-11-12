// CODE.md 9m.3 (names.ts): at least 60 names, all different, and pickNames
// never repeats a name already taken in the game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_NAMES, pickNames } from '../../src/ai/names.ts';
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
