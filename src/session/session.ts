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
 *   dealing -> reshuffle (anyone may call a vote, once per deal; a passed vote deals
 *   again and opens the window again; host starts the round)
 *   -> swap (2 and 3 players) -> missing suits / Reaction Tap / winner picks
 *   -> playing -> results (votes, ready up, host moves on or ends)
 * The Ultimate Round goes straight to the end of the session.
 */

import { joinNames } from './names.ts';
import { assertPlayerCount, jokerCount } from '../rules/cards.ts';
import type { Card } from '../rules/cards.ts';
import { autoDealAll, autoDealStart, autoDealStep, isDealComplete, manualDealCard, removeSeat, setDealMode } from '../rules/deal.ts';
import type { DealState } from '../rules/deal.ts';
import type { PlayEvent, PlayResult, RoundEnd } from '../rules/play.ts';
import { betweenTricks, forfeit, pickUpWastePile, playCard, removeFromPlay, startPlay, takeAllowed, takeCards } from '../rules/play.ts';
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
import { tallyVote, type Ballot } from '../rules/voting.ts';
import type {
  ActionResult,
  LeadNotice,
  LogEntry,
  PlayerId,
  Session,
  SessionAction,
  SessionEnd,
  SessionEvent,
  SessionPhase,
  SessionSetup,
  TapEntry,
  UltimateLabels,
} from './types.ts';

