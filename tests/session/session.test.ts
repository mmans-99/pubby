import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { applyAction, createSession, finalStandings } from '../../src/session/session.ts';
import type { Session } from '../../src/session/types.ts';
import { legalCards } from '../../src/rules/play.ts';
import { playerView } from '../../src/session/view.ts';
import { act, dealAll, playRound, setupFor, start, step } from './helpers.ts';

const types = (s: Session) => s.log.map((e) => e.event.type);

test('game start: host deals round 1, joker total shown, joker rule can be turned off', () => {
  const rng = seededRng(1);
  const r = createSession(setupFor(4), rng);
  assert.equal(r.session.dealer, 'p1');
  assert.equal(r.session.round, 1);
  assert.equal(r.session.phase, 'dealing');
  const started = r.events.find((e) => e.type === 'gameStarted');
  assert.ok(started && started.type === 'gameStarted' && started.jokerTotal === 2);
  assert.equal(start(7, rng).jokerTotal, 3);
  const off = start(7, rng, false);
  assert.equal(off.jokerTotal, 0);
  assert.equal(off.deal!.remaining.length, 52);
});

test('setup checks: player count, host, unique ids, profile names', () => {
  const rng = seededRng(1);
  assert.throws(() => createSession({ ...setupFor(2), players: [{ id: 'a', profileName: 'A' }] }, rng));
  assert.throws(() => createSession({ ...setupFor(3), hostId: 'zz' }, rng));
  assert.throws(() =>
    createSession({ players: [{ id: 'a', profileName: 'A' }, { id: 'a', profileName: 'B' }], hostId: 'a' }, rng),
  );
  assert.throws(() =>
    createSession({ players: [{ id: 'a', profileName: ' ' }, { id: 'b', profileName: 'B' }], hostId: 'a' }, rng),
  );
  const s = createSession(
    { players: [{ id: 'a', profileName: 'Ferrari', sessionName: 'Speedy' }, { id: 'b', profileName: 'B' }], hostId: 'a' },
    rng,
  ).session;
  assert.equal(s.players[0]!.sessionName, 'Speedy');
  assert.equal(s.players[1]!.sessionName, 'B');
});

test('only the dealer deals; the deal ends in the reshuffle window', () => {
  const rng = seededRng(2);
  let s = start(4, rng);
  assert.throws(() => act(s, { type: 'autoDealStart', by: 'p2', firstSeat: 'p2' }, rng), /dealer/);
  s = act(s, { type: 'setDealMode', by: 'p1', mode: 'manual' }, rng);
  s = act(s, { type: 'manualDealCard', by: 'p1', seat: 'p3' }, rng);
  s = act(s, { type: 'setDealMode', by: 'p1', mode: 'auto' }, rng);
  s = act(s, { type: 'autoDealStart', by: 'p1', firstSeat: 'p4' }, rng);
  s = act(s, { type: 'autoDealAll', by: 'p1' }, rng);
  assert.equal(s.phase, 'reshuffle');
  const total = s.order.reduce((n, p) => n + (s.hands[p]?.length ?? 0), 0);
  assert.equal(total, 54);
  assert.ok(types(s).includes('dealComplete'));
});

test('reshuffle vote: any player calls, majority passes, dealer deals again, only once per round', () => {
  const rng = seededRng(3);
  let s = dealAll(start(4, rng), rng);
  const before = JSON.stringify(s.hands);
  s = act(s, { type: 'callVote', by: 'p3', kind: 'reshuffle' }, rng);
  assert.throws(() => act(s, { type: 'startRound', by: 'p1' }, rng), /vote/);
  s = act(s, { type: 'castVote', by: 'p1', ballot: 'yes' }, rng);
  s = act(s, { type: 'castVote', by: 'p2', ballot: 'yes' }, rng);
  assert.equal(s.vote?.kind, 'reshuffle'); // 2 of 4 is not a majority yet
  s = act(s, { type: 'castVote', by: 'p3', ballot: 'yes' }, rng);
  assert.equal(s.vote, null);
  const resolved = [...s.log].reverse().find((e) => e.event.type === 'voteResolved')!.event;
  assert.deepEqual(resolved, { type: 'voteResolved', kind: 'reshuffle', result: true, decidedBy: 'majority', value: null });
  assert.equal(s.phase, 'dealing');
  assert.equal(s.dealer, 'p1');
  s = dealAll(s, rng);
  assert.notEqual(JSON.stringify(s.hands), before);
  // Vote used up: the round moves straight on (4 players: no swap).
  assert.equal(s.phase, 'playing');
});

