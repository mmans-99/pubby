import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import type { Session, SessionSetup } from '../../src/session/types.ts';
import { playerView } from '../../src/session/view.ts';
import { chooseSeenHand } from '../../src/ai/moves.ts';
import { phoneActions } from '../../src/net/netgame.ts';
import { act, dealAll, playRound, setupFor } from './helpers.ts';

/** Two or three players, dealt, and in the hidden swap. */
function inSwap(n: number, seed: number, waitForAll: boolean | undefined): Session {
  const rng = seededRng(seed);
  const setup: SessionSetup = { ...setupFor(n), ...(waitForAll === undefined ? {} : { waitForAll }) };
  let s = dealAll(createSession(setup, rng).session, rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  assert.equal(s.phase, 'swap');
  return s;
}

/** Everyone swaps nothing. */
function swapAll(s: Session, rng: ReturnType<typeof seededRng>): Session {
  for (const p of s.order) s = act(s, { type: 'swap', by: p, cardIds: [] }, rng);
  return s;
}

test('waitForAll off (pass-and-play): after the last swap the round goes on as in 2.19', () => {
  const rng = seededRng(11);
  const s = swapAll(inSwap(3, 11, false), rng);
  assert.notEqual(s.phase, 'cardCheck');
  assert.ok(['reactionTap', 'chooseLeader', 'playing'].includes(s.phase));
});

test('waitForAll on: after the last swap the phase is cardCheck; nobody can play yet', () => {
  const rng = seededRng(12);
  const s = swapAll(inSwap(3, 12, true), rng);
  assert.equal(s.phase, 'cardCheck');
  assert.deepEqual(s.handSeen, []);
  assert.throws(() => act(s, { type: 'playCard', by: 'p1', cardId: 'x' }, rng), /Not allowed/);
  assert.throws(() => act(s, { type: 'swap', by: 'p1', cardIds: [] }, rng), /Not allowed/);
});

test('seenHand from one player: still cardCheck, the event is logged', () => {
  const rng = seededRng(13);
  let s = swapAll(inSwap(3, 13, true), rng);
  const r = applyAction(s, { type: 'seenHand', by: 'p2' }, rng);
  s = r.session;
  assert.equal(s.phase, 'cardCheck');
  assert.deepEqual(s.handSeen, ['p2']);
  assert.ok(r.events.some((e) => e.type === 'handSeen' && e.player === 'p2'));
});

test('a repeat seenHand changes nothing', () => {
  const rng = seededRng(14);
  let s = swapAll(inSwap(2, 14, true), rng);
  s = act(s, { type: 'seenHand', by: 'p2' }, rng);
  const again = applyAction(s, { type: 'seenHand', by: 'p2' }, rng);
  assert.deepEqual(again.session.handSeen, ['p2']);
  assert.equal(again.events.length, 0);
});

test('the last seenHand moves on as decideLeaderStep would (leader chosen or tap or chooser)', () => {
  const rng = seededRng(15);
  let s = swapAll(inSwap(3, 15, true), rng);
  for (const p of s.order) s = act(s, { type: 'seenHand', by: p }, rng);
  assert.notEqual(s.phase, 'cardCheck');
  assert.ok(['reactionTap', 'chooseLeader', 'playing'].includes(s.phase));
});

test('seenHand in any other phase fails', () => {
  const rng = seededRng(16);
  const s = inSwap(3, 16, true);
  assert.throws(() => act(s, { type: 'seenHand', by: 'p1' }, rng), /Not allowed/);
});

test('a new round starts with handSeen empty again', () => {
  const rng = seededRng(17);
  let s = swapAll(inSwap(2, 17, true), rng);
  for (const p of s.order) s = act(s, { type: 'seenHand', by: p }, rng);
  s = playRound(s, rng);
  for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  assert.equal(s.round, 2);
  assert.deepEqual(s.handSeen, []);
});

test('view: cardCheck lists who has seen their hand, and is null in other phases', () => {
  const rng = seededRng(18);
  let s = swapAll(inSwap(3, 18, true), rng);
  assert.deepEqual(playerView(s, 'p2').cardCheck, { seen: [] });
  s = act(s, { type: 'seenHand', by: 'p2' }, rng);
  assert.deepEqual(playerView(s, 'p3').cardCheck, { seen: ['p2'] });
  assert.equal(playerView(inSwap(3, 19, true), 'p1').cardCheck, null);
});

test('a phone may send seenHand for its own player only', () => {
  const ok = phoneActions([{ type: 'seenHand', by: 'p2' }], 'p2');
  assert.ok('actions' in ok && ok.actions.length === 1);
  assert.ok('why' in phoneActions([{ type: 'seenHand', by: 'p1' }], 'p2'));
});

test('a session saved before 2.20 (no waitForAll) never enters cardCheck', () => {
  const rng = seededRng(20);
  const s = swapAll(inSwap(3, 20, undefined), rng);
  assert.equal(s.waitForAll, false);
  assert.notEqual(s.phase, 'cardCheck');
});

test('computer player: in cardCheck it says it has seen its hand, once', () => {
  const rng = seededRng(21);
  const s = swapAll(inSwap(2, 21, true), rng);
  const seen = (me: string, handSeen: string[]) => ({ me, view: { cardCheck: { seen: handSeen } } }) as never;
  assert.deepEqual(chooseSeenHand(seen('p2', [])), { type: 'seenHand', by: 'p2' });
  assert.equal(chooseSeenHand(seen('p2', ['p2'])), null);
  assert.equal(chooseSeenHand({ me: 'p2', view: { cardCheck: null } } as never), null);
  assert.equal(s.phase, 'cardCheck');
});

test('votes are refused during cardCheck (reshuffle, target, Ultimate)', () => {
  const rng = seededRng(22);
  const s = swapAll(inSwap(3, 22, true), rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng));
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 10 }, rng));
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng));
});
