/**
 * The session layer: runs a whole game of Pubby on top of the rules engine.
 * See PROJECT.md sections 1.1, 2, 3, 5, 8 and 9, and CODE.md section 2.
 *
 * `createSession` starts a game. `applyAction` takes the current session and
 * one action, checks who may do it and when, and returns the new session plus
 * the events it caused. It never changes the session passed in. Illegal
 * actions throw an Error with a message the UI can show.
 *
 * Flow of a round:
 *   dealing -> reshuffle (anyone may call a vote; host starts the round)
 *   -> swap (2 and 3 players) -> missing suits / Reaction Tap / winner picks
 *   -> playing -> results (votes, ready up, host moves on or ends)
 * The Ultimate Round goes straight to the end of the session.
 */

import { assertPlayerCount, jokerCount } from '../rules/cards.ts';
import type { Card } from '../rules/cards.ts';
import { autoDealAll, autoDealStart, autoDealStep, isDealComplete, manualDealCard, setDealMode } from '../rules/deal.ts';
import type { PlayEvent, PlayResult, RoundEnd } from '../rules/play.ts';
import { betweenTricks, forfeit, pickUpWastePile, playCard, startPlay, takeAllowed, takeCards } from '../rules/play.ts';
import type { Rng } from '../rules/rng.ts';
import type { RoundSetup } from '../rules/round.ts';
import {
  dealerFor,
  decideLeader,
  hiddenSwap,
  missingSuitPlayers,
  resolveReactionTap,
  shuffleAndStartDeal,
  swapAllowed,
} from '../rules/round.ts';
import { addScores, scoreRound } from '../rules/scoring.ts';
import { tallyVote } from '../rules/voting.ts';
import type {
  ActionResult,
  LogEntry,
  PlayerId,
  Session,
  SessionAction,
  SessionEnd,
  SessionEvent,
  SessionPhase,
  SessionSetup,
  UltimateLabels,
} from './types.ts';

/** Phases that are part of a round. The host can pause during these. */
const ROUND_PHASES: readonly SessionPhase[] = ['dealing', 'reshuffle', 'swap', 'reactionTap', 'chooseLeader', 'playing'];

