// CODE.md 9an.4 (2.38, Part D): Keep my cards. Network games only (waitForAll, two or more people):
// nobody starts the round until everyone has kept their cards or voted on a reshuffle.
// Single player and one-phone play are unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession, keepOn } from '../../src/session/session.ts';
import type { Session, SessionAction } from '../../src/session/types.ts';
import { playerView } from '../../src/session/view.ts';
import { dealAll } from './helpers.ts';
import type { Rng } from '../../src/rules/rng.ts';

function table(n: number, waitForAll: boolean, computers: number[] = [], seed = 17): { s: Session; rng: Rng } {
  const rng = seededRng(seed);
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    profileName: `Player ${i + 1}`,
    ...(computers.includes(i + 1) ? { computer: true } : {}),
  }));
  let s = createSession({ players, hostId: 'p1', jokerRuleEnabled: true, waitForAll }, rng).session;
  s = dealAll(s, rng);
  return { s, rng };
}

function act(s: Session, a: SessionAction, rng: Rng): Session {
  return applyAction(s, a, rng).session;
}

function failure(s: Session, a: SessionAction, rng: Rng): string {
  try {
    applyAction(s, a, rng);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

test('keep is on only for network games: waitForAll and two or more people', () => {
  assert.equal(keepOn(table(3, true).s), true);
  assert.equal(keepOn(table(3, false).s), false, 'one phone, no waiting: unchanged');
  assert.equal(keepOn(table(2, true, [2]).s), false, 'one person and a computer is single player');
  assert.equal(keepOn(table(3, true, [3]).s), true, 'two people and a computer is a network game');
});

test('the deal starts with nobody kept, and the reshuffle phase is open', () => {
  const { s } = table(3, true);
  assert.equal(s.phase, 'reshuffle');
  assert.deepEqual(s.kept, []);
});

test('the host cannot start until everyone has kept their cards', () => {
  const { s, rng } = table(3, true);
  assert.match(failure(s, { type: 'startRound', by: 'p1' }, rng), /Waiting for everyone to keep their cards/);
  const s1 = act(s, { type: 'keepCards', by: 'p2' }, rng);
  assert.match(failure(s1, { type: 'startRound', by: 'p1' }, rng), /Waiting for everyone/);
  const s2 = act(s1, { type: 'keepCards', by: 'p3' }, rng);
  const started = act(s2, { type: 'startRound', by: 'p1' }, rng);
  assert.equal(started.phase, 'swap', '3 players swap after the reshuffle window');
});

test('keepCards records the person and emits cardsKept', () => {
  const { s, rng } = table(3, true);
  const r = applyAction(s, { type: 'keepCards', by: 'p2' }, rng);
  assert.deepEqual(r.session.kept, ['p2']);
  assert.ok(r.events.some((e) => e.type === 'cardsKept' && e.player === 'p2'));
});

test('keepCards refuses twice and any other phase; a computer may keep (it never holds the round up)', () => {
  const { s, rng } = table(3, true, [3]);
  const s1 = act(s, { type: 'keepCards', by: 'p2' }, rng);
  assert.match(failure(s1, { type: 'keepCards', by: 'p2' }, rng), /already kept/);
  const s2 = act(s1, { type: 'keepCards', by: 'p3' }, rng);
  assert.deepEqual(s2.kept, ['p2', 'p3']);
  const { s: solo, rng: r2 } = table(2, false);
  assert.match(failure(solo, { type: 'keepCards', by: 'p1' }, r2), /only for network games/);
});

test('a player who is away can be skipped by the host, and the host needs no keep', () => {
  const { s, rng } = table(3, true);
  const s1 = act(s, { type: 'keepCards', by: 'p2' }, rng);
  assert.match(failure(s1, { type: 'startRound', by: 'p1' }, rng), /Waiting for everyone/);
  const started = act(s1, { type: 'startRound', by: 'p1', skip: ['p3'] }, rng);
  assert.equal(started.phase, 'swap');
  assert.deepEqual(started.kept, ['p2'], 'skipping does not add to the kept list');
});

test('calling a reshuffle vote counts as keeping for the caller', () => {
  const { s, rng } = table(3, true);
  const called = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  assert.ok(called.kept.includes('p2'));
});

test('voting on a reshuffle counts as keeping for the voter', () => {
  const { s, rng } = table(3, true);
  const called = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  const voted = act(called, { type: 'castVote', by: 'p3', ballot: 'no' }, rng);
  assert.ok(voted.kept.includes('p3'));
});

test('the view lists who the round still waits for', () => {
  const { s, rng } = table(4, true, [4]);
  const s1 = act(s, { type: 'keepCards', by: 'p2' }, rng);
  const v = playerView(s1, 'p1');
  assert.equal(v.keepOn, true);
  assert.deepEqual([...v.kept], ['p2']);
  assert.deepEqual([...v.keepWaiting], ['p3'], 'the computer never has to keep');
});

test('single player view says keeping is off', () => {
  const { s } = table(2, false);
  assert.equal(playerView(s, 'p1').keepOn, false);
  assert.deepEqual([...playerView(s, 'p1').keepWaiting], []);
});
