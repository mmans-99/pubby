// CODE.md 9aq.4 (2.39, Part D): "What happened" keeps the last 8 lines, newest first in the note, and says a small time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLogLines, ageText, clearLog, LOG_KEEP, recentLines } from '../../src/ui/eventlog.ts';

test('the log keeps only the last 8 lines', () => {
  clearLog();
  const many = Array.from({ length: 12 }, (_, i) => ({ text: `line ${i}`, strong: false }));
  addLogLines(many, 1000);
  const all = recentLines(20);
  assert.equal(all.length, LOG_KEEP);
  assert.equal(all[0]!.text, 'line 11');
  assert.equal(all[LOG_KEEP - 1]!.text, 'line 4');
});

test('the note shows the newest six, newest first', () => {
  clearLog();
  addLogLines([{ text: 'a', strong: false }, { text: 'b', strong: true }], 1);
  addLogLines([{ text: 'c', strong: false }], 2);
  assert.deepEqual(recentLines(6).map((l) => l.text), ['c', 'b', 'a']);
  assert.equal(recentLines(6)[1]!.strong, true);
});

test('clearing the log empties it', () => {
  addLogLines([{ text: 'x', strong: false }], 1);
  clearLog();
  assert.deepEqual(recentLines(6), []);
});

test('ages read as now, seconds, then minutes', () => {
  assert.equal(ageText(0, 2000), 'now');
  assert.equal(ageText(0, 10_000), '10 s');
  assert.equal(ageText(0, 125_000), '2 min');
});