/** Collects events, stamped with the round they happened in. */
class Out {
  readonly entries: LogEntry[] = [];
  emit(s: Session, event: SessionEvent): void {
    this.entries.push({ round: s.round, ultimate: s.ultimateRound, event });
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function nameOf(s: Session, id: PlayerId | null): string {
  if (id === null) return 'nobody';
  return s.players.find((p) => p.id === id)?.sessionName ?? id;
}

function assertPlayer(s: Session, id: PlayerId): void {
  if (!s.order.includes(id)) fail(`Unknown player: ${id}`);
}

function assertHost(s: Session, by: PlayerId, what: string): void {
  if (by !== s.hostId) fail(`Only the host can ${what}`);
}

function assertPhase(s: Session, ...phases: SessionPhase[]): void {
  if (!phases.includes(s.phase)) fail(`Not allowed right now (${s.phase})`);
}

function roundSetup(s: Session): RoundSetup {
  return {
    round: s.round,
    players: s.order,
    hostId: s.hostId,
    jokerRuleEnabled: s.jokerRuleEnabled,
    ...(s.previous ? { previous: s.previous } : {}),
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Start a new game. Round 1: the host shuffles and deals. */
export function createSession(setup: SessionSetup, rng: Rng): ActionResult {
  const n = setup.players.length;
  assertPlayerCount(n);
  const ids = setup.players.map((p) => p.id);
  if (new Set(ids).size !== n) fail('Player ids must be unique');
  if (!ids.includes(setup.hostId)) fail('The host must be one of the players');
  for (const p of setup.players) {
    if (!p.profileName.trim()) fail('Every player needs a profile name');
  }
  const jokerRuleEnabled = setup.jokerRuleEnabled ?? true;
  const limit = setup.pauseTimeLimitSec ?? null;
  if (limit !== null && !(limit > 0)) fail('Pause time limit must be more than 0 seconds');

  const base: Session = {
    hostId: setup.hostId,
    players: setup.players.map((p) => ({
      id: p.id,
      profileName: p.profileName.trim(),
      sessionName: p.sessionName?.trim() || p.profileName.trim(),
    })),
    order: ids,
    jokerRuleEnabled,
    jokerTotal: jokerCount(n, jokerRuleEnabled),
    phase: 'dealing',
    round: 0,
    ultimateRound: false,
    previous: null,
    dealer: setup.hostId,
    deal: null,
    dealMode: 'auto',
    hands: {},
    hiddenDecks: {},
    reshuffleUsed: false,
    swapDone: [],
    tap: null,
    play: null,
    takeRequests: [],
    vote: null,
    paused: false,
    pausedAt: null,
    pauseTimeLimitSec: limit,
    pauseRequests: [],
    scores: Object.fromEntries(ids.map((id) => [id, 0])),
    target: null,
    targetReachedHandled: false,
    rounds: [],
    ready: [],
    ultimateLabels: null,
    ended: null,
    log: [],
  };
  const out = new Out();
  out.emit({ ...base, round: 1 }, {
    type: 'gameStarted',
    players: ids,
    hostId: setup.hostId,
    jokerRuleEnabled,
    jokerTotal: base.jokerTotal,
  });
  const s = startNextRound(base, rng, out);
  return { session: { ...s, log: out.entries }, events: out.entries.map((e) => e.event) };
}

function startNextRound(prev: Session, rng: Rng, out: Out): Session {
  let s: Session = {
    ...prev,
    round: prev.round + 1,
    phase: 'dealing',
    hands: {},
    reshuffleUsed: false,
    swapDone: [],
    tap: null,
    play: null,
    takeRequests: [],
    vote: null,
    ready: [],
    pauseRequests: [],
  };
  const dealer = dealerFor(roundSetup(s));
  const deal = shuffleAndStartDeal(roundSetup(s), rng, 'auto');
  s = { ...s, dealer, deal, dealMode: 'auto', hiddenDecks: deal.hiddenDecks };
  out.emit(s, { type: 'roundStarted', round: s.round, dealer, ultimate: s.ultimateRound });
  return s;
}

// ---------------------------------------------------------------------------
// Apply an action
// ---------------------------------------------------------------------------

export function applyAction(session: Session, action: SessionAction, rng: Rng): ActionResult {
  const out = new Out();
  const next = reduce(session, action, rng, out);
  return {
    session: { ...next, log: [...session.log, ...out.entries] },
    events: out.entries.map((e) => e.event),
  };
}

function reduce(s: Session, a: SessionAction, rng: Rng, out: Out): Session {
  if (s.phase === 'gameOver') fail('The session has ended');
  if ('by' in a) assertPlayer(s, a.by);

  // While paused, only pause controls work.
  if (s.paused && a.type !== 'resume' && a.type !== 'setPauseTimeLimit' && a.type !== 'tick') {
    fail('The game is paused');
  }

  switch (a.type) {
    // ----- Dealing -----
    case 'setDealMode': {
      dealerOnly(s, a.by);
      const deal = setDealMode(s.deal!, a.mode);
      out.emit(s, { type: 'dealModeChanged', mode: a.mode });
      return { ...s, deal, dealMode: a.mode };
    }
    case 'autoDealStart':
      dealerOnly(s, a.by);
      return { ...s, deal: autoDealStart(s.deal!, a.firstSeat) };
    case 'autoDealStep':
      dealerOnly(s, a.by);
      return afterDealStep({ ...s, deal: autoDealStep(s.deal!) }, out);
    case 'autoDealAll':
      dealerOnly(s, a.by);
      return afterDealStep({ ...s, deal: autoDealAll(s.deal!) }, out);
    case 'manualDealCard':
      dealerOnly(s, a.by);
      return afterDealStep({ ...s, deal: manualDealCard(s.deal!, a.seat) }, out);

    // ----- Votes -----
    case 'callVote':
      return callVote(s, a.by, a.kind, a.value ?? null, out);
    case 'castVote': {
      const v = s.vote ?? fail('There is no vote to answer');
      if (v.awaitingHost) fail('Voting is closed: the host is deciding');
      const ballots = { ...v.ballots, [a.by]: a.ballot };
      out.emit(s, { type: 'voteCast', kind: v.kind, by: a.by, ballot: a.ballot });
      const s2: Session = { ...s, vote: { ...v, ballots } };
      const tally = tallyVote(ballots, s.order.length);
      if (tally === 'passed') return resolveVote(s2, true, 'majority', rng, out);
      if (tally === 'failed') return resolveVote(s2, false, 'majority', rng, out);
      if (Object.keys(ballots).length === s.order.length) return needHost(s2, out);
      return s2;
    }
    case 'closeVote': {
      assertHost(s, a.by, 'close a vote');
      const v = s.vote ?? fail('There is no vote to close');
      if (v.awaitingHost) return s;
      const tally = tallyVote(v.ballots, s.order.length);
      if (tally === 'passed') return resolveVote(s, true, 'majority', rng, out);
      if (tally === 'failed') return resolveVote(s, false, 'majority', rng, out);
      return needHost(s, out);
    }
    case 'hostDecides': {
      assertHost(s, a.by, 'decide a vote');
      const v = s.vote ?? fail('There is no vote to decide');
      if (!v.awaitingHost) fail('The vote is still open, or it has a majority');
      return resolveVote(s, a.yes, 'host', rng, out);
    }

    // ----- Round start -----
    case 'startRound':
      assertHost(s, a.by, 'start the round');
      assertPhase(s, 'reshuffle');
      if (s.vote) fail('Finish the reshuffle vote first');
      out.emit(s, { type: 'reshuffleWindowClosed' });
      return afterReshuffleWindow(s, out);
    case 'swap': {
      assertPhase(s, 'swap');
      if (s.swapDone.includes(a.by)) fail(`${nameOf(s, a.by)} has already swapped this round`);
      const res = hiddenSwap(s.hands[a.by] ?? [], s.hiddenDecks, a.cardIds, rng);
      out.emit(s, { type: 'swapped', player: a.by, count: res.removed.length });
      const s2: Session = {
        ...s,
        hands: { ...s.hands, [a.by]: res.hand },
        hiddenDecks: res.hiddenDecks,
        swapDone: [...s.swapDone, a.by],
      };
      if (s2.order.every((p) => s2.swapDone.includes(p))) return decideLeaderStep(s2, out);
      return s2;
    }
    case 'reactionTap': {
      assertPhase(s, 'reactionTap');
      const tap = s.tap!;
      if (!tap.players.includes(a.by)) fail(`${nameOf(s, a.by)} is not in this Reaction Tap`);
      if (tap.results[a.by]) fail(`${nameOf(s, a.by)} has already tapped`);
      if (!a.falseStart && !(a.ms >= 0)) fail('Reaction time must be 0 ms or more');
      out.emit(s, { type: 'reactionTapped', player: a.by, ms: a.ms, falseStart: a.falseStart });
      const results = { ...tap.results, [a.by]: { ms: a.ms, falseStart: a.falseStart } };
      if (Object.keys(results).length < tap.players.length) return { ...s, tap: { ...tap, results } };
      const outcome = resolveReactionTap(
        tap.players.map((p) => ({ player: p, ms: results[p]!.ms, falseStart: results[p]!.falseStart })),
      );
      if (outcome.kind === 'replay') {
        out.emit(s, { type: 'reactionTapReplay', players: outcome.players });
        return { ...s, tap: { players: outcome.players, results: {} } };
      }
      return beginPlay({ ...s, tap: null }, outcome.slowest, 'reactionTap', out);
    }
    case 'chooseLeader': {
      assertPhase(s, 'chooseLeader');
      const winner = s.previous!.winner;
      if (a.by !== winner) fail(`Only ${nameOf(s, winner)} (last round's winner) picks who leads`);
      assertPlayer(s, a.leader);
      return beginPlay(s, a.leader, 'winnerChose', out);
    }

    // ----- Play -----
    case 'playCard':
      assertPhase(s, 'playing');
      if (betweenTricks(s.play!) && s.takeRequests.some((r) => !r.agreed)) {
        fail('Waiting for a take-cards request to be answered before the next trick');
      }
      return afterPlay(s, playCard(s.play!, a.by, a.cardId), out);
    case 'pickUpWastePile':
      assertPhase(s, 'playing');
      return afterPlay(s, pickUpWastePile(s.play!, a.by), out);
    case 'forfeit':
      assertPhase(s, 'playing');
      return afterPlay(s, forfeit(s.play!, a.by), out);

    // ----- Take-cards request -----
    case 'requestTake': {
      assertPhase(s, 'playing');
      const why = takeAllowed(s.play!, a.by, a.target);
      if (why) fail(why);
      if (s.takeRequests.some((r) => r.requester === a.by && r.target === a.target)) {
        fail(`You have already asked ${nameOf(s, a.target)}`);
      }
      out.emit(s, { type: 'takeRequested', requester: a.by, target: a.target });
      return { ...s, takeRequests: [...s.takeRequests, { requester: a.by, target: a.target, agreed: false }] };
    }
    case 'answerTake': {
      assertPhase(s, 'playing');
      const req = s.takeRequests.find((r) => r.requester === a.requester && r.target === a.by && !r.agreed);
      if (!req) fail('No take-cards request to answer');
      out.emit(s, { type: 'takeAnswered', requester: a.requester, target: a.by, accepted: a.accept });
      const rest = s.takeRequests.filter((r) => r !== req);
      const takeRequests = a.accept ? [...rest, { ...req, agreed: true }] : rest;
      return processTakes({ ...s, takeRequests }, out);
    }
    case 'withdrawTake': {
      assertPhase(s, 'playing');
      const req = s.takeRequests.find((r) => r.requester === a.by && r.target === a.target);
      if (!req) fail('No request to withdraw');
      out.emit(s, { type: 'takeCancelled', requester: a.by, target: a.target, reason: 'withdrawn' });
      return { ...s, takeRequests: s.takeRequests.filter((r) => r !== req) };
    }

    // ----- Pause -----
    case 'pause':
      assertHost(s, a.by, 'pause');
      return doPause(s, a.at, null, out);
    case 'requestPause': {
      if (a.by === s.hostId) fail('The host can pause directly');
      pauseAllowed(s);
      if (s.pauseRequests.includes(a.by)) fail('You have already asked to pause');
      out.emit(s, { type: 'pauseRequested', by: a.by });
      return { ...s, pauseRequests: [...s.pauseRequests, a.by] };
    }
    case 'respondPause': {
      assertHost(s, a.by, 'answer a pause request');
      if (!s.pauseRequests.includes(a.requester)) fail('No pause request from that player');
      if (a.approve) return doPause(s, a.at, a.requester, out);
      out.emit(s, { type: 'pauseDeclined', requester: a.requester });
      return { ...s, pauseRequests: s.pauseRequests.filter((p) => p !== a.requester) };
    }
    case 'resume':
      assertHost(s, a.by, 'resume');
      if (!s.paused) fail('The game is not paused');
      out.emit(s, { type: 'resumed', reason: 'host' });
      return { ...s, paused: false, pausedAt: null };
    case 'setPauseTimeLimit': {
      assertHost(s, a.by, 'set the pause time limit');
      if (a.seconds !== null && !(a.seconds > 0)) fail('Pause time limit must be more than 0 seconds');
      out.emit(s, { type: 'pauseTimeLimitSet', seconds: a.seconds });
      return { ...s, pauseTimeLimitSec: a.seconds };
    }
    case 'tick': {
      if (!s.paused || s.pauseTimeLimitSec === null || s.pausedAt === null) return s;
      if (a.at - s.pausedAt < s.pauseTimeLimitSec * 1000) return s;
      out.emit(s, { type: 'resumed', reason: 'timeLimit' });
      return { ...s, paused: false, pausedAt: null };
    }

    // ----- Results screen -----
    case 'readyUp':
      assertPhase(s, 'results');
      if (s.ready.includes(a.by)) return s;
      out.emit(s, { type: 'playerReady', player: a.by });
      return { ...s, ready: [...s.ready, a.by] };
    case 'advance':
      assertHost(s, a.by, 'start the next round');
      assertPhase(s, 'results');
      if (s.vote) fail('Finish the vote first');
      return startNextRound(s, rng, out);
    case 'endSession':
      assertHost(s, a.by, 'end the session');
      assertPhase(s, 'results');
      if (s.vote) fail('Finish the vote first');
      return endSession(s, 'hostEnded', out);
  }
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

function dealerOnly(s: Session, by: PlayerId): void {
  assertPhase(s, 'dealing');
  if (s.vote) fail('Finish the vote first');
  if (by !== s.dealer) fail(`Only the dealer (${nameOf(s, s.dealer)}) can deal`);
}

function afterDealStep(s: Session, out: Out): Session {
  const deal = s.deal!;
  if (!isDealComplete(deal)) return s;
  const hands = deal.hands;
  out.emit(s, {
    type: 'dealComplete',
    handSizes: Object.fromEntries(s.order.map((p) => [p, (hands[p] ?? []).length])),
  });
  const s2: Session = { ...s, deal: null, hands, hiddenDecks: deal.hiddenDecks };
  // After a reshuffle the vote is used up, so the round moves straight on.
  if (s2.reshuffleUsed) return afterReshuffleWindow(s2, out);
  return { ...s2, phase: 'reshuffle' };
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

function callVote(
  s: Session,
  by: PlayerId | null,
  kind: 'reshuffle' | 'target' | 'ultimate',
  value: number | null,
  out: Out,
): Session {
  if (s.vote) fail('A vote is already in progress');
  if (kind === 'reshuffle') {
    if (s.phase !== 'reshuffle') fail('A reshuffle vote can only be called after the deal, before the round begins');
    if (s.reshuffleUsed) fail('Only one reshuffle vote per round');
    value = null;
  } else if (kind === 'target') {
    if (!targetVoteAllowed(s)) {
      if (s.target !== null) fail('The target score has already been agreed');
      if (s.ultimateRound) fail('The Ultimate Round has already been agreed');
      fail('A target vote can only happen before round 1 starts or on the results screen');
    }
    if (value === null || !Number.isInteger(value) || value < 1) fail('The target must be a whole number of points, 1 or more');
  } else {
    if (s.phase !== 'results') fail('This vote can only happen on the results screen');
    if (s.ultimateRound) fail('The Ultimate Round has already been agreed');
    value = null;
  }
  out.emit(s, { type: 'voteCalled', kind, by, value });
  return {
    ...s,
    reshuffleUsed: kind === 'reshuffle' ? true : s.reshuffleUsed,
    vote: { kind, calledBy: by, ballots: {}, value, awaitingHost: false },
  };
}

/**
 * The target score vote: before round 1 starts (during the deal or before the
 * host starts the round) or on any results screen. Once a target is agreed,
 * or the Ultimate Round is agreed, no more target votes.
 */
export function targetVoteAllowed(s: Session): boolean {
  if (s.vote || s.paused || s.target !== null || s.ultimateRound) return false;
  if (s.phase === 'results') return true;
  return s.round === 1 && (s.phase === 'dealing' || s.phase === 'reshuffle');
}

function needHost(s: Session, out: Out): Session {
  const v = s.vote!;
  out.emit(s, { type: 'voteNeedsHost', kind: v.kind });
  return { ...s, vote: { ...v, awaitingHost: true } };
}

function resolveVote(s: Session, result: boolean, decidedBy: 'majority' | 'host', rng: Rng, out: Out): Session {
  const v = s.vote!;
  out.emit(s, { type: 'voteResolved', kind: v.kind, result, decidedBy, value: v.value });
  const s2: Session = { ...s, vote: null };
  switch (v.kind) {
    case 'reshuffle': {
      if (!result) return afterReshuffleWindow(s2, out);
      // The dealer shuffles the full deck again and deals again, hidden decks included.
      const deal = shuffleAndStartDeal(roundSetup(s2), rng, 'auto');
      out.emit(s2, { type: 'reshuffled', dealer: s2.dealer });
      return { ...s2, phase: 'dealing', deal, dealMode: 'auto', hands: {}, hiddenDecks: deal.hiddenDecks };
    }
    case 'target': {
      if (!result) return s2;
      return checkTarget({ ...s2, target: v.value, targetReachedHandled: false }, out);
    }
    case 'ultimate': {
      if (result) return { ...s2, ultimateRound: true };
      // Target reached and the Ultimate vote failed: the session ends, highest score wins.
      if (v.calledBy === null) return endSession(s2, 'ultimateVoteFailedAtTarget', out);
      return s2;
    }
  }
}

/** A player reached the target: an Ultimate Round vote starts automatically. */
function checkTarget(s: Session, out: Out): Session {
  if (s.target === null || s.targetReachedHandled || s.ultimateRound) return s;
  const reached = s.order.filter((p) => (s.scores[p] ?? 0) >= s.target!);
  if (reached.length === 0) return s;
  out.emit(s, { type: 'targetReached', players: reached, target: s.target });
  return callVote({ ...s, targetReachedHandled: true }, null, 'ultimate', null, out);
}

// ---------------------------------------------------------------------------
// Round start
// ---------------------------------------------------------------------------

function afterReshuffleWindow(s: Session, out: Out): Session {
  if (swapAllowed(s.order.length)) return { ...s, phase: 'swap', swapDone: [] };
  return decideLeaderStep(s, out);
}

function decideLeaderStep(s: Session, out: Out): Session {
  for (const m of missingSuitPlayers(s.order, s.hands)) {
    out.emit(s, { type: 'missingSuitDeclared', player: m.player, suits: m.suits });
  }
  const d = decideLeader(roundSetup(s), s.hands);
  if (d.kind === 'leader') return beginPlay(s, d.leader, d.reason, out);
  if (d.kind === 'reactionTap') {
    out.emit(s, { type: 'reactionTapStarted', players: d.players });
    return { ...s, phase: 'reactionTap', tap: { players: d.players, results: {} } };
  }
  return { ...s, phase: 'chooseLeader' };
}

function beginPlay(
  s: Session,
  leader: PlayerId,
  reason: 'host' | 'missingSuit' | 'reactionTap' | 'winnerChose',
  out: Out,
): Session {
  out.emit(s, { type: 'leaderChosen', leader, reason });
  return { ...s, phase: 'playing', play: startPlay(s.order, s.hands, leader) };
}

// ---------------------------------------------------------------------------
// Play and round end
// ---------------------------------------------------------------------------

function afterPlay(s: Session, r: PlayResult, out: Out): Session {
  let s2: Session = { ...s, play: r.state, hands: r.state.hands };
  for (const e of r.events) out.emit(s2, e);
  const end = r.events.find((e): e is Extract<PlayEvent, { type: 'roundEnded' }> => e.type === 'roundEnded');
  if (end) return finishRound({ ...s2, takeRequests: [] }, end, out);
  return processTakes(s2, out);
}

/**
 * Take-cards requests: drop any that can no longer happen (a player is out,
 * or only two players hold cards). Between tricks, carry out the agreed ones,
 * oldest first. Requests made during a trick wait until it is over.
 */
function processTakes(s: Session, out: Out): Session {
  if (s.phase !== 'playing' || !s.play || s.takeRequests.length === 0) return s;
  let play = s.play;
  let queue = s.takeRequests.slice();
  const drop = () => {
    queue = queue.filter((r) => {
      if (!takeAllowed(play, r.requester, r.target)) return true;
      out.emit(s, { type: 'takeCancelled', requester: r.requester, target: r.target, reason: 'notPossible' });
      return false;
    });
  };
  drop();
  if (betweenTricks(play)) {
    for (;;) {
      const next = queue.find((r) => r.agreed);
      if (!next) break;
      queue = queue.filter((r) => r !== next);
      const res = takeCards(play, next.requester, next.target);
      play = res.state;
      for (const e of res.events) out.emit(s, e);
      drop();
    }
  }
  return { ...s, play, hands: play.hands, takeRequests: queue };
}

function finishRound(s: Session, end: RoundEnd, out: Out): Session {
  const order = end.finishingOrder;
  const n = order.length;
  const pauseCleared = { paused: false, pausedAt: null, pauseRequests: [] as PlayerId[] };

  if (s.ultimateRound) {
    // Outside the score. Titles only.
    const losers = end.sharedSecondLast ? end.sharedSecondLast.slice() : [order[n - 1] as PlayerId];
    const winnerCandidate = order[0] as PlayerId;
    const labels: UltimateLabels = {
      winner: losers.includes(winnerCandidate) ? null : winnerCandidate,
      losers,
    };
    out.emit(s, { type: 'roundScored', round: s.round, ultimate: true, finishingOrder: order, points: {}, totals: s.scores });
    out.emit(s, { type: 'ultimateLabels', winner: labels.winner, losers: labels.losers });
    const s2: Session = {
      ...s,
      ...pauseCleared,
      ultimateLabels: labels,
      rounds: [
        ...s.rounds,
        {
          round: s.round,
          ultimate: true,
          finishingOrder: order,
          points: {},
          totals: s.scores,
          sharedSecondLast: end.sharedSecondLast,
          forfeitedBy: end.forfeitedBy,
        },
      ],
    };
    return endSession(s2, 'ultimatePlayed', out);
  }

  const points = scoreRound(order, end.sharedSecondLast);
  const totals = addScores(s.scores, points);
  out.emit(s, { type: 'roundScored', round: s.round, ultimate: false, finishingOrder: order, points, totals });
  const s2: Session = {
    ...s,
    ...pauseCleared,
    phase: 'results',
    scores: totals,
    previous: { winner: order[0] as PlayerId, loser: order[n - 1] as PlayerId },
    ready: [],
    rounds: [
      ...s.rounds,
      {
        round: s.round,
        ultimate: false,
        finishingOrder: order,
        points,
        totals,
        sharedSecondLast: end.sharedSecondLast,
        forfeitedBy: end.forfeitedBy,
      },
    ],
  };
  return checkTarget(s2, out);
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

function pauseAllowed(s: Session): void {
  if (s.paused) fail('The game is already paused');
  if (!ROUND_PHASES.includes(s.phase)) fail('You can only pause during a round');
  if (s.vote) fail('No pausing during a vote');
}

function doPause(s: Session, at: number, requestedBy: PlayerId | null, out: Out): Session {
  pauseAllowed(s);
  out.emit(s, { type: 'paused', requestedBy });
  // Pending requests are cleared while paused.
  return { ...s, paused: true, pausedAt: at, pauseRequests: [] };
}

// ---------------------------------------------------------------------------
// End of session
// ---------------------------------------------------------------------------

/**
 * Final standings: highest score first. The Ultimate Winner outranks every
 * score; the Ultimate Loser(s) rank below every score.
 */
export function finalStandings(s: Pick<Session, 'order' | 'scores' | 'ultimateLabels'>): {
  standings: PlayerId[];
  winners: PlayerId[];
  decidedBy: 'ultimate' | 'highestScore';
} {
  const labels = s.ultimateLabels;
  const byScore = s.order.slice().sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  const losers = labels?.losers ?? [];
  const winner = labels?.winner ?? null;
  const middle = byScore.filter((p) => p !== winner && !losers.includes(p));
  const standings = [...(winner ? [winner] : []), ...middle, ...losers.filter((p) => p !== winner)];
  if (winner) return { standings, winners: [winner], decidedBy: 'ultimate' };
  const pool = middle.length ? middle : byScore;
  const top = Math.max(...pool.map((p) => s.scores[p] ?? 0));
  return { standings, winners: pool.filter((p) => (s.scores[p] ?? 0) === top), decidedBy: 'highestScore' };
}

function endSession(s: Session, reason: SessionEnd['reason'], out: Out): Session {
  const f = finalStandings(s);
  const ended: SessionEnd = { ...f, reason };
  out.emit(s, { type: 'sessionEnded', ...ended });
  return { ...s, phase: 'gameOver', vote: null, ended, paused: false, pausedAt: null, pauseRequests: [] };
}

/** Cards a player holds right now (before play: the dealt hand; during play: the play hand). */
export function handOf(s: Session, id: PlayerId): readonly Card[] {
  if (s.phase === 'dealing') return s.deal?.hands[id] ?? [];
  return s.hands[id] ?? [];
}