/** Phases that are part of a round. The host can pause during these. */
const ROUND_PHASES: readonly SessionPhase[] = ['dealing', 'reshuffle', 'swap', 'cardCheck', 'leadNotice', 'reactionTap', 'chooseLeader', 'playing'];

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
  if (s.order.includes(id)) return;
  if (s.gone.includes(id)) fail(`${nameOf(s, id)} was removed from the game`);
  fail(`Unknown player: ${id}`);
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
      ...(p.computer ? { computer: true } : {}),
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
    dealMode: 'manual',
    hands: {},
    hiddenDecks: {},
    reshuffleUsed: false,
    swapDone: [],
    handSeen: [],
    waitForAll: setup.waitForAll ?? false,
    tap: null,
    notice: null,
    noticeSeen: [],
    play: null,
    takeRequests: [],
    peeks: [],
    kept: [],
    removed: [],
    gone: [],
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
    handSeen: [],
    tap: null,
    notice: null,
    noticeSeen: [],
    play: null,
    takeRequests: [],
    peeks: [],
    kept: [],
    removed: [],
    vote: null,
    ready: [],
    pauseRequests: [],
  };
  const dealer = dealerFor(roundSetup(s));
  // The deal starts in manual mode; the dealer can switch to auto at any time.
  const deal = shuffleAndStartDeal(roundSetup(s), rng, 'manual');
  s = { ...s, dealer, deal, dealMode: 'manual', hiddenDecks: deal.hiddenDecks };
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
  // 9an.8: removing a player is allowed while paused (a paused game is the likely moment).
  if (s.paused && a.type !== 'resume' && a.type !== 'setPauseTimeLimit' && a.type !== 'tick' && a.type !== 'removePlayer') {
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
      // 2.32 (PROJECT.md 12n): the player who asked for a vote is already YES.
      if (v.calledBy !== null && a.by === v.calledBy) fail('You asked for this vote, so your vote is already YES');
      const ballots = { ...v.ballots, [a.by]: a.ballot };
      out.emit(s, { type: 'voteCast', kind: v.kind, by: a.by, ballot: a.ballot });
      // 9an.4 (2.38): a reshuffle vote, either way, is the voter's choice for this deal (Keep my cards is done).
      const kept = v.kind === 'reshuffle' && !s.kept.includes(a.by) ? [...s.kept, a.by] : s.kept;
      const s2: Session = { ...s, vote: { ...v, ballots }, kept };
      // 2.32: nothing is decided until everyone has voted (tallyVote's `final` is true only then).
      const everyone = Object.keys(ballots).length === s.order.length;
      const tally = tallyVote(ballots, s.order.length, everyone);
      if (tally === 'passed') return resolveVote(s2, true, 'majority', rng, out);
      if (tally === 'failed') return resolveVote(s2, false, 'majority', rng, out);
      if (tally === 'hostDecides') return needHost(s2, out);
      return s2;
    }
    case 'closeVote': {
      assertHost(s, a.by, 'close a vote');
      const v = s.vote ?? fail('There is no vote to close');
      if (v.awaitingHost) return s;
      // 2.32: the host counts early: missing votes are not yes (PROJECT.md 12n).
      const tally = tallyVote(v.ballots, s.order.length, true);
      if (tally === 'passed') return resolveVote(s, true, 'majority', rng, out);
      if (tally === 'failed') return resolveVote(s, false, 'majority', rng, out);
      // Two players: no host decision. Closed without both agreeing: not agreed.
      if (s.order.length === 2) return resolveVote(s, false, 'majority', rng, out);
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
      if (keepOn(s)) {
        // 9an.4 (2.38): nobody starts the round until every person has kept their cards or voted.
        // The host counts as kept (their own Start), and so do players who are away (the host's phone sends them).
        const counted = [...s.kept, s.hostId, ...(a.skip ?? []).filter((p) => s.order.includes(p))];
        const waiting = s.order.filter((p) => !s.players.find((x) => x.id === p)?.computer && !counted.includes(p));
        if (waiting.length) fail('Waiting for everyone to keep their cards');
      }
      out.emit(s, { type: 'reshuffleWindowClosed' });
      return afterReshuffleWindow(s, out);
    case 'keepCards': {
      assertPhase(s, 'reshuffle');
      if (!keepOn(s)) fail('Keeping cards is only for network games');
      if (s.kept.includes(a.by)) fail('You have already kept your cards');
      out.emit(s, { type: 'cardsKept', player: a.by });
      return { ...s, kept: [...s.kept, a.by] };
    }
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
      return afterSwapGate(s2, out);
    }
    case 'seenHand': {
      assertPhase(s, 'cardCheck');
      if (s.handSeen.includes(a.by)) return s; // a repeat is harmless
      out.emit(s, { type: 'handSeen', player: a.by });
      const s2: Session = { ...s, handSeen: [...s.handSeen, a.by] };
      if (s2.order.every((p) => s2.handSeen.includes(p))) return decideLeaderStep(s2, out);
      return s2;
    }
    case 'seenNotice': {
      // 2.30 (CODE.md 9y.2): OK on a notice. Every person must tap (waitForAll), or one tap is enough (shared phone).
      assertPhase(s, 'leadNotice');
      if (isComputer(s, a.by)) fail(`${nameOf(s, a.by)} is a computer player and never taps a notice`);
      if (s.noticeSeen.includes(a.by)) return s; // a repeat is harmless
      const seen = [...s.noticeSeen, a.by];
      const persons = s.order.filter((p) => !isComputer(s, p));
      const allSeen = s.waitForAll ? persons.every((p) => seen.includes(p)) : true;
      if (!allSeen) return { ...s, noticeSeen: seen };
      return advanceNotice({ ...s, noticeSeen: [] }, out);
    }
    case 'reactionTap': {
      assertPhase(s, 'reactionTap');
      const tap = s.tap!;
      if (!tap.players.includes(a.by)) fail(`${nameOf(s, a.by)} is not in this Reaction Tap`);
      if (tap.results[a.by]) fail(`${nameOf(s, a.by)} has already tapped`);
      if (!a.falseStart && !(a.ms >= 0)) fail('Reaction time must be 0 ms or more');
      out.emit(s, { type: 'reactionTapped', player: a.by, ms: a.ms, falseStart: a.falseStart });
      const results = { ...tap.results, [a.by]: { ms: a.ms, falseStart: a.falseStart } };
      return completeTap({ ...s, tap: { ...tap, results } }, out);
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
      if (!betweenTricks(s.play!)) fail('You can only ask before a trick starts');
      const why = takeAllowed(s.play!, a.by, a.target);
      if (why) fail(why);
      if (s.takeRequests.some((r) => r.requester === a.by)) {
        fail('You can only ask one player at a time');
      }
      out.emit(s, { type: 'takeRequested', requester: a.by, target: a.target });
      return { ...s, takeRequests: [...s.takeRequests, { requester: a.by, target: a.target, agreed: false }] };
    }
    case 'answerTake': {
      assertPhase(s, 'playing');
      const req = s.takeRequests.find((r) => r.requester === a.requester && r.target === a.by && !r.agreed);
      if (!req) fail('No take-cards request to answer');
      out.emit(s, { type: 'takeAnswered', requester: a.requester, target: a.by, accepted: a.accept });
      let rest = s.takeRequests.filter((r) => r !== req);
      if (a.accept) {
        // 9an.1 (2.38): only the player about to lead can ask now, so this only happens in saved games
        // made before 2.38. Kept so those games still load and finish. Giving to one is a no to the others.
        for (const r of rest.filter((x) => x.target === a.by && !x.agreed)) {
          out.emit(s, { type: 'takeAnswered', requester: r.requester, target: a.by, accepted: false });
        }
        rest = rest.filter((x) => x.target !== a.by);
      }
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

    // ----- Watch a hand (9an.3, 2.38) -----
    case 'requestPeek': {
      assertPhase(s, 'playing');
      if (!s.play) fail('Not allowed right now (no trick)');
      if (!peeksOn(s)) fail('Watching a hand is for network games and single player');
      if (s.players.find((p) => p.id === a.by)?.computer) fail('Computer players do not watch hands');
      if (a.target === a.by) fail('You cannot watch your own hand');
      if (handOf(s, a.by).length > 0) fail('Only players who are out can watch');
      if (s.peeks.some((p) => p.viewer === a.by)) fail('You can watch one player at a time');
      if (handOf(s, a.target).length === 0) fail('That player is out');
      out.emit(s, { type: 'peekRequested', viewer: a.by, target: a.target });
      return { ...s, peeks: [...s.peeks, { viewer: a.by, target: a.target, showing: false }] };
    }
    case 'answerPeek': {
      assertPhase(s, 'playing');
      const peek = s.peeks.find((p) => p.viewer === a.viewer && p.target === a.by && !p.showing);
      if (!peek) fail('No request to answer');
      out.emit(s, { type: 'peekAnswered', viewer: a.viewer, target: a.by, accepted: a.accept });
      if (!a.accept) return { ...s, peeks: s.peeks.filter((p) => p !== peek) };
      return { ...s, peeks: s.peeks.map((p) => (p === peek ? { ...p, showing: true } : p)) };
    }
    case 'stopPeek': {
      assertPhase(s, 'playing');
      // Either the viewer or the player being watched may stop it.
      const peek = s.peeks.find((p) => (p.viewer === a.by && p.target === a.other) || (p.target === a.by && p.viewer === a.other));
      if (!peek) fail('Nothing to stop');
      out.emit(s, { type: 'peekStopped', viewer: peek.viewer, target: peek.target, by: a.by });
      return { ...s, peeks: s.peeks.filter((p) => p !== peek) };
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
    case 'unready':
      // 9ak.3 (2.37): a player takes back "I'm ready" while the host has not moved on. The host's own ready
      // is not taken back: the host starts the next round.
      assertPhase(s, 'results');
      if (!s.ready.includes(a.by)) return s;
      if (a.by === s.hostId) fail('The host starts the next round');
      out.emit(s, { type: 'playerUnready', player: a.by });
      return { ...s, ready: s.ready.filter((p) => p !== a.by) };
    case 'advance':
      assertHost(s, a.by, 'start the next round');
      assertPhase(s, 'results');
      if (s.vote) fail('Finish the vote first');
      // 2.20 (Part C): with waitForAll, the host waits until every player is ready.
      if (s.waitForAll && !s.order.every((p) => s.ready.includes(p))) {
        fail(`Waiting for ${joinNames(s.order.filter((p) => !s.ready.includes(p)).map((p) => nameOf(s, p)))}`);
      }
      return startNextRound(s, rng, out);
    case 'endSession':
      assertHost(s, a.by, 'end the session');
      assertPhase(s, 'results');
      if (s.vote) fail('Finish the vote first');
      return endOrOfferDraw(s, 'hostEnded', 1, out);
    case 'removePlayer': {
      const why = removeAllowed(s, a.by, a.player);
      if (why) fail(why);
      return removeFromGame(s, a.player, rng, out);
    }
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
  // 9ap.H (2.38.2): every deal opens the reshuffle window, but only one Deal again vote per round. `reshuffleUsed`
  // is kept from the round's start (false) and set by the vote (passed or failed), so a redeal after a passed vote
  // does not bring "Deal again?" back. It is reset only when a round starts (createSession, startNextRound).
  return { ...s2, phase: 'reshuffle', kept: [] };
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
  draw?: 1 | 2,
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
    const min = minimumTarget(s);
    if (value < min) fail(`The target can't be lower than the highest score (${min})`);
  } else {
    if (s.phase !== 'results') fail('This vote can only happen on the results screen');
    if (s.ultimateRound) fail('The Ultimate Round has already been agreed');
    value = null;
  }
  out.emit(s, { type: 'voteCalled', kind, by, value });
  // Two players: asking counts as agreeing; only the other player answers.
  // 2.32 (PROJECT.md 12n): the player who asks is YES for every kind of vote (the automatic Ultimate vote has no asker).
  const ballots: Record<PlayerId, Ballot> = by !== null ? { [by]: 'yes' } : {};
  const kept = kind === 'reshuffle' && by !== null && !s.kept.includes(by) ? [...s.kept, by] : s.kept;
  return {
    ...s,
    reshuffleUsed: kind === 'reshuffle' ? true : s.reshuffleUsed,
    kept,
    vote: { kind, calledBy: by, ballots, value, awaitingHost: false, ...(draw ? { draw } : {}) },
  };
}

