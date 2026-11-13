/** The round table's pure helpers (CODE.md 9u Part E6). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeSpot, pileSpots, seeded } from '../../src/ui/table.ts';

test('edgeSpot has n-1 spots for 2 to 8 players, each t within 0..1', () => {
  for (let n = 2; n <= 8; n++) {
    for (let k = 1; k <= n - 1; k++) {
      const s = edgeSpot(n, k);
      assert.ok(['top', 'left', 'right'].includes(s.edge));
      assert.ok(s.t >= 0 && s.t <= 1, `n ${n} k ${k} t ${s.t}`);
    }
  }
});

test('seeded is stable and in 0..1', () => {
  assert.equal(seeded('1:spades-14:x'), seeded('1:spades-14:x'));
  const v = seeded('anything');
  assert.ok(v >= 0 && v < 1);
});

const IDS = ['spades-14', 'hearts-2', 'clubs-11', 'diamonds-9', 'hearts-13', 'spades-7', 'clubs-3', 'diamonds-12'];

test('pile: every step moves right by at least 20 px and tilts within 14 degrees', () => {
  for (let salt = 0; salt < 20; salt++) {
    const spots = pileSpots(IDS, `1:${salt}`);
    for (let i = 1; i < spots.length; i++) {
      assert.ok(spots[i]!.x - spots[i - 1]!.x >= 20, `salt ${salt} step ${i}`);
    }
    for (const p of spots) assert.ok(Math.abs(p.rot) <= 14);
  }
});

test('pile: the same trick looks the same on every call', () => {
  assert.deepEqual(pileSpots(IDS, '2:spades-14'), pileSpots(IDS, '2:spades-14'));
});
