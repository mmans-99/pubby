import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { pointsFor } from '../../src/rules/scoring.ts';
import { applyAction, createSession, finalStandings, removeAllowed } from '../../src/session/session.ts';
import type { Session, SessionSetup } from '../../src/session/types.ts';
import { act, dealAll, pickDealer, playRound, setupFor, startedRound, step } from './helpers.ts';

// 9an.8 (Part H): the host removes a player (CODE.md 9an.8 H-b to H-k).

const net = (n: number, extra: Partial<SessionSetup> = {}): SessionSetup => ({ ...setupFor(n), waitForAll: true, ...extra });

/** A network game dealt and started, playing its first trick. */
function toPlaying(n: number, seed: number): { s: Session; rng: ReturnType<typeof seededRng> } {
  const rng = seededRng(seed);
  let s = dealAll(createSession(net(n), rng).session, rng);
  s = startedRound(s, rng, 'p1');
  for (let i = 0; i < 2000 && s.phase !== 'playing'; i++) s = step(s, rng);
  assert.equal(s.phase, 'playing');
  return { s, rng };
}

/** Everyone who is still in the game readies up, and the host starts the next round. */
function nextRound(s: Session, rng: ReturnType<typeof seededRng>): Session {
  for (const p of s.order) s = act(s, { type: 'readyUp', by: p }, rng);
  return pickDealer(act(s, { type: 'advance', by: s.hostId }, rng), rng);
}

test('removeAllowed: refusals (not the host, the host, a computer, one phone, already removed)', () => {
  const rng = seededRng(40);
  const s = createSession(net(4), rng).session;
  assert.equal(removeAllowed(s, 'p2', 'p3'), 'Only the host can remove a player');
  assert.equal(removeAllowed(s, 'p1', 'p1'), "The host can't remove themselves");
  assert.equal(removeAllowed(s, 'p1', 'p3'), null);

  const withComputer = createSession(
    net(4, { players: setupFor(4).players.map((p, i) => (i === 3 ? { ...p, computer: true } : p)) }),
    rng,
  ).session;
  assert.equal(removeAllowed(withComputer, 'p1', 'p4'), "Computer players can't be removed");

  const onePhone = createSession(setupFor(3), rng).session;
  assert.equal(removeAllowed(onePhone, 'p1', 'p2'), 'Removing a player is for network games');
});

test('dealing: a player removed mid-deal leaves the table and their dealt cards go with them', () => {
  const rng = seededRng(41);
  let s = createSession(net(4), rng).session;
  s = act(s, { type: 'autoDealStart', by: 'p1', firstSeat: 'p1' }, rng);
  for (let i = 0; i < 6; i++) s = act(s, { type: 'autoDealStep', by: 'p1' }, rng); // p1 p2 p3 p4 p1 p2
  const r = applyAction(s, { type: 'removePlayer', by: 'p1', player: 'p3' }, rng);
  const s2 = r.session;
  assert.deepEqual(s2.order, ['p1', 'p2', 'p4']);
  assert.deepEqual(s2.gone, ['p3']);
  assert.deepEqual(s2.removed, ['p3']);
  assert.ok(r.events.some((e) => e.type === 'playerRemoved' && e.player === 'p3' && e.cards === 1));
  // The rest of the deal goes on among the people left, and nobody is dealt to p3.
  const done = act(s2, { type: 'autoDealAll', by: 'p1' }, rng);
  assert.equal(done.phase, 'reshuffle');
  assert.equal(done.hands['p3'], undefined);
  assert.deepEqual(Object.keys(done.hands).sort(), ['p1', 'p2', 'p4']);
});