test('reshuffle vote: majority no fails and the round goes on', () => {
  const rng = seededRng(4);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  for (const p of ['p1', 'p2', 'p3']) s = act(s, { type: 'castVote', by: p, ballot: 'no' }, rng);
  assert.equal(s.phase, 'playing');
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng));
});

test('vote with no majority: the host decides (tie, or too few votes)', () => {
  const rng = seededRng(5);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  s = act(s, { type: 'castVote', by: 'p1', ballot: 'yes' }, rng);
  s = act(s, { type: 'castVote', by: 'p2', ballot: 'yes' }, rng);
  s = act(s, { type: 'castVote', by: 'p3', ballot: 'no' }, rng);
  s = act(s, { type: 'castVote', by: 'p4', ballot: 'no' }, rng);
  assert.equal(s.vote?.awaitingHost, true);
  assert.throws(() => act(s, { type: 'hostDecides', by: 'p2', yes: true }, rng), /host/);
  assert.throws(() => act(s, { type: 'castVote', by: 'p4', ballot: 'yes' }, rng));
  s = act(s, { type: 'hostDecides', by: 'p1', yes: false }, rng);
  const resolved = [...s.log].reverse().find((e) => e.event.type === 'voteResolved')!.event;
  assert.ok(resolved.type === 'voteResolved' && resolved.decidedBy === 'host' && !resolved.result);

  // Too few votes: host closes the vote, then decides.
  let t = dealAll(start(5, rng), rng);
  t = act(t, { type: 'callVote', by: 'p5', kind: 'reshuffle' }, rng);
  t = act(t, { type: 'castVote', by: 'p5', ballot: 'yes' }, rng);
  assert.throws(() => act(t, { type: 'closeVote', by: 'p5' }, rng), /host/);
  t = act(t, { type: 'closeVote', by: 'p1' }, rng);
  assert.equal(t.vote?.awaitingHost, true);
  t = act(t, { type: 'hostDecides', by: 'p1', yes: true }, rng);
  assert.equal(t.phase, 'dealing');
});

test('hidden swap: 2 and 3 players, once each per round, then the round starts', () => {
  const rng = seededRng(6);
  let s = dealAll(start(3, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  assert.equal(s.phase, 'swap');
  const size = s.hands['p2']!.length;
  const give = s.hands['p2']!.slice(0, 4).map((c) => c.id);
  s = act(s, { type: 'swap', by: 'p2', cardIds: give }, rng);
  assert.equal(s.hands['p2']!.length, size);
  assert.ok(give.every((id) => !s.hands['p2']!.some((c) => c.id === id)));
  assert.throws(() => act(s, { type: 'swap', by: 'p2', cardIds: [] }, rng), /already/);
  s = act(s, { type: 'swap', by: 'p1', cardIds: [] }, rng);
  s = act(s, { type: 'swap', by: 'p3', cardIds: [] }, rng);
  assert.ok(['playing', 'reactionTap'].includes(s.phase));

  let four = dealAll(start(4, rng), rng);
  four = act(four, { type: 'startRound', by: 'p1' }, rng);
  assert.notEqual(four.phase, 'swap');
});

test('pause: host pauses and resumes; requests need the host; nothing else works while paused', () => {
  const rng = seededRng(7);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  assert.throws(() => act(s, { type: 'pause', by: 'p2', at: 0 }, rng), /host/);
  s = act(s, { type: 'requestPause', by: 'p2' }, rng);
  s = act(s, { type: 'requestPause', by: 'p3' }, rng);
  assert.throws(() => act(s, { type: 'requestPause', by: 'p2' }, rng));
  s = act(s, { type: 'respondPause', by: 'p1', requester: 'p3', approve: false, at: 0 }, rng);
  assert.deepEqual(s.pauseRequests, ['p2']);
  s = act(s, { type: 'respondPause', by: 'p1', requester: 'p2', approve: true, at: 1000 }, rng);
  assert.equal(s.paused, true);
  assert.deepEqual(s.pauseRequests, []); // cleared while paused
  assert.throws(() => act(s, { type: 'requestPause', by: 'p4' }, rng), /paused/);
  const turn = s.play!.turn!;
  assert.throws(() => act(s, { type: 'playCard', by: turn, cardId: s.play!.hands[turn]![0]!.id }, rng), /paused/);
  assert.throws(() => act(s, { type: 'resume', by: 'p2' }, rng), /host/);
  s = act(s, { type: 'resume', by: 'p1' }, rng);
  assert.equal(s.paused, false);
});

test('pause time limit: optional, the game resumes on its own when it runs out', () => {
  const rng = seededRng(8);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'setPauseTimeLimit', by: 'p1', seconds: 30 }, rng);
  s = act(s, { type: 'pause', by: 'p1', at: 10_000 }, rng);
  s = act(s, { type: 'tick', at: 39_000 }, rng);
  assert.equal(s.paused, true);
  s = act(s, { type: 'tick', at: 40_000 }, rng);
  assert.equal(s.paused, false);
  assert.ok(s.log.some((e) => e.event.type === 'resumed' && e.event.reason === 'timeLimit'));
  // No limit by default.
  let t = dealAll(start(4, rng), rng);
  t = act(t, { type: 'pause', by: 'p1', at: 0 }, rng);
  t = act(t, { type: 'tick', at: 10_000_000 }, rng);
  assert.equal(t.paused, true);
});

