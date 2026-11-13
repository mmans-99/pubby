import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, minimumTarget } from '../../src/session/session.ts';
import type { Session, SessionAction } from '../../src/session/types.ts';
import { act, playRound, start } from './helpers.ts';

/** A session on the results screen after one round, with the given scores. */
function results(n: number, scores: Record<string, number>, seed = 11): Session {
  const rng = seededRng(seed);
  const s = playRound(start(n, rng), rng);
  assert.equal(s.phase, 'results');
  return { ...s, scores };
}

function events(s: Session, a: SessionAction) {
  return applyAction(s, a, seededRng(1)).events.map((e) => e.type);
}

const rng = seededRng(5);
const vote = (s: Session, by: string, ballot: 'yes' | 'no') => act(s, { type: 'castVote', by, ballot }, rng);

// ----- Target minimum -----

test('target: can\'t be lower than the highest score; equal starts the Ultimate vote', () => {
  const s = results(3, { p1: 5, p2: 3, p3: 1 });
  assert.equal(minimumTarget(s), 5);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 4 }, rng), /lower than the highest score/);
  let t = act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 5 }, rng); // p2 asked: already YES
  t = vote(vote(t, 'p1', 'yes'), 'p3', 'yes'); // everyone has voted: 3 of 3 yes
  assert.equal(t.target, 5);
  assert.ok(t.vote && t.vote.kind === 'ultimate' && t.vote.calledBy === null, 'p1 has reached it: Ultimate vote starts');
});

test('target: before any points the minimum is 1', () => {
  const s = results(3, { p1: 0, p2: 0, p3: 0 });
  assert.equal(minimumTarget(s), 1);
});

// ----- Two players: both must agree -----

test('2 players: asking counts as yes, the other player decides, no host', () => {
  const s = results(2, { p1: 2, p2: 1 });
  const asked = act(s, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng);
  assert.deepEqual(asked.vote?.ballots, { p2: 'yes' });
  const no = vote(asked, 'p1', 'no');
  assert.equal(no.vote, null);
  assert.equal(no.ultimateRound, false, 'one "no" is enough: not agreed');
  const yes = vote(asked, 'p1', 'yes');
  assert.equal(yes.ultimateRound, true);
});

test('2 players: the host closing an unanswered request means no', () => {
  const s = results(2, { p1: 2, p2: 1 });
  const asked = act(s, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng);
  const closed = act(asked, { type: 'closeVote', by: 'p1' }, rng);
  assert.equal(closed.vote, null);
  assert.equal(closed.ultimateRound, false);
});

test('2 players: the host\'s own request still needs the other player', () => {
  const s = results(2, { p1: 2, p2: 1 });
  const asked = act(s, { type: 'callVote', by: 'p1', kind: 'ultimate' }, rng);
  assert.equal(asked.vote?.awaitingHost, false);
  assert.equal(vote(asked, 'p2', 'no').ultimateRound, false);
});

// ----- Draw at the end -----

test('draw: host ends the game with a tied top score: Ultimate offered, then "Coward!", then shared scores', () => {
  const s = results(4, { p1: 3, p2: 3, p3: 1, p4: 0 });
  assert.ok(events(s, { type: 'endSession', by: 'p1' }).includes('drawAtEnd'));
  let t = act(s, { type: 'endSession', by: 'p1' }, rng);
  assert.equal(t.ended, null, 'not ended yet');
  assert.equal(t.vote?.draw, 1);
  assert.equal(t.vote?.kind, 'ultimate');
  // 2.32: a vote is decided only once everyone has voted: all four say no.
  t = vote(vote(vote(vote(t, 'p1', 'no'), 'p2', 'no'), 'p3', 'no'), 'p4', 'no');
  assert.equal(t.vote?.draw, 2, 'second chance');
  assert.ok(t.log.some((e) => e.event.type === 'drawCoward'));
  assert.equal(t.ended, null);
  t = vote(vote(vote(vote(t, 'p1', 'no'), 'p2', 'no'), 'p3', 'no'), 'p4', 'no');
  assert.ok(t.ended);
  assert.equal(t.ended.reason, 'drawDeclined');
  assert.deepEqual([...t.ended.winners].sort(), ['p1', 'p2']);
});

test('draw: everyone votes, and saying yes plays the Ultimate Round', () => {
  const s = results(4, { p1: 3, p2: 3, p3: 1, p4: 0 });
  let t = act(s, { type: 'endSession', by: 'p1' }, rng);
  t = vote(vote(vote(vote(t, 'p3', 'yes'), 'p4', 'yes'), 'p1', 'yes'), 'p2', 'yes'); // all four have voted
  assert.equal(t.ultimateRound, true);
  assert.equal(t.ended, null);
  assert.equal(t.phase, 'results');
});

test('draw: second chance accepted plays the Ultimate Round', () => {
  const s = results(2, { p1: 3, p2: 3 });
  let t = act(s, { type: 'endSession', by: 'p1' }, rng);
  t = vote(t, 'p1', 'no');
  assert.equal(t.vote?.draw, 2);
  t = vote(vote(t, 'p1', 'yes'), 'p2', 'yes');
  assert.equal(t.ultimateRound, true);
});

test('draw: target reached, Ultimate vote fails, top score drawn: "Coward!" second chance', () => {
  const s = results(3, { p1: 4, p2: 4, p3: 1 });
  let t = act(s, { type: 'callVote', by: 'p3', kind: 'target', value: 4 }, rng);
  t = vote(vote(t, 'p1', 'yes'), 'p2', 'yes'); // p3 asked (YES): all three have voted, target reached
  assert.equal(t.vote?.kind, 'ultimate');
  assert.equal(t.vote?.draw, undefined);
  t = vote(vote(vote(t, 'p1', 'no'), 'p2', 'no'), 'p3', 'no');
  assert.equal(t.vote?.draw, 2, 'Coward! second chance');
  t = vote(vote(vote(t, 'p1', 'no'), 'p2', 'no'), 'p3', 'no');
  assert.equal(t.ended?.reason, 'drawDeclined');
});

test('no draw: the host ends the game straight away', () => {
  const s = results(3, { p1: 4, p2: 2, p3: 1 });
  const t = act(s, { type: 'endSession', by: 'p1' }, rng);
  assert.equal(t.ended?.reason, 'hostEnded');
  assert.deepEqual(t.ended?.winners, ['p1']);
});
