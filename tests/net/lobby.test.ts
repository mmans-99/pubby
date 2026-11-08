import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSeat, cleanName, joinProblem, jokerLine, LOBBY_PROTOCOL, lobbyProblems, moveSeat, newLobby,
  readToHost, readToJoiner, removeSeat, renameSeat, seatName, sessionPlayers, setConnected,
} from '../../src/net/lobby.ts';
import { codeFromText, joinLink, linkKind, lobbyLink } from '../../src/net/signal.ts';
import { createSession } from '../../src/session/session.ts';
import { defaultRng } from '../../src/rules/rng.ts';

const hello = (name: string, version = '2.1') => ({ protocol: LOBBY_PROTOCOL, version, profileName: name });

test('a new lobby has only the host, jokers on, no pause limit, not started', () => {
  const l = newLobby('  Sam ');
  assert.equal(l.seats.length, 1);
  assert.deepEqual(l.seats[0], { id: 'host', profileName: 'Sam', sessionName: '', isHost: true, connected: true });
  assert.equal(l.jokers, true);
  assert.equal(l.pauseLimit, null);
  assert.equal(l.started, false);
});

test('joining: version must match, no joining once started, at most 8', () => {
  let l = newLobby('Sam');
  assert.equal(joinProblem(l, hello('Ali'), '2.1'), null);
  assert.match(joinProblem(l, hello('Ali', '2.0'), '2.1')!, /different Pubby versions/);
  assert.match(joinProblem(l, { ...hello('Ali'), protocol: 99 }, '2.1')!, /different Pubby versions/);
  assert.match(joinProblem(l, hello('   '), '2.1')!, /name/);
  assert.match(joinProblem({ ...l, started: true }, hello('Ali'), '2.1')!, /already started/);
  for (let i = 1; i < 8; i++) l = addSeat(l, `c${i}`, `P${i}`, '');
  assert.equal(l.seats.length, 8);
  assert.match(joinProblem(l, hello('Nine'), '2.1')!, /full/);
});

test('seats: add, rename, move, remove; the host seat is never removed', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ali', '');
  l = addSeat(l, 'c1', 'Ali again', ''); // same link twice: ignored
  l = addSeat(l, 'c2', 'Bea', 'B');
  assert.deepEqual(l.seats.map((s) => s.id), ['host', 'c1', 'c2']);
  assert.equal(seatName(l.seats[2]!), 'B');
  l = renameSeat(l, 'c1', '  Big   Al  ');
  assert.equal(seatName(l.seats[1]!), 'Big Al');
  l = renameSeat(l, 'c1', '');
  assert.equal(seatName(l.seats[1]!), 'Ali');
  l = moveSeat(l, 'host', 1);
  assert.deepEqual(l.seats.map((s) => s.id), ['c1', 'host', 'c2']);
  assert.equal(moveSeat(l, 'c1', -1), l); // already first
  assert.equal(moveSeat(l, 'c2', 1), l); // already last
  l = removeSeat(l, 'host');
  assert.equal(l.seats.length, 3);
  l = removeSeat(l, 'c1');
  assert.deepEqual(l.seats.map((s) => s.id), ['host', 'c2']);
  l = setConnected(l, 'c2', false);
  assert.equal(l.seats[1]!.connected, false);
});

test('names are trimmed and cut to 16 letters', () => {
  assert.equal(cleanName('  a   b  '), 'a b');
  assert.equal(cleanName('x'.repeat(30)).length, 16);
});

test('problems: at least 2 players, and no two shown names alike', () => {
  let l = newLobby('Sam');
  assert.match(lobbyProblems(l).join(' '), /at least 2/);
  l = addSeat(l, 'c1', 'sam', '');
  assert.match(lobbyProblems(l).join(' '), /Two players are called/);
  l = renameSeat(l, 'c1', 'Sammy');
  assert.deepEqual(lobbyProblems(l), []);
});

test('joker line follows the player count', () => {
  let l = newLobby('Sam');
  assert.equal(jokerLine(l), 'Joker rule on · 2 jokers');
  for (let i = 1; i < 6; i++) l = addSeat(l, `c${i}`, `P${i}`, '');
  assert.equal(jokerLine(l), 'Joker rule on · 3 jokers');
  assert.equal(jokerLine({ ...l, jokers: false }), 'Joker rule off');
});

test('session players follow the seat order and the session layer accepts them', () => {
  let l = newLobby('Sam');
  l = addSeat(l, 'c1', 'Ali', 'Al');
  l = addSeat(l, 'c2', 'Bea', '');
  l = moveSeat(l, 'host', 1);
  const { players, hostId, linkIds } = sessionPlayers(l);
  assert.deepEqual(players, [
    { id: 'p1', profileName: 'Ali', sessionName: 'Al' },
    { id: 'p2', profileName: 'Sam', sessionName: undefined },
    { id: 'p3', profileName: 'Bea', sessionName: undefined },
  ]);
  assert.equal(hostId, 'p2');
  assert.deepEqual(linkIds, { p1: 'c1', p2: 'host', p3: 'c2' });
  const { session } = createSession({ players, hostId, jokerRuleEnabled: l.jokers, pauseTimeLimitSec: l.pauseLimit }, defaultRng());
  assert.equal(session.hostId, 'p2');
});

test('messages: good ones are read, anything else is ignored', () => {
  assert.deepEqual(readToHost({ t: 'hello', protocol: 1, version: '2.1', profileName: 'Ali', sessionName: '' }),
    { t: 'hello', protocol: 1, version: '2.1', profileName: 'Ali', sessionName: '' });
  assert.equal(readToHost({ t: 'hello', protocol: 1 }), null);
  assert.equal(readToHost('hello'), null);
  assert.equal(readToHost({ t: 'ping', id: 4 })?.t, 'ping'); // the connection test's ping is harmless
  assert.deepEqual(readToHost({ t: 'rename', sessionName: 'Al' }), { t: 'rename', sessionName: 'Al' });
  assert.equal(readToHost({ t: 'rename' }), null);

  const l = addSeat(newLobby('Sam'), 'c1', 'Ali', '');
  const back = readToJoiner(JSON.parse(JSON.stringify({ t: 'lobby', you: 'c1', lobby: l })));
  assert.deepEqual(back, { t: 'lobby', you: 'c1', lobby: l });
  assert.equal(readToJoiner({ t: 'lobby', you: 'c1', lobby: { seats: [{ id: 1 }] } }), null);
  assert.deepEqual(readToJoiner({ t: 'refused' }), { t: 'refused', why: 'The host said no.' });
  assert.equal(readToJoiner({ t: 'removed' })?.t, 'removed');
  assert.equal(readToJoiner({ t: 'pong' }), null);
});

test('lobby links and connection-test links are told apart; both give back the code', () => {
  const code = 'PUBBY1~o~u~p~f~1.2.3.4:5';
  const lob = lobbyLink('https://x.io/pubby/', code);
  const tst = joinLink('https://x.io/pubby/', code);
  assert.equal(lob, 'https://x.io/pubby/#lobby=' + code);
  assert.equal(linkKind(lob), 'lobby');
  assert.equal(linkKind(tst), 'join');
  assert.equal(linkKind(code), null);
  assert.equal(codeFromText(lob), code);
  assert.equal(codeFromText(tst), code);
  assert.equal(codeFromText(code), code);
});
