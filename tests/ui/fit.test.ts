// 9ar.3 (Q): the table scales down to its slot, never up, and never by a broken number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleToFit } from '../../src/ui/layout.ts';

test('a table that fits its slot is not scaled', () => {
  assert.equal(scaleToFit(400, 300, 300, 200), 1);
  assert.equal(scaleToFit(300, 200, 300, 200), 1);
});

test('a table too tall for its slot scales by the height ratio', () => {
  assert.equal(scaleToFit(400, 150, 300, 300), 0.5);
});

test('a table too wide for its slot scales by the width ratio, the smaller ratio wins', () => {
  assert.equal(scaleToFit(150, 400, 300, 200), 0.5);
  assert.equal(scaleToFit(150, 90, 300, 200), 0.45);
});

test('an empty or unmeasured slot or table is left alone (scale 1)', () => {
  assert.equal(scaleToFit(0, 0, 300, 200), 1);
  assert.equal(scaleToFit(400, 300, 0, 0), 1);
  assert.equal(scaleToFit(Number.NaN, 300, 300, 200), 1);
});