test('no pausing during a vote or on the results screen', () => {
  const rng = seededRng(9);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  assert.throws(() => act(s, { type: 'pause', by: 'p1', at: 0 }, rng), /vote/);
  let r = playRound(start(4, rng), rng);
  assert.equal(r.phase, 'results');
  assert.throws(() => act(r, { type: 'pause', by: 'p1', at: 0 }, rng), /round/);
});

test('a full round: scores, results screen, ready up, loser deals next, winner picks who leads', () => {
  const rng = seededRng(10);
  let s = playRound(start(5, rng), rng);
  assert.equal(s.phase, 'results');
  const r = s.rounds[0]!;
  assert.equal(r.finishingOrder.length, 5);
  assert.equal(Object.values(s.scores).reduce((a, b) => a + b, 0), r.sharedSecondLast ? 5 + 1 : 5);
  assert.deepEqual(s.previous, { winner: r.finishingOrder[0], loser: r.finishingOrder[4] });
  s = act(s, { type: 'readyUp', by: 'p3' }, rng);
  assert.deepEqual(s.ready, ['p3']);
  assert.throws(() => act(s, { type: 'advance', by: 'p3' }, rng), /host/);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  assert.equal(s.round, 2);
  assert.equal(s.dealer, r.finishingOrder[4]);
  s = dealAll(s, rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  if (s.phase === 'chooseLeader') {
    const other = s.order.find((p) => p !== r.finishingOrder[0])!;
    assert.throws(() => act(s, { type: 'chooseLeader', by: other, leader: other }, rng), /winner/);
    s = act(s, { type: 'chooseLeader', by: r.finishingOrder[0]!, leader: 'p4' }, rng);
    assert.equal(s.play!.turn, 'p4');
  }
});

test('target vote on the results screen sets the goal; not during a round', () => {
  const rng = seededRng(11);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 10 }, rng), /results/);
  s = playRound(s, rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 0 }, rng));
  s = act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 50 }, rng);
  assert.throws(() => act(s, { type: 'advance', by: 'p1' }, rng), /vote/);
  for (const p of ['p1', 'p2', 'p3']) s = act(s, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.equal(s.target, 50);
  assert.equal(s.vote, null);
});

/** Play rounds until the target is reached (an Ultimate vote starts). */
function toTarget(s: Session, rng: () => number): Session {
  for (let i = 0; i < 40 && !s.vote; i++) {
    s = act(s, { type: 'advance', by: s.hostId }, rng);
    s = playRound(s, rng);
  }
  return s;
}

