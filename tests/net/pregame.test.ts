import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSeat, newLobby, readToHost, readToJoiner, removeSeat, setConnected, setReady, waitingSeats, waitingText,
} from '../../src/net/lobby.ts';

// Phase 4d: everyone at the table before a game starts (PROJECT.md 12e, CODE.md 9s).

test('a joining phone is not at the table until it says so; the host always is', () => {
  let l = newLobby('Sam');
  assert.equal(l.seats[0]!.ready, true);
  l = addSeat(l, 'c1', 'Ali', '');
  assert.equal(l.seats[1]!.ready, false);
  l = setReady(l, 'c1', true);
  assert.equal(l.seats[1]!.ready, true);
});

test('setReady never changes the host seat, and an unknown id changes nothing', () => {
  let l = newLobby('Sam');
  l = setReady(l, 'host', false);
  assert.equal(l.seats[0]!.ready, true);
  const before = JSON.stringify(l);
  assert.equal(JSON.stringify(setReady(l, 'nobody', false)), before);
});

test('waiting text names everyone not at the table, in seat order', () => {
  let l = newLobby('Sam');
  assert.equal(waitingText(l), null);
  l = addSeat(l, 'c1', 'Ali', '');
  l = addSeat(l, 'c2', 'Ben', '');
  l = addSeat(l, 'c3', 'Fay', '');
  assert.equal(waitingText(l), 'Waiting for Ali, Ben and Fay');
  l = setReady(l, 'c1', true);
  assert.equal(waitingText(l), 'Waiting for Ben and Fay');
  l = setReady(l, 'c2', true);
  assert.equal(waitingText(l), 'Waiting for Fay');
  l = setReady(l, 'c3', true);
  assert.equal(waitingText(l), null);
  assert.deepEqual(waitingSeats(l), []);
});

test('a seat without a link is still missing even when it was ready', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ali', '');
  l = setReady(l, 'c1', true);
  l = setConnected(l, 'c1', false);
  assert.equal(waitingText(l), 'Waiting for Ali');
});

test('a phone that leaves loses its seat and must reach the table again when it rejoins', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ali', '');
  l = setReady(l, 'c1', true);
  l = removeSeat(l, 'c1');
  assert.equal(waitingText(l), null);
  l = addSeat(l, 'c2', 'Ali', '');
  assert.equal(l.seats[1]!.ready, false);
  assert.equal(waitingText(l), 'Waiting for Ali');
});

test('the ready message is read from a joining phone; anything else is ignored', () => {
  assert.deepEqual(readToHost({ t: 'ready' }), { t: 'ready' });
  assert.deepEqual(readToHost({ t: 'ready', extra: 1 }), { t: 'ready' });
});

test('the lobby message carries each seat’s ready flag; a missing flag reads as not ready', () => {
  const seats = [
    { id: 'host', profileName: 'Sam', sessionName: '', isHost: true, connected: true, ready: true },
    { id: 'c1', profileName: 'Ali', sessionName: '', isHost: false, connected: true, ready: true },
    { id: 'c2', profileName: 'Ben', sessionName: '', isHost: false, connected: true },
  ];
  const m = readToJoiner({ t: 'lobby', you: 'c2', lobby: { seats, jokers: true, pauseLimit: null, started: false } });
  assert.ok(m && m.t === 'lobby');
  assert.deepEqual(m.lobby.seats.map((s) => s.ready), [true, true, false]);
  assert.equal(waitingText(m.lobby), 'Waiting for Ben');
});
