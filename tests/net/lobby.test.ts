import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSeat, cleanName, joinProblem, jokerLine, LOBBY_PROTOCOL, lobbyProblems, moveSeat, newLobby,
  readToHost, readToJoiner, removeSeat, renameSeat, seatName, sessionPlayers, setConnected,
  setAway, setBack, isAway, waitingText, addSeat as addSeatAway, setReady, newLobby as newLobbyAway,
  addBot, setBotLevel, nextBotId,
} from '../../src/net/lobby.ts';
import { botNamesProblem, pickNames } from '../../src/ai/names.ts';
import { seededRng } from '../../src/rules/rng.ts';
import { codeFromText, lobbyLink } from '../../src/net/signal.ts';
import { createSession } from '../../src/session/session.ts';
import { defaultRng } from '../../src/rules/rng.ts';

const hello = (name: string, version = '2.1') => ({ protocol: LOBBY_PROTOCOL, version, profileName: name });

test('a new lobby has only the host, jokers on, no pause limit, not started', () => {
  const l = newLobby('  Sam ');
  assert.equal(l.seats.length, 1);
  assert.deepEqual(l.seats[0], { id: 'host', profileName: 'Sam', sessionName: '', isHost: true, connected: true, ready: true });
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
  assert.deepEqual(back, { t: 'lobby', you: 'c1', lobby: { ...l, adding: false } });
  const busy = readToJoiner({ t: 'lobby', you: 'c1', lobby: { ...l, adding: true } });
  assert.equal(busy?.t === 'lobby' && busy.lobby.adding, true);
  // 2.4: reactions both ways; anything that isn't a whole number is ignored.
  assert.deepEqual(readToHost({ t: 'react', r: -1 }), { t: 'react', r: -1 });
  assert.equal(readToHost({ t: 'react', r: 'x' }), null);
  assert.deepEqual(readToJoiner({ t: 'react', from: 'p2', r: 3 }), { t: 'react', from: 'p2', r: 3 });
  assert.equal(readToJoiner({ t: 'react', r: 3 }), null);
  assert.equal(readToJoiner({ t: 'lobby', you: 'c1', lobby: { seats: [{ id: 1 }] } }), null);
  assert.deepEqual(readToJoiner({ t: 'refused' }), { t: 'refused', why: 'The host said no.' });
  assert.equal(readToJoiner({ t: 'removed' })?.t, 'removed');
  assert.equal(readToJoiner({ t: 'pong' }), null);
});

test('lobby links give back the code; a bare code stays as it is', () => {
  const code = 'PUBBY1~o~u~p~f~1.2.3.4:5';
  const lob = lobbyLink('https://x.io/pubby/', code);
  assert.equal(lob, 'https://x.io/pubby/#lobby=' + code);
  assert.equal(codeFromText(lob), code);
  assert.equal(codeFromText(code), code);
  // The old connection test's links (#join=, removed in 2.2) are not lobby codes.
  assert.notEqual(codeFromText('https://x.io/pubby/#join=' + code), code);
});

// ---- CODE.md 9u Part A5 (2.25): away seats are kept, and the messages are read.

test('away: a seat that left the screen is kept, marked with the time, and back again', () => {
  let l = addSeatAway(newLobbyAway('Host'), 'o1', 'Ali', '');
  l = setReady(l, 'o1', true);
  assert.equal(isAway(l, 'o1'), false);
  l = setAway(l, 'o1', 5000);
  assert.equal(l.seats.length, 2, 'the seat is still there');
  assert.equal(isAway(l, 'o1'), true);
  assert.equal(l.seats.find((s) => s.id === 'o1')?.awaySince, 5000);
  l = setBack(l, 'o1');
  assert.equal(isAway(l, 'o1'), false);
  assert.equal(l.seats.find((s) => s.id === 'o1')?.awaySince, undefined);
});

