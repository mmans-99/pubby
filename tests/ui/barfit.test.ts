// CODE.md 9aq.16 Fix 2 (3.0.2): the portrait top bar keeps the buttons that fit its width, in order;
// the rest goes into the game menu's shelf. barFit is the pure rule. The widths below mirror the table in
// game.ts (barWidth) and styles.css; game.ts itself needs the DOM, so the test keeps its own copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barFit } from '../../src/ui/layout.ts';

type Key = 'menu' | 'mic' | 'voice' | 'round' | 'pause' | 'targetChip' | 'targetButton' | 'jokers' | 'hidden' | 'take';

/** game.ts barWidth, copied: 40 for icon buttons, 64 target chip (44 narrow), 52 bar chips (36 narrow). */
function widthOf(k: Key, viewW: number): number {
  const narrow = viewW <= 380;
  if (k === 'targetChip') return narrow ? 44 : 64;
  if (k === 'jokers' || k === 'hidden') return narrow ? 36 : 52;
  return 40;
}

const DEALING: Key[] = ['menu', 'mic', 'round', 'pause', 'jokers', 'hidden'];
const PLAY: Key[] = ['menu', 'mic', 'voice', 'round', 'pause'];
const PLAY_TAKE: Key[] = ['menu', 'mic', 'voice', 'round', 'pause', 'targetButton', 'take'];
const PLAY_TARGET: Key[] = ['menu', 'mic', 'voice', 'round', 'pause', 'targetChip', 'targetButton', 'take'];
const ALL: Key[] = ['menu', 'mic', 'voice', 'round', 'pause', 'targetChip', 'targetButton', 'jokers', 'hidden', 'take'];
const PHASES = [DEALING, PLAY, PLAY_TAKE, PLAY_TARGET, ALL];
const WIDTHS = [320, 360, 390, 412, 500, 768];

/** The keys that fit, by the same rule as game.ts barKeysFit. */
function split(viewW: number, keys: Key[]): { shown: Key[]; overflow: Key[] } {
  const n = barFit(viewW, keys.map((k) => widthOf(k, viewW)));
  return { shown: keys.slice(0, n), overflow: keys.slice(n) };
}

test('barFit: 390 wide (room 276, gaps 8): dealing shows five, the hidden chip goes to the menu', () => {
  // 40 + 8+40 + 8+40 + 8+40 = 184 (menu, mic, round, pause); jokers 184+8+52 = 244; hidden would make 304 > 276.
  assert.deepEqual(split(390, DEALING), { shown: ['menu', 'mic', 'round', 'pause', 'jokers'], overflow: ['hidden'] });
});

test('barFit: 390 wide, playing with the target chip and Take: the target chip and Take go to the menu', () => {
  // menu, mic, voice, round, pause = 232; the target chip would make 304 > 276.
  assert.deepEqual(split(390, PLAY_TARGET), {
    shown: ['menu', 'mic', 'voice', 'round', 'pause'],
    overflow: ['targetChip', 'targetButton', 'take'],
  });
});

test('barFit: 412 wide (room 298) fits one more 40 px button than 390 does', () => {
  // targetButton ends at 280: it fits in 298 but not in 276.
  assert.equal(split(390, PLAY_TAKE).shown.length, 5);
  assert.deepEqual(split(412, PLAY_TAKE), { shown: ['menu', 'mic', 'voice', 'round', 'pause', 'targetButton'], overflow: ['take'] });
});

test('barFit: 360 wide is narrow (room 242, gaps 2): all six dealing buttons fit exactly', () => {
  // 40, 82, 124, 166, 204 (jokers 36), 242 (hidden 36) = 242, which is exactly the room.
  assert.deepEqual(split(360, DEALING), { shown: DEALING, overflow: [] });
});

test('barFit: 320 wide (room 202): dealing keeps four, the jokers and hidden chips go to the menu', () => {
  assert.deepEqual(split(320, DEALING), { shown: ['menu', 'mic', 'round', 'pause'], overflow: ['jokers', 'hidden'] });
});

test('barFit: at every width and phase, shown and overflow together are the whole bar, in order', () => {
  for (const w of WIDTHS) {
    for (const keys of PHASES) {
      const r = split(w, keys);
      assert.deepEqual([...r.shown, ...r.overflow], keys, `width ${w}, ${keys.join(',')}`);
    }
  }
});

test('barFit: what is shown always fits the room; the next button would not', () => {
  for (const w of WIDTHS) {
    const narrow = w <= 380;
    const room = w - 16 - 98 - (narrow ? 4 : 0);
    const gap = narrow ? 2 : 8;
    for (const keys of PHASES) {
      const r = split(w, keys);
      const widths = r.shown.map((k) => widthOf(k, w));
      const total = widths.reduce((s, x) => s + x, 0) + gap * Math.max(0, widths.length - 1);
      assert.ok(total <= room, `width ${w}: ${r.shown.join(',')} is ${total} px in a ${room} px room`);
      const next = r.overflow[0];
      if (next !== undefined) {
        assert.ok(total + gap + widthOf(next, w) > room, `width ${w}: ${next} would still fit`);
      }
    }
  }
});

test('barFit: where every button fits, nothing overflows (3.0.0 looks the same)', () => {
  // A tablet-width portrait window, and a 412 phone with the playing bar (five buttons).
  assert.deepEqual(split(768, ALL), { shown: ALL, overflow: [] });
  assert.deepEqual(split(412, PLAY), { shown: PLAY, overflow: [] });
});

test('barFit: a window too narrow for even one button keeps none, not a negative count', () => {
  assert.equal(barFit(100, [40, 40]), 0);
});