test('dealer removed mid-deal: the rest of the deal goes out by itself at once (H-q6)', () => {
  let found: { s: Session; rng: ReturnType<typeof seededRng> } | null = null;
  // Find a game where the next dealer is not the host (the host can't be removed).
  for (let seed = 50; seed < 90 && !found; seed++) {
    const rng = seededRng(seed);
    let s = dealAll(createSession(net(4), rng).session, rng);
    s = startedRound(s, rng, 'p1');
    s = playRound(s, rng);
    if (s.previous && s.previous.loser !== 'p1') {
      s = nextRound(s, rng);
      if (s.dealer !== 'p1') found = { s, rng };
    }
  }
  assert.ok(found, 'a seed with a non-host dealer');
  const { s, rng } = found;
  const dealer = s.dealer;
  let d = act(s, { type: 'autoDealStart', by: dealer, firstSeat: dealer }, rng);
  d = act(d, { type: 'autoDealStep', by: dealer }, rng);
  const r = applyAction(d, { type: 'removePlayer', by: 'p1', player: dealer }, rng);
  assert.equal(r.session.phase, 'reshuffle');
  assert.ok(r.events.some((e) => e.type === 'dealComplete'));
  assert.ok(r.session.gone.includes(dealer));
  assert.equal(r.session.hands[dealer], undefined);
});

test('playing: a removed player leaves the round, the round goes on, and they come last', () => {
  const { s, rng } = toPlaying(4, 43);
  const s2 = act(s, { type: 'removePlayer', by: 'p1', player: 'p3' }, rng);
  assert.deepEqual(s2.order, ['p1', 'p2', 'p4']);
  assert.deepEqual(s2.removed, ['p3']);
  assert.equal(s2.play?.order.includes('p3'), false);
  const end = playRound(s2, rng);
  assert.equal(end.phase, 'results');
  const round = end.rounds[0]!;
  assert.equal(round.finishingOrder.length, 4);
  assert.equal(round.finishingOrder[3], 'p3');
  assert.deepEqual(round.removed, ['p3']);
  // Scored on the table the round started with: p3 takes the bottom place's points.
  assert.equal(round.points['p3'], pointsFor(4, 4));
});

test('two players removed in one round: they come last, in removal order', () => {
  const { s, rng } = toPlaying(4, 44);
  let s2 = act(s, { type: 'removePlayer', by: 'p1', player: 'p3' }, rng);
  s2 = act(s2, { type: 'removePlayer', by: 'p1', player: 'p4' }, rng);
  const end = playRound(s2, rng);
  const round = end.rounds[0]!;
  assert.equal(round.finishingOrder.length, 4);
  assert.deepEqual(round.finishingOrder.slice(2), ['p3', 'p4']);
  assert.deepEqual(round.removed, ['p3', 'p4']);
  assert.deepEqual(end.gone, ['p3', 'p4']);
});

test('the results screen: a removed previous loser hands the dealer job to the player just above them', () => {
  let found: { s: Session; rng: ReturnType<typeof seededRng> } | null = null;
  for (let seed = 60; seed < 100 && !found; seed++) {
    const rng = seededRng(seed);
    let s = dealAll(createSession(net(4), rng).session, rng);
    s = startedRound(s, rng, 'p1');
    s = playRound(s, rng);
    if (s.previous && s.previous.loser !== 'p1') found = { s, rng };
  }
  assert.ok(found, 'a seed with a non-host loser');
  const { s, rng } = found;
  const loser = s.previous!.loser;
  const fo = s.rounds[0]!.finishingOrder;
  const above = fo[fo.indexOf(loser) - 1];
  const s2 = act(s, { type: 'removePlayer', by: 'p1', player: loser }, rng);
  assert.equal(s2.previous?.loser, above);
  // The next round goes ahead with the players left, and the dealer is the new loser.
  const next = nextRound(s2, rng);
  assert.equal(next.dealer, above);
  // Three players left: the hidden deck and the swap come back (the 3-player rule).
  assert.equal(Object.keys(next.hiddenDecks).length, 1);
  assert.equal(next.order.length, 3);
});

