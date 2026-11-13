/** The fixed game screen (CODE.md 9x.5, 2.29). Pure functions only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fanLayout } from '../../src/ui/cards.ts';
import { CHROME_PORTRAIT, gameLayout, MIN_TABLE_H } from '../../src/ui/layout.ts';
import { fitBox, seatCollisions, tableBoxFor, lastBox } from '../../src/ui/table.ts';

/** The 16 screen sizes from CODE.md 9w.7, plus the test phone (384 × 730, CODE.md 9x.5). */
const SIZES: [number, number][] = [
  [320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [412, 915], [768, 1024], [820, 1180],
  [1024, 768], [1180, 820], [568, 320], [667, 375], [844, 390], [932, 430], [1280, 800], [1920, 1080],
];
const TEST_PHONE: [number, number] = [384, 730];

test('portrait: the three rows and the fixed space fit the window for every size', () => {
  for (const [w, h] of [...SIZES, TEST_PHONE]) {
    if (w > h) continue; // landscape is tested below
    for (const bar of [0, 52, 92]) {
      for (const hand of [true, false]) {
        const lay = gameLayout(w, h, { hand, bar });
        const total = CHROME_PORTRAIT + lay.tableH + lay.handH + lay.barH;
        assert.ok(total <= h + 0.01, `${w}x${h} bar ${bar} hand ${hand}: ${total} is over ${h}`);
      }
    }
  }
});

test('portrait: the table is at least 240 px and the hand at least 120 px when the window allows it', () => {
  for (const [w, h] of [...SIZES, TEST_PHONE]) {
    if (w > h || h < 568) continue;
    const lay = gameLayout(w, h);
    assert.ok(lay.tableH >= MIN_TABLE_H, `${w}x${h}: table ${lay.tableH}`);
    assert.ok(lay.handH >= 120, `${w}x${h}: hand ${lay.handH}`);
  }
});

test('the test phone (384 × 730): table about 454 px, hand 146 px, bar 52 px', () => {
  const lay = gameLayout(384, 730);
  assert.equal(lay.handH, 146);
  assert.equal(lay.barH, 52);
  assert.equal(lay.tableH, 730 - CHROME_PORTRAIT - 52 - 146);
  assert.equal(lay.box.w, 384 - 16);
});

test('the table box is the size of the row it sits in', () => {
  const lay = gameLayout(390, 844);
  assert.equal(lay.box.h, lay.tableH);
  assert.equal(lay.box.w, lay.tableW);
  assert.deepEqual(lay.box, tableBoxFor(lay.tableW, lay.tableH, false));
});

test('landscape: the action bar is a column of 170 px beside the hand; the table is at least 96 px', () => {
  for (const [w, h] of SIZES) {
    if (w <= h) continue;
    const lay = gameLayout(w, h, { bar: 92 });
    assert.equal(lay.sideW, 170);
    assert.equal(lay.barH, 0);
    assert.equal(lay.handW, w - 16 - 170);
    assert.ok(lay.tableH >= 96, `${w}x${h}: table ${lay.tableH}`);
    assert.ok(60 + lay.tableH + lay.handH <= h || lay.tableH === 96, `${w}x${h}: total over the window`);
  }
});

test('landscape: 568 × 320 keeps a table of about 160 px (close to 2.28)', () => {
  const lay = gameLayout(568, 320, { bar: 52 });
  assert.equal(lay.handH, 96);
  assert.equal(lay.tableH, 320 - 60 - 96);
});

test('fanLayout with maxH: the fan fits its height for every card count 1 to 27 and every hand row', () => {
  for (const maxH of [120, 146, 190]) {
    for (const width of [320, 372, 520]) {
      for (let n = 1; n <= 27; n++) {
        const { height } = fanLayout(n, width, undefined, 64, maxH);
        assert.ok(height <= maxH + 0.01, `n ${n} width ${width} maxH ${maxH}: height ${height.toFixed(1)}`);
      }
    }
  }
});

test('fanLayout with maxH: 12 and 13 cards have the same card size (no jump)', () => {
  for (const maxH of [120, 146, 190]) {
    const a = fanLayout(12, 372, undefined, 64, maxH);
    const b = fanLayout(13, 372, undefined, 64, maxH);
    assert.equal(a.cardW, b.cardW);
    assert.equal(a.height, b.height);
  }
});

test('fanLayout: up to 15 cards stay in one row (the card size is the same); 16 make two, smaller', () => {
  const at15 = fanLayout(15, 372, undefined, 64, 146);
  const at16 = fanLayout(16, 372, undefined, 64, 146);
  assert.ok(at16.cardW < at15.cardW, `two rows (${at16.cardW.toFixed(1)}) should be smaller than one (${at15.cardW.toFixed(1)})`);
  assert.equal(new Set(fanLayout(15, 372, undefined, 64, 146).spots.map((p) => p.y.toFixed(1))).size > 1, true, 'the arc still lifts the ends');
});

test('portrait, 2 to 8 players: the last-trick corner adds no collisions after fitBox (9x.5 rule 3)', () => {
  for (const [w, h] of [...SIZES, TEST_PHONE]) {
    if (w > h) continue;
    const lay = gameLayout(w, h);
    for (const n of [2, 4, 8]) {
      assert.deepEqual(seatCollisions(n, fitBox(n, lay.box)), [], `${w}x${h} with ${n} players`);
    }
  }
});

test('lastBox: at the bottom-left, room for n cards grows with n', () => {
  const box = tableBoxFor(360, 400, false);
  const one = lastBox(box, 1);
  const eight = lastBox(box, 8);
  assert.ok(eight.w > one.w);
  assert.equal(one.x, 8);
  assert.equal(one.y + one.h, box.h - 8);
});