test('target reached: an Ultimate vote starts; if it fails the session ends, highest score wins', () => {
  const rng = seededRng(12);
  let s = playRound(start(3, rng), rng);
  s = act(s, { type: 'callVote', by: 'p3', kind: 'target', value: 4 }, rng);
  for (const p of ['p1', 'p2']) s = act(s, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  s = toTarget(s, rng);
  assert.equal(s.vote?.kind, 'ultimate');
  assert.equal(s.vote?.calledBy, null);
  assert.ok(types(s).includes('targetReached'));
  for (const p of ['p1', 'p2']) s = act(s, { type: 'castVote', by: p, ballot: 'no' }, rng);
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.ended!.reason, 'ultimateVoteFailedAtTarget');
  assert.equal(s.ended!.decidedBy, 'highestScore');
  const top = Math.max(...Object.values(s.scores));
  assert.ok(s.ended!.winners.every((w) => s.scores[w] === top));
  assert.throws(() => act(s, { type: 'advance', by: 'p1' }, rng), /ended/);
});

test('Ultimate Round: any player triggers it, outside the score, titles, then the session ends', () => {
  const rng = seededRng(13);
  let s = playRound(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p4', kind: 'ultimate' }, rng);
  for (const p of ['p1', 'p2', 'p3']) s = act(s, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.equal(s.ultimateRound, true);
  assert.throws(() => act(s, { type: 'callVote', by: 'p4', kind: 'ultimate' }, rng));
  const scores = { ...s.scores };
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  s = playRound(s, rng);
  assert.equal(s.phase, 'gameOver');
  assert.deepEqual(s.scores, scores);
  const ult = s.rounds[s.rounds.length - 1]!;
  assert.ok(ult.ultimate);
  assert.equal(s.ultimateLabels!.winner, ult.finishingOrder[0]);
  assert.equal(s.ended!.reason, 'ultimatePlayed');
  assert.equal(s.ended!.decidedBy, 'ultimate');
  assert.equal(s.ended!.standings[0], s.ultimateLabels!.winner);
  assert.equal(s.ended!.standings[3], s.ultimateLabels!.losers[0]);
});

test('Ultimate vote that fails (not from the target) lets play go on', () => {
  const rng = seededRng(14);
  let s = playRound(start(4, rng), rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng);
  for (const p of ['p1', 'p3', 'p4']) s = act(s, { type: 'castVote', by: p, ballot: 'no' }, rng);
  assert.equal(s.phase, 'results');
  assert.equal(s.ultimateRound, false);
});

test('final standings: Ultimate Winner outranks every score, Ultimate Loser(s) rank last', () => {
  const base = { order: ['a', 'b', 'c', 'd'], scores: { a: 10, b: 2, c: 7, d: -1 } };
  assert.deepEqual(finalStandings({ ...base, ultimateLabels: null }), {
    standings: ['a', 'c', 'b', 'd'],
    winners: ['a'],
    decidedBy: 'highestScore',
  });
  assert.deepEqual(finalStandings({ ...base, ultimateLabels: { winner: 'd', losers: ['a'] } }), {
    standings: ['d', 'c', 'b', 'a'],
    winners: ['d'],
    decidedBy: 'ultimate',
  });
  // Both final players went out on jokers in a 2-player Ultimate: both losers, no winner.
  const two = finalStandings({ order: ['a', 'b'], scores: { a: 3, b: 5 }, ultimateLabels: { winner: null, losers: ['a', 'b'] } });
  assert.equal(two.decidedBy, 'highestScore');
  assert.deepEqual(two.winners, ['b']);
  // Tied top scores: both win.
  assert.deepEqual(finalStandings({ order: ['a', 'b', 'c'], scores: { a: 4, b: 4, c: 1 }, ultimateLabels: null }).winners, ['a', 'b']);
});

test('host ends the session from the results screen', () => {
  const rng = seededRng(15);
  let s = playRound(start(6, rng), rng);
  assert.throws(() => act(s, { type: 'endSession', by: 'p2' }, rng), /host/);
  s = act(s, { type: 'endSession', by: 'p1' }, rng);
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.ended!.reason, 'hostEnded');
});

test('many full sessions at every player count run without errors', () => {
  for (let n = 2; n <= 8; n++) {
    for (const jokers of [true, false]) {
      const rng = seededRng(100 + n * 10 + (jokers ? 1 : 0));
      let s = start(n, rng, jokers);
      for (let round = 0; round < 4; round++) {
        s = playRound(s, rng);
        if (round < 3) s = act(s, { type: 'advance', by: 'p1' }, rng);
      }
      s = act(s, { type: 'endSession', by: 'p1' }, rng);
      assert.equal(s.rounds.length, 4);
      // Every round's points add up to the scoring table (shared second-last aside).
      const last = s.rounds[3]!;
      assert.deepEqual(last.totals, s.scores);
    }
  }
});

test('the log stamps each event with its round', () => {
  const rng = seededRng(16);
  let s = playRound(start(4, rng), rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  const r2 = s.log.find((e) => e.event.type === 'roundStarted' && e.event.round === 2)!;
  assert.equal(r2.round, 2);
  const res = applyAction(s, { type: 'autoDealStart', by: s.dealer, firstSeat: s.dealer }, rng);
  assert.equal(res.events.length, 0);
  assert.equal(step(s, rng).phase, 'dealing');
});

test('target vote before round 1 starts (during the deal or before the host starts the round)', () => {
  const rng = seededRng(30);
  let s = start(4, rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 8 }, rng);
  // No dealing while the vote is open.
  assert.throws(() => act(s, { type: 'autoDealStart', by: 'p1', firstSeat: 'p1' }, rng), /vote/);
  for (const p of ['p1', 'p2', 'p3']) s = act(s, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.equal(s.target, 8);
  assert.equal(s.phase, 'dealing');

  // Also in the window after the deal; a failed vote can be tried again.
  let t = dealAll(start(4, rng), rng);
  t = act(t, { type: 'callVote', by: 'p3', kind: 'target', value: 5 }, rng);
  for (const p of ['p1', 'p2', 'p3']) t = act(t, { type: 'castVote', by: p, ballot: 'no' }, rng);
  assert.equal(t.target, null);
  assert.equal(t.phase, 'reshuffle'); // a target vote does not start the round
  t = act(t, { type: 'callVote', by: 'p3', kind: 'target', value: 6 }, rng);
  for (const p of ['p1', 'p2', 'p3']) t = act(t, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.equal(t.target, 6);
  assert.equal(t.phase, 'reshuffle');
});

test('target vote: not during a round, not before later rounds, and only until one is agreed', () => {
  const rng = seededRng(31);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 5 }, rng), /before round 1|results/);
  s = playRound(s, rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 50 }, rng);
  for (const p of ['p1', 'p2', 'p3']) s = act(s, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 60 }, rng), /already been agreed/);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  s = dealAll(s, rng);
  assert.throws(() => act(s, { type: 'callVote', by: 'p2', kind: 'target', value: 60 }, rng));

  // Once the Ultimate Round is agreed, no target vote either.
  let u = playRound(start(4, rng), rng);
  u = act(u, { type: 'callVote', by: 'p2', kind: 'ultimate' }, rng);
  for (const p of ['p1', 'p2', 'p3']) u = act(u, { type: 'castVote', by: p, ballot: 'yes' }, rng);
  assert.throws(() => act(u, { type: 'callVote', by: 'p2', kind: 'target', value: 5 }, rng), /Ultimate/);
});

