// 9ar.2 (L): from round 2 on, the winner of the last round picks who shuffles and deals, at the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import type { Session } from '../../src/session/types.ts';
import { act, dealAll, playRound, setupFor, startedRound, voteRest } from './helpers.ts';
import { chooseDealer } from '../../src/ai/moves.ts';
import { seededRng as rng0 } from '../../src/rules/rng.ts';

/** Network setup, as the removal tests use it (the host removes players only in a network game). */
const net = (n: number): ReturnType<typeof setupFor> => ({ ...setupFor(n), waitForAll: true });

/** Play round 1 to the results screen and advance to round 2 (the pick is still to come). */
function toRoundTwo(n: number, seed: number, setup = setupFor(n)): { s: Session; rng: ReturnType<typeof seededRng> } {
  const rng = seededRng(seed);
  let s = playRound(createSession(setup, rng).session, rng);
  // A network game (waitForAll) waits until every player is ready.
  if (setup.waitForAll) for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  return { s, rng };
}

test('round 1: the host deals at once, no pick', () => {
  const rng = seededRng(3);
  const s = createSession(setupFor(4), rng).session;
  assert.equal(s.phase, 'dealing');
  assert.equal(s.dealer, 'p1');
});

test('round 2 starts with the dealer pick, and nothing is dealt yet', () => {
  const { s } = toRoundTwo(4, 11);
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'chooseDealer');
  assert.equal(s.deal, null);
  assert.equal(s.hands.p1, undefined);
});

test('only last round\'s winner may pick', () => {
  const { s, rng } = toRoundTwo(4, 12);
  const winner = s.previous!.winner;
  const other = s.order.find((p) => p !== winner)!;
  assert.throws(() => act(s, { type: 'chooseDealer', by: other, dealer: other }, rng), /winner/);
});

test('the winner may pick any player, themselves included', () => {
  for (const pick of ['self', 'other'] as const) {
    const { s, rng } = toRoundTwo(4, 13);
    const winner = s.previous!.winner;
    const dealer = pick === 'self' ? winner : s.order.find((p) => p !== winner)!;
    const r = applyAction(s, { type: 'chooseDealer', by: winner, dealer }, rng);
    assert.equal(r.session.dealer, dealer);
    assert.equal(r.session.phase, 'dealing');
    assert.ok(r.events.some((e) => e.type === 'dealerChosen' && e.dealer === dealer));
    assert.ok(r.events.some((e) => e.type === 'roundStarted' && e.dealer === dealer));
  }
});

test('the picked dealer can then deal and the round goes on', () => {
  const { s, rng } = toRoundTwo(3, 14);
  const winner = s.previous!.winner;
  const dealer = s.order.find((p) => p !== winner)!;
  let t = act(s, { type: 'chooseDealer', by: winner, dealer }, rng);
  t = dealAll(t, rng);
  t = startedRound(t, rng, t.hostId);
  assert.ok(['reshuffle', 'swap', 'cardCheck', 'leadNotice', 'reactionTap', 'chooseLeader', 'playing'].includes(t.phase));
});

test('a pick for a player not in the game is refused', () => {
  const { s, rng } = toRoundTwo(4, 15);
  assert.throws(() => act(s, { type: 'chooseDealer', by: s.previous!.winner, dealer: 'nobody' }, rng));
});

test('the Ultimate Round uses the same pick', () => {
  const rng = seededRng(16);
  let s = playRound(createSession(setupFor(4), rng).session, rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng);
  s = voteRest(s, 'yes', rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  assert.equal(s.ultimateRound, true);
  assert.equal(s.phase, 'chooseDealer');
});

test('a removed winner passes the pick to the player just below them', () => {
  // The host can't be removed, so look for a round whose winner is someone else.
  let found: { s: Session; rng: ReturnType<typeof seededRng> } | null = null;
  for (let seed = 17; seed < 80 && !found; seed++) {
    const t = toRoundTwo(4, seed, net(4));
    if (t.s.previous!.winner !== t.s.hostId) found = t;
  }
  assert.ok(found, 'a seed with a non-host winner');
  const { s, rng } = found;
  const winner = s.previous!.winner;
  const r = applyAction(s, { type: 'removePlayer', by: 'p1', player: winner }, rng);
  assert.equal(r.session.phase, 'chooseDealer');
  assert.notEqual(r.session.previous!.winner, winner);
  assert.ok(r.session.order.includes(r.session.previous!.winner));
});

test('the computer picks another player, weighted to whoever is ahead', () => {
  const { s } = toRoundTwo(4, 18);
  const winner = s.previous!.winner;
  const fakeSeen = { session: { ...s, scores: { ...s.scores, p2: 50, p3: 0, p4: 0 } }, view: {}, me: winner } as never;
  const rng = rng0(1);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 400; i++) {
    const a = chooseDealer(fakeSeen, rng);
    assert.equal(a.type, 'chooseDealer');
    if (a.type === 'chooseDealer') {
      assert.notEqual(a.dealer, winner, 'the computer picks someone else');
      counts[a.dealer] = (counts[a.dealer] ?? 0) + 1;
    }
  }
  const ahead = counts['p2'] ?? 0;
  const others = (counts['p3'] ?? 0) + (counts['p4'] ?? 0);
  assert.ok(ahead > others / 2, `the player ahead is picked often (${ahead} vs ${others})`);
});
