/** Pop-up wording by whose phone it is (CODE.md 9al.4, 2.37.1). Pure functions only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forfeitLine } from '../../src/ui/popuptext.ts';

test('the forfeiter\'s own phone says "You forfeited"', () => {
  assert.equal(forfeitLine('Murshed', true), 'You forfeited');
});

test('every other phone (and a one-phone game) keeps the name', () => {
  assert.equal(forfeitLine('Murshed', false), 'Murshed forfeited');
});