/** Deal and start round 1 with 4 players. */
function playing(seed: number) {
  const rng = seededRng(seed);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  while (s.phase !== 'playing') s = step(s, rng); // Reaction Tap if needed
  return { s, rng };
}

test('take-cards request: asked between tricks, agreed, cards move at once and the giver goes out', () => {
  let { s, rng } = playing(40);
  const req = s.order.find((p) => p !== s.play!.turn)!;
  const target = s.order.find((p) => p !== req)!;
  const before = s.play!.hands[req]!.length + s.play!.hands[target]!.length;
  s = act(s, { type: 'requestTake', by: req, target }, rng);
  assert.throws(() => act(s, { type: 'requestTake', by: req, target }, rng), /one player at a time/);
  const third = s.order.find((p) => p !== req && p !== target)!;
  assert.throws(() => act(s, { type: 'requestTake', by: req, target: third }, rng), /one player at a time/);
  // The next trick waits until the request is answered.
  const turn = s.play!.turn!;
  assert.throws(() => act(s, { type: 'playCard', by: turn, cardId: s.play!.hands[turn]![0]!.id }, rng), /take-cards/);
  assert.throws(() => act(s, { type: 'answerTake', by: req, requester: req, accept: true }, rng));
  s = act(s, { type: 'answerTake', by: target, requester: req, accept: true }, rng);
  assert.equal(s.play!.hands[target]!.length, 0);
  assert.equal(s.play!.hands[req]!.length, before);
  assert.deepEqual(s.play!.finished, [target]);
  assert.deepEqual(s.takeRequests, []);
  assert.ok(s.log.some((e) => e.event.type === 'cardsTaken'));
});

