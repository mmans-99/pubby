import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSeat, markRemoved, newLobby, readToJoiner, sessionPlayers, waitingSeats, waitingText } from '../../src/net/lobby.ts';

// CODE.md 9an.8 (H-g, H-j): a removed seat stays in the lobby, so player ids (from seat order) don't move.

test('markRemoved keeps every seat index, so the player ids of the others do not change', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ann', '');
  l = addSeat(l, 'c2', 'Ben', '');
  l = addSeat(l, 'c3', 'Cal', '');
  const before = sessionPlayers(l);
  const after = markRemoved(l, 'c2');
  assert.equal(after.seats.length, l.seats.length);
  assert.deepEqual(after.seats.map((s) => s.id), l.seats.map((s) => s.id));
  assert.equal(after.seats.find((s) => s.id === 'c2')?.removed, true);
  assert.deepEqual(sessionPlayers(after).linkIds, before.linkIds);
});

test('markRemoved clears away and busy, and a removed seat is never waited for', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ann', '');
  l = { ...l, seats: l.seats.map((s) => (s.id === 'c1' ? { ...s, awaySince: 5, busy: true } : s)) };
  const m = markRemoved(l, 'c1');
  const seat = m.seats.find((s) => s.id === 'c1')!;
  assert.equal(seat.awaySince, undefined);
  assert.equal(seat.busy, undefined);
  assert.deepEqual(waitingSeats(m), []);
  assert.equal(waitingText(m), null);
});

test('a removed flag from the host is read back by a joining phone (lobby message)', () => {
  const raw = {
    t: 'lobby',
    you: 'c1',
    lobby: {
      seats: [
        { id: 'host', profileName: 'Sam', sessionName: '', isHost: true, connected: true, ready: true },
        { id: 'c1', profileName: 'Ann', sessionName: '', isHost: false, connected: false, ready: true, removed: true },
      ],
      started: true,
    },
  };
  const m = readToJoiner(raw);
  assert.ok(m && m.t === 'lobby');
  assert.equal(m.lobby.seats.find((s) => s.id === 'c1')?.removed, true);
});