/** Highest score in the game so far (0 before any round). */
export function highestScore(s: Pick<Session, 'order' | 'scores'>): number {
  return Math.max(0, ...s.order.map((p) => s.scores[p] ?? 0));
}

/** Lowest target that can be proposed: the current highest score, and at least 1. */
export function minimumTarget(s: Pick<Session, 'order' | 'scores'>): number {
  return Math.max(1, highestScore(s));
}

/** Players sharing the top score when the game would end on points (none: no draw). */
function drawnTop(s: Session): PlayerId[] {
  if (s.ultimateLabels?.winner) return [];
  const f = finalStandings(s);
  return f.winners.length > 1 ? f.winners : [];
}

/**
 * The game would end on points. If the top score is a draw, offer an Ultimate
 * Round instead (everyone votes). `offer` 2 is the second chance after
 * "Coward!". Otherwise, or after the second refusal, the session ends.
 */
function endOrOfferDraw(s: Session, reason: SessionEnd['reason'], offer: 1 | 2, out: Out): Session {
  const tied = drawnTop(s);
  if (tied.length === 0) return endSession(s, reason, out);
  if (offer === 1) out.emit(s, { type: 'drawAtEnd', players: tied });
  else out.emit(s, { type: 'drawCoward', players: tied });
  return callVote({ ...s, phase: 'results' }, null, 'ultimate', null, out, offer);
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
  out.emit(s, { type: 'voteResolved', kind: v.kind, result, decidedBy, value: v.value, ballots: { ...v.ballots } });
  const s2: Session = { ...s, vote: null };
  switch (v.kind) {
    case 'reshuffle': {
      if (!result) return afterReshuffleWindow(s2, out);
      // The dealer shuffles the full deck again and deals again, hidden decks included.
      const deal = shuffleAndStartDeal(roundSetup(s2), rng, 'manual');
      out.emit(s2, { type: 'reshuffled', dealer: s2.dealer });
      return { ...s2, phase: 'dealing', deal, dealMode: 'manual', hands: {}, hiddenDecks: deal.hiddenDecks };
    }
    case 'target': {
      if (!result) return s2;
      return checkTarget({ ...s2, target: v.value, targetReachedHandled: false }, out);
    }
    case 'ultimate': {
      if (result) return { ...s2, ultimateRound: true };
      // Draw at the end, first offer refused: "Coward!" and a second chance.
      if (v.draw === 1) return endOrOfferDraw(s2, 'drawDeclined', 2, out);
      // Second chance refused: the game ends with the shared top score.
      if (v.draw === 2) return endSession(s2, 'drawDeclined', out);
      // Target reached and the Ultimate vote failed: the session ends, highest
      // score wins. A drawn top score still gets the "Coward!" second chance.
      if (v.calledBy === null) return endOrOfferDraw(s2, 'ultimateVoteFailedAtTarget', 2, out);
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
  if (swapAllowed(s.order.length)) return { ...s, phase: 'swap', swapDone: [], handSeen: [] };
  return decideLeaderStep(s, out);
}

function decideLeaderStep(s: Session, out: Out): Session {
  for (const m of missingSuitPlayers(s.order, s.hands)) {
    // Secret: the suit is never logged or sent (PROJECT.md 5). The leader still follows the real hands.
    out.emit(s, { type: 'missingSuitDeclared', player: m.player });
  }
  const d = decideLeader(roundSetup(s), s.hands);
  if (d.kind === 'leader') {
    // 2.30: one player missing a suit gets a notice that stays until OK (CODE.md 9y.2).
    if (d.reason === 'missingSuit' && showsNotice(s)) return noticeAt(s, { kind: 'missingOne', players: [d.leader], leader: d.leader }, out);
    return beginPlay(s, d.leader, d.reason, out);
  }
  if (d.kind === 'reactionTap') {
    if (showsNotice(s)) return noticeAt(s, { kind: 'missingMany', players: d.players }, out);
    return startReactionTap(s, d.players, out);
  }
  return { ...s, phase: 'chooseLeader' };
}

/** 2.30: the Reaction Tap begins (after its notice, if any). */
function startReactionTap(s: Session, players: readonly PlayerId[], out: Out): Session {
  out.emit(s, { type: 'reactionTapStarted', players });
  return { ...s, phase: 'reactionTap', notice: null, noticeSeen: [], tap: { players, results: {} } };
}

/** 2.30: a computer player is never a person who must tap (CODE.md 9y.1). */
function isComputer(s: Session, id: PlayerId): boolean {
  return s.players.find((p) => p.id === id)?.computer === true;
}

/**
 * 2.30: notices show only when a person is playing. With computer players only
 * (fast forward, or a game of computer players), nothing waits for a tap.
 */
function showsNotice(s: Session): boolean {
  return s.order.some((p) => !isComputer(s, p));
}

/** 2.30: show a notice; it stays until every person has tapped OK. */
function noticeAt(s: Session, notice: LeadNotice, out: Out): Session {
  return { ...s, phase: 'leadNotice', notice, noticeSeen: [] };
}

/** 2.30: everyone has tapped OK: the next step of the notice sequence (CODE.md 9y.2). */
function advanceNotice(s: Session, out: Out): Session {
  const n = s.notice;
  if (!n) return s;
  switch (n.kind) {
    case 'missingOne':
      return beginPlay({ ...s, notice: null }, n.leader!, 'missingSuit', out);
    case 'missingMany':
      return noticeAt(s, { kind: 'tapIntro', players: n.players }, out);
    case 'tapIntro':
    case 'tapTie':
      return startReactionTap(s, n.players, out);
    case 'tapResult':
      return beginPlay({ ...s, notice: null }, n.leader!, 'reactionTap', out);
  }
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
  if (end) return finishRound(endPeeks({ ...s2, takeRequests: [] }, out), end, out);
  return processTakes(s2, out);
}

/**
 * Take-cards requests: drop any that can no longer happen (a player is out,
 * or only two players hold cards). Between tricks, carry out the agreed ones,
 * oldest first. Requests made during a trick wait until it is over.
 */
function processTakes(s: Session, out: Out): Session {
  return tidyPeeks(processTakesOnce(s, out), out);
}

function processTakesOnce(s: Session, out: Out): Session {
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

/**
 * 9an.4 (2.38): Keep my cards and the wait before the round starts: network games only, which here means
 * waitForAll with at least two people. Single player and one phone are unchanged.
 */
export function keepOn(s: Session): boolean {
  return s.waitForAll && s.players.filter((p) => !p.computer).length >= 2;
}

/**
 * 9an.3 (2.38): watching a hand: the session's `waitForAll`
 * (network games and games against the computer), or one person with computer players. Not pass-and-play.
 */
export function peeksOn(s: Session): boolean {
  if (s.waitForAll) return true;
  const persons = s.players.filter((p) => !p.computer).length;
  return s.players.length > persons && persons === 1;
}

/** 9an.3: a watch ends by itself when the player being watched has no cards left (they went out). */
function tidyPeeks(s: Session, out: Out): Session {
  if (s.peeks.length === 0) return s;
  const keep = s.peeks.filter((p) => {
    if (handOf(s, p.target).length > 0) return true;
    out.emit(s, { type: 'peekStopped', viewer: p.viewer, target: p.target, by: null });
    return false;
  });
  return keep.length === s.peeks.length ? s : { ...s, peeks: keep };
}

/** 9an.3: the round ended, so every watch ends (the viewers' cards are no longer shown). */
function endPeeks(s: Session, out: Out): Session {
  for (const p of s.peeks) out.emit(s, { type: 'peekStopped', viewer: p.viewer, target: p.target, by: null });
  return s.peeks.length ? { ...s, peeks: [] } : s;
}

function finishRound(s: Session, end: RoundEnd, out: Out): Session {
  // 9an.8 (H-e): the people who stayed in finishing order, then the players removed this round (bottom places).
  // The round is scored for everyone who started it, so `n` is the starting count.
  const order = [...end.finishingOrder, ...s.removed];
  const n = order.length;
  const loser = end.loser ?? (order[n - 1] as PlayerId);
  const pauseCleared = { paused: false, pausedAt: null, pauseRequests: [] as PlayerId[] };
  const removedRecord = s.removed.length ? { removed: s.removed.slice() } : {};

  if (s.ultimateRound) {
    // Outside the score. Titles only.
    const losers = end.sharedSecondLast ? end.sharedSecondLast.slice() : [loser];
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
          ...removedRecord,
        },
      ],
    };
    return endSession(s2, s2.order.length <= 1 ? 'playersLeft' : 'ultimatePlayed', out);
  }

  const points = scoreRound(order, end.sharedSecondLast);
  const totals = addScores(s.scores, points);
  out.emit(s, { type: 'roundScored', round: s.round, ultimate: false, finishingOrder: order, points, totals });
  const s2: Session = {
    ...s,
    ...pauseCleared,
    phase: 'results',
    scores: totals,
    // 9an.8: the round's loser is the last player who held cards, never a removed player (H-e).
    previous: { winner: order[0] as PlayerId, loser },
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
        ...removedRecord,
      },
    ],
  };
  // 9an.8 (H-f): one player left: the round is scored, then the game ends. That player wins.
  if (s2.order.length <= 1) return endSession(s2, 'playersLeft', out);
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
export function finalStandings(s: Pick<Session, 'order' | 'scores' | 'ultimateLabels'> & { readonly gone?: readonly PlayerId[] }): {
  standings: PlayerId[];
  winners: PlayerId[];
  decidedBy: 'ultimate' | 'highestScore';
} {
  const labels = s.ultimateLabels;
  const byScore = s.order.slice().sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  const losers = labels?.losers ?? [];
  const winner = labels?.winner ?? null;
  const middle = byScore.filter((p) => p !== winner && !losers.includes(p));
  const stayed = [...(winner ? [winner] : []), ...middle, ...losers.filter((p) => p !== winner)];
  // 9an.8 (H-q7): removed players are listed below everyone who stayed, in the order they were removed.
  const standings = [...stayed, ...(s.gone ?? []).filter((p) => !stayed.includes(p))];
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

// ---------------------------------------------------------------------------
// Removing a player (9an.8, Part H; CODE.md 9an.8 H-a to H-h)
// ---------------------------------------------------------------------------

/** Why the host can't remove this player now, or null if they can (H-b). Network games only. */
export function removeAllowed(s: Session, by: PlayerId, player: PlayerId): string | null {
  if (by !== s.hostId) return 'Only the host can remove a player';
  if (player === s.hostId) return "The host can't remove themselves";
  if (s.gone.includes(player)) return `${nameOf(s, player)} was removed from the game`;
  if (!s.order.includes(player)) return 'Unknown player';
  if (s.players.find((p) => p.id === player)?.computer) return "Computer players can't be removed";
  if (s.phase === 'gameOver') return 'The session has ended';
  if (!keepOn(s)) return 'Removing a player is for network games';
  return null;
}

/** Cards that leave the game with a removed player: their hand, aside jokers and cards on the felt (H-b). */
function cardsWithPlayer(s: Session, p: PlayerId): number {
  if (!ROUND_PHASES.includes(s.phase)) return 0;
  const aside = s.play?.asideJokers?.[p]?.length ?? 0;
  const onFelt = s.play?.trick.plays.filter((x) => x.player === p).length ?? 0;
  return handOf(s, p).length + aside + onFelt;
}

/**
 * The host removed `p` (H-c). Common steps for every phase, then the phase's
 * own step: the cards leave the game, `p` leaves the table at once, and the
 * round goes on (or ends) without them.
 */
function removeFromGame(s: Session, p: PlayerId, rng: Rng, out: Out): Session {
  // Read before anything changes: whether p was part of the Reaction Tap or the notice.
  const involved = {
    tap: s.tap?.players.includes(p) ?? false,
    notice: s.notice !== null && (s.notice.players.includes(p) || s.notice.leader === p),
  };
  out.emit(s, { type: 'playerRemoved', player: p, cards: cardsWithPlayer(s, p) });
  let s1 = dropFromRound(s, p, out);
  s1 = fixPrevious(s1);
  s1 = votesAfterRemoval(s1, rng, out);
  if (s1.phase === 'gameOver') return s1;
  return phaseAfterRemoval(s1, p, involved, rng, out);
}

/**
 * H-c, common steps: p leaves `order` and `gone`; during a round they also
 * join `removed` (not once they are already out, and not on the results
 * screen). Requests, peeks, votes and readiness involving p are cleared.
 */
function dropFromRound(s: Session, p: PlayerId, out: Out): Session {
  const inRound = ROUND_PHASES.includes(s.phase);
  const alreadyOut = s.play?.finished.includes(p) ?? false;

  for (const r of s.takeRequests) {
    if (r.requester === p || r.target === p) {
      out.emit(s, { type: 'takeCancelled', requester: r.requester, target: r.target, reason: 'notPossible' });
    }
  }
  for (const pk of s.peeks) {
    if (pk.viewer === p || pk.target === p) out.emit(s, { type: 'peekStopped', viewer: pk.viewer, target: pk.target, by: null });
  }
  const hands: Record<PlayerId, readonly Card[]> = { ...s.hands };
  delete hands[p];
  // H-c.4: p's ballot is dropped. A ballot from someone no longer at the table must not decide anything.
  let vote = s.vote;
  if (vote && p in vote.ballots) {
    const ballots: Record<PlayerId, Ballot> = { ...vote.ballots };
    delete ballots[p];
    vote = { ...vote, ballots };
  }
  let tap = s.tap;
  if (tap) {
    const results: Record<PlayerId, TapEntry> = { ...tap.results };
    delete results[p];
    tap = { players: tap.players.filter((x) => x !== p), results };
  }
  // The rules engine removes p from the trick itself (removeFromPlay). Outside play the play state
  // only keeps the round's order for the results screen.
  const play = s.play && s.phase !== 'playing' ? { ...s.play, order: s.play.order.filter((x) => x !== p) } : s.play;

  return {
    ...s,
    order: s.order.filter((x) => x !== p),
    gone: [...s.gone, p],
    removed: inRound && !alreadyOut && s.phase !== 'results' ? [...s.removed, p] : s.removed,
    hands,
    play,
    takeRequests: s.takeRequests.filter((r) => r.requester !== p && r.target !== p),
    peeks: s.peeks.filter((pk) => pk.viewer !== p && pk.target !== p),
    kept: s.kept.filter((x) => x !== p),
    swapDone: s.swapDone.filter((x) => x !== p),
    handSeen: s.handSeen.filter((x) => x !== p),
    noticeSeen: s.noticeSeen.filter((x) => x !== p),
    ready: s.ready.filter((x) => x !== p),
    pauseRequests: s.pauseRequests.filter((x) => x !== p),
    vote,
    tap,
  };
}

/**
 * H-c.5: if p was the round's loser (next dealer) or winner (who picks the
 * leader), the job goes to the next player in that round's finishing order who
 * is still in: the winner's job to 2nd place, the dealer's job to the player
 * just above them. Only the last round's result is held here.
 */
function fixPrevious(s: Session): Session {
  if (!s.previous) return s;
  const stillIn = (x: PlayerId) => s.order.includes(x);
  const { winner, loser } = s.previous;
  if (stillIn(winner) && stillIn(loser)) return s;
  const fo = s.rounds.length ? s.rounds[s.rounds.length - 1]!.finishingOrder : [];
  let w = winner;
  let l = loser;
  if (!stillIn(winner)) w = fo.find((x) => stillIn(x)) ?? (s.order[0] as PlayerId);
  if (!stillIn(loser)) {
    const i = fo.indexOf(loser);
    let found: PlayerId | undefined;
    for (let k = i - 1; k >= 0 && found === undefined; k--) {
      if (stillIn(fo[k] as PlayerId)) found = fo[k] as PlayerId;
    }
    l = found ?? (s.order[s.order.length - 1] as PlayerId);
  }
  return { ...s, previous: { winner: w, loser: l } };
}

/** H-c.4: the vote with p's ballot dropped: decided if the rest are enough (as castVote). */
function votesAfterRemoval(s: Session, rng: Rng, out: Out): Session {
  const v = s.vote;
  if (!v || v.awaitingHost) return s;
  const everyone = Object.keys(v.ballots).length === s.order.length;
  const tally = tallyVote(v.ballots, s.order.length, everyone);
  if (tally === 'passed') return resolveVote(s, true, 'majority', rng, out);
  if (tally === 'failed') return resolveVote(s, false, 'majority', rng, out);
  if (tally === 'hostDecides') return needHost(s, out);
  return s;
}

/** The phase's own step after p's removal (H-c, by phase). */
function phaseAfterRemoval(
  s: Session,
  p: PlayerId,
  involved: { tap: boolean; notice: boolean },
  rng: Rng,
  out: Out,
): Session {
  if (s.phase === 'results') return s.order.length <= 1 ? endSession(s, 'playersLeft', out) : s;
  if (s.phase === 'playing') {
    // The rules engine takes p out of the trick, and ends the round if one player is left (H-d).
    return afterPlay(s, removeFromPlay(s.play!, p), out);
  }
  // Round running but one player left: the round is scored with no play, then the game ends (H-e, H-f).
  if (s.order.length <= 1) return endRoundWithoutPlay(s, out);

  switch (s.phase) {
    case 'dealing':
      return dealingAfterRemoval(s, p, out);
    case 'reshuffle':
      return s;
    case 'swap':
      // Stay in swap even at three to two: the hidden decks were set for three, and the swap still works (H-c).
      return afterSwapGate(s, out);
    case 'cardCheck':
      if (s.order.every((x) => s.handSeen.includes(x))) return decideLeaderStep(s, out);
      return s;
    case 'leadNotice':
      if (involved.notice) return redecideLeader(s, out);
      return advanceNoticeIfEveryoneSeen(s, out);
    case 'reactionTap':
      if (involved.tap) return redecideLeader(s, out);
      return completeTap(s, out);
    case 'chooseLeader':
      // The fixed previous winner now chooses (fixPrevious); nothing else to do.
      return s;
    default:
      return s;
  }
}

/** H-e: the round ends with one player left and no trick played. That player is the round's loser. */
function endRoundWithoutPlay(s: Session, out: Out): Session {
  const left = s.order[0] as PlayerId;
  const end: RoundEnd = { finishingOrder: [left], loser: left, sharedSecondLast: null, forfeitedBy: null };
  return finishRound({ ...s, deal: null, vote: null, tap: null, notice: null, noticeSeen: [] }, end, out);
}

/**
 * H-c dealing: p's seat leaves the deal (their cards already dealt go with them). If p was the
 * dealer, the rest of the deal goes out by itself at once (H-q6).
 */
function dealingAfterRemoval(s: Session, p: PlayerId, out: Out): Session {
  const before = s.deal as DealState;
  let deal = before.seats.includes(p) ? removeSeat(before, p) : before;
  if (s.dealer !== p) return afterDealStep({ ...s, deal }, out);
  const first = deal.nextSeat ?? seatAfter(before, p, deal);
  deal = autoDealStart(deal, first);
  return afterDealStep({ ...s, deal: autoDealAll(deal) }, out);
}

/** The next seat clockwise from `p` (in the deal before p left) that is still in the deal. */
function seatAfter(before: DealState, p: PlayerId, after: DealState): PlayerId {
  const n = before.seats.length;
  const i = before.seats.indexOf(p);
  if (i >= 0) {
    for (let k = 1; k < n; k++) {
      const cand = before.seats[(i + k) % n] as PlayerId;
      if (after.seats.includes(cand)) return cand;
    }
  }
  return after.seats[0] as PlayerId;
}

/** H-c swap: the swap gate, after a swap or a removal. Everyone left has swapped: on to the next step. */
function afterSwapGate(s: Session, out: Out): Session {
  if (!s.order.every((p) => s.swapDone.includes(p))) return s;
  // 2.20: with waitForAll, nobody leads until every phone has seen its new hand.
  if (s.waitForAll) return { ...s, phase: 'cardCheck', handSeen: [] };
  return decideLeaderStep(s, out);
}

/** H-c leadNotice: everyone left has tapped OK on the notice: the next step. */
function advanceNoticeIfEveryoneSeen(s: Session, out: Out): Session {
  const persons = s.order.filter((p) => !isComputer(s, p));
  if (!s.waitForAll || persons.length === 0 || !persons.every((p) => s.noticeSeen.includes(p))) return s;
  return advanceNotice({ ...s, noticeSeen: [] }, out);
}

/**
 * H-c leadNotice / reactionTap: someone involved in the decided leader left, so the leader is
 * decided again with the players who are left. Missing-suit pop-ups are not sent a second time.
 */
function redecideLeader(s: Session, out: Out): Session {
  const declared = new Set(
    s.log.filter((e) => e.round === s.round && e.event.type === 'missingSuitDeclared').map((e) => (e.event as { player: PlayerId }).player),
  );
  for (const m of missingSuitPlayers(s.order, s.hands)) {
    if (!declared.has(m.player)) out.emit(s, { type: 'missingSuitDeclared', player: m.player });
  }
  const base: Session = { ...s, notice: null, noticeSeen: [], tap: null };
  const d = decideLeader(roundSetup(base), base.hands);
  if (d.kind === 'leader') {
    if (d.reason === 'missingSuit' && showsNotice(base)) return noticeAt(base, { kind: 'missingOne', players: [d.leader], leader: d.leader }, out);
    return beginPlay(base, d.leader, d.reason, out);
  }
  if (d.kind === 'reactionTap') {
    if (showsNotice(base)) return noticeAt(base, { kind: 'missingMany', players: d.players }, out);
    return startReactionTap(base, d.players, out);
  }
  return { ...base, phase: 'chooseLeader' };
}

/**
 * The Reaction Tap, once every player in it has tapped: the slowest leads, or
 * a tie runs again. Used after a tap and after a removal (H-c).
 */
function completeTap(s: Session, out: Out): Session {
  const tap = s.tap;
  if (!tap || tap.players.length === 0) return s;
  const results = tap.results;
  if (!tap.players.every((p) => results[p])) return s;
  const outcome = resolveReactionTap(
    tap.players.map((p) => ({ player: p, ms: results[p]!.ms, falseStart: results[p]!.falseStart })),
  );
  if (outcome.kind === 'replay') {
    out.emit(s, { type: 'reactionTapReplay', players: outcome.players });
    if (showsNotice(s)) return noticeAt({ ...s, tap: null }, { kind: 'tapTie', players: outcome.players, times: results }, out);
    return { ...s, tap: { players: outcome.players, results: {} } };
  }
  if (showsNotice(s)) return noticeAt({ ...s, tap: null }, { kind: 'tapResult', players: tap.players, leader: outcome.slowest, times: results }, out);
  return beginPlay({ ...s, tap: null }, outcome.slowest, 'reactionTap', out);
}

/** Cards a player holds right now (before play: the dealt hand; during play: the play hand). */
export function handOf(s: Session, id: PlayerId): readonly Card[] {
  if (s.phase === 'dealing') return s.deal?.hands[id] ?? [];
  return s.hands[id] ?? [];
}
