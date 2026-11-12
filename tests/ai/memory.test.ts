// CODE.md 9m.9 (memory.test.ts): one test per event row in 9m.3, Easy's
// forgetting with a fixed seed, and that rebuild() equals remembering step by step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import type { SessionEvent } from '../../src/session/types.ts';
import { newMemory, rebuild, remember, unknownPool, type Memory } from '../../src/ai/memory.ts';
import { standard } from './position.ts';
import { playBotGame } from './botgame.ts';

const ORDER = ['p1', 'p2', 'p3'];
const rng = () => seededRng(11);

function fresh(level: 'normal' | 'easy' = 'normal'): Memory {
  return newMemory('p1', level, ORDER);
}

function play(player: string, id: string): SessionEvent {
  return { type: 'cardPlayed', player, card: standard(id) };
}

test('roundStarted resets everything for the new round', () => {
  const m = fresh();
  remember(m, [{ type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false }, play('p2', 'hearts-9'), { type: 'trickResolved', nextLeader: 'p3' }], rng());
  remember(m, [{ type: 'missingSuitDeclared', player: 'p3', suits: ['clubs'] }], rng());
  remember(m, [{ type: 'roundStarted', round: 2, dealer: 'p2', ultimate: false }], rng());
  assert.equal(m.round, 2);
  assert.equal(m.played.size, 0);
  assert.equal(m.waste.size, 0);
  assert.equal(m.trickCount, 0);
  assert.equal(m.voids.p3!.size, 0);
  assert.equal(m.leader, null);
  assert.equal(m.ledSuit, null);
});

test('missingSuitDeclared adds the suits to voids', () => {
  const m = fresh();
  remember(m, [{ type: 'missingSuitDeclared', player: 'p2', suits: ['hearts', 'spades'] }], rng());
  assert.deepEqual([...m.voids.p2!].sort(), ['hearts', 'spades']);
});

test('swapped clears what is known about that player', () => {
  const m = fresh();
  m.known.p2!.set('clubs-5', standard('clubs-5'));
  remember(m, [{ type: 'swapped', player: 'p2', count: 2 }], rng());
  assert.equal(m.known.p2!.size, 0);
});

test('cardPlayed fills the trick and played, sets the led suit on the first card, and removes known cards', () => {
  const m = fresh();
  m.known.p2!.set('hearts-7', standard('hearts-7'));
  remember(m, [play('p2', 'hearts-7'), play('p3', 'hearts-12')], rng());
  assert.deepEqual(m.trick.map((t) => t.player), ['p2', 'p3']);
  assert.equal(m.ledSuit, 'hearts');
  assert.equal(m.leader, 'p2');
  assert.ok(m.played.has('hearts-7') && m.played.has('hearts-12'));
  assert.equal(m.known.p2!.has('hearts-7'), false);
  assert.equal(m.voids.p3!.size, 0, 'a follow is not a void');
});

test('an off-suit cardPlayed is a slap: the player is void in the led suit', () => {
  const m = fresh();
  remember(m, [play('p2', 'hearts-7'), play('p3', 'clubs-2')], rng());
  assert.ok(m.voids.p3!.has('hearts'));
  assert.equal(m.voids.p2!.size, 0);
});

test('jokerPlayed counts the joker and makes its player the leader when it is first', () => {
  const m = fresh();
  remember(m, [{ type: 'jokerPlayed', player: 'p2', asLeader: true }], rng());
  assert.equal(m.jokersPlayed, 1);
  assert.equal(m.leader, 'p2');
  assert.equal(m.ledSuit, null, 'a joker lead does not set the suit');
  remember(m, [play('p3', 'spades-4')], rng());
  assert.equal(m.ledSuit, 'spades');
  assert.equal(m.leader, 'p2', 'the leader does not change within the trick');
});

test('slapped: the trick goes into the slapped player\'s known cards, and the trick is cleared', () => {
  const m = fresh();
  m.voids.p2!.add('hearts');
  remember(m, [play('p1', 'hearts-9'), play('p2', 'clubs-3'), { type: 'slapped', slapper: 'p2', slapped: 'p1', cardsPickedUp: 2 }], rng());
  assert.deepEqual([...m.known.p1!.keys()].sort(), ['clubs-3', 'hearts-9']);
  assert.equal(m.trick.length, 0);
  assert.ok(m.voids.p2!.has('hearts'), 'the slapper stays void');
  assert.equal(m.played.has('hearts-9'), false, 'picked-up cards are not "played" any more');
});

test('a slapped player loses a void in a suit they now hold', () => {
  const m = fresh();
  m.voids.p1!.add('hearts');
  remember(m, [play('p1', 'hearts-9'), play('p2', 'clubs-3'), { type: 'slapped', slapper: 'p2', slapped: 'p1', cardsPickedUp: 2 }], rng());
  assert.equal(m.voids.p1!.has('hearts'), false);
});

test('trickResolved puts the trick on the waste pile, clears the trick and counts it', () => {
  const m = fresh();
  remember(m, [play('p1', 'diamonds-3'), play('p2', 'diamonds-10'), play('p3', 'diamonds-5'), { type: 'trickResolved', nextLeader: 'p2' }], rng());
  assert.equal(m.waste.size, 3);
  assert.equal(m.trick.length, 0);
  assert.equal(m.ledSuit, null);
  assert.equal(m.leader, null);
  assert.equal(m.trickCount, 1);
});

