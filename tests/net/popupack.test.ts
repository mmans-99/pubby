// CODE.md 9an.5 (2.38, Part E-a, E-c, E-d): the host's pop-up wait bookkeeping, and the new fields
// that the message readers must keep (an update's seq and ack, a busy message's seq).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearWait, newWaits, nextSeq, noteAck, pendingPlayers, startWait } from '../../src/net/popupwait.ts';
import { readGameUpdate } from '../../src/net/netgame.ts';
import { readToHost } from '../../src/net/lobby.ts';

test('sequence numbers count up per player', () => {
  const w = newWaits();
  assert.equal(nextSeq(w, 'p2'), 1);
  assert.equal(nextSeq(w, 'p2'), 2);
  assert.equal(nextSeq(w, 'p3'), 1);
});

test('an answer to the waited-for update clears the wait; an older answer does not', () => {
  const w = newWaits();
  startWait(w, 'p2', 5);
  noteAck(w, 'p2', 4);
  assert.deepEqual(pendingPlayers(w, ['p2']), ['p2'], 'an older update does not cover seq 5');
  noteAck(w, 'p2', 5);
  assert.deepEqual(pendingPlayers(w, ['p2']), []);
});

test('a later answer covers an earlier wait', () => {
  const w = newWaits();
  startWait(w, 'p2', 3);
  noteAck(w, 'p2', 7);
  assert.deepEqual(pendingPlayers(w, ['p2']), []);
});

test('clearing a wait (away, guard) leaves the others waiting', () => {
  const w = newWaits();
  startWait(w, 'p2', 1);
  startWait(w, 'p3', 1);
  clearWait(w, 'p2');
  assert.deepEqual(pendingPlayers(w, ['p2', 'p3']), ['p3']);
});

test('readGameUpdate keeps seq and ack, and is fine without them (old phones)', () => {
  const base = { t: 'game', me: 'p2', full: false, session: { order: [] }, log: [], events: [], hostNow: 1 };
  const withFields = readGameUpdate({ ...base, seq: 9, ack: true });
  assert.equal(withFields?.seq, 9);
  assert.equal(withFields?.ack, true);
  const old = readGameUpdate(base);
  assert.equal(old?.seq, undefined);
  assert.equal(old?.ack, undefined);
});

test('readToHost keeps the seq of a busy message', () => {
  const m = readToHost({ t: 'busy', on: true, seq: 4 });
  assert.ok(m && m.t === 'busy');
  assert.equal((m as { seq?: number }).seq, 4);
  const plain = readToHost({ t: 'busy', on: false });
  assert.equal((plain as { seq?: number }).seq, undefined);
});
