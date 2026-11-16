/** The fanned hand (CODE.md 9u Part D5): placement is pure, so it is tested here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fanLayout } from '../../src/ui/cards.ts';

test('one card sits in the middle', () => {
  const { cardW, spots } = fanLayout(1, 360);
  assert.equal(spots.length, 1);
  assert.ok(Math.abs(spots[0]!.x + cardW / 2 - 180) < 0.01);
});

test('14 cards fit inside the width', () => {
  const width = 360;
  const { cardW, spots } = fanLayout(14, width);
  assert.equal(spots.length, 14);
  assert.ok(spots[0]!.x >= 0);
  assert.ok(spots[13]!.x + cardW <= width);
});

test('17 cards make two rows', () => {
  const { spots } = fanLayout(17, 360);
  assert.equal(spots.length, 17);
  const ys = new Set(spots.map((s) => s.y.toFixed(1)));
  assert.ok(ys.size > 2, 'the second row sits lower than the first');
});

test('26 cards on 320 px: every visible strip is at least 20 px', () => {
  const { spots } = fanLayout(26, 320);
  const row1 = spots.slice(0, 13);
  const row2 = spots.slice(13);
  for (const row of [row1, row2]) {
    for (let i = 1; i < row.length; i++) {
      assert.ok(row[i]!.x - row[i - 1]!.x >= 20, `step ${(row[i]!.x - row[i - 1]!.x).toFixed(1)} is under 20`);
    }
  }
});

test('cards rise left to right, later cards on top', () => {
  const { spots } = fanLayout(9, 360);
  for (let i = 1; i < spots.length; i++) {
    assert.ok(spots[i]!.z > spots[i - 1]!.z);
    assert.ok(spots[i]!.x > spots[i - 1]!.x);
  }
});

// 2.37 (CODE.md 9ak.6): a long hand (a pick-up of the waste pile can give about 50 cards) stays inside its height.
test('a long hand (50 cards) in the landscape rail: every card stays inside the fan height', () => {
  for (const maxH of [125, 146]) {
    for (const width of [614, 658]) {
      const fan = fanLayout(50, width, undefined, 64, maxH);
      const cardH = fan.cardW * 1.4;
      const lowest = Math.max(...fan.spots.map((s) => s.y)) + cardH;
      assert.ok(lowest <= fan.height + 0.01, `maxH ${maxH} width ${width}: lowest ${lowest.toFixed(1)} over ${fan.height.toFixed(1)}`);
      assert.ok(fan.height <= maxH + 0.01, `maxH ${maxH} width ${width}: height ${fan.height.toFixed(1)}`);
    }
  }
});
