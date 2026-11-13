import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction } from '../../src/session/session.ts';
import type { Session } from '../../src/session/types.ts';
import { act, dealAll, playRound, start, voteRest } from './helpers.ts';

// 2.32 (PROJECT.md 12n): the asker is an automatic YES; a vote waits for everyone unless the host counts early.

function toTarget(s: Session, rng: () => number): Session {
  for (let i = 0; i < 40 && !s.vote; i++) {
    s = act(s, { type: 'advance', by: s.hostId }, rng);
    s = playRound(s, rng);
  }
  return s;
}

test('host counts early: 3 of 5 yes (asker included) passes; the missing two count as not-yes', () => {
  const rng = seededRng(21);
  let s = dealAll(start(5, rng), rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  s = act(s, { type: 'castVote', by: 'p1', ballot: 'yes' }, rng);
  s = act(s, { type: 'castVote', by: 'p3', ballot: 'yes' }, rng);
  assert.equal(s.vote?.kind, 'reshuffle'); // 3 of 5 yes, two still to vote
  s = act(s, { type: 'closeVote', by: 'p1' }, rng); // the host counts now
  assert.equal(s.vote, null);
  const resolved = [...s.log].reverse().find((e) => e.event.type === 'voteResolved')!.event;
  assert.deepEqual(resolved, { type: 'voteResolved', kind: 'reshuffle', result: true, decidedBy: 'majority', value: null });
  assert.equal(s.phase, 'dealing');
});

test('automatic Ultimate Round (target reached) starts with no asker and no ballots', () => {
  const rng = seededRng(12);
  let s = playRound(start(3, rng), rng);
  s = act(s, { type: 'callVote', by: 'p3', kind: 'target', value: 4 }, rng);
  s = voteRest(s, 'yes', rng);
  s = toTarget(s, rng);
  assert.equal(s.vote?.kind, 'ultimate');
  assert.equal(s.vote?.calledBy, null);
  assert.deepEqual(s.vote?.ballots, {});
});

test('the asker cannot cast a second ballot', () => {
  const rng = seededRng(22);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p4', kind: 'reshuffle' }, rng);
  assert.deepEqual(s.vote?.ballots, { p4: 'yes' });
  assert.throws(() => applyAction(s, { type: 'castVote', by: 'p4', ballot: 'no' }, rng), /already YES/);
});
