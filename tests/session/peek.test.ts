// CODE.md 9an.3 (2.38, Part C): watching a hand after you are out. Network games and single player only;
// the watched hand reaches only the viewer's copy; computer players never ask, and usually agree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession, handOf, peeksOn } from '../../src/session/session.ts';
import type { Session, SessionAction } from '../../src/session/types.ts';
import { playerView } from '../../src/session/view.ts';
import { isBlank, redactSession } from '../../src/net/netgame.ts';
import { choosePeekAnswer } from '../../src/ai/moves.ts';
import { seenBy } from '../../src/ai/seen.ts';
import type { Persona } from '../../src/ai/persona.ts';
import { act, dealAll, playRound, step, startedRound } from './helpers.ts';
import type { Rng } from '../../src/rules/rng.ts';

/** A table of n players; `computers` are seat numbers (1-based) that are computer players. */
function table(n: number, waitForAll: boolean, computers: number[] = [], seed = 91): { s: Session; rng: Rng } {
  const rng = seededRng(seed);
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    profileName: `Player ${i + 1}`,
    ...(computers.includes(i + 1) ? { computer: true } : {}),
  }));
  let s = createSession({ players, hostId: 'p1', jokerRuleEnabled: true, waitForAll }, rng).session;
  s = dealAll(s, rng);
  s = startedRound(s, rng, 'p1');
  while (s.phase !== 'playing') s = step(s, rng);
  return { s, rng };
}

/** Play until someone is out of the round (and the round is still on). */
function untilSomeoneOut(s: Session, rng: Rng): Session {
  while (s.phase === 'playing' && s.order.every((p) => handOf(s, p).length > 0)) s = step(s, rng);
  return s;
}

function outAndHolder(s: Session): { out: string; holder: string } {
  const out = s.order.find((p) => handOf(s, p).length === 0)!;
  const holder = s.order.find((p) => handOf(s, p).length > 0)!;
  return { out, holder };
}