test('a trick ended by a slap does not go on the waste pile', () => {
  const m = fresh();
  remember(m, [play('p1', 'diamonds-3'), play('p2', 'clubs-9'), { type: 'slapped', slapper: 'p2', slapped: 'p1', cardsPickedUp: 2 }, { type: 'trickResolved', nextLeader: 'p3' }], rng());
  assert.equal(m.waste.size, 0);
  assert.equal(m.trickCount, 1);
});

test('wastePilePickedUp: the remembered waste cards become known to the picker; their suits are no longer void', () => {
  const m = fresh();
  m.voids.p2!.add('diamonds');
  remember(m, [play('p1', 'diamonds-3'), play('p2', 'hearts-10'), { type: 'trickResolved', nextLeader: 'p3' }], rng());
  remember(m, [{ type: 'wastePilePickedUp', player: 'p2', cards: 2 }], rng());
  assert.ok(m.known.p2!.has('diamonds-3'));
  assert.ok(m.known.p2!.has('hearts-10'));
  assert.equal(m.waste.size, 0);
  assert.equal(m.voids.p2!.has('diamonds'), false);
});

test('cardsTaken: knowledge about the target moves to the requester; voids are kept only where both are void', () => {
  const m = fresh();
  m.known.p2!.set('spades-14', standard('spades-14'));
  m.voids.p1!.add('hearts');
  m.voids.p1!.add('clubs');
  m.voids.p2!.add('hearts');
  remember(m, [{ type: 'cardsTaken', requester: 'p1', target: 'p2', count: 4 }], rng());
  assert.ok(m.known.p1!.has('spades-14'));
  assert.equal(m.known.p2!.size, 0);
  assert.deepEqual([...m.voids.p1!], ['hearts']);
});

test('jokersDiscarded: the thrown-away jokers are gone from the pool', () => {
  const m = fresh();
  remember(m, [{ type: 'jokersDiscarded', player: 'p3', count: 2 }], rng());
  assert.equal(m.jokersPlayed, 2);
});

test('takeRequested counts only my own requests this round', () => {
  const m = fresh();
  remember(m, [{ type: 'takeRequested', requester: 'p2', target: 'p3' }, { type: 'takeRequested', requester: 'p1', target: 'p2' }], rng());
  assert.equal(m.asks, 1);
});

test('unknownPool: the full deck minus my hand, played cards and known cards, with jokers counted', () => {
  // Two-player game with 2 jokers: 54 cards in all.
  const m = fresh();
  remember(m, [play('p2', 'spades-14')], rng());
  const seen = {
    me: 'p1',
    session: { jokerRuleEnabled: true, jokerTotal: 2 },
    view: { myHand: [standard('hearts-2'), { kind: 'joker', id: 'joker-1' }] },
  } as unknown as Parameters<typeof unknownPool>[1];
  const pool = unknownPool(m, seen);
  assert.equal(pool.length, 54 - 3, 'minus my two cards and the played card, one joker is in my hand and one is left in the pool');
  assert.equal(pool.filter((c) => c.kind === 'joker').length, 1);
  assert.equal(pool.some((c) => c.id === 'spades-14'), false);
  assert.equal(pool.some((c) => c.id === 'hearts-2'), false);
});

test('Easy forgets some of what it remembers after each trick; the same seed forgets the same things', () => {
  const events: SessionEvent[] = [
    { type: 'roundStarted', round: 1, dealer: 'p1', ultimate: false },
    play('p2', 'hearts-3'), play('p3', 'hearts-4'), play('p1', 'hearts-5'), { type: 'trickResolved', nextLeader: 'p3' },
    play('p3', 'clubs-6'), play('p1', 'clubs-7'), play('p2', 'clubs-8'), { type: 'trickResolved', nextLeader: 'p1' },
    play('p1', 'spades-9'), play('p2', 'spades-10'), play('p3', 'spades-11'), { type: 'trickResolved', nextLeader: 'p3' },
  ];
  const easy1 = fresh('easy');
  remember(easy1, events, seededRng(2024));
  const easy2 = fresh('easy');
  remember(easy2, events, seededRng(2024));
  assert.deepEqual(easy1, easy2, 'same seed, same forgetting');
  assert.ok(easy1.played.size < 9, 'Easy forgets some played cards');

  const normal = fresh();
  remember(normal, events, seededRng(2024));
  assert.equal(normal.played.size, 9, 'Normal forgets nothing');
});

test('rebuild() equals remembering step by step from the round start', () => {
  for (const level of ['normal', 'easy'] as const) {
    const result = playBotGame({ players: 3, levels: [level], rounds: 2, seed: 616 });
    const log = result.session.log;
    let start = 0;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i]?.event.type === 'roundStarted') {
        start = i;
        break;
      }
    }
    const stepwise = newMemory('p1', level, result.session.order);
    remember(stepwise, log.slice(start).map((e) => e.event), seededRng(88));
    const rebuilt = rebuild('p1', level, result.session, seededRng(88));
    assert.deepEqual(rebuilt, stepwise, `${level}: rebuild differs from remembering step by step`);
  }
});
