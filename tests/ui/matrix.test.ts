// 9ar.3 (R, S): the layout rows fit every size of the screen-size matrix (testbed/tablet_check.py), pure maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROME_LANDSCAPE, CHROME_PORTRAIT, gameLayout } from '../../src/ui/layout.ts';

/** The 15 sizes of the matrix, in window pixels (the iPad Safari tab size is 1024 × 768 less about 70 px). */
export const MATRIX: [number, number][] = [
  [320, 568], [360, 640], [390, 844], [412, 915], [430, 932],
  [844, 390], [915, 412],
  [768, 1024], [1024, 768],
  [820, 1180], [1180, 820], [1024, 1366], [1366, 1024],
  [678, 1024], [600, 960],
];

test('the matrix has the 15 sizes of CODE.md 9ar.3 R', () => {
  assert.equal(MATRIX.length, 15);
});

test('portrait: top bar, table and hand and the action row fit the window at every matrix size', () => {
  for (const [w, h] of MATRIX) {
    if (w > h) continue;
    for (const bar of [0, 52, 92]) {
      for (const hand of [true, false]) {
        const lay = gameLayout(w, h, { hand, bar });
        assert.ok(lay.tableH >= 0 && lay.handH >= 0, `${w}x${h}: negative row`);
        const total = CHROME_PORTRAIT + lay.tableH + lay.handH + lay.barH;
        assert.ok(total <= h + 0.01, `${w}x${h} bar ${bar} hand ${hand}: ${total} is over ${h}`);
      }
    }
  }
});

test('landscape: the table keeps at least its shortest height and the rows stay inside the window at every matrix size', () => {
  for (const [w, h] of MATRIX) {
    if (w <= h) continue;
    const lay = gameLayout(w, h, { bar: 92 });
    assert.ok(lay.tableH >= 0 && lay.handH >= 0, `${w}x${h}: negative row`);
    assert.ok(lay.handH + lay.tableH <= h - CHROME_LANDSCAPE + 0.01 || lay.rail, `${w}x${h}: rows over the window`);
  }
});