function failure(s: Session, a: SessionAction, rng: Rng): string {
  try {
    applyAction(s, a, rng);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

test('watch: only in network games and single player (not one shared phone)', () => {
  const net = table(4, true);
  assert.equal(peeksOn(net.s), true);
  const passAndPlay = table(4, false);
  assert.equal(peeksOn(passAndPlay.s), false);
  const single = table(4, false, [2, 3, 4]);
  assert.equal(peeksOn(single.s), true, 'one person and computers is single player');
  const shared = untilSomeoneOut(passAndPlay.s, passAndPlay.rng);
  const { out, holder } = outAndHolder(shared);
  assert.match(failure(shared, { type: 'requestPeek', by: out, target: holder }, passAndPlay.rng), /network games and single player/);
});

test('watch: only a player who is out can ask, and only one player at a time', () => {
  const { s: start, rng } = table(4, true);
  const s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  const notOut = s.order.find((p) => p !== out && handOf(s, p).length > 0 && p !== holder)!;
  assert.match(failure(s, { type: 'requestPeek', by: notOut, target: holder }, rng), /Only players who are out/);
  const asked = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  assert.deepEqual(asked.peeks, [{ viewer: out, target: holder, showing: false }]);
  assert.match(failure(asked, { type: 'requestPeek', by: out, target: notOut }, rng), /one player at a time/);
});

test('watch: a computer player who is out never asks (computers never watch)', () => {
  const { s: start, rng } = table(4, true, [2]);
  let s = start;
  while (s.phase === 'playing' && handOf(s, 'p2').length > 0) s = step(s, rng);
  assert.equal(s.phase, 'playing', 'seat 2 went out during the round');
  assert.equal(handOf(s, 'p2').length, 0);
  assert.match(failure(s, { type: 'requestPeek', by: 'p2', target: 'p1' }, rng), /Computer players do not watch hands/);
});

test('watch: accept shows the hand; refuse removes the request', () => {
  const { s: start, rng } = table(4, true);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  // The target answers; accept turns it on.
  const yes = act(s, { type: 'answerPeek', by: holder, viewer: out, accept: true }, rng);
  assert.deepEqual(yes.peeks, [{ viewer: out, target: holder, showing: true }]);
  assert.ok(yes.log.some((e) => e.event.type === 'peekAnswered' && e.event.accepted));
  // A refusal (asked again after a stop) removes it.
  const stopped = act(yes, { type: 'stopPeek', by: out, other: holder }, rng);
  assert.deepEqual(stopped.peeks, []);
  const asked = act(stopped, { type: 'requestPeek', by: out, target: holder }, rng);
  const no = act(asked, { type: 'answerPeek', by: holder, viewer: out, accept: false }, rng);
  assert.deepEqual(no.peeks, []);
});

test('watch: either the viewer or the player watched can stop it', () => {
  const { s: start, rng } = table(4, true);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  s = act(s, { type: 'answerPeek', by: holder, viewer: out, accept: true }, rng);
  const byTarget = act(s, { type: 'stopPeek', by: holder, other: out }, rng);
  assert.deepEqual(byTarget.peeks, []);
  assert.ok(byTarget.log.some((e) => e.event.type === 'peekStopped' && e.event.by === holder));
});

test('watch: the view shows the hand to the viewer only, and the redacted copies of others stay blank', () => {
  const { s: start, rng } = table(4, true);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  s = act(s, { type: 'answerPeek', by: holder, viewer: out, accept: true }, rng);

  const viewer = playerView(redactSession(s, out), out);
  assert.ok(viewer.watching, 'the viewer has the watch');
  assert.equal(viewer.watching!.target, holder);
  assert.deepEqual(viewer.watching!.cards.map((c) => c.id), handOf(s, holder).map((c) => c.id));

  // Nobody else gets the watched hand: not the target, not another player, not the bystander.
  for (const p of s.order.filter((x) => x !== out)) {
    const copy = redactSession(s, p);
    assert.equal(playerView(copy, p).watching, null, `${p} has no watch`);
    assert.ok(copy.hands[holder]!.every(isBlank) || p === holder, `${p} can't see ${holder}'s cards`);
  }
  // Everyone sees that the watch exists (no cards): the public list.
  assert.equal(playerView(redactSession(s, 'p1'), 'p1').peeks.length, 1);
});

test('watch: a watch ends by itself when the player watched goes out', () => {
  const { s: start, rng } = table(4, true);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  // Asked, not yet answered: the watch is pending.
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  assert.equal(s.peeks.length, 1);
  // Play on until the holder goes out too (or the round ends); the watch must not outlive them.
  let guard = 0;
  while (s.phase === 'playing' && handOf(s, holder).length > 0 && guard++ < 2000) s = step(s, rng);
  if (handOf(s, holder).length === 0 && s.phase === 'playing') assert.equal(s.peeks.length, 0);
});

test('watch: all watches end when the round ends', () => {
  const { s: start, rng } = table(4, true, [], 93);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  s = act(s, { type: 'answerPeek', by: holder, viewer: out, accept: true }, rng);
  const ended = playRound(s, rng);
  assert.equal(ended.peeks.length, 0);
  assert.equal(playerView(redactSession(ended, out), out).watching, null);
});

test('watch: a computer player agrees most of the time (windup 50%, others 75%), never reads the view', () => {
  const { s: start, rng } = table(4, true, [4]);
  let s = untilSomeoneOut(start, rng);
  const { out, holder } = outAndHolder(s);
  s = act(s, { type: 'requestPeek', by: out, target: holder }, rng);
  const seen = seenBy(s, holder, 0);
  const count = (personality: Persona['personality']) => {
    let yes = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const a = choosePeekAnswer(seen, { level: 'normal', personality }, seededRng(seed));
      if (a && a.type === 'answerPeek' && a.accept) yes++;
    }
    return yes / 400;
  };
  assert.ok(Math.abs(count('careful') - 0.75) < 0.07, `careful ${count('careful')}`);
  assert.ok(Math.abs(count('windup') - 0.5) < 0.07, `windup ${count('windup')}`);
});
