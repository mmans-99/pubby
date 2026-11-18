/** The fixed game screen (CODE.md 9x.5, 2.29). Pure functions only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fanBounds, fanLayout, fitFan } from '../../src/ui/cards.ts';
import { CHROME_PORTRAIT, CHROME_RAIL, gameLayout, MIN_TABLE_H, RAIL_GAP, RAIL_MAX_H, RAIL_SIDE_W, RAIL_W, sideBarW } from '../../src/ui/layout.ts';
import { fitBox, insideTable, ownSeatBox, railWidth, seatCollisions, tableBoxFor, lastBox, lastStep } from '../../src/ui/table.ts';

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

test('landscape (taller than 500 px): the action bar is a column of sideBarW px beside the hand; the table is at least 96 px', () => {
  for (const [w, h] of SIZES) {
    if (w <= h || h <= RAIL_MAX_H) continue;
    const lay = gameLayout(w, h, { bar: 92 });
    assert.equal(lay.sideW, sideBarW(w));
    assert.equal(lay.barH, 0);
    assert.equal(lay.handW, Math.min(w, 1100) - 16 - sideBarW(w));
    assert.ok(lay.tableH >= 96, `${w}x${h}: table ${lay.tableH}`);
    assert.ok(60 + lay.tableH + lay.handH <= h || lay.tableH === 96, `${w}x${h}: total over the window`);
  }
});

// 9ak.6 (2.37): landscape phones (height 500 or less) use the rail: a column of buttons down the left.
const RAIL_PHONES: [number, number][] = [[568, 320], [667, 375], [740, 360], [844, 390], [932, 430]];

test('rail (landscape, height 500 or less): the rail flag is on, the action column is 150 px, the hand is 96 to 150 px', () => {
  for (const [w, h] of RAIL_PHONES) {
    const lay = gameLayout(w, h, { bar: 52 });
    assert.equal(lay.rail, true, `${w}x${h}`);
    assert.equal(lay.sideW, RAIL_SIDE_W, `${w}x${h}`);
    assert.equal(lay.barH, 0, `${w}x${h}`);
    assert.ok(lay.handH >= 96 && lay.handH <= 150, `${w}x${h}: hand ${lay.handH}`);
  }
});

test('rail: 844 × 390 fills the window (table + hand + 20 px chrome = 390), the hand row is beside its column', () => {
  const lay = gameLayout(844, 390, { bar: 52 });
  assert.equal(lay.rail, true);
  assert.equal(lay.tableH + lay.handH + CHROME_RAIL, 390);
  assert.equal(lay.tableW, 844 - RAIL_W - RAIL_GAP - RAIL_GAP);
  assert.equal(lay.handW, lay.tableW - RAIL_SIDE_W - RAIL_GAP);
});

test('rail: the table is at least 96 px on every phone size', () => {
  for (const [w, h] of RAIL_PHONES) {
    const lay = gameLayout(w, h, { bar: 52 });
    assert.ok(lay.tableH >= 96, `${w}x${h}: table ${lay.tableH}`);
  }
});

test('rail: no action column when there is no bar (a round with no buttons)', () => {
  const lay = gameLayout(844, 390, { bar: 0 });
  assert.equal(lay.sideW, 0);
  assert.equal(lay.handW, lay.tableW);
});

test('tablet landscape (1180 × 820) keeps the old layout: no rail, the old action column', () => {
  const lay = gameLayout(1180, 820, { bar: 92 });
  assert.equal(lay.rail, false);
  assert.equal(lay.handH, 200);
  assert.equal(lay.tableH, 820 - 60 - 200);
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
  // 9an.9: moved in from the corner until the rounded table clears it, still in the bottom-left quarter.
  assert.ok(one.x >= 8 && one.x + one.w < box.w / 2 && one.y > box.h / 2);
  assert.ok(insideTable(one, box, railWidth(box)));
});

// 2.31 (CODE.md 9aa Part D): the last-trick cards are spaced so each corner number and suit shows.
test('lastStep: each card is at least one card-u further along, on every size', () => {
  for (const [w, h] of SIZES) {
    const box = gameLayout(w, h).box;
    for (let n = 2; n <= 8; n++) {
      assert.ok(lastStep(box, n) >= box.u - 1e-9, `${w}x${h} with ${n} players`);
    }
  }
});

test('lastStep: 1.6u (one corner index wide) when up to 3 players, on a 384 × 730 phone', () => {
  // 9an.9: the stack starts further in (the rounded corner), so from 4 players the cards sit closer (at least 1u, test above).
  const box = gameLayout(384, 730).box;
  for (let n = 2; n <= 3; n++) assert.equal(lastStep(box, n), 1.6 * box.u, `${n} players`);
});

test('lastBox: 8 cards stay left of the You pill, and a slap adds room for its mark', () => {
  const box = fitBox(8, gameLayout(384, 730).box); // as the table draws it (9an.9: the stack starts further in)
  const eight = lastBox(box, 8);
  assert.ok(eight.x + eight.w <= ownSeatBox(8, box).x);
  assert.ok(Math.abs(lastBox(box, 8, true).w - eight.w - 1.4 * box.u) < 1e-9);
});

// ---------------------------------------------------------------------------
// 2.34.5 (CODE.md 9ag.3): tablets
// ---------------------------------------------------------------------------

test('sideBarW: 170 on phones, 17% of the window on tablets, at most 240', () => {
  assert.equal(sideBarW(568), 170);
  assert.equal(sideBarW(844), 170);
  assert.equal(sideBarW(1000), 170);
  assert.equal(sideBarW(1180), 200);
  assert.equal(sideBarW(1366), 232); // 0.17 × 1366 (the plan said 240: that is the cap, reached from 1412 px)
  assert.equal(sideBarW(1412), 240);
  assert.equal(sideBarW(1920), 240);
});

test('the layout uses the game screen\'s width (at most 1100 px), so wide windows do not overflow it', () => {
  const lay = gameLayout(1366, 1024, { bar: 52 });
  assert.equal(lay.tableW, 1084);
  assert.equal(lay.handW + lay.sideW, 1084);
});

test('fitFan: the hand fits the hand slot for 1 to 40 cards at the tablet and phone sizes', () => {
  const sizes: [number, number][] = [[1180, 820], [1024, 768], [1366, 1024], [1194, 834], [820, 1180], [1024, 1366], [390, 844], [844, 390], [568, 320]];
  for (const [w, h] of sizes) {
    const lay = gameLayout(w, h, { bar: 52 });
    const fit = lay.landscape ? lay.handH : lay.handH - 8;
    for (let n = 1; n <= 40; n++) {
      const fan = fitFan(n, lay.handW, fit, lay.landscape);
      const b = fanBounds(fan);
      const top = (fit - fan.height) / 2;
      assert.ok(top + b.top >= -0.6 && top + b.bottom <= fit + 0.6, `${w}x${h} n=${n}: height ${b.top}..${b.bottom} in ${fit}`);
      assert.ok(b.left >= -8.1 && b.right <= lay.handW + 8.1, `${w}x${h} n=${n}: width ${b.left}..${b.right} in ${lay.handW}`);
    }
  }
});

test('fitFan: a phone hand that already fits is the same as before (390 × 844, up to 13 cards)', () => {
  const lay = gameLayout(390, 844, { bar: 52 });
  for (const n of [5, 10, 13]) {
    assert.deepEqual(fitFan(n, lay.handW, lay.handH - 8, false), fanLayout(n, lay.handW, undefined, 64, lay.handH - 8));
  }
});
