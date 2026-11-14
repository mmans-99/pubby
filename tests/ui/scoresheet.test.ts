/** Points table (CODE.md 9ad.4, 2.34). Pure: scoreRows has no DOM, so no browser is needed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRows } from '../../src/ui/scores.ts';
import type { Session } from '../../src/session/types.ts';

/** Only the fields scoreRows reads. */
function session(order: string[], scores: Record<string, number>, rounds: { round: number; ultimate: boolean; points: Record<string, number> }[]): Session {
  return { order, scores, rounds } as unknown as Session;
}

test('rows are sorted by total, best first', () => {
  const s = session(['a', 'b', 'c'], { a: 3, b: 7, c: 5 }, []);
  assert.deepEqual(scoreRows(s).map((r) => r.id), ['b', 'c', 'a']);
  assert.deepEqual(scoreRows(s).map((r) => r.place), ['1st', '2nd', '3rd']);
});

test('equal totals share a place, and the next place skips a number', () => {
  const s = session(['a', 'b', 'c'], { a: 5, b: 5, c: 1 }, []);
  const rows = scoreRows(s);
  assert.deepEqual(rows.map((r) => r.place), ['=1st', '=1st', '3rd']);
  const s2 = session(['a', 'b', 'c', 'd'], { a: 9, b: 4, c: 4, d: 1 }, []);
  assert.deepEqual(scoreRows(s2).map((r) => r.place), ['1st', '=2nd', '=2nd', '4th']);
});

test('equal totals keep the seat order', () => {
  const s = session(['x', 'y', 'z'], { x: 2, y: 2, z: 2 }, []);
  assert.deepEqual(scoreRows(s).map((r) => r.id), ['x', 'y', 'z']);
});

test('the Ultimate Round is not a column', () => {
  const s = session(['a', 'b'], { a: 2, b: -1 }, [
    { round: 1, ultimate: false, points: { a: 2, b: -1 } },
    { round: 2, ultimate: true, points: {} },
  ]);
  const rows = scoreRows(s);
  assert.equal(rows[0]!.points.length, 1);
  assert.deepEqual(rows[0]!.points, [2]);
});

test('a player with no points in a round shows 0', () => {
  const s = session(['a', 'b'], { a: 3, b: 0 }, [
    { round: 1, ultimate: false, points: { a: 3 } },
    { round: 2, ultimate: false, points: { b: 0 } },
  ]);
  const rows = scoreRows(s);
  assert.deepEqual(rows.find((r) => r.id === 'b')!.points, [0, 0]);
  assert.deepEqual(rows.find((r) => r.id === 'a')!.points, [3, 0]);
});
