// CODE.md 9m.9 (eval.test.ts): pVoid cases (known void, known card, the formula),
// the play-order helper, and the hand and card numbers the rules use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pSlapAfterMe, pVoid, handBadness, rankValue, yetToPlay } from '../../src/ai/eval.ts';
import { cards, position, standard } from './position.ts';

test('pVoid is 1 for a known void with no known card of the suit', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3'), p2: cards('clubs-4', 'clubs-9'), p3: cards('spades-2') },
    leader: 'p1',
    turn: 'p1',
    events: [
      { type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false },
      { type: 'missingSuitDeclared', player: 'p2', suits: ['hearts'] },
    ],
  });
  assert.equal(pVoid(p.memory, p.seen, 'p2', 'hearts'), 1);
});

test('pVoid is 0 when the player is known to hold a card of the suit', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3'), p2: cards('clubs-4'), p3: cards('spades-2') },
    leader: 'p1',
    turn: 'p1',
    events: [{ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }],
  });
  p.memory.known.p2!.set('hearts-12', standard('hearts-12'));
  assert.equal(pVoid(p.memory, p.seen, 'p2', 'hearts'), 0);
});

test('pVoid follows ((U - u) / U) ** k for an unknown player', () => {
  // No jokers: the pool is every card except my hand (3 cards) and nothing played.
  const p = position({
    order: ['p1', 'p2'],
    me: 'p1',
    hands: { p1: cards('hearts-3', 'hearts-4', 'clubs-5'), p2: cards('clubs-4', 'clubs-9', 'spades-2', 'diamonds-7') },
    leader: 'p1',
    turn: 'p1',
    events: [{ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }],
  });
  const U = 52 - 3; // the pool
  const u = 13; // every spade is unknown to me (I hold none)
  const k = 4; // p2 holds four cards, none known
  assert.ok(Math.abs(pVoid(p.memory, p.seen, 'p2', 'spades') - ((U - u) / U) ** k) < 1e-12);
});

test('pVoid is 1 for a player with no cards left', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3'), p2: [], p3: cards('spades-2') },
    leader: 'p1',
    turn: 'p1',
    events: [{ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }],
  });
  assert.equal(pVoid(p.memory, p.seen, 'p2', 'hearts'), 1);
});

test('yetToPlay: the players after me, up to the leader, who still hold cards', () => {
  // Trick order p3 (leader), p4, p1, p2. Seen from p4, p1 and p2 are still to play.
  const base = {
    order: ['p1', 'p2', 'p3', 'p4'],
    hands: { p1: cards('clubs-2'), p2: cards('hearts-3'), p3: cards('hearts-9'), p4: cards('hearts-5') },
    leader: 'p3',
    turn: 'p4',
    plays: [{ player: 'p3', cardId: 'hearts-9' }],
    events: [
      { type: 'roundStarted' as const, round: 1, dealer: 'p1', ultimate: false },
      { type: 'cardPlayed' as const, player: 'p3', card: standard('hearts-9') },
    ],
  };
  const fromP4 = position({ ...base, me: 'p4' });
  assert.deepEqual(yetToPlay(fromP4.memory, fromP4.seen), ['p1', 'p2']);
  // From p2 (last to play in this trick), nobody is left.
  const fromP2 = position({ ...base, me: 'p2', turn: 'p2' });
  assert.deepEqual(yetToPlay(fromP2.memory, fromP2.seen), []);
});

test('pSlapAfterMe uses only the players still to play', () => {
  const p = position({
    order: ['p1', 'p2', 'p3'],
    me: 'p1',
    hands: { p1: cards('hearts-3'), p2: cards('clubs-9'), p3: cards('hearts-8', 'clubs-2') },
    leader: 'p3',
    turn: 'p1',
    plays: [{ player: 'p3', cardId: 'hearts-8' }],
    events: [
      { type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false },
      { type: 'cardPlayed', player: 'p3', card: standard('hearts-8') },
      { type: 'missingSuitDeclared', player: 'p2', suits: ['hearts'] },
    ],
  });
  // p2 is the only player still to play, and is known void in hearts.
  assert.equal(pSlapAfterMe(p.memory, p.seen, 'hearts'), 1);
});

test('rankValue: 2 to 14 for standard cards, 0 for a joker', () => {
  assert.equal(rankValue(standard('clubs-2')), 2);
  assert.equal(rankValue(standard('spades-14')), 14);
  assert.equal(rankValue({ kind: 'joker', id: 'joker-1' }), 0);
});

test('handBadness: high cards are worse, missing suits and jokers help', () => {
  const twos = cards('clubs-2', 'hearts-2', 'diamonds-2', 'spades-2');
  const aces = cards('clubs-14', 'hearts-14', 'diamonds-14', 'spades-14');
  assert.ok(handBadness(aces) > handBadness(twos));
  const withJoker = [...aces, { kind: 'joker' as const, id: 'joker-1' }];
  assert.ok(handBadness(withJoker) < handBadness(aces));
  // Four missing suits at -0.3 each (an empty hand is never decided on, so this only checks the formula).
  assert.equal(handBadness([]), -1.2);
});
