// CODE.md 9aq.1 (2.39, Part A): the round's end is one pop-up. mergeRoundEnd folds the round-end pop-ups
// of one batch of events into one `roundEnd`, with the head word chosen in order: forfeit, round-ending slap,
// HAHAHA!, plain end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRoundEnd } from '../../src/ui/roundend.ts';
import type { Popup } from '../../src/ui/store.ts';

const end = { kind: 'lastTwo', order: ['p1', 'p2', 'p3'], shared: null, forfeitedBy: null } as Popup;
const slapOver = { kind: 'slap', slapper: 'p2', slapped: 'p3', cards: 2, over: 'round' } as Popup;
const pathetic = { kind: 'pathetic', player: 'p3' } as Popup;
const haha = { kind: 'haha', laugher: 'p2', loser: 'p3' } as Popup;
const out1 = { kind: 'out', player: 'p1', place: 1 } as Popup;

test('a plain round end becomes one over pop-up', () => {
  const r = mergeRoundEnd([out1, end], false);
  assert.equal(r.length, 1);
  const p = r[0]!;
  assert.equal(p.kind, 'roundEnd');
  if (p.kind !== 'roundEnd') return;
  assert.equal(p.head, 'over');
  assert.equal(p.gameOver, false);
  assert.equal(p.end, end);
});

test('a forfeit with a HAHAHA! in the same batch leads with PATHETIC!!! and keeps the laugh', () => {
  const r = mergeRoundEnd([haha, pathetic, end], false);
  assert.equal(r.length, 1);
  const p = r[0]!;
  assert.equal(p.kind, 'roundEnd');
  if (p.kind !== 'roundEnd') return;
  assert.equal(p.head, 'pathetic');
  assert.equal(p.forfeiter, 'p3');
  assert.equal(p.haha, haha);
});

test('a round-ending slap leads with SLAP!', () => {
  const r = mergeRoundEnd([slapOver, end], false);
  assert.equal(r.length, 1);
  const p = r[0]!;
  if (p.kind !== 'roundEnd') assert.fail('not merged');
  assert.equal(p.head, 'slap');
  assert.equal(p.slap, slapOver);
});

test('a HAHAHA! alone leads with HAHAHA!', () => {
  const p = mergeRoundEnd([haha, end], false)[0]!;
  if (p.kind !== 'roundEnd') assert.fail('not merged');
  assert.equal(p.head, 'haha');
});

test('the game-over flag is passed through', () => {
  const p = mergeRoundEnd([end], true)[0]!;
  if (p.kind !== 'roundEnd') assert.fail('not merged');
  assert.equal(p.gameOver, true);
});

test('the merged pop-up takes the place of the first pop-up it replaces, and other pop-ups stay', () => {
  const vote = { kind: 'info', icon: 'equal', title: 'No majority', text: '' } as Popup;
  const r = mergeRoundEnd([vote, slapOver, out1, end], false);
  assert.deepEqual(r.map((p) => p.kind), ['info', 'roundEnd']);
});

test('a batch without a round end comes back unchanged', () => {
  const r = mergeRoundEnd([out1, slapOver], false);
  assert.deepEqual(r, [out1, slapOver]);
});
