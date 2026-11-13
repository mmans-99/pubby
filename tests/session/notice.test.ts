/**
 * 2.30 (CODE.md 9y.4, PROJECT.md 12k): the missing-suit notices stay until
 * every person has tapped OK. Pure session tests (no browser).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { missingSuitPlayers } from '../../src/rules/round.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import type { Session, SessionSetup } from '../../src/session/types.ts';
import { act, dealAll } from './helpers.ts';

function setup(opts: { waitForAll?: boolean; computer?: readonly string[] }, seed: number): SessionSetup {
  void seed;
  return {
    players: Array.from({ length: 4 }, (_, i) => {
      const id = `p${i + 1}`;
      return opts.computer?.includes(id) ? { id, profileName: id, computer: true } : { id, profileName: id };
    }),
    hostId: 'p1',
    jokerRuleEnabled: true,
    waitForAll: opts.waitForAll,
  };
}

/** The first seed (from 1) where `want` players are missing a suit, dealt and started (round 1). */
function atStart(want: number, opts: { waitForAll?: boolean; computer?: readonly string[] } = {}): Session {
  for (let seed = 1; seed < 5000; seed++) {
    const rng = seededRng(seed);
    let s = dealAll(createSession(setup(opts, seed), rng).session, rng);
    if (missingSuitPlayers(s.order, s.hands).length !== want) continue;
    s = act(s, { type: 'startRound', by: s.hostId }, rng);
    return s;
  }
  throw new Error(`no seed with ${want} missing`);
}

const rng = seededRng(99);
const tapAll = (s: Session, who: readonly string[]): Session => who.reduce((x, p) => act(x, { type: 'seenNotice', by: p }, rng), s);

test('one player missing a suit: a notice stays until every person taps OK, then that player leads', () => {
  const s0 = atStart(1, { waitForAll: true });
  assert.equal(s0.phase, 'leadNotice');
  assert.equal(s0.notice?.kind, 'missingOne');
  const leader = s0.notice!.leader!;
  const after1 = act(s0, { type: 'seenNotice', by: 'p1' }, rng);
  assert.equal(after1.phase, 'leadNotice', 'one tap is not enough with waitForAll');
  assert.deepEqual([...after1.noticeSeen], ['p1']);
  const again = act(after1, { type: 'seenNotice', by: 'p1' }, rng);
  assert.deepEqual([...again.noticeSeen], ['p1'], 'a repeat tap is harmless');
  const done = tapAll(after1, ['p2', 'p3', 'p4']);
  assert.equal(done.phase, 'playing');
  assert.equal(done.play!.turn, leader);
  assert.equal(done.notice, null);
});

test('a shared phone (waitForAll off): one OK is enough', () => {
  const s0 = atStart(1, { waitForAll: false });
  assert.equal(s0.phase, 'leadNotice');
  const done = act(s0, { type: 'seenNotice', by: 'p3' }, rng);
  assert.equal(done.phase, 'playing');
});

test('two players missing a suit: notice, then the Reaction Tap intro, then the tap', () => {
  const s0 = atStart(2, { waitForAll: true });
  assert.equal(s0.notice?.kind, 'missingMany');
  const players = [...s0.notice!.players];
  const s1 = tapAll(s0, s0.order);
  assert.equal(s1.phase, 'leadNotice');
  assert.equal(s1.notice?.kind, 'tapIntro');
  assert.deepEqual([...s1.notice!.players], players);
  const s2 = tapAll(s1, s0.order);
  assert.equal(s2.phase, 'reactionTap');
  assert.deepEqual([...s2.tap!.players], players);
  assert.equal(s2.notice, null);
});

test('Reaction Tap: the slowest leads, after a notice that shows the times', () => {
  let s = tapAll(tapAll(atStart(2, { waitForAll: true }), ['p1', 'p2', 'p3', 'p4']), ['p1', 'p2', 'p3', 'p4']);
  const [a, b] = s.tap!.players as [string, string];
  s = act(s, { type: 'reactionTap', by: a, ms: 300, falseStart: false }, rng);
  s = act(s, { type: 'reactionTap', by: b, ms: 450, falseStart: false }, rng);
  assert.equal(s.phase, 'leadNotice');
  assert.equal(s.notice?.kind, 'tapResult');
  assert.equal(s.notice?.leader, b, 'the slower player leads');
  assert.equal(s.notice?.times?.[b]?.ms, 450);
  const done = tapAll(s, s.order);
  assert.equal(done.phase, 'playing');
  assert.equal(done.play!.turn, b);
});

test('a tie in Reaction Tap shows a tie notice, then the tap runs again with the same players', () => {
  let s = tapAll(tapAll(atStart(2, { waitForAll: true }), ['p1', 'p2', 'p3', 'p4']), ['p1', 'p2', 'p3', 'p4']);
  const [a, b] = s.tap!.players as [string, string];
  s = act(s, { type: 'reactionTap', by: a, ms: 300, falseStart: false }, rng);
  s = act(s, { type: 'reactionTap', by: b, ms: 300, falseStart: false }, rng);
  assert.equal(s.phase, 'leadNotice');
  assert.equal(s.notice?.kind, 'tapTie');
  const back = tapAll(s, s.order);
  assert.equal(back.phase, 'reactionTap');
  assert.deepEqual([...back.tap!.players].sort(), [a, b].sort());
  assert.deepEqual(back.tap!.results, {});
});

test('computer players never tap a notice and do not hold it up', () => {
  const s0 = atStart(1, { waitForAll: true, computer: ['p2', 'p3'] });
  assert.equal(s0.phase, 'leadNotice');
  assert.throws(() => act(s0, { type: 'seenNotice', by: 'p2' }, rng), /computer player/);
  const done = tapAll(s0, ['p1', 'p4']);
  assert.equal(done.phase, 'playing', 'only the two persons have to tap');
});

test('a game of computer players only has no notice: play goes on at once', () => {
  const s = atStart(1, { waitForAll: true, computer: ['p1', 'p2', 'p3', 'p4'] });
  assert.equal(s.phase, 'playing');
  assert.equal(s.notice, null);
});

test('seenNotice outside a notice fails', () => {
  const s = atStart(0);
  assert.throws(() => act(s, { type: 'seenNotice', by: 'p1' }, rng), /Not allowed/);
});

test('an unknown player cannot tap a notice', () => {
  const s0 = atStart(1, { waitForAll: true });
  assert.throws(() => applyAction(s0, { type: 'seenNotice', by: 'nobody' }, rng), /.+/);
});