test('take-cards request: refused, or withdrawn, nothing moves', () => {
  let { s, rng } = playing(41);
  s = act(s, { type: 'requestTake', by: 'p2', target: 'p3' }, rng);
  const hands = JSON.stringify(s.play!.hands);
  s = act(s, { type: 'answerTake', by: 'p3', requester: 'p2', accept: false }, rng);
  assert.equal(JSON.stringify(s.play!.hands), hands);
  assert.deepEqual(s.takeRequests, []);
  s = act(s, { type: 'requestTake', by: 'p2', target: 'p4' }, rng);
  s = act(s, { type: 'withdrawTake', by: 'p2', target: 'p4' }, rng);
  assert.deepEqual(s.takeRequests, []);
});

test('take-cards request: only before a trick starts, never during one', () => {
  let { s, rng } = playing(42);
  const leader = s.play!.turn!;
  s = act(s, { type: 'playCard', by: leader, cardId: s.play!.hands[leader]![0]!.id }, rng);
  const [req, target] = s.order.filter((p) => p !== leader) as [string, string];
  assert.throws(() => act(s, { type: 'requestTake', by: req, target }, rng), /before a trick starts/);
});

test('take-cards request: two players ask the same player, who gives to one; the other gets a no', () => {
  let { s, rng } = playing(45);
  const [a, b, target] = s.order.slice(0, 3) as [string, string, string];
  s = act(s, { type: 'requestTake', by: a, target }, rng);
  s = act(s, { type: 'requestTake', by: b, target }, rng);
  const before = s.play!.hands[b]!.length + s.play!.hands[target]!.length;
  s = act(s, { type: 'answerTake', by: target, requester: b, accept: true }, rng);
  assert.equal(s.play!.hands[b]!.length, before);
  assert.equal(s.play!.hands[target]!.length, 0);
  assert.deepEqual(s.takeRequests, []);
  assert.ok(s.log.some((e) => e.event.type === 'takeAnswered' && e.event.requester === a && !e.event.accepted));
});

test('take-cards request: not with only two players holding cards (and never in a 2-player game)', () => {
  const rng = seededRng(43);
  let s = dealAll(start(2, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  while (s.phase === 'swap') s = step(s, rng);
  if (s.phase === 'playing') assert.throws(() => act(s, { type: 'requestTake', by: 'p1', target: 'p2' }, rng), /two players/);
});

test('player view: take-cards requests are only shown to the two players involved', () => {
  let { s, rng } = playing(44);
  s = act(s, { type: 'requestTake', by: 'p2', target: 'p3' }, rng);
  assert.equal(playerView(s, 'p2').myTakeRequests.length, 1);
  assert.equal(playerView(s, 'p3').myTakeRequests.length, 1);
  assert.equal(playerView(s, 'p4').myTakeRequests.length, 0);
  assert.equal(playerView(s, 'p1').myTakeRequests.length, 0);
});

test('full sessions with random take-cards requests run without errors', () => {
  let takes = 0;
  for (let n = 3; n <= 8; n++) {
    const rng = seededRng(500 + n);
    let s = start(n, rng);
    for (let round = 0; round < 5; round++) {
      s = playRound(s, rng);
      if (round < 4) s = act(s, { type: 'advance', by: 'p1' }, rng);
    }
    takes += s.log.filter((e) => e.event.type === 'cardsTaken').length;
    for (const r of s.rounds) assert.equal(new Set(r.finishingOrder).size, n);
  }
  assert.ok(takes > 0);
});
