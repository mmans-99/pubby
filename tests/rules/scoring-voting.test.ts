import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addScores, pointsFor, scoreRound } from '../../src/rules/scoring.ts';
import { resolveVote, tallyVote } from '../../src/rules/voting.ts';

// Copied from PROJECT.md section 9.
const EXPECTED: Record<number, number[]> = {
  2: [2, 1],
  3: [2, 1, 0],
  4: [2, 1, 0, -1],
  5: [3, 2, 1, 0, -1],
  6: [3, 2, 1, 0, -1, -2],
  7: [3, 2, 1, 0, -1, -2, -3],
  8: [4, 3, 2, 1, 0, -1, -2, -3],
};

test('scoring table matches PROJECT.md for 2 to 8 players', () => {
  for (const [n, row] of Object.entries(EXPECTED)) {
    row.forEach((pts, i) => assert.equal(pointsFor(Number(n), i + 1), pts, `${n}p place ${i + 1}`));
  }
});

test('scoreRound awards by finishing order and totals add up', () => {
  const r = scoreRound(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(r, { a: 3, b: 2, c: 1, d: 0, e: -1 });
  assert.deepEqual(addScores({ a: 1, e: 2 }, r), { a: 4, b: 2, c: 1, d: 0, e: 1 });
});

test('scoring rejects bad input', () => {
  assert.throws(() => pointsFor(4, 5));
  assert.throws(() => pointsFor(9, 1));
  assert.throws(() => scoreRound(['a', 'a', 'b']));
});

test('vote: more than half yes passes', () => {
  assert.equal(tallyVote({ a: 'yes', b: 'yes', c: 'no' }, 3), 'passed');
  assert.equal(tallyVote({ a: 'yes', b: 'yes', c: 'yes' }, 5), 'passed');
});

test('vote: more than half no fails', () => {
  assert.equal(tallyVote({ a: 'no', b: 'no', c: 'yes' }, 3), 'failed');
});

test('vote: a tie or too few votes goes to the host', () => {
  assert.equal(tallyVote({ a: 'yes', b: 'no' }, 2), 'hostDecides');
  assert.equal(tallyVote({ a: 'yes', b: 'yes', c: 'no', d: 'no' }, 4), 'hostDecides');
  assert.equal(tallyVote({ a: 'yes' }, 4), 'hostDecides');
  assert.equal(resolveVote('hostDecides', true), true);
  assert.equal(resolveVote('hostDecides', false), false);
  assert.throws(() => resolveVote('hostDecides'));
  assert.equal(resolveVote('passed'), true);
  assert.equal(resolveVote('failed'), false);
});