test('away: the host seat cannot go away, and an away seat counts as missing (Start waits)', () => {
  let l = addSeatAway(newLobbyAway('Host'), 'o1', 'Ali', '');
  l = setReady(l, 'o1', true);
  assert.equal(waitingText(l), null);
  l = setAway(l, 'o1', 1);
  assert.equal(waitingText(l), 'Waiting for Ali');
  assert.equal(setAway(l, 'host', 1).seats[0]!.awaySince, undefined);
});

test('away messages are read both ways; the protocol is 7', () => {
  assert.equal(LOBBY_PROTOCOL, 8);
  assert.deepEqual(readToHost({ t: 'away' }), { t: 'away' });
  assert.deepEqual(readToHost({ t: 'back' }), { t: 'back' });
  assert.deepEqual(readToJoiner({ t: 'hostAway' }), { t: 'hostAway' });
  assert.deepEqual(readToJoiner({ t: 'hostBack' }), { t: 'hostBack' });
});

test('away survives a lobby message, so every phone shows the same time', () => {
  const l = setAway(addSeatAway(newLobbyAway('Host'), 'o1', 'Ali', ''), 'o1', 1234);
  const back = readToJoiner({ t: 'lobby', you: 'o1', lobby: l });
  assert.ok(back && back.t === 'lobby');
  if (back && back.t === 'lobby') assert.equal(back.lobby.seats[1]!.awaySince, 1234);
});

// ---- CODE.md 9u Part C (2.26): computer players in the lobby.

test('computer players: added with a level, levels change, removed, ids never reused while seated', () => {
  let l = addBot(newLobbyAway('Host'), 'b1', 'Ravi', 'normal');
  l = addBot(l, 'b2', 'Mei', 'hard');
  assert.equal(l.seats.length, 3);
  assert.equal(nextBotId(l), 'b3');
  l = setBotLevel(l, 'b1', 'easy');
  assert.equal(l.seats[1]!.bot?.level, 'easy');
  l = removeSeat(l, 'b2');
  assert.equal(l.seats.some((s) => s.id === 'b2'), false);
  assert.equal(nextBotId(l), 'b2');
});

test('computer players never make Start wait, and a host plus one computer player is a table', () => {
  const l = addBot(newLobbyAway('Host'), 'b1', 'Ravi', 'normal');
  assert.equal(waitingText(l), null);
  assert.deepEqual(lobbyProblems(l), []);
});

test('computer players never clash with each other or with the person (names)', () => {
  assert.match(botNamesProblem(['Ravi', 'ravi'], null)!, /can't both/);
  assert.match(botNamesProblem(['Ravi'], 'Ravi')!, /can't both/);
  assert.equal(botNamesProblem(['Ravi', 'Mei'], 'Ann'), null);
  const fresh = pickNames(3, ['Ravi', 'Mei'], seededRng(3));
  assert.equal(fresh.length, 3);
  assert.ok(!fresh.some((n) => n === 'Ravi' || n === 'Mei'));
});

test('sessionPlayers marks computer players, whose link is "bot"', () => {
  const l = addBot(newLobbyAway('Host'), 'b1', 'Ravi', 'hard');
  const { players, linkIds } = sessionPlayers(l);
  assert.equal(players[0]!.computer, undefined);
  assert.equal(players[1]!.computer, true);
  assert.equal(linkIds['p2'], 'bot');
});

test('a computer player seat and the host options survive a lobby message (protocol 8)', () => {
  const l = { ...addBot(newLobbyAway('Host'), 'b1', 'Ravi', 'hard'), botSpeed: 'fast' as const, botReactions: false };
  const back = readToJoiner({ t: 'lobby', you: 'host', lobby: l });
  assert.ok(back && back.t === 'lobby');
  if (back && back.t === 'lobby') {
    assert.deepEqual(back.lobby.seats[1]!.bot, { level: 'hard' });
    assert.equal(back.lobby.botSpeed, 'fast');
    assert.equal(back.lobby.botReactions, false);
  }
});
