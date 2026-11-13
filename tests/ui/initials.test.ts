import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatInitials } from '../../src/ui/initials.ts';

const tags = (...names: string[]) => {
  const map = seatInitials(names.map((name, i) => ({ id: `p${i + 1}`, name })));
  return names.map((_, i) => map[`p${i + 1}`]!);
};

test('one letter when the first letters differ', () => {
  assert.deepEqual(tags('Soo-ah', 'Mikhail', 'Leila'), ['S', 'M', 'L']);
});

test('two letters when two names share the first letter', () => {
  assert.deepEqual(tags('Mikhail', 'Maya', 'Leila'), ['Mi', 'Ma', 'L']);
});

test('three letters when two letters still match', () => {
  assert.deepEqual(tags('Mikhail', 'Mila', 'Leila'), ['Mik', 'Mil', 'L']);
});

test('letter and number when the names are the same to three letters', () => {
  assert.deepEqual(tags('Mikhail', 'Mikhail'), ['M1', 'M2']);
  assert.deepEqual(tags('Sam', 'sam'), ['S1', 'S2']);
});

test('spaces ignored, trimmed, first letter upper case', () => {
  assert.deepEqual(tags('  leila '), ['L']);
  assert.deepEqual(tags('Soo ah'), ['S']);
});

test('accented letters count as one character', () => {
  assert.deepEqual(tags('Émile', 'Eve'), ['É', 'E']);
});

test('one-letter names and empty names', () => {
  assert.deepEqual(tags('A', 'Ab'), ['A', 'Ab']);
  assert.deepEqual(tags(''), ['?']);
});

test('eight players: every tag is different', () => {
  const t = tags('Anna', 'Adam', 'Ali', 'Amir', 'Ben', 'Bo', 'Cara', 'Cal');
  assert.equal(new Set(t.map((x) => x.toLowerCase())).size, 8);
});
