// CODE.md 9m.9 (decide.test.ts): every move a computer player makes is legal
// (the session accepts it), in whole games at 2, 3, 5 and 8 players at every
// level; nothing is decided while the game is paused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../src/ai/decide.ts';
import { seenBy } from '../../src/ai/seen.ts';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import { cards, position } from './position.ts';
import { playBotGame, type SeatLevel } from './botgame.ts';

test('every move is legal in whole games at 2, 3, 5 and 8 players, at every level', () => {
  const levelSets: SeatLevel[][] = [['normal'], ['easy'], ['hard'], ['normal', 'easy', 'hard', 'random']];
  for (const n of [2, 3, 5, 8]) {
    for (const levels of levelSets) {
      const r = playBotGame({ players: n, levels, rounds: 3, seed: 40 + n });
      assert.equal(r.refused, 0, `${n} players, ${levels.join('/')}: refused moves`);
      assert.equal(r.crashed, 0, `${n} players, ${levels.join('/')}: crashed decisions`);
      assert.ok(r.finished, `${n} players, ${levels.join('/')}: game did not finish`);
    }
  }
});

test('nothing is decided while the game is paused', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3', 'clubs-9'), p2: cards('clubs-4'), p3: cards('spades-2') },
    leader: 'p1',
    turn: 'p1',
    events: [{ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }],
  });
  const paused = { ...p.session, paused: true, pausedAt: 0 };
  assert.equal(decide(seenBy(paused, 'p1', 0), p.memory, p.persona, seededRng(1)), null);
});

test('the same position always gives the same decision for the same rng', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3', 'hearts-10', 'clubs-9'), p2: cards('clubs-4'), p3: cards('hearts-8') },
    leader: 'p3',
    turn: 'p1',
    plays: [{ player: 'p3', cardId: 'hearts-8' }],
    events: [
      { type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false },
      { type: 'cardPlayed', player: 'p3', card: { kind: 'standard', id: 'hearts-8', suit: 'hearts', rank: 8 } },
    ],
  });
  const a = decide(p.seen, p.memory, p.persona, seededRng(5));
  const b = decide(p.seen, p.memory, p.persona, seededRng(5));
  assert.deepEqual(a, b);
  assert.ok(a, 'a move is made');
});

test('a move from a real position is accepted by the session', () => {
  const s = createSession(
    { players: [{ id: 'p1', profileName: 'a' }, { id: 'p2', profileName: 'b' }], hostId: 'p1' },
    seededRng(8),
  ).session;
  // A fresh session is in the deal phase: the dealer's decision (deal) must be accepted.
  const seen = seenBy(s, 'p1', 0);
  const memory = position({ order: ['p1', 'p2'], me: 'p1', hands: { p1: cards('clubs-2'), p2: cards('clubs-3') }, leader: 'p1', turn: 'p1' }).memory;
  const d = decide(seen, memory, { level: 'normal', personality: 'counter' }, seededRng(3));
  assert.ok(d, 'the dealer deals');
  let state = s;
  for (const action of d!.actions) state = applyAction(state, action, seededRng(4)).session;
  assert.ok(state.deal && state.deal.nextSeat !== null, 'the auto deal has started');
});
