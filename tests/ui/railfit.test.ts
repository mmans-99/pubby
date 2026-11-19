// CODE.md 9aq.15 A2 (3.0.1, Option 1): the landscape rail keeps what fits in its top group, in order of
// importance; the rest goes into the game menu. railFit is the pure rule for that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { railFit } from '../../src/ui/layout.ts';

// The top bar's items in order of importance (the menu button first, then the game chips, then Voice).
const PLAIN = ['menu', 'mic', 'round', 'pause'];
const TAKE = [...PLAIN, 'take'];
const TARGET = [...PLAIN, 'targetButton'];
const TARGET_CHIP = [...PLAIN, 'take', 'targetChip'];
const DEALING = [...PLAIN, 'jokers', 'hidden'];
const DEALING_VOICE = [...DEALING, 'voice'];
const FULL = [...PLAIN, 'take', 'targetChip', 'targetButton', 'jokers', 'hidden', 'voice'];

// The number that fits at each height (the plan's sums: 152 px of the window goes to the rail's own spacing).
const FIT: Record<number, number> = { 320: 3, 360: 4, 390: 5, 412: 5, 500: 7 };

test('railFit: how many buttons fit at each landscape height', () => {
  for (const [h, n] of Object.entries(FIT)) {
    const r = railFit(Number(h), FULL);
    assert.equal(r.shown.length, n, `height ${h}`);
  }
});

test('railFit: the 740 × 360 and 844 × 390 phones (4 and 5 slots)', () => {
  assert.equal(railFit(360, PLAIN).shown.length, 4);
  assert.equal(railFit(390, TAKE).shown.length, 5);
  assert.deepEqual(railFit(390, TAKE).overflow, []);
});

test('railFit: overflow keeps the order, and the menu is always the first item shown', () => {
  const r = railFit(360, DEALING_VOICE);
  assert.deepEqual(r.shown, ['menu', 'mic', 'round', 'pause']);
  assert.deepEqual(r.overflow, ['jokers', 'hidden', 'voice']);
  for (const h of [320, 360, 390, 412, 500]) assert.equal(railFit(h, FULL).shown[0], 'menu', `height ${h}`);
});

test('railFit: every phase at each height keeps shown + overflow equal to the whole list, in order', () => {
  const phases = [PLAIN, TAKE, TARGET, TARGET_CHIP, DEALING, DEALING_VOICE, FULL];
  for (const h of [320, 360, 390, 412, 500]) {
    for (const items of phases) {
      const r = railFit(h, items);
      assert.deepEqual([...r.shown, ...r.overflow], items, `height ${h}, ${items.join(',')}`);
      assert.ok(r.shown.length <= FIT[h]!, `height ${h} shows ${r.shown.length}`);
    }
  }
});

test('railFit: nothing overflows when the list is short', () => {
  for (const h of [320, 360, 390, 412, 500]) {
    assert.deepEqual(railFit(h, PLAIN).overflow.length === 0, FIT[h]! >= PLAIN.length);
  }
});

test('railFit: a very short window keeps no item, not a negative count', () => {
  const r = railFit(100, FULL);
  assert.deepEqual(r.shown, []);
  assert.equal(r.overflow.length, FULL.length);
});
