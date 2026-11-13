import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryCore, LIST_AGE_MS, LIST_MAX, ROOMS_PER_HOUR, type ListEntry } from '../../server/src/core/directory.ts';

const T0 = 2_000_000_000;
const HOUR = 60 * 60_000;
const entry = (id: string, createdAt: number, seats = 1): ListEntry => ({
  roomId: id, name: `Table ${id}`, hostName: 'Cat', seats, maxSeats: 8, version: '2.17', createdAt,
});

test('reserve: a free id is held; the same id is taken while held, and free again later', () => {
  const d = new DirectoryCore();
  assert.equal(d.reserve('abcd2345', '1.1.1.1', T0), 'ok');
  assert.equal(d.reserve('abcd2345', '2.2.2.2', T0 + 1000), 'taken');
  assert.equal(d.reserve('abcd2345', '2.2.2.2', T0 + 61_000), 'ok', 'a reservation lapses after a minute');
});

test('reserve: an id already in the list is taken', () => {
  const d = new DirectoryCore();
  d.upsert(entry('room0001', T0));
  assert.equal(d.reserve('room0001', '1.1.1.1', T0), 'taken');
});

test('reserve: 10 rooms per address per hour, then refused until the hour passes', () => {
  const d = new DirectoryCore();
  for (let i = 0; i < ROOMS_PER_HOUR; i++) assert.equal(d.reserve(`id${i}`, '9.9.9.9', T0 + i), 'ok');
  assert.equal(d.reserve('extra', '9.9.9.9', T0 + 100), 'too-many-rooms');
  assert.equal(d.reserve('extra', '8.8.8.8', T0 + 100), 'ok', 'another address is fine');
  assert.equal(d.reserve('extra', '9.9.9.9', T0 + HOUR), 'ok', 'an hour later the limit is clear');
});

test('list: open rooms only, newest first, dropped after 12 hours, at most 50', () => {
  const d = new DirectoryCore();
  d.upsert(entry('old', T0 - LIST_AGE_MS - 1));
  d.upsert(entry('first', T0 - 1000));
  d.upsert(entry('second', T0 - 500));
  d.upsert(entry('full', T0 - 100, 8));
  assert.deepEqual(d.list(T0).map((e) => e.roomId), ['second', 'first']);
  for (let i = 0; i < 60; i++) d.upsert(entry(`r${i}`, T0 - 10_000 + i));
  assert.equal(d.list(T0).length, LIST_MAX);
  assert.equal(d.list(T0)[0]?.roomId, 'second', 'the newest comes first, whatever the insert order');
});

test('changed: true once after a change, then false until the next change', () => {
  const d = new DirectoryCore();
  assert.equal(d.changed(), false);
  d.upsert(entry('a', T0));
  assert.equal(d.changed(), true);
  assert.equal(d.changed(), false);
  d.remove('a');
  assert.equal(d.changed(), true);
  d.remove('a');
  assert.equal(d.changed(), false, 'removing a room that is not there is not a change');
});

test('remove: the room leaves the list', () => {
  const d = new DirectoryCore();
  d.upsert(entry('a', T0));
  d.remove('a');
  assert.deepEqual(d.list(T0), []);
});

test('toJSON and fromJSON keep the list, reservations and the hourly count', () => {
  const d = new DirectoryCore();
  d.upsert(entry('a', T0));
  d.reserve('b', '1.1.1.1', T0);
  const back = DirectoryCore.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepEqual(back.list(T0), [entry('a', T0)]);
  assert.equal(back.reserve('b', '2.2.2.2', T0 + 1), 'taken');
});
