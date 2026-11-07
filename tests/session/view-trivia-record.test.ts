import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { addGameToProfiles, buildGameRecord, profileCsv, profileRivals, sessionCsv } from '../../src/session/record.ts';
import { computeTrivia } from '../../src/session/trivia.ts';
import type { LogEntry, Session } from '../../src/session/types.ts';
import { playerView } from '../../src/session/view.ts';
import { act, dealAll, playRound, start, step } from './helpers.ts';

/** Card ids a player must never see: other hands and hidden decks. */
function secretIds(s: Session, me: string): string[] {
  const ids: string[] = [];
  for (const p of s.order) if (p !== me) for (const c of s.deal?.hands[p] ?? s.hands[p] ?? []) ids.push(c.id);
  for (const deck of Object.values(s.hiddenDecks)) for (const c of deck) ids.push(c.id);
  return ids;
}

function assertNoLeak(s: Session) {
  for (const me of s.order) {
    const json = JSON.stringify(playerView(s, me));
    assert.ok(!json.includes('hidden-'), 'hidden deck id leaked');
    assert.ok(!/hiddenDeck/i.test(json), 'hidden deck field leaked');
    for (const id of secretIds(s, me)) assert.ok(!json.includes(`"${id}"`), `${me} can see ${id}`);
  }
}

test('player views never include other hands or hidden decks, at every stage', () => {
  for (const n of [2, 3, 5, 8]) {
    const rng = seededRng(200 + n);
    let s = start(n, rng);
    assertNoLeak(s);
    for (let i = 0; i < 400 && s.phase !== 'results'; i++) {
      s = step(s, rng);
      assertNoLeak(s);
    }
  }
});

test('player view: own hand, counts for others, legal cards only on your turn', () => {
  const rng = seededRng(210);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: 'p1' }, rng);
  const turn = s.play!.turn!;
  const v = playerView(s, turn);
  assert.equal(v.myHand.length, s.play!.hands[turn]!.length);
  assert.ok(v.legalCardIds.length > 0);
  const other = s.order.find((p) => p !== turn)!;
  assert.deepEqual(playerView(s, other).legalCardIds, []);
  assert.equal(v.players.find((p) => p.id === other)!.cardCount, s.play!.hands[other]!.length);
  assert.equal(v.jokerTotal, 2);
});

test('player view: only the host sees every pause request', () => {
  const rng = seededRng(211);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'requestPause', by: 'p2' }, rng);
  s = act(s, { type: 'requestPause', by: 'p3' }, rng);
  assert.deepEqual(playerView(s, 'p1').pauseRequests, ['p2', 'p3']);
  assert.deepEqual(playerView(s, 'p2').pauseRequests, ['p2']);
  assert.deepEqual(playerView(s, 'p4').pauseRequests, []);
});

const e = (round: number, event: LogEntry['event'], ultimate = false): LogEntry => ({ round, ultimate, event });

test('trivia from the event log', () => {
  const log: LogEntry[] = [
    e(1, { type: 'slapped', slapper: 'a', slapped: 'b', cardsPickedUp: 3 }),
    e(1, { type: 'slapped', slapper: 'a', slapped: 'b', cardsPickedUp: 6 }),
    e(1, { type: 'slapped', slapper: 'c', slapped: 'b', cardsPickedUp: 2 }),
    e(1, { type: 'slapped', slapper: 'b', slapped: 'c', cardsPickedUp: 4 }),
    e(1, { type: 'slapped', slapper: 'b', slapped: 'c', cardsPickedUp: 4 }),
    e(1, { type: 'roundScored', round: 1, ultimate: false, finishingOrder: ['a', 'c', 'b'], points: {}, totals: {} }),
    e(2, { type: 'roundScored', round: 2, ultimate: false, finishingOrder: ['c', 'a', 'b'], points: {}, totals: {} }),
    e(3, { type: 'roundScored', round: 3, ultimate: true, finishingOrder: ['b', 'a', 'c'], points: {}, totals: {} }, true),
    e(2, { type: 'forfeited', player: 'b' }),
    e(2, { type: 'voteCalled', kind: 'reshuffle', by: 'c', value: null }),
    e(2, { type: 'voteCalled', kind: 'target', by: 'a', value: 10 }),
    e(2, { type: 'reactionTapped', player: 'a', ms: 300, falseStart: false }),
    e(2, { type: 'reactionTapped', player: 'c', ms: 900, falseStart: false }),
    e(2, { type: 'reactionTapped', player: 'b', ms: 0, falseStart: true }),
  ];
  const t = computeTrivia(log, ['a', 'b', 'c']);
  assert.deepEqual(t.mostSlapped, { players: ['b'], count: 3 });
  assert.deepEqual(t.mostSlapper, { players: ['a', 'b'], count: 2 });
  assert.deepEqual(t.rivals, [
    { slapper: 'a', slapped: 'b', count: 2 },
    { slapper: 'b', slapped: 'c', count: 2 },
  ]);
  assert.deepEqual(t.perPlayer['b']!.slappedByMost, { players: ['a'], count: 2 });
  assert.deepEqual(t.perPlayer['b']!.slappedMost, { players: ['c'], count: 2 });
  assert.equal(t.perPlayer['a']!.slappedByMost, null);
  assert.deepEqual(t.alwaysFightingForSurvival, { players: ['b'], count: 2 }); // Ultimate not counted
  assert.deepEqual(t.biggestPickUp, { players: ['b'], count: 6 });
  assert.deepEqual(t.mostForfeits, { players: ['b'], count: 1 });
  assert.deepEqual(t.mostReshuffleVotes, { players: ['c'], count: 1 });
  assert.deepEqual(t.slowestReaction, { players: ['c'], count: 900 });
  assert.equal(computeTrivia([], ['a', 'b']).mostSlapped, null);
});