test('one player left mid-round: the round is scored and the game ends; that player wins', () => {
  const rng = seededRng(45);
  let s = dealAll(createSession(net(2), rng).session, rng);
  s = startedRound(s, rng, 'p1');
  for (let i = 0; i < 2000 && s.phase !== 'playing'; i++) s = step(s, rng);
  const r = applyAction(s, { type: 'removePlayer', by: 'p1', player: 'p2' }, rng);
  assert.equal(r.session.phase, 'gameOver');
  assert.equal(r.session.ended?.reason, 'playersLeft');
  assert.deepEqual(r.session.ended?.winners, ['p1']);
  assert.deepEqual(r.session.ended?.standings, ['p1', 'p2']);
});

test('one player left in a deal phase: the round is scored with no play, the game ends', () => {
  const rng = seededRng(46);
  let s = createSession(net(2), rng).session;
  s = act(s, { type: 'autoDealStart', by: 'p1', firstSeat: 'p1' }, rng);
  const r = applyAction(s, { type: 'removePlayer', by: 'p1', player: 'p2' }, rng);
  assert.equal(r.session.phase, 'gameOver');
  assert.equal(r.session.ended?.reason, 'playersLeft');
  assert.deepEqual(r.session.ended?.winners, ['p1']);
});

test('final standings: removed players are listed after everyone who stayed, and cannot win (H-q7)', () => {
  const standings = finalStandings({
    order: ['p1', 'p2'],
    scores: { p1: 10, p2: 3, p3: 99 },
    ultimateLabels: null,
    gone: ['p3'],
  });
  assert.deepEqual(standings.standings, ['p1', 'p2', 'p3']);
  assert.deepEqual(standings.winners, ['p1']);
});

test('a removed player keeps their place in this round if they were already out (H-q4)', () => {
  // Find a game where someone other than the host goes out first, then remove that player.
  let found: { cur: Session; rng: ReturnType<typeof seededRng>; out: string } | null = null;
  for (let seed = 47; seed < 80 && !found; seed++) {
    const { s, rng } = toPlaying(4, seed);
    let cur = s;
    for (let i = 0; i < 2000 && cur.play && cur.play.finished.length === 0; i++) cur = step(cur, rng);
    const out = cur.play?.finished[0];
    if (out && out !== 'p1') found = { cur, rng, out };
  }
  assert.ok(found, 'a seed where someone other than the host went out first');
  const { cur, rng, out } = found;
  const r = act(cur, { type: 'removePlayer', by: 'p1', player: out }, rng);
  assert.equal(r.removed.includes(out), false);
  assert.ok(r.gone.includes(out));
  const end = playRound(r, rng);
  assert.equal(end.rounds[0]!.finishingOrder[0], out);
});

test('a removed player is refused everywhere they try to act', () => {
  const { s, rng } = toPlaying(4, 48);
  const s2 = act(s, { type: 'removePlayer', by: 'p1', player: 'p3' }, rng);
  assert.throws(() => act(s2, { type: 'readyUp', by: 'p3' }, rng), /removed from the game/);
  assert.throws(() => act(s2, { type: 'removePlayer', by: 'p1', player: 'p3' }, rng), /removed from the game/);
});

test('removing a player while paused is allowed, and the game stays paused', () => {
  const { s, rng } = toPlaying(4, 49);
  const paused = act(s, { type: 'pause', by: 'p1', at: 0 }, rng);
  const s2 = act(paused, { type: 'removePlayer', by: 'p1', player: 'p4' }, rng);
  assert.equal(s2.paused, true);
  assert.deepEqual(s2.order, ['p1', 'p2', 'p3']);
});

test('a vote: a removed player’s ballot is dropped and the vote carries on', () => {
  const rng = seededRng(50);
  let s = dealAll(createSession(net(4), rng).session, rng);
  s = act(s, { type: 'callVote', by: 'p2', kind: 'reshuffle' }, rng);
  assert.deepEqual(s.vote?.ballots, { p2: 'yes' });
  // p2 asked, so p2's YES is already there; remove p2 (the asker): the ballot goes and the vote stays open.
  const s2 = act(s, { type: 'removePlayer', by: 'p1', player: 'p2' }, rng);
  assert.ok(s2.vote !== null);
  assert.deepEqual(s2.vote?.ballots, {});
  assert.equal(s2.vote?.calledBy, 'p2');
});