function finishedSession(seed: number): Session {
  const rng = seededRng(seed);
  let s = playRound(start(4, rng), rng);
  s = act(s, { type: 'advance', by: 'p1' }, rng);
  s = playRound(s, rng);
  return act(s, { type: 'endSession', by: 'p1' }, rng);
}

test('game record: built when the session ends, with every round and final standings', () => {
  const rng = seededRng(220);
  const live = playRound(start(4, rng), rng);
  assert.throws(() => buildGameRecord(live, new Date(0), 'x'));
  const s = finishedSession(221);
  const r = buildGameRecord(s, new Date('2026-11-07T12:00:00Z'), 'game-1');
  assert.equal(r.savedAt, '2026-11-07T12:00:00.000Z');
  assert.equal(r.rounds.length, 2);
  assert.equal(r.playerCount, 4);
  assert.equal(r.final.reason, 'hostEnded');
  assert.deepEqual(r.final.scores, s.scores);
  assert.equal(r.ultimate.played, false);
  assert.equal(r.players[0]!.profileName, 'Player 1');
});

test('profile history: added once per game, only for profiles on this phone', () => {
  const s = finishedSession(222);
  const r = buildGameRecord(s, new Date(0), 'game-A');
  const onPhone = ['Player 1', 'Player 2'];
  let profiles = addGameToProfiles({}, r, onPhone);
  assert.deepEqual(Object.keys(profiles).sort(), onPhone);
  const p1 = profiles['Player 1']!;
  assert.equal(p1.gamesPlayed, 1);
  assert.equal(p1.points, s.scores['p1']);
  assert.equal(p1.slapsGiven, r.trivia.perPlayer['p1']!.slapsGiven);
  // Same game again: not counted twice.
  profiles = addGameToProfiles(profiles, r, onPhone);
  assert.equal(profiles['Player 1']!.gamesPlayed, 1);
  // A second game adds up.
  const r2 = buildGameRecord(finishedSession(223), new Date(0), 'game-B');
  profiles = addGameToProfiles(profiles, r2, onPhone);
  assert.equal(profiles['Player 1']!.gamesPlayed, 2);
  const wins = [r, r2].flatMap((x) => x.rounds).filter((x) => x.finishingOrder[0] === 'p1').length;
  assert.equal(profiles['Player 1']!.roundWins, wins);
});

test('profile rivals across sessions', () => {
  const p = {
    ...addGameToProfiles({}, buildGameRecord(finishedSession(224), new Date(0), 'g'), ['Player 1'])['Player 1']!,
    slappedBy: { Ana: 3, Bo: 3, Cy: 1 },
    slapped: { Cy: 5 },
  };
  assert.deepEqual(profileRivals(p), { slappedByMost: ['Ana', 'Bo'], slappedMost: ['Cy'] });
});

test('CSV export: session and profile', () => {
  const s = finishedSession(225);
  const r = buildGameRecord(s, new Date(0), 'g');
  const csv = sessionCsv(r);
  assert.ok(csv.startsWith('Pubby game record\r\n'));
  assert.ok(csv.includes('Round,Ultimate,Place,Session name,Profile name,Points,Total'));
  assert.ok(csv.includes('Most slapped,'));
  // One row per player per round.
  const roundRows = csv.split('\r\n').filter((l) => /^[12],no,/.test(l));
  assert.equal(roundRows.length, 8);
  const prof = profileCsv(addGameToProfiles({}, r, ['Player 1'])['Player 1']!);
  assert.ok(prof.includes('Games played,1'));
  // Commas and quotes are escaped.
  const tricky = sessionCsv({ ...r, players: r.players.map((p, i) => (i === 0 ? { ...p, sessionName: 'Speedy, "the" fast' } : p)) });
  assert.ok(tricky.includes('"Speedy, ""the"" fast"'));
});
