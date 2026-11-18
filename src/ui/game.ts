/**
 * Game screens for pass-and-play (one phone). See CODE.md section 9c.
 *
 * The phone moves between three stages (storage.ts `GameStage`):
 * - table: the shared screen (dealing, round start, results). No hands shown.
 * - handoff: "Pass the phone to X". Public information only.
 * - hand: X's own cards, during play or when everyone looks at their cards.
 *
 * Every move goes through `send()`, which runs the session layer, turns the
 * events into pop-ups and the "last trick" record, and decides who should
 * hold the phone next.
 *
 * Slice 2: dealing (auto with animation, manual, switchable), trick play,
 * slaps, jokers, the final two, going-out and last-two pop-ups, winner picks
 * the leader, and a basic results screen. Slice 3 (roundstart.ts): votes,
 * the hidden swap and Reaction Tap.
 */

import catchPhrasesMd from '../content/catch-phrases.md';
import type { Card } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { applyAction, handOf } from '../session/session.ts';
import type { LeadNotice, PlayerId, Session, SessionAction, SessionEvent } from '../session/types.ts';
import { playerView, type PlayerView } from '../session/view.ts';
import { cardFace, cardFaceFromId, fanLayout, fitFan, hasFourAces, ordinal, shortLabel, sortHand, SUIT_NAME, SUIT_SYMBOL, trickFromPlay } from './cards.ts';
import { h, type Child } from './dom.ts';
import type { GameStage, LastTrick, SavedGame, TrickPlay } from './storage.ts';
import { getState, say, update, type Popup } from './store.ts';
import { saveFinishedGame } from './history.ts';
import { miniDisc, reshuffleStage, resetTap, roundStartHolder, roundStartScreen, voteAlertBody, voteOutcome, voteResultBody } from './roundstart.ts';
import { lockedSeats } from '../rules/deal.ts';
import { cardSound, eventSounds, setCalm, sfx } from '../audio/sfx.ts';
import { soundSettings } from '../audio/settings.ts';
import { icon, type IconName } from './icons.ts';
import { botsOnlyFor, botsTick, startFastForward, startSkip, stopFastForward } from './bots.ts';
import { fastForwardOn, hostIsSkipping, instantSkipping, skipNote, skipping } from '../ai/fastforward.ts';
import { anyoneBusy, reportMyBusy } from '../net/busy.ts';
import { hostBroadcast, joinSend, sendMessage, sendReaction } from './netplay.ts';
import { cleanMessage } from '../net/lobby.ts';
import { handH, roundTable, wastePile } from './table.ts';
import { joinNames } from '../session/names.ts';
import { gameLayout, type GameLayout } from './layout.ts';
import { forfeitLine } from './popuptext.ts';
import { watchAskCard, watchEyeButton, watchingBlock, watchPill, watchSheet } from './watch.ts';
import { netGameBody, netMenu } from './netscreens.ts';
import {
  askPausePanel, gameOverStage, netPauseButton, notesPanel, passOnButton, pauseButton, pausePanel, pauseRequestsBanner,
  pauseTick, resultsStage, takeButton, takeControls, takeHolder, takePrompts, takeStatus, targetButton, targetSheet,
} from './between.ts';

const rng = defaultRng();
const AUTO_DEAL_MS = 150;

export const CATCH_PHRASES: string[] = catchPhrasesMd
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('- '))
  .map((l) => l.slice(2).trim())
  .filter(Boolean);

/** The SLAP! pop-up closes by itself after this long. */
const SLAP_MS = 4000;
/** Every other pop-up closes by itself after this long (tap to skip). */
const POP_MS = 2400;
/** How long a pop-up stays up. */
function popupMs(p: Popup): number {
  if (p.kind === 'info' && p.ms) return p.ms;
  return p.kind === 'slap' || p.kind === 'haha' || p.kind === 'badboy' || p.kind === 'pathetic' ? SLAP_MS : p.kind === 'lastTwo' ? POP_MS + 600 : POP_MS;
}
/** "X leads" pop-up (who leads and any missing suits): long enough to read (user, 2026-11-13). */
const LEAD_MS = 6000;
/** A finished trick stays on the felt this long before its cards move. */
const TRICK_HOLD_MS = 700;
/** Cards sliding to the waste pile or into the slapped player's seat. */
const TRICK_FLY_MS = 480;
/** 9v.3: with Fast forward on, the end-of-trick animation runs at half its normal time (steps unchanged). */
function trickMs(ms: number): number {
  return fastForwardOn() ? ms / 2 : ms;
}
/** Shuffle animation before the deal (two riffles). */
const SHUFFLE_MS = 1700;

/**
 * End-of-trick animation (user, 2026-11-08): the finished trick stays on the
 * felt, then (after the SLAP! pop-up, if there was a slap) its cards slide to
 * the waste pile or into the slapped player's seat. Taps wait until it is done;
 * the other pop-ups and sounds come after it.
 */
interface TrickAnim {
  plays: TrickPlay[];
  slapped: PlayerId | null;
  slapPopup: Popup | null;
  step: 'hold' | 'wait' | 'fly';
  timer: number | null;
  flying: boolean;
  /** Events of the move that ended the trick: their sounds play when the animation is done. */
  after: readonly SessionEvent[];
  /** 2.34.6 (CODE.md 9ah.1): the round's last trick. It stays on the felt until the player taps. */
  final: boolean;
  /** The player tapped the final trick away. */
  tapped: boolean;
}
let trickAnim: TrickAnim | null = null;

/** True while a finished trick is still being shown or moved. */
export function trickAnimating(): boolean {
  return trickAnim !== null;
}

let shuffleUntil = 0;

/** Shuffle animation and sound before the deal (game start, new round, after a reshuffle vote). */
export function startShuffle(): void {
  shuffleUntil = Date.now() + SHUFFLE_MS;
  sfx('shuffle');
  sfx('shuffle', 750);
  window.setTimeout(() => { if (getState().screen === 'game') update({}); else afterRender(); }, SHUFFLE_MS + 30);
}

export function shuffling(): boolean {
  return Date.now() < shuffleUntil;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The trick was started with a joker (or jokers) and nobody has played a normal card yet. */
export function jokerLed(s: Session): boolean {
  const t = s.play?.trick;
  return !!t && t.acted.length > 0 && t.plays.length === 0;
}

/**
 * Final two: would playing a joker now hand the other player the win?
 * Uses only what everyone can see (card counts), never the other hand:
 * - leading, and the other player holds one card (a single card is always
 *   normal: nobody holds only jokers), so they can play it unopposed;
 * - the other player has just played their last card in this trick.
 */
export function jokerGivesWin(s: Session, me: PlayerId): PlayerId | null {
  const play = s.play;
  if (!play || play.turn !== me) return null;
  const t = play.trick;
  if (t.participants.length !== 2 || !t.participants.includes(me)) return null;
  const other = t.participants.find((p) => p !== me)!;
  const count = play.hands[other]?.length ?? 0;
  const otherActed = t.acted.includes(other);
  if (!otherActed && t.acted.length === 0 && count === 1) return other;
  if (otherActed && t.plays.some((x) => x.player === other) && count === 0) return other;
  return null;
}

export function nameOf(s: Session, id: PlayerId | null | undefined): string {
  if (!id) return '';
  return s.players.find((p) => p.id === id)?.sessionName ?? id;
}

export function nextClockwise(s: Session, id: PlayerId): PlayerId {
  const i = s.order.indexOf(id);
  return s.order[(i + 1) % s.order.length]!;
}

/** Who must hold the phone during play: the player choosing in the final two, or whose turn it is. */
export function actorOf(s: Session): PlayerId | null {
  if (s.phase !== 'playing' || !s.play) return null;
  return s.play.pendingFinalTwo ?? s.play.turn;
}

/**
 * The one player this phone shows (its own seat): a network game's player, or
 * the person in single player against the computer (CODE.md 9m.6). Null when
 * the phone shows the whole table (pass-and-play with one phone).
 */
export function ownSeat(g: SavedGame): PlayerId | null {
  return g.net?.me ?? g.bots?.me ?? null;
}

/** Runs the game's moves on this phone: everything except a joining network phone. */
export function runsSession(g: SavedGame): boolean {
  return !g.net || g.net.role === 'host';
}

/** This phone's player is the host (network game or single player). */
export function isHostSeat(g: SavedGame): boolean {
  return g.net ? g.net.role === 'host' : ownSeat(g) === g.session.hostId;
}

export function publicView(s: Session): PlayerView {
  // Any player's view has the same public parts. The host's is used for table
  // screens; a network phone uses its own (its copy only has its own hand).
  const g = getState().game;
  const me = g ? ownSeat(g) : null;
  return playerView(s, me && s.order.includes(me) ? me : s.hostId);
}

/**
 * Redraws rebuild the screen, so entry animations would replay on every tap.
 * These remember what was last shown, so only new things animate.
 */
let shownHandKey = '';
let shownTrickCount = 0;

// ---------------------------------------------------------------------------
// Sending actions
// ---------------------------------------------------------------------------

/** For the deal animation: the seat that should receive a flying card after the next draw. */
let pendingFly: PlayerId | null = null;

/**
 * Run actions through the session layer. All or nothing: if one is not
 * allowed, nothing changes and the reason is shown.
 */
export function send(actions: readonly SessionAction[], opts: SendOpts = {}): boolean {
  const g = getState().game;
  if (!g) return false;
  // Network game, joining phone: the host runs the move and sends the result back.
  if (g.net?.role === 'join') return joinSend(actions);
  const why = runActions(actions, { ...opts, mine: true });
  if (why) {
    sfx('notAllowed');
    say(why);
    return false;
  }
  return true;
}

type SendOpts = {
  stage?: GameStage;
  holder?: PlayerId;
  /** The move was made on this phone (so its raised card and "tap again" are done with). */
  mine?: boolean;
};

/**
 * Run moves on this phone (pass-and-play, or the host's phone in a network
 * game, including moves sent by other phones). Returns why they weren't
 * allowed, or null. The host then sends every other phone its copy.
 */
export function runActions(actions: readonly SessionAction[], opts: SendOpts = {}): string | null {
  const g = getState().game;
  if (!g) return 'No game.';
  let session = g.session;
  const events: SessionEvent[] = [];
  try {
    for (const a of actions) {
      const r = applyAction(session, a, rng);
      session = r.session;
      events.push(...r.events);
    }
  } catch (e) {
    return e instanceof Error ? e.message : 'Not allowed.';
  }
  absorb(g, session, events, opts);
  if (g.net?.role === 'host') hostBroadcast(session, events);
  return null;
}

/** Network game, joining phone: the host sent the game after a move. */
export function receive(session: Session, events: readonly SessionEvent[]): void {
  const g = getState().game;
  if (!g) return;
  absorb(g, session, events, {});
}

/** Seat that just got one card dealt (for the flying card), from the hand counts. */
function dealtTo(before: Session, after: Session): { seat: PlayerId | null; any: boolean } {
  if (before.phase !== 'dealing') return { seat: null, any: false };
  const up = after.order.filter((p) => handOf(after, p).length > handOf(before, p).length);
  return { seat: up.length === 1 ? up[0]! : null, any: up.length > 0 };
}

/**
 * After a move: the last-trick record, private notes, who holds the phone,
 * saving a finished game, pop-ups, sounds and animations, then redraw.
 */
/**
 * 9an.5 (E-a): this phone's busy state, the same rule the game screen reports to the host. An ack
 * must send this, or a phone that is auto-closing pop-ups could leave the host waiting for a change
 * that never comes.
 */
export function phoneBusyNow(): boolean {
  return getState().popups.length > 0 && !autoClosing() && !(trickAnim && trickAnim.step !== 'wait');
}

/** 9an.5 (E-f): this phone took moves while pop-ups were still open; it catches up calmly. */
let catchingUp = false;

function absorb(g: SavedGame, session: Session, events: readonly SessionEvent[], opts: SendOpts): void {
  // 9an.5 (E-f): pop-ups already open before these moves means a catch-up: calm sounds, a fade after.
  if (getState().popups.length > 0) { catchingUp = true; setCalm(true); }
  const dealt = dealtTo(g.session, session);
  if (dealt.seat && !pendingFly) pendingFly = dealt.seat;

  // Last trick record.
  let trickLog = g.trickLog.slice();
  let lastTrick: LastTrick | null = g.lastTrick;
  let slap: LastTrick['slap'] = null;
  let finished: { plays: TrickPlay[]; slapped: PlayerId | null } | null = null;
  for (const e of events) {
    if (e.type === 'roundStarted') { trickLog = []; lastTrick = null; }
    if (e.type === 'cardPlayed') trickLog.push({ player: e.player, card: e.card.id, label: shortLabel(e.card) });
    if (e.type === 'jokerPlayed') trickLog.push({ player: e.player, card: 'joker', label: 'Joker' });
    if (e.type === 'slapped') slap = { slapper: e.slapper, slapped: e.slapped };
    if (e.type === 'trickResolved') {
      if (trickLog.length) {
        lastTrick = { plays: trickLog, slap, nextLeader: e.nextLeader };
        finished = { plays: trickLog, slapped: slap?.slapped ?? null };
      }
      trickLog = [];
      slap = null;
    }
    // 2.34.6 (CODE.md 9ah.1): the final-two end, a forfeit mid-trick and "both went out" end the round
    // with no trickResolved: the cards on the felt are still the last trick, so show it.
    if (e.type === 'roundEnded' && trickLog.length) {
      lastTrick = { plays: trickLog, slap, nextLeader: null };
      finished = { plays: trickLog, slapped: slap?.slapped ?? null };
      trickLog = [];
      slap = null;
    }
  }
  const roundOver = events.some((e) => e.type === 'roundEnded');

  // Private notes (take-cards answers): only the requester sees them, on their own hand screen.
  const notes: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(g.notes ?? {})) notes[k] = v.slice();
  const note = (p: PlayerId, text: string): void => { (notes[p] ??= []).push(text); };
  const taken = new Set(events.filter((e) => e.type === 'cardsTaken').map((e) => e.type === 'cardsTaken' ? `${e.requester}>${e.target}` : ''));
  for (const e of events) {
    if (e.type === 'roundStarted') for (const k of Object.keys(notes)) notes[k] = [];
    if (e.type === 'takeAnswered' && !e.accepted) {
      const gaveTo = events.find((x) => x.type === 'cardsTaken' && x.target === e.target);
      note(e.requester, gaveTo && gaveTo.type === 'cardsTaken'
        ? `${nameOf(session, e.target)} gave their cards to ${nameOf(session, gaveTo.requester)} instead.`
        : `${nameOf(session, e.target)} said no to your take-cards request.`);
    }
    if (e.type === 'takeAnswered' && e.accepted && !taken.has(`${e.requester}>${e.target}`)) {
      note(e.requester, `${nameOf(session, e.target)} agreed. You take their cards when this trick is over.`);
    }
    if (e.type === 'takeCancelled' && e.reason === 'notPossible') {
      note(e.requester, `Your request for ${nameOf(session, e.target)}'s cards was cancelled: it can't happen any more.`);
    }
  }

  // Who holds the phone next.
  let stage: GameStage = opts.stage ?? 'table';
  let holder = opts.holder ?? g.holder;
  const seat = ownSeat(g);
  if (seat) {
    // Network game or single player: this phone always shows its own player.
    stage = 'hand';
    holder = seat;
  } else if (!opts.stage) {
    const rs = roundStartHolder(session);
    const next = rs ?? takeHolder(session) ?? actorOf(session);
    if (next) {
      // During play the same player keeps their cards up; private round-start steps always pass the phone.
      stage = !rs && session.phase === 'playing' && g.stage === 'hand' && next === g.holder ? 'hand' : 'handoff';
      holder = next;
    }
  }

  // 9an.6 (F-1, 2.38): the session is the truth for the trick in progress; events only drive the animation.
  // A card missed in a gap (a full update has no events) still shows. Not while a trick is resolving.
  if (session.play && session.phase === 'playing' && !events.some((e) => e.type === 'trickResolved')) {
    const want = trickFromPlay(session.play.trick.plays, trickLog.filter((t) => t.card === 'joker'));
    const same = want.length === trickLog.length && want.every((w, i) => w.player === trickLog[i]?.player && w.card === trickLog[i]?.card);
    if (!same) trickLog = want;
  }

  // Game over: save the game record and add it to the profiles on this phone (once).
  let recordId = g.recordId;
  if (session.ended && !recordId && events.some((e) => e.type === 'sessionEnded')) {
    const saved = saveFinishedGame(session, seat ?? undefined);
    if (saved.ok) recordId = saved.recordId;
  }

  // 9v.4 / 2.32.1: while Fast forward or Skip runs, only the round-over pop-up (and the game-over one) is shown.
  // The round-over one names the round's winner (1st in the finishing order).
  const quiet = skipping() || instantSkipping();
  const fresh = popupsFor(session, events, seat ?? null)
    // 9ai.4: the asker doesn't get the vote alert (they already said YES).
    .filter((p) => !(p.kind === 'voteAlert' && p.by === seat))
    .filter((p) => !quiet || p.kind === 'lastTwo' || (p.kind === 'slap' && p.over !== undefined))
    .map((p) => (quiet && p.kind === 'lastTwo' && !p.shared ? { ...p, winner: p.order[0] } : p));
  const popups = [...getState().popups, ...fresh];

  // Sound effects and animations for what just happened (PROJECT.md 12b). 2.32.1: none for an instant Skip.
  if (!instantSkipping()) {
    if (dealt.any) sfx('deal');
    cardSound(events);
    // Network game: the host moved on (next round, end of the game) before this phone tapped the last trick.
    if (!finished && trickAnim?.final && events.some((e) => e.type === 'roundStarted' || e.type === 'sessionEnded')) {
      if (trickAnim.timer) window.clearTimeout(trickAnim.timer);
      trickAnim = null;
      shownTrickCount = 0;
    }
    if (finished) {
      if (trickAnim?.timer) window.clearTimeout(trickAnim.timer);
      trickAnim = {
        plays: finished.plays, slapped: finished.slapped, step: 'hold', timer: null, flying: false, after: events,
        slapPopup: finished.slapped ? fresh.find((p) => p.kind === 'slap') ?? null : null,
        final: roundOver, tapped: false,
      };
    } else {
      eventSounds(events, true);
    }
    if (events.some((e) => e.type === 'reshuffled' || e.type === 'roundStarted')) startShuffle();
  }

  // Network game: a move by another phone keeps this phone's raised card (drawn
  // only if still playable) and any "tap again" it is in the middle of.
  // A pause (any phone) drops a Reaction Tap under way and closes open panels (2.5).
  const pausedNow = events.some((e) => e.type === 'paused');
  if (pausedNow) resetTap();
  const keep = !!seat && !opts.mine;
  update({
    game: {
      session, stage, holder, trickLog, lastTrick, notes, recordId,
      ...(g.net ? { net: g.net } : {}), ...(g.bots ? { bots: g.bots } : {}),
    },
    popups,
    ...(keep ? (pausedNow ? { armed: null } : {}) : { selected: null, armed: null }),
  });
}

/**
 * `seat`: the player whose phone this is (network game or single player), or null on one shared phone.
 * On one phone the take-cards requests stay private (9an.1), so they make no pop-up here.
 */
function popupsFor(s: Session, events: readonly SessionEvent[], seat: PlayerId | null): Popup[] {
  const out: Popup[] = [];
  const end = events.find((e) => e.type === 'roundEnded');
  const lastTwo = end && end.type === 'roundEnded' ? end.finishingOrder.slice(-2) : [];
  for (const e of events) {
    switch (e.type) {
      case 'takeRequested':
        // 9an.1 item 9: everyone who isn't the asker or the asked sees the ask.
        if (seat && seat !== e.requester && seat !== e.target) out.push({ kind: 'take', requester: e.requester, target: e.target, answer: null });
        break;
      case 'peekAnswered':
        // 9an.3 (2.38, item 10): a refused watch is a pop-up for the player who asked, only.
        if (seat && seat === e.viewer && !e.accepted) out.push({ kind: 'info', icon: 'eye', title: `${nameOf(s, e.target)} said no`, text: '' });
        break;
      case 'takeAnswered':
        // 9an.1 item 9: the answer, on every phone with a seat (the asked player's phone included).
        if (seat) {
          const gone = events.find((x) => x.type === 'playerOut' && x.player === e.target);
          out.push({
            kind: 'take', requester: e.requester, target: e.target,
            answer: { accepted: e.accepted, place: e.accepted && gone?.type === 'playerOut' ? gone.place : null },
          });
        }
        break;
      case 'slapped':
        // 2.21: a slap that ends the round has no next trick, so no pick-up line (the round is over, the game may be too).
        out.push({ kind: 'slap', slapper: e.slapper, slapped: e.slapped, cards: e.cardsPickedUp,
          over: s.phase === 'gameOver' ? 'game' : events.some((x) => x.type === 'roundEnded') ? 'round' : undefined });
        break;
      case 'jokerPlayed': {
        // Every card in the trick was a joker: missed round.
        const resolved = events.find((x) => x.type === 'trickResolved');
        if (resolved && resolved.type === 'trickResolved' && resolved.nextLeader
          && s.play?.trick.participants.length === 2 && !events.some((x) => x.type === 'cardPlayed')) {
          out.push({
            kind: 'info', icon: 'joker', title: 'Missed round',
            text: `Two jokers. ${nameOf(s, resolved.nextLeader)} leads again.`,
          });
          break;
        }
        out.push({
          kind: 'info', icon: 'joker', title: 'Joker',
          text: `${nameOf(s, e.player)}${e.asLeader && jokerLed(s) && s.play?.turn ? ` · same trick, ${nameOf(s, s.play.turn)} plays any card` : ''}`,
        });
        break;
      }
      case 'playerOut':
        if (!lastTwo.includes(e.player)) out.push({ kind: 'out', player: e.player, place: e.place });
        break;
      case 'playerRemoved':
        // 9an.8 (H-i, item 8): every other phone sees it. The removed player's phone gets its own screen instead.
        if (seat && seat !== e.player) out.push({ kind: 'info', icon: 'x', title: `${nameOf(s, e.player)} was removed by the host`, text: '' });
        break;
      case 'forfeited':
        // 2.34.6: a forfeit is shown to everyone, in capitals.
        out.push({ kind: 'pathetic', player: e.player });
        break;
      case 'finalTwoChoice': {
        const v = publicView(s);
        const laugher = v.players.find((p) => p.place === null && p.id !== e.player)?.id;
        if (laugher) out.push({ kind: 'haha', laugher, loser: e.player });
        break;
      }
      case 'wastePilePickedUp':
        out.push({
          kind: 'info', icon: 'take', title: 'Picked up',
          text: `${nameOf(s, e.player)} · ${e.cards} cards · leads`,
        });
        break;
      case 'roundEnded':
        out.push({ kind: 'lastTwo', order: e.finishingOrder, shared: e.sharedSecondLast, forfeitedBy: e.forfeitedBy });
        break;
      case 'voteCalled': {
        // 9ai.4 (2.36): the alert; the asker's own phone doesn't get it (filtered where the seat is known).
        if (!e.by) break;
        out.push({ kind: 'voteAlert', by: e.by, vote: e.kind, value: e.value, dealer: s.dealer, twoPlayers: s.order.length === 2 });
        break;
      }
      case 'drawAtEnd':
        out.push({
          kind: 'info', icon: 'equal', title: 'It\'s a draw',
          text: `${e.players.map((x) => nameOf(s, x)).join(' and ')} · Ultimate Round vote`,
        });
        break;
      case 'drawCoward':
        out.push({
          kind: 'info', icon: 'flag', title: 'No one\'s a winner! Coward!',
          text: 'One last chance: Ultimate Round?',
        });
        break;
      case 'voteNeedsHost':
        // 9aj.3 (2.36): the words say it is a tie, and who decides.
        out.push({ kind: 'info', icon: 'equal', title: 'No majority', text: `It's a tie · ${nameOf(s, s.hostId)} decides` });
        break;
      case 'voteResolved':
        out.push({ kind: 'vote', decidedBy: s.order.length === 2 ? 'both' : e.decidedBy, result: e.result, text: voteOutcome(s, e.kind, e.result, e.value), kindOf: e.kind, value: e.value, ballots: e.ballots ?? {} });
        break;
      case 'jokersDiscarded':
        out.push({
          kind: 'info', icon: 'joker', title: 'Jokers out',
          text: `${nameOf(s, e.player)} · last card played, ${e.count === 1 ? 'joker' : `${e.count} jokers`} thrown away`,
        });
        break;
      case 'targetReached':
        out.push({
          kind: 'info', icon: 'target', title: 'Target reached',
          text: `${e.players.map((x) => nameOf(s, x)).join(' and ')} · ${e.target} points · Ultimate Round vote`,
        });
        break;
      case 'cardsTaken':
        // 9an.1: with a seat, the answer pop-up above says it (one pop-up per take); one phone keeps this one.
        if (!seat) out.push({
          kind: 'info', icon: 'take', title: 'Cards taken',
          text: `${nameOf(s, e.requester)} took ${nameOf(s, e.target)}'s ${e.count} cards`,
        });
        break;
      case 'pauseDeclined':
        out.push({ kind: 'info', icon: 'play', title: 'No pause', text: `${nameOf(s, s.hostId)} said no to ${nameOf(s, e.requester)}` });
        break;
      case 'resumed':
        if (e.reason === 'timeLimit') out.push({ kind: 'info', icon: 'play', title: 'Pause over', text: 'Time limit reached' });
        break;
      case 'reactionTapReplay':
        // 2.30: the tie is a notice now (CODE.md 9y.3), so no pop-up for a shown notice.
        break;
      case 'leaderChosen': {
        // 2.30: "X leads" for a missing suit or Reaction Tap is a notice now, so no six-second pop-up.
        if (e.reason === 'missingSuit' || e.reason === 'reactionTap') break;
        const who = nameOf(s, e.leader);
        // Secret suits (2026-11-13): the pop-up never says which suit is missing.
        const why = e.reason === 'host' ? 'Host leads round 1' : '';
        out.push({ kind: 'info', icon: 'play', title: `${who} leads`, text: why, ms: LEAD_MS });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * 2.34.6 (CODE.md 9ah.3): "You are the Ultimate Badboy!!" Each phone works it out from the hand it
 * shows (its own seat, or on one phone the player holding it on their private hand screen), after the
 * deal and after the swap, once per deal per player. Nothing is logged or sent.
 */
const badboyShown = new Set<string>();
const BADBOY_PHASES: readonly string[] = ['reshuffle', 'swap', 'cardCheck', 'leadNotice', 'reactionTap', 'chooseLeader'];

function badboyCheck(g: SavedGame): void {
  const s = g.session;
  if (!BADBOY_PHASES.includes(s.phase)) return;
  const who = ownSeat(g) ?? (g.stage === 'hand' ? g.holder : null);
  if (!who || s.players.find((p) => p.id === who)?.computer) return;
  if (!hasFourAces(playerView(s, who).myHand)) return;
  let fromRound = 0;
  s.log.forEach((e, i) => { if (e.event.type === 'roundStarted') fromRound = i; });
  const dealIndex = s.log.slice(fromRound).filter((e) => e.event.type === 'dealComplete').length;
  const key = `${s.round}:${dealIndex}:${who}`;
  if (badboyShown.has(key)) return;
  badboyShown.add(key);
  window.setTimeout(() => update({ popups: [...getState().popups, { kind: 'badboy', player: who }] }), 0);
}

export function gameScreen(g: SavedGame): HTMLElement {
  if (g.stage !== 'hand') shownHandKey = '';
  badboyCheck(g);
  const s = g.session;
  const st = getState();
  let body: Child;
  const rs = trickAnim || ownSeat(g) ? null : roundStartScreen(g);
  if (trickAnim) {
    body = trickFinishStage(g, trickAnim);
  } else if (ownSeat(g)) {
    body = netGameBody(g);
  } else if (rs) {
    body = rs;
  } else if (s.phase === 'playing') {
    body = g.stage === 'hand' ? playHandStage(g) : playHandoffStage(g);
  } else if (g.stage === 'hand' && s.phase !== 'dealing' && s.phase !== 'results' && s.phase !== 'gameOver') {
    body = lookHandStage(g);
  } else if (g.stage === 'handoff' && s.phase !== 'dealing' && s.phase !== 'results' && s.phase !== 'gameOver') {
    body = lookHandoffStage(g);
  } else {
    body = tableStage(g);
  }
  const label: Child = s.phase === 'gameOver' ? 'End'
    : s.ultimateRound && s.phase !== 'results' ? icon('bolt')  // the word would widen the chip and squeeze the bar (2.10)
    : `R${s.round}`;
  // 2.29: a fixed game screen (no scrolling) when the stage is framed; results and game over still scroll.
  // Stages that are not framed (results, round start screens not yet framed) scroll inside their own
  // box, so the page itself never scrolls during a game (2.29, CODE.md 9x.2).
  const framed = hasFrame(body);
  // 2.31 (CODE.md 9aa Part A): the scrolling box is named, so a redraw keeps its place (app.ts render).
  const content: Child = framed ? body : h('div', { class: 'game-scroll', 'data-scroll': `game-${s.phase}-${s.round}` }, body);
  return h('main', { class: framed ? 'screen game fixed framed' : 'screen game fixed' },
    h('div', { class: st.menuOpen ? 'game-bar menu-open' : 'game-bar' },
      // 9ak.1 (2.37): while the menu is open the button reads as a close (×) and stays above the menu layer.
      h('button', {
        class: st.menuOpen ? 'icon-btn menu-btn open' : 'icon-btn menu-btn',
        'aria-label': st.menuOpen ? 'Close menu' : 'Menu',
        'aria-expanded': st.menuOpen ? 'true' : 'false',
        onclick: () => update({ menuOpen: !st.menuOpen, armed: null }),
      }, icon(st.menuOpen ? 'x' : 'menu')),
      roundChip(s, label),
      ownSeat(g) ? netPauseButton(g) : pauseButton(s),
      // 9ak.1 (2.37): once a target is agreed, a gold "First to N" chip sits right after the pause button.
      s.target !== null ? targetChip(s) : null,
      // 9aj.5 (2.36): the target score, proposed from here (gold ring); it never shares the bar with Take cards.
      targetButton(s),
      // 2.31 (CODE.md 9aa Part C item 3): the jokers and hidden-deck chips sit in the top bar while dealing.
      s.phase === 'dealing' ? dealChips(s) : null,
      takeButton(g),
    ),
    // 9al.1 (2.37.1): the round note floats over the table; it never pushes the table down.
    st.armed === 'roundinfo' ? noteLayer(s) : null,
    // 9ak.1 (2.37): the menu floats as a card over the table; a tap outside it closes it.
    st.menuOpen ? menuLayer(g.net ? netMenu(g) : gameMenu(g)) : null,
    st.lastOpen && s.phase !== 'gameOver' && g.lastTrick ? lastSheet(s, g.lastTrick) : null,
    targetSheet(s, { me: ownSeat(g) ?? undefined }),
    fastBanner(g),
    pausePanel(g),
    askPausePanel(g),
    pauseRequestsBanner(g),
    content,
  );
}

/**
 * 9aj.5 (2.36): the round chip. Once a target is agreed a small gold badge shows it on the chip.
 * A tap opens the round's note under the bar ("Round 3 · first to 10 points").
 */
function roundChip(s: Session, label: Child): HTMLElement {
  const open = getState().armed === 'roundinfo';
  const word = s.phase === 'gameOver' ? 'Game over' : s.ultimateRound && s.phase !== 'results' ? 'Ultimate Round' : `Round ${s.round}`;
  // 9ak.1 (2.37): the round chip no longer carries a target badge; the target chip sits beside the bar's buttons.
  return h('button', {
    class: open ? 'round-chip on' : 'round-chip',
    'aria-label': s.target !== null && s.phase !== 'gameOver' ? `${word}, first to ${s.target} points` : word,
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : 'roundinfo', menuOpen: false }),
  }, label);
}

/**
 * 9ak.1 (2.37): the gold "First to 10" chip in the top bar, once a target is agreed. A tap shows the round note.
 * On narrow phones the word "First to" hides (CSS `.tc-word`), so the chip keeps the number.
 */
function targetChip(s: Session): HTMLElement {
  const open = getState().armed === 'roundinfo';
  return h('button', {
    class: open ? 'target-chip on' : 'target-chip',
    'aria-label': `First to ${s.target} points`,
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : 'roundinfo', menuOpen: false }),
  }, icon('target'), h('span', { class: 'target-chip-text' }, h('span', { class: 'tc-word' }, 'First to '), String(s.target)));
}

/**
 * 9ak.1 (2.37): the menu as a floating card. The layer dims the table; a tap on the dim closes the menu.
 * Landscape (the rail, 9ak.6) moves the card to the right of the rail (CSS).
 */
function menuLayer(menu: HTMLElement): HTMLElement {
  return h('div', {
    class: 'menu-layer',
    onclick: (e: Event) => { if (e.target === e.currentTarget) update({ menuOpen: false, armed: null }); },
  }, menu);
}

/**
 * 9aj.5 (2.36): the small cream note under the bar; any tap closes it.
 * 9al.1 (2.37.1): it floats in a transparent full-screen layer (no dim), so the table never moves.
 */
function noteLayer(s: Session): HTMLElement {
  return h('div', { class: 'note-layer', onclick: () => update({ armed: null }) },
    h('div', { class: 'round-note' },
      `Round ${s.round} · ${s.target !== null ? `first to ${s.target} points` : 'no target'}`));
}

/** 9v.1: the Fast forward / Skip items, shown only while the game waits on computer players. */
export function fastForwardMenuItems(g: SavedGame): Child[] {
  if (!g.bots || !botsOnlyFor(g) || instantSkipping()) return [];
  return [
    fastForwardOn() ? null : h('button', { class: 'secondary', onclick: () => { update({ menuOpen: false }); startFastForward(); } }, 'Fast forward'),
    h('button', { class: 'secondary', onclick: () => { update({ menuOpen: false }); startSkip(); } }, 'Skip to end of round'),
  ];
}

/**
 * 2.31 (CODE.md 9aa Part B): with no cards left, Fast forward and Skip sit where the cards were.
 * Only the host in a network game (9v.5). While Fast forward is on the first button says Stop
 * fast forward; while a skip runs, only Stop. The ☰ menu keeps its items as before.
 */
function handFastItems(g: SavedGame): Child[] {
  if (g.net && !isHostSeat(g)) return [];
  if (instantSkipping() || fastForwardOn()) return []; // 2.32.2: while Fast forward is on, the bottom Stop button is the only control
  if (!g.bots || !botsOnlyFor(g)) return [];
  return [
    h('button', { class: 'secondary', onclick: () => startFastForward() }, 'Fast forward'),
    h('button', { class: 'secondary', onclick: () => startSkip() }, 'Skip to end of round'),
  ];
}

/**
 * 2.31 (CODE.md 9aa Part C item 3): the jokers chip and the hidden-deck chip, in the top bar while dealing.
 * Both are short (a number beside the icon) so they fit on a 320 px phone.
 */
function dealChips(s: Session): Child {
  return [
    h('span', { class: s.jokerRuleEnabled ? 'chip-info bar-chip gold' : 'chip-info bar-chip', 'aria-label': s.jokerRuleEnabled ? `${s.jokerTotal} jokers` : 'No jokers' },
      icon('joker'), s.jokerRuleEnabled ? String(s.jokerTotal) : '0'),
    s.order.length <= 3
      ? h('button', { class: 'chip-info bar-chip', 'aria-label': `${s.order.length === 2 ? 2 : 1} hidden ${s.order.length === 2 ? 'decks' : 'deck'}: what is this?`, onclick: () => update({ rulesOpen: true, rulesTopic: 'Hidden decks' }) },
        icon('eyeoff'), String(s.order.length === 2 ? 2 : 1))
      : null,
  ];
}

/** 9v.1: the banner under the top bar while Fast forward or a skip runs, with Stop. */
function fastBanner(g: SavedGame): HTMLElement | null {
  if (g.net && g.net.role === 'join') {
    // 9v.5: a joining phone sees one line while the host's phone is skipping.
    return hostIsSkipping() ? h('div', { class: 'fast-banner', role: 'status' }, h('span', {}, 'Host is skipping to the end')) : null;
  }
  const note = skipNote();
  // 2.32.1: the Stop button lives only at the bottom, so the banner is text only.
  if (fastForwardOn()) return h('div', { class: 'fast-banner', role: 'status' }, h('span', {}, 'Fast forward on'));
  return note ? h('div', { class: 'fast-banner', role: 'status' }, h('span', {}, note)) : null;
}

function gameMenu(g: SavedGame): HTMLElement {
  const armed = getState().armed === 'endgame';
  return h('div', { class: 'panel menu' },
    ...fastForwardMenuItems(g),
    h('button', { class: 'secondary', onclick: () => update({ screen: 'home', menuOpen: false }) }, 'Home (game is kept)'),
    h('button', {
      class: armed ? 'danger' : 'secondary',
      onclick: () => {
        if (!armed) { update({ armed: 'endgame' }); return; }
        update({ game: null, screen: 'home', menuOpen: false, armed: null, popups: [] });
      },
    }, armed ? 'Tap again to end the game' : 'End this game'),
  );
}

// ---------------------------------------------------------------------------
// Table pieces (public information only)
// ---------------------------------------------------------------------------

export function seatStrip(s: Session, v: PlayerView, opts: { highlight?: PlayerId | null; onTap?: (id: PlayerId) => void; tapLabel?: string; disabled?: readonly PlayerId[] } = {}): HTMLElement {
  return h('div', { class: 'seat-strip' }, s.order.map((id) => {
    const p = v.players.find((x) => x.id === id)!;
    const out = p.place !== null;
    const cls = ['seat-chip', id === opts.highlight ? 'turn' : '', out ? 'out' : '', opts.onTap ? 'tappable' : ''].join(' ');
    const inner: Child[] = [
      h('span', { class: 'seat-name' }, p.sessionName),
      h('span', { class: 'seat-count' }, out ? `${ordinal(p.place!)}` : [String(p.cardCount), h('span', { class: 'mini-back', 'aria-hidden': 'true' })]),
      id === s.dealer && s.phase === 'dealing' ? h('span', { class: 'seat-tag' }, 'Deals') : null,
      p.isHost ? h('span', { class: 'seat-host', 'aria-label': 'Host' }, '★') : null,
    ];
    return opts.onTap
      ? h('button', { class: cls, 'data-seat': id, disabled: opts.disabled?.includes(id) ?? false, 'aria-label': `${opts.tapLabel ?? ''} ${p.sessionName}`.trim(), onclick: () => opts.onTap!(id) }, inner)
      : h('div', { class: cls, 'data-seat': id }, inner);
  }));
}

/** Who sits at the bottom of the table: this phone's player, or (one phone) whoever holds it. */
function bottomSeat(g: SavedGame, holder: PlayerId): PlayerId {
  return ownSeat(g) ?? holder;
}

/**
 * The table during play: players around it and this trick's cards in front of
 * them. The last trick is a small stack in the felt's corner (CODE.md 9x.2 rule 3).
 */
function trickArea(s: Session, g: SavedGame, v: PlayerView, bottom: PlayerId, highlight: PlayerId | null, lay: GameLayout, meLabel?: Child): Child {
  const plays = g.trickLog;
  const table = roundTable(s, v, {
    bottom: bottomSeat(g, bottom),
    highlight,
    meLabel,
    plays,
    newFrom: shownTrickCount,
    waste: wastePile(v.wastePileCount),
    ledSuit: v.ledSuit,
    you: ownSeat(g) !== null,
    box: lay.box,
    last: g.lastTrick ? lastCorner(s, g.lastTrick) : null,
    lastSlap: !!g.lastTrick?.slap,
  });
  shownTrickCount = plays.length;
  return table;
}

/** The finished trick on the felt while its cards move (see TrickAnim). */
function trickFinishStage(g: SavedGame, a: TrickAnim): Child {
  const s = g.session;
  const v = publicView(s);
  const waste = Math.max(0, v.wastePileCount - (a.slapped ? 0 : a.plays.length));
  const last = a.plays.length - 1;
  const firstDraw = shownTrickCount !== -1;
  shownTrickCount = -1;
  const lay = stageLayout(true, 52);
  const who = ownSeat(g) ?? g.holder;
  const table = roundTable(s, v, {
    bottom: bottomSeat(g, g.holder),
    highlight: a.slapped,
    plays: a.plays,
    newFrom: firstDraw ? last : a.plays.length,
    waste: wastePile(waste),
    you: ownSeat(g) !== null,
    box: lay.box,
  });
  // 2.34.6 (CODE.md 9ah.1): the round's last trick stays until tapped; the whole table is the button.
  const tapToGo = a.step === 'hold' && waitsForTap(a) && a.timer === null;
  return gameFrame(lay, {
    table: tapToGo
      ? h('div', {
        class: 'final-trick', role: 'button', tabindex: '0', 'aria-label': 'See the results',
        onclick: () => tapFinalTrick(a),
        onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') tapFinalTrick(a); },
      }, table, h('p', { class: 'hint center final-hint' }, 'Tap to see the results'))
      : table,
    hand: handBlock(s, playerView(s, who), null, { head: false, fit: lay.handH, width: lay.handW }),
    // 9am.1 (2.37.2): while only computer players can move there is nothing to protect, so no block:
    // a finger reaches Stop fast forward, Fast forward / Skip and ☰ during the animations.
    extra: tapToGo || (g.bots && botsOnlyFor(g)) ? null : h('div', { class: 'anim-block', 'aria-hidden': 'true' }),
  });
}

/** Slide the trick's cards to the waste pile, or into the slapped player's seat. */
function flyTrick(a: TrickAnim, done: () => void): void {
  const target = a.slapped ? document.querySelector(`[data-seat="${a.slapped}"]`) : document.querySelector('.round-table .waste-pile');
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.round-table .trick-play'));
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('animate' in HTMLElement.prototype);
  if (!target || !cards.length || still) { window.setTimeout(done, 250); return; }
  const b = target.getBoundingClientRect();
  cards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (r.left + r.width / 2);
    const dy = b.top + b.height / 2 - (r.top + r.height / 2);
    el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.25}px, ${dy * 0.25 - 12}px) scale(0.9)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.15 },
      ],
      { duration: trickMs(TRICK_FLY_MS), delay: i * 45, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
    );
  });
  window.setTimeout(done, trickMs(TRICK_FLY_MS) + cards.length * 45 + 60);
}

/** Moves the end-of-trick animation on; called after every draw. */
/** 2.34.6 (CODE.md 9ah.1): the round's last trick waits for a tap, except while Fast forward or Skip runs. */
function waitsForTap(a: TrickAnim): boolean {
  return a.final && !a.tapped && !(fastForwardOn() || skipping() || instantSkipping());
}

/** The player taps the round's last trick away: its cards move, then the round-over pop-up and the results. */
function tapFinalTrick(a: TrickAnim): void {
  if (trickAnim !== a || a.tapped) return;
  a.tapped = true;
  if (a.step === 'hold' && a.timer === null) a.step = 'fly';
  update({});
}

function driveTrickAnim(): void {
  const a = trickAnim;
  if (!a) return;
  // A final trick waits on the felt; a round-ending slap still shows its SLAP! pop-up first (hold, then wait).
  const slapStillDue = !!(a.slapped && a.slapPopup && getState().popups.includes(a.slapPopup));
  if (a.step === 'hold' && a.timer === null && waitsForTap(a) && !slapStillDue) return;
  if (a.step === 'hold' && a.timer === null) {
    a.timer = window.setTimeout(() => {
      a.timer = null;
      if (trickAnim !== a) return;
      if (a.slapped && a.slapPopup && getState().popups.includes(a.slapPopup)) { a.step = 'wait'; sfx('slap'); }
      else { a.step = 'fly'; if (a.slapped) sfx('slap'); }
      update({});
    }, trickMs(TRICK_HOLD_MS));
  } else if (a.step === 'wait' && !(a.slapPopup && getState().popups.includes(a.slapPopup))) {
    if (waitsForTap(a)) {
      // SLAP! has been shown: back to holding the trick until the tap.
      a.step = 'hold';
      a.slapPopup = null;
      window.setTimeout(() => { if (trickAnim === a) update({}); }, 0);
      return;
    }
    a.step = 'fly';
    window.setTimeout(() => { if (trickAnim === a) update({}); }, 0);
  } else if (a.step === 'fly' && !a.flying) {
    a.flying = true;
    sfx(a.slapped ? 'pickUp' : 'trickDone');
    flyTrick(a, () => {
      if (trickAnim !== a) return;
      trickAnim = null;
      shownTrickCount = 0;
      eventSounds(a.after, false);
      update({});
    });
  }
}

/** Words for who played what in the last trick (for screen readers). */
function lastLabel(s: Session, t: LastTrick): string {
  return `Last trick: ${t.plays.map((p) => `${nameOf(s, p.player)} ${p.label}`).join(', ')}${t.slap ? `. ${nameOf(s, t.slap.slapper)} slapped ${nameOf(s, t.slap.slapped)}` : ''}`;
}

/**
 * The last trick in the table's bottom-left corner (2.29): tap it to see it big. The slapped player's card is ringed.
 * 2.31 (CODE.md 9aa Part D): each card sits `--step` further along (set by the table, table.ts lastStyle), so
 * each card's corner number and suit show; the slap mark sits just past the top card.
 */
function lastCorner(s: Session, t: LastTrick): Child {
  return h('button', { class: 'lt-corner', 'aria-label': `${lastLabel(s, t)}. Tap to see it big`, onclick: () => update({ lastOpen: true }) },
    h('span', { class: 'lt-label', 'aria-hidden': 'true' }, 'last'),
    t.plays.map((p: TrickPlay, i) => {
      const el = cardFaceFromId(p.card, `tiny-card lt-card${t.slap?.slapped === p.player ? ' slapped' : ''}`);
      el.style.setProperty('--i', String(i));
      el.setAttribute('aria-hidden', 'true');
      return el;
    }),
    t.slap ? h('span', { class: 'lt-slap', 'aria-hidden': 'true', style: `left:calc(${t.plays.length - 1} * var(--step, 0px) + 3.6 * var(--u, 11px) + 2px)` }, icon('hand')) : null,
  );
}

/** The last trick, big, on a sheet (2.29): from the corner of the table. */
function lastSheet(s: Session, t: LastTrick): HTMLElement {
  const close = (): void => update({ lastOpen: false });
  return h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet last-sheet', role: 'dialog', 'aria-label': 'Last trick', 'data-scroll': 'last' },
      h('div', { class: 'sheet-head' }, h('h2', null, 'Last trick'), h('button', { class: 'ghost', onclick: close }, 'Close')),
      h('div', { class: 'last-big' }, t.plays.map((p: TrickPlay) => h('div', { class: 'last-big-item' },
        cardFaceFromId(p.card, 'last-big-card'),
        h('span', { class: t.slap?.slapped === p.player ? 'slapped-name' : '' }, nameOf(s, p.player))))),
      t.slap ? h('p', { class: 'muted small center' }, `${nameOf(s, t.slap.slapper)} slapped ${nameOf(s, t.slap.slapped)}`) : null,
    ),
  );
}

/** True when a body is (or holds) a fixed game frame, so the screen must not scroll (2.29). */
function hasFrame(c: Child): boolean {
  // 9ak.4 (2.37): the results screen B is a framed column too (its own scrolling body and fixed footer).
  if (c instanceof HTMLElement) return c.classList.contains('game-frame') || c.classList.contains('results-frame');
  if (Array.isArray(c)) return (c as readonly Child[]).some(hasFrame);
  return false;
}

/** The sizes of a stage's rows for this window (layout.ts). `bar` is the action bar's height (CODE.md 9x.2). */
export function stageLayout(hasHand: boolean, bar: number): GameLayout {
  return gameLayout(window.innerWidth, window.innerHeight, { hand: hasHand, bar });
}

/**
 * One fixed game screen (CODE.md 9x.2, 2.29): the table row takes what is left,
 * the hand row has the height `lay` gives it, and the action bar sits at the
 * bottom. `extra` panels float over the bottom of the table and scroll inside
 * themselves, so they never push the rows.
 */
export function gameFrame(lay: GameLayout, parts: { table: Child; hand?: Child; action?: Child; extra?: Child; extraAt?: 'top' | 'bottom' }): HTMLElement {
  // 2.31 (CODE.md 9aa Part C item 5): `extraAt: 'top'` moves the floating panels to the top of the table (round start: the target row).
  // 2.34.5 (CODE.md 9ag.3 fix 3): the 😂 button lives outside the frame; in landscape it sits at the top of the
  // action column, so it needs the column's size.
  const root = document.documentElement;
  root.style.setProperty('--side-w', `${lay.sideW.toFixed(1)}px`);
  root.style.setProperty('--hand-h', `${lay.handH.toFixed(1)}px`);
  if (lay.landscape && lay.sideW > 0) root.dataset['side'] = '1'; else delete root.dataset['side'];
  // 9ak.6 (2.37): the rail (landscape phones): the top bar is a column down the left.
  if (lay.rail) root.dataset['rail'] = '1'; else delete root.dataset['rail'];
  // 9al.5 (2.37.1): the reactions sheet sits above the action row (CSS reads --bar-h on the root).
  root.style.setProperty('--bar-h', `${lay.barH.toFixed(1)}px`);
  return h('div', { class: 'game-frame', style: `--hand-h:${lay.handH.toFixed(1)}px;--bar-h:${lay.barH.toFixed(1)}px;--side-w:${lay.sideW.toFixed(1)}px` },
    h('div', { class: 'game-table-slot' }, parts.table,
      parts.extra ? h('div', { class: parts.extraAt === 'top' ? 'game-extra at-top' : 'game-extra', 'data-scroll': 'extra' }, parts.extra) : null),
    h('div', { class: 'game-hand-slot' }, parts.hand ?? null),
    // 9al.5 (2.37.1): 😂 is the first item of the action row (portrait, tablet); the rail keeps its own floating one.
    // 2.32.2: while Fast forward is on, the one Stop button sits here on every screen (pop-ups and tricks don't hide it).
    h('div', { class: 'game-action-slot' },
      lay.rail ? null : reactionsToggle(true),
      h('div', { class: 'action-main' }, fastForwardOn()
        ? h('button', { class: 'secondary big', onclick: () => stopFastForward() }, 'Stop fast forward')
        : parts.action ?? null)));
}

// ---------------------------------------------------------------------------
// Table stage: dealing, round start, results, game over
// ---------------------------------------------------------------------------

function tableStage(g: SavedGame): Child {
  const s = g.session;
  switch (s.phase) {
    case 'dealing': return dealingStage(g);
    case 'reshuffle': return reshuffleStage(g);
    case 'swap':
    case 'cardCheck': // 2.20: the wait and new-hand screens come from netRoundStart
    case 'reactionTap': return roundStartScreen(g) ?? h('p', null, 'Waiting…');
    case 'leadNotice': return noticeStage(g);
    case 'chooseLeader': return chooseLeaderStage(g);
    case 'results': return resultsStage(g);
    case 'gameOver': return gameOverStage(g);
    case 'playing': return playHandoffStage(g);
  }
}

export function dealingStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const d = v.deal!;
  const dealer = s.dealer;
  const notStarted = d.mode === 'auto' && d.nextSeat === null;
  const manual = d.mode === 'manual';
  const total = s.order.reduce((n, id) => n + (v.players.find((p) => p.id === id)?.cardCount ?? 0), 0) + d.remaining;
  // Network game or single player: only the dealer's phone deals; the others watch.
  const seat = ownSeat(g);
  const watching = !!seat && seat !== dealer;
  const tap = watching ? undefined : notStarted
    ? (id: PlayerId) => send([{ type: 'autoDealStart', by: dealer, firstSeat: id }])
    : manual
      ? (id: PlayerId) => { pendingFly = id; send([{ type: 'manualDealCard', by: dealer, seat: id }]); }
      : undefined;
  // 2.31 (CODE.md 9aa Part C item 4): the jokers and hidden-deck chips moved to the top bar (dealChips),
  // so the deal bar holds two rows: the hint and the deal buttons. Portrait: 76 px (was 92 with the chips).
  // 2.34 fix: on a phone the deal bar (hint + Manual/Auto/Deal all) needs about 88px to stay whole.
  const lay = stageLayout(false, window.innerWidth > window.innerHeight ? 64 : 88);
  if (shuffling()) {
    return gameFrame(lay, {
      table: roundTable(s, v, {
        bottom: bottomSeat(g, dealer),
        dealer,
        box: lay.box,
        middle: h('div', { class: 'deck shuffling', 'aria-label': 'Shuffling' },
          [0, 1, 2].map((k) => h('div', { class: 'card-back l', style: `--k:${k}` })),
          [0, 1, 2].map((k) => h('div', { class: 'card-back r', style: `--k:${k}` })),
        ),
      }),
      action: h('div', { class: 'deal-bar' }, h('p', { class: 'hint center' }, `${nameOf(s, dealer)} shuffles`)),
    });
  }
  const setMode = (mode: 'auto' | 'manual'): void => { if (mode !== d.mode) send([{ type: 'setDealMode', by: dealer, mode }]); };
  const hint = watching ? (notStarted || manual ? `${nameOf(s, dealer)} is dealing` : 'Dealing…')
    : notStarted ? `${seat ? 'You' : nameOf(s, dealer)}: tap who gets the first card` : manual ? 'Tap a name to deal' : 'Dealing…';
  return gameFrame(lay, {
    table: roundTable(s, v, {
      bottom: bottomSeat(g, dealer),
      dealer,
      highlight: manual || notStarted ? null : d.nextSeat,
      onTap: tap,
      tapLabel: notStarted ? 'First card to' : 'Deal a card to',
      disabled: manual && s.deal ? lockedSeats(s.deal) : [],
      box: lay.box,
      middle: h('div', { class: 'deck', id: 'deck', 'aria-label': `${d.remaining} of ${total} cards left to deal` },
        h('div', { class: 'card-back' }), h('div', { class: 'card-back' }), h('div', { class: 'card-back top' }),
        h('span', { class: 'deck-count' }, String(d.remaining))),
    }),
    action: h('div', { class: 'deal-bar' },
      h('p', { class: 'hint center' }, hint),
      notStarted || watching ? null : h('div', { class: 'seg', role: 'group', 'aria-label': 'Deal mode' },
        h('button', { class: manual ? 'seg-btn on' : 'seg-btn', 'aria-pressed': manual ? 'true' : 'false', onclick: () => setMode('manual') }, icon('hand'), ' Manual'),
        h('button', { class: manual ? 'seg-btn' : 'seg-btn on', 'aria-pressed': manual ? 'false' : 'true', onclick: () => setMode('auto') }, icon('play'), ' Auto'),
        !manual ? h('button', { class: 'seg-btn', onclick: () => send([{ type: 'autoDealAll', by: dealer }]) }, 'Deal all') : null,
      )),
  });
}

/**
 * 2.30 (CODE.md 9y.3): a notice about who leads, over the table. It stays until
 * this phone's person taps OK. Play waits for every person (CODE.md 9y.1).
 */
export function noticeStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const notice = s.notice!;
  const seat = ownSeat(g);
  const me = seat ?? g.holder; // a one-phone game: whoever holds the phone taps
  const seenByMe = s.noticeSeen.includes(me);
  // Persons who still have to tap OK (waitForAll only; a shared phone needs one tap).
  const waiting = s.waitForAll ? s.order.filter((p) => !s.players.find((x) => x.id === p)?.computer && !s.noticeSeen.includes(p)) : [];
  const lay = stageLayout(false, 52);
  return gameFrame(lay, {
    table: [
      roundTable(s, v, { bottom: bottomSeat(g, me), you: seat !== null, box: lay.box }),
      seenByMe ? null : h('div', { class: 'notice-overlay' }, noticeCard(s, notice, () => send([{ type: 'seenNotice', by: me }]))),
    ],
    action: seenByMe && waiting.length ? h('p', { class: 'hint center wait-line' }, `Waiting for ${joinNames(waiting.map((p) => nameOf(s, p)))}`) : null,
  });
}

/** The notice card's words and its OK button (CODE.md 9y.1). The suit is never named. */
function noticeCard(s: Session, n: LeadNotice, onOk: () => void): HTMLElement {
  const who = (ids: readonly PlayerId[]): string => joinNames(ids.map((id) => nameOf(s, id)));
  let title: string;
  let text: string;
  let times: HTMLElement | null = null;
  switch (n.kind) {
    case 'missingOne':
      title = `${who(n.players)} is missing a suit`;
      text = `${who(n.players)} leads first.`;
      break;
    case 'missingMany':
      title = `${who(n.players)} are missing a suit`;
      text = 'Reaction Tap comes next.';
      break;
    case 'tapIntro':
      title = 'Reaction Tap';
      text = `${who(n.players)} play Reaction Tap. Tap when the screen turns green. The slowest leads first.`;
      break;
    case 'tapResult':
      title = `${who(n.leader ? [n.leader] : [])} leads first`;
      text = 'Slowest in Reaction Tap';
      times = h('p', { class: 'small center' }, n.players.map((id) => {
        const t = n.times?.[id];
        return `${nameOf(s, id)} ${t?.falseStart ? 'tapped too soon' : `${t?.ms ?? '?'} ms`}`;
      }).join(' · '));
      break;
    case 'tapTie':
      title = `${who(n.players)} tap again`;
      text = 'A tie in Reaction Tap.';
      break;
  }
  return h('section', { class: 'panel notice-card', role: 'dialog', 'aria-label': title },
    h('h2', { class: 'center notice-title' }, title),
    h('p', { class: 'center' }, text),
    times,
    h('button', { class: 'big', onclick: onOk }, 'OK'),
  );
}

/**
 * 9ad.3 (2.34): one-phone game only: the round (its previous-round record) whose winner tapped
 * "Show my cards". Keyed to that record, so a new round or a new game starts hidden again.
 */
let leaderPeek: object | null = null;

export function chooseLeaderStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const winner = s.previous!.winner;
  // 9ad.3 (2.34): the winner sees their own cards before picking who leads.
  // One-phone game: everyone can see the screen, so the cards stay hidden until "Show my cards".
  const mine = ownSeat(g) === winner;
  const oneOwnPhone = ownSeat(g) === null;
  const showHand = mine || (oneOwnPhone && leaderPeek === s.previous);
  const lay = stageLayout(showHand, 52);
  const question = h('h2', { class: 'center' }, `${ownSeat(g) ? 'You' : nameOf(s, winner)}: who leads?`);
  return gameFrame(lay, {
    table: roundTable(s, v, { bottom: bottomSeat(g, winner), you: ownSeat(g) !== null, onTap: (id) => send([{ type: 'chooseLeader', by: winner, leader: id }]), tapLabel: 'Leads:', box: lay.box }),
    hand: showHand ? handBlock(s, playerView(s, winner), null, { head: false, fit: lay.handH, width: lay.handW }) : undefined,
    action: oneOwnPhone && !showHand
      ? h('div', { class: 'row round-buttons' }, question,
        h('button', { class: 'secondary', onclick: () => { leaderPeek = s.previous ?? null; update({}); } }, 'Show my cards'))
      : question,
  });
}

// ---------------------------------------------------------------------------
// Looking at hands before the round (pass the phone round)
// ---------------------------------------------------------------------------

/** P1: pass the phone: phone and arrow, the name big, one "I'm X" button. */
export function handoffBlock(name: string, onGo: () => void, opts: { compact?: boolean; note?: string | null } = {}): HTMLElement {
  return h('div', { class: opts.compact ? 'handoff compact' : 'handoff', 'aria-label': `Pass the phone to ${name}` },
    h('div', { class: 'handoff-icon' }, icon('phone'), icon('arrow')),
    opts.note ? h('p', { class: 'muted small' }, opts.note) : null,
    h('h1', { class: 'handoff-name' }, name),
    h('button', { class: 'big', onclick: onGo }, icon('eye'), ` I'm ${name}`),
  );
}

function lookHandoffStage(g: SavedGame): Child {
  const s = g.session;
  const who = nameOf(s, g.holder);
  return gameFrame(stageLayout(false, 0), {
    table: h('div', { class: 'frame-col' },
      handoffBlock(who, () => update({ game: { ...g, stage: 'hand' } })),
      h('button', { class: 'ghost', onclick: () => update({ game: { ...g, stage: 'table' } }) }, 'Back to the table')),
  });
}

function lookHandStage(g: SavedGame): Child {
  const s = g.session;
  const v = playerView(s, g.holder);
  const next = nextClockwise(s, g.holder);
  const lay = stageLayout(true, 0);
  return gameFrame(lay, {
    table: h('div', { class: 'frame-col' },
      h('h2', { class: 'center' }, `${nameOf(s, v.me)}'s cards`),
      h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'handoff', holder: next } }) },
        `Hide · pass to ${nameOf(s, next)}`),
      h('button', { class: 'ghost', onclick: () => update({ game: { ...g, stage: 'table' } }) }, 'Hide · back to the table')),
    hand: handBlock(s, v, null, { head: false, fit: lay.handH, width: lay.handW }),
  });
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

function playHandoffStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const asked = takeHolder(s);
  const actor = asked ?? actorOf(s) ?? g.holder;
  const who = nameOf(s, actor);
  const choosing = !asked && v.pendingFinalTwo === actor;
  const lay = stageLayout(true, 52);
  return gameFrame(lay, {
    table: trickArea(s, g, v, actor, actor, lay),
    hand: handoffBlock(who, () => update({ game: { ...g, stage: 'hand', holder: actor } }), { compact: true }),
    action: choosing || asked ? h('p', { class: 'hint center' }, choosing ? 'Pick up or forfeit' : `For ${who} only`) : null,
  });
}

/**
 * A player's hand. With `onTap`, legal cards are lit and tappable (during play).
 * `opts.all` makes every card tappable (hidden swap); `opts.picked` marks cards
 * as raised; `opts.mark` puts a star on them instead (new cards after a swap).
 */
/**
 * 9ai.6 (2.36) / 9aj.4 (2.36): the words for your name pill on your turn: "Your turn · lead", "Your turn · play a ♥".
 * The pill sits on the table (it used to be a separate pill above the hand).
 */
function turnLabel(s: Session, v: PlayerView): Child {
  const led = v.ledSuit;
  let label: Child = 'Your turn';
  if (v.trick.length === 0 && !jokerLed(s)) label = 'Your turn · lead';
  else if (led && v.myHand.some((c) => c.kind === 'standard' && c.suit === led)) {
    const red = led === 'hearts' || led === 'diamonds';
    label = ['Your turn · play a ', h('span', { class: red ? 'play-red' : '' }, SUIT_SYMBOL[led])];
  }
  return label;
}

/** 9ai.6 (2.36): the phone buzzes once when a turn comes to this player (where it can, with sound effects on). */
let lastTurnKey = '';
function buzzForTurn(g: SavedGame, v: PlayerView): void {
  const key = `${g.session.round}:${g.trickLog.length}:${v.me}`;
  if (key === lastTurnKey) return;
  lastTurnKey = key;
  if (soundSettings().sfxOn) navigator.vibrate?.(60);
}

export function handBlock(
  s: Session,
  v: PlayerView,
  onTap: ((c: Card) => void) | null,
  opts: { picked?: ReadonlySet<string>; all?: boolean; mark?: boolean; head?: boolean; fit?: number; width?: number; yourTurn?: boolean } = {},
): HTMLElement {
  const hand = sortHand(v.myHand);
  // The fanned hand (CODE.md 9u Part D): card size and place from the phone's width (portrait only).
  // CODE.md 9w.5: the hand uses the window's width (not the 520 px menu column); in landscape the cards fit the shorter hand area.
  const landscape = window.innerWidth > window.innerHeight;
  // 2.29: the hand fits its fixed row (`fit`), one row up to 15 cards; its width comes from the stage's layout.
  const width = opts.width ?? Math.min(window.innerWidth, 1100) - 12;
  // 2.34.5 (CODE.md 9ag.3 fix 1): the fan fits the hand slot's real width and height; cards get smaller when needed.
  const fan = landscape
    ? fitFan(hand.length, width, opts.fit ?? handH(window.innerWidth, window.innerHeight), true)
    // Portrait: the 😂 button reaches 6 px up into the hand row, so the cards keep 8 px clear at the bottom (styles.css).
    : opts.fit !== undefined ? fitFan(hand.length, width, opts.fit - 8, false) : fanLayout(hand.length, width, undefined, 64, opts.fit);
  const legal = new Set(opts.all ? v.myHand.map((c) => c.id) : v.legalCardIds);
  const selected = getState().selected;
  const raised = (id: string): boolean => (opts.picked ? opts.picked.has(id) && !opts.mark : selected === id);
  const key = `${s.round}:${v.me}:${s.phase}`;
  const fresh = key !== shownHandKey;
  shownHandKey = key;
  // 9aj.4 (2.36): on your turn the hand gets a gold glow under the cards (no frame); the turn words are on your name pill.
  return h('section', { class: opts.yourTurn ? 'hand-section your-turn' : 'hand-section', 'aria-label': `${nameOf(s, v.me)}'s cards` },
    opts.head === false ? null : h('div', { class: 'hand-head' },
      h('h2', null, nameOf(s, v.me)),
      h('span', { class: 'count' }, String(hand.length)),
    ),
    hand.length
      ? h('div', { class: fresh ? 'hand fan fresh' : 'hand fan', style: `--card-w:${fan.cardW.toFixed(1)}px;--fan-h:${fan.height.toFixed(1)}px` }, hand.map((c, i) => {
        const playable = onTap !== null && legal.has(c.id);
        const el = cardFace(c, [onTap && !playable ? 'dim' : '', raised(c.id) ? 'selected' : '', playable ? 'playable' : '', opts.mark && opts.picked?.has(c.id) ? 'new-card' : ''].join(' '));
        el.style.setProperty('--i', String(i));
        const spot = fan.spots[i]!;
        el.style.setProperty('--x', `${spot.x.toFixed(1)}px`);
        el.style.setProperty('--y', `${spot.y.toFixed(1)}px`);
        el.style.setProperty('--rot', `${spot.rot.toFixed(1)}deg`);
        el.style.zIndex = String(spot.z);
        if (onTap && !playable) el.addEventListener('click', () => sfx('notAllowed'));
        if (playable) {
          el.setAttribute('role', 'button');
          el.setAttribute('tabindex', '0');
          el.addEventListener('click', () => onTap(c));
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') onTap(c); });
        }
        return el;
      }))
      : h('p', { class: 'empty' }, 'No cards left.'),
  );
}

export function playHandStage(g: SavedGame): Child {
  const s = g.session;
  const v = playerView(s, g.holder);
  const st = getState();
  const myTurn = v.turn === v.me && !v.pendingFinalTwo;
  const choosing = v.pendingFinalTwo === v.me;
  const selected = st.selected && v.legalCardIds.includes(st.selected) ? st.selected : null;
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : undefined;

  const play = (id: string): void => { send([{ type: 'playCard', by: v.me, cardId: id }]); };
  const onTap = myTurn
    ? (c: Card) => { if (selected === c.id) play(c.id); else update({ selected: c.id }); }
    : null;
  // 9ak.2 (2.37): Forfeit is a red outline button in the bottom action row (flag icon); tap twice to forfeit.
  const forfeitArmed = st.armed === 'forfeit';
  const forfeitBtn = v.canForfeit
    ? h('button', {
      class: forfeitArmed ? 'forfeit-btn armed' : 'forfeit-btn',
      'aria-label': forfeitArmed ? 'Tap again to forfeit, you finish last' : 'Forfeit',
      onclick: () => {
        if (!forfeitArmed) { update({ armed: 'forfeit' }); return; }
        send([{ type: 'forfeit', by: v.me }]);
      },
    }, icon('flag'), forfeitArmed ? ' Tap again' : ' Forfeit')
    : null;

  // Network game (2.5): the leader can't play while a take-cards request waits; the trick waits for the answer.
  // 2.29: the "X's turn" line is gone: the gold seat on the table shows whose turn it is.
  const actor = actorOf(s);
  const takeWaiting = ownSeat(g) ? s.takeRequests.find((r) => !r.agreed) : undefined;
  const playBlocked = !!takeWaiting;
  const lay = stageLayout(true, 52);
  // 2.31 (CODE.md 9aa Part B): with no cards left, Fast forward and Skip take the hand area.
  const fastItems = v.myHand.length === 0 ? handFastItems(g) : [];
  // 9ai.3 (2.36): a pop-up open on any phone holds the game: Play shows only the hourglass until it is closed.
  const busyWait = anyoneBusy();
  const playButton = myTurn && !playBlocked
    ? h('button', { class: 'big grow', disabled: !selCard || busyWait, onclick: () => selected && !busyWait && play(selected) },
      busyWait ? icon('wait') : selCard ? ['Play ', h('span', { class: selCard.kind === 'standard' && (selCard.suit === 'hearts' || selCard.suit === 'diamonds') ? 'play-red' : '' }, shortLabel(selCard))]
        // 9al.6 (2.37.1): with Forfeit on the row the hint is just "Pick a card" (it must fit one line).
        : v.trick.length || jokerLed(s) || v.canForfeit ? 'Pick a card' : 'Pick a card to lead')
    : null;
  // Panels that come and go float over the table (2.29), so the rows never move.
  const extra: Child[] = [
    ownSeat(g) ? takeStatus(s, v.me) : null,
    notesPanel(g, v.me),
    takePrompts(s, v.me),
    choosing
      ? h('section', { class: 'panel choice' },
        h('h2', null, 'Pick up or forfeit'),
        h('button', { class: 'big', onclick: () => send([{ type: 'pickUpWastePile', by: v.me }]) },
          `Pick up the waste pile (${v.wastePileCount} cards) and lead`),
        forfeitBtn,
      )
      : null,
    myTurn && jokerLed(s) && s.play
      ? h('p', { class: 'note center' }, icon('joker'), ` Joker lead by ${nameOf(s, s.play.trick.acted[0] as string)}: same trick, play any card`)
      : null,
    myTurn && playBlocked && takeWaiting
      ? h('p', { class: 'note center' }, `Waiting for ${nameOf(s, takeWaiting.target)} to answer ${nameOf(s, takeWaiting.requester)}`)
      : null,
    myTurn && selCard?.kind === 'joker' && jokerGivesWin(s, v.me)
      ? h('p', { class: 'note warn' }, `Careful: if you play this joker, ${nameOf(s, jokerGivesWin(s, v.me))} ${
        (s.play?.hands[jokerGivesWin(s, v.me)!]?.length ?? 0) === 0 ? 'goes out with their last card unopposed and wins' : 'can play their last card unopposed and win'} the round.`)
      : null,
    takeControls(s, v.me),
    watchSheet(s, v),
    watchAskCard(s, v),
    watchPill(s, v),
    !ownSeat(g) && !myTurn && !choosing && !s.takeRequests.some((r) => r.target === v.me && !r.agreed)
      ? passOnButton(g)
      : null,
  ];
  if (myTurn && ownSeat(g)) buzzForTurn(g, v);
  // 9ak.2 (2.37): the action row: Forfeit on the left, the main button (or the "Wait for" hint) on the right.
  // The final-two decision card has its own Forfeit, so the row leaves it out while choosing.
  const waitHint = !myTurn && actor && !choosing ? h('span', { class: 'action-hint' }, `Wait for ${nameOf(s, actor)}`) : null;
  const barForfeit = choosing ? null : forfeitBtn;
  // 9an.3 (2.38, item 8): out of the round, the eye (Watch a hand) sits beside Forfeit.
  const eye = watchEyeButton(s, v);
  const action: Child = barForfeit || eye || playButton || waitHint
    ? h('div', { class: 'action-row' }, barForfeit, eye, playButton ?? waitHint)
    : null;
  return gameFrame(lay, {
    table: trickArea(s, g, v, v.me, actor ?? v.me, lay, myTurn ? turnLabel(s, v) : undefined),
    hand: fastItems.length
      ? h('div', { class: 'hand-actions' }, ...fastItems)
      // 9an.3 (2.38, item 10): out and watching someone: their cards show where my hand was.
      : watchingBlock(s, v) ?? handBlock(s, v, playBlocked ? null : onTap, {
        head: false, fit: lay.handH, width: lay.handW,
        yourTurn: myTurn,
      }),
    action,
    extra,
  });
}

// ---------------------------------------------------------------------------
// Pop-ups
// ---------------------------------------------------------------------------

/** When each SLAP! pop-up first appeared, so its countdown bar survives a redraw. */
const slapShownAt = new WeakMap<Popup, number>();

function slapElapsed(p: Popup): number {
  const now = Date.now();
  if (!slapShownAt.has(p)) slapShownAt.set(p, now);
  return Math.min(popupMs(p), now - slapShownAt.get(p)!);
}

/**
 * 9ai.1 (2.36): pop-ups close by themselves only while Fast forward or Skip runs
 * (only computer players are left, so no person is waiting). Otherwise they wait for a tap.
 */
function autoClosing(): boolean {
  return fastForwardOn() || skipping() || instantSkipping();
}

/** The countdown bar under a pop-up that closes by itself (only while autoClosing). */
function popupTimer(p: Popup): HTMLElement | null {
  if (!autoClosing()) return null;
  return h('div', { class: 'slap-timer', 'aria-hidden': 'true' }, h('span', { style: `animation-duration:${popupMs(p)}ms;animation-delay:-${slapElapsed(p)}ms` }));
}

/** 9ai.1: the line at the bottom of a pop-up that closes on a tap (hidden while it closes by itself). */
function tapHint(): HTMLElement | null {
  return autoClosing() ? null : h('div', { class: 'tap-hint' }, 'Tap anywhere to close');
}

/** Coloured place badge: 1st gold, 2nd silver, 3rd bronze, Last red. */
export function placeBadge(place: number | 'last'): HTMLElement {
  const cls = place === 'last' ? 'last' : place <= 3 ? `p${place}` : '';
  return h('span', { class: `place ${cls}` }, place === 'last' ? 'Last' : ordinal(place));
}

/** Pop-ups already on screen, so a redraw doesn't replay their entrance. */
const shownPopups = new WeakSet<Popup>();

export function popupLayer(): HTMLElement | null {
  const st = getState();
  const p = st.popups[0];
  const g = st.game;
  if (!p || !g) return null;
  // During the end-of-trick animation only the SLAP! pop-up shows, at its turn.
  if (trickAnim && trickAnim.step !== 'wait') return null;
  const s = g.session;
  const next = (): void => update({ popups: st.popups.slice(1) });
  let body: Child;
  let cls = shownPopups.has(p) ? 'popup seen' : 'popup';
  const firstShow = !shownPopups.has(p);
  if (p.kind === 'pathetic') {
    cls += ' slap pathetic';
    body = [
      h('div', { class: 'slap-word pathetic-word', 'aria-label': 'Pathetic!!!' }, 'PATHETIC!!!'),
      h('div', { class: 'slap-who' }, forfeitLine(nameOf(s, p.player), ownSeat(g) === p.player)),
      h('div', { class: 'small' }, 'Last place.'),
      popupTimer(p),
    ];
  } else if (p.kind === 'badboy') {
    cls += ' slap badboy';
    if (firstShow) sfx('badboy');
    body = [
      h('div', { class: 'badboy-pre' }, 'You are the'),
      h('div', { class: 'slap-word badboy-word', 'aria-label': 'You are the Ultimate Badboy!!' }, 'Ultimate', h('br'), 'Badboy!!'),
      h('div', { class: 'small' }, 'All four aces.'),
      popupTimer(p),
    ];
  } else if (p.kind === 'haha') {
    cls += ' slap haha';
    body = [
      h('div', { class: 'slap-word', 'aria-label': 'Ha ha ha!' }, 'HAHAHA!'),
      h('div', { class: 'slap-who' }, `${nameOf(s, p.laugher)} played a lower card than ${nameOf(s, p.loser)}!`),
      popupTimer(p),
    ];
  } else if (p.kind === 'slap') {
    cls += ' slap';
    body = [
      h('div', { class: 'slap-word', 'aria-label': 'Slap!' }, 'SLAP!'),
      h('div', { class: 'slap-who' }, `${nameOf(s, p.slapper)} slapped ${nameOf(s, p.slapped)}`),
      h('div', { class: 'small' }, p.over === 'game' ? 'Game over.' : p.over === 'round' ? 'Round over.'
        : `${nameOf(s, p.slapped)} picks up ${p.cards} ${p.cards === 1 ? 'card' : 'cards'} and leads.`),
      popupTimer(p),
    ];
  } else if (p.kind === 'out') {
    // 9ai.2 (2.36): where the player came, not "is out". On your own phone: "You came 2nd!".
    const mine = ownSeat(g) === p.player;
    const tier = p.place <= 3 ? `place-${p.place}` : 'place-rest';
    body = [
      h('div', { class: `place-icon ${tier}` }, icon('trophy')),
      h('div', { class: 'popup-title' }, `${mine ? 'You' : nameOf(s, p.player)} came ${ordinal(p.place)}!`),
      h('div', { class: `place-big ${tier}` }, ordinal(p.place)),
      h('div', { class: 'small' }, mine ? 'Sit back and watch the rest.' : 'No cards left.'),
    ];
  } else if (p.kind === 'take') {
    cls += ' take-pop';
    body = takePopBody(s, p);
  } else if (p.kind === 'lastTwo') {
    body = lastTwoBody(s, p, ownSeat(g));
  } else if (p.kind === 'voteAlert') {
    // 9ai.4 (2.36): solid, no timer; "Vote now" or a tap anywhere closes it.
    cls += ' vote-alert';
    body = voteAlertBody(s, p, next);
  } else if (p.kind === 'vote') {
    // 9ai.4 (2.36): the result, with the YES and NO rows; counts only on one phone (secret vote).
    cls += ' vote-pop';
    body = voteResultBody(s, p, !!ownSeat(g));
  } else {
    body = [
      h('div', { class: 'popup-icon' }, icon(p.icon)),
      h('div', { class: 'popup-title' }, p.title),
      p.text ? h('div', { class: 'popup-text' }, p.text) : null,
    ];
  }
  shownPopups.add(p);
  // 9ai.1 (2.36): every pop-up has no timer and closes on a tap anywhere (except during Fast forward or Skip).
  // The vote alert has its own "Vote now" button and no tap line (9ai.4).
  // 9aj.2 (2.36): during Fast forward the pop-ups come back to back and cover the bottom Stop button,
  // so the Stop button is drawn here, above the overlay, and its tap does not also close the pop-up.
  return h('div', { class: 'overlay popup-overlay', 'data-skip': 'true', onclick: next },
    h('div', { class: cls, role: 'alert' }, body, p.kind === 'voteAlert' ? null : tapHint()),
    fastForwardOn()
      ? h('button', { class: 'secondary big ff-stop', onclick: (e: Event) => { e.stopPropagation(); stopFastForward(); } }, 'Stop fast forward')
      : null);
}

/** 9an.1 (2.38): the asker's disc, "Amy is asking Ben for their cards" and Waiting; then the answer. */
function takePopBody(s: Session, p: Extract<Popup, { kind: 'take' }>): Child[] {
  const who = nameOf(s, p.requester);
  const whom = nameOf(s, p.target);
  if (!p.answer) return [
    h('div', { class: 'take-pop-disc' }, miniDisc(s, p.requester, '56px')),
    h('div', { class: 'popup-title' }, `${who} is asking ${whom} for their cards`),
    h('div', { class: 'small' }, `Waiting for ${whom}`),
  ];
  if (!p.answer.accepted) return [
    h('div', { class: 'take-pop-disc' }, miniDisc(s, p.target, '56px')),
    h('div', { class: 'popup-title' }, `${whom} said no to ${who}`),
  ];
  return [
    h('div', { class: 'take-pop-disc' }, miniDisc(s, p.target, '56px')),
    h('div', { class: 'popup-title' }, `${whom} gave ${who} their cards`),
    p.answer.place !== null ? h('div', { class: 'small' }, `${whom} came ${ordinal(p.answer.place)}`) : null,
  ];
}

function lastTwoBody(s: Session, p: Extract<Popup, { kind: 'lastTwo' }>, me: PlayerId | null): Child[] {
  const n = p.order.length;
  if (p.shared) {
    return [
      h('div', { class: 'popup-icon' }, icon('joker')),
      h('div', { class: 'popup-title' }, 'Both out on jokers'),
      h('div', { class: 'popup-text' }, placeBadge(n - 1), ` ${p.shared.map((x) => nameOf(s, x)).join(' and ')}`),
    ];
  }
  const second = p.order[n - 2]!;
  const loser = p.order[n - 1]!;
  const forfeit = p.forfeitedBy ? h('div', { class: 'popup-text small' }, forfeitLine(nameOf(s, p.forfeitedBy), me === p.forfeitedBy)) : null;
  return [
    h('div', { class: 'popup-icon' }, icon('flag')),
    h('div', { class: 'popup-title' }, p.winner ? `${nameOf(s, p.winner)} wins the round` : 'Round over'),
    h('div', { class: 'popup-text places' },
      h('span', null, placeBadge(n === 2 ? 1 : n - 1), ` ${nameOf(s, second)}`),
      h('span', null, placeBadge('last'), ` ${nameOf(s, loser)}`)),
    forfeit,
  ];
}

/**
 * Reactions: anyone can spam 😂 and the catch-phrases at any time in a game.
 * A button opens the sheet of reactions; it stays open until it's put away, and it
 * sits above pop-ups so people can react while the SLAP! is on screen. Each
 * tap floats up from where it was tapped and fades out.
 * Multiplayer (Phase 4): each reaction will show who sent it and come from
 * that player's side of the table (CODE.md section 9c).
 */
let drawerWasOpen = false;

/**
 * The 😂 button (2.4). 9al.5 (2.37.1): `inline` puts it in a screen's action row, where it never covers a
 * control; otherwise it floats at the bottom left (screens with no action row, and the rail).
 * Null once the game is over (no reactions then).
 */
export function reactionsToggle(inline: boolean): HTMLElement | null {
  if (getState().game?.session.phase === 'gameOver') return null;
  const open = getState().reactionsOpen;
  return h('button', {
    class: ['reactions-toggle', open ? 'on' : '', inline ? 'react-inline' : ''].filter(Boolean).join(' '),
    'aria-label': open ? 'Put reactions away' : 'Open reactions',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ reactionsOpen: !open }),
  }, open ? '✕' : '😂');
}

/** `inline`: the page already has the 😂 button in its action row, so no floating one is added. */
export function reactionsLayer(inline = false): HTMLElement[] {
  // Reactions show from the start of the game to the end (user, 2.4).
  if (getState().game?.session.phase === 'gameOver') { hideMessageBar(); return []; }
  const open = getState().reactionsOpen;
  const opening = open && !drawerWasOpen;
  drawerWasOpen = open;
  const toggle = inline ? null : reactionsToggle(false);
  if (!open) { hideMessageBar(); return toggle ? [toggle] : []; }
  // 9am.2 (2.37.2, option a): a tap anywhere outside the sheet closes it; the ✕ and the typing bar keep working.
  const catcher = h('div', { class: 'react-catcher', 'aria-hidden': 'true', onclick: () => update({ reactionsOpen: false }) });
  // 9ad.5 (2.34): the typing bar lives outside the page, so redraws never wipe what's typed.
  ensureMessageBar().classList.add('open');
  // A sheet above the 😂 button: every phrase in a wrapping grid, scrolling up and down (2.11).
  const sheet = h('section', { class: opening ? 'reactions-sheet opening' : 'reactions-sheet', 'aria-label': 'Reactions', 'data-scroll': 'reactions' },
    h('button', { class: 'phrase-chip laugh-chip', 'aria-label': 'Laugh', onclick: (e) => react(-1, e as MouseEvent) }, '😂 Laugh'),
    CATCH_PHRASES.map((ph, i) =>
      h('button', { class: 'phrase-chip', onclick: (e) => react(i, e as MouseEvent) }, ph)),
  );
  return toggle ? [catcher, sheet, toggle] : [catcher, sheet];
}

// ---------------------------------------------------------------------------
// Typed messages (CODE.md 9ad.5, 2.34)
// ---------------------------------------------------------------------------

/** Built once, on first use, and kept on document.body: it survives every redraw. */
let messageBar: HTMLFormElement | null = null;

function ensureMessageBar(): HTMLFormElement {
  if (messageBar) return messageBar;
  const input = h('input', { type: 'text', maxlength: 60, placeholder: 'Say something…', 'aria-label': 'Your message', autocomplete: 'off', enterkeyhint: 'send' });
  messageBar = h('form', {
    class: 'msg-bar',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const text = cleanMessage(input.value);
      if (!text) return;
      sendMessage(text);
      input.value = '';
      input.focus(); // keeps the keyboard up for the next one
    },
  }, input, h('button', { class: 'secondary', type: 'submit' }, 'Send'));
  document.body.appendChild(messageBar);
  return messageBar;
}

/** Hides the typing bar (the sheet is closed, or the game is over or left). */
export function hideMessageBar(): void {
  messageBar?.classList.remove('open');
}

/** -1 = the laugh, else a catch-phrase number (the same list on every phone). */
function reactionText(r: number): string | null {
  return r === -1 ? '😂' : (CATCH_PHRASES[r] ?? null);
}

/** This phone's reaction: shown here where it was tapped, and sent to the other phones (network game). */
function react(r: number, e: MouseEvent): void {
  const text = reactionText(r);
  if (!text) return;
  floatText(text, e, r === -1);
  sendReaction(r);
}

/**
 * Another phone's reaction: it rises from the sender's seat with their name.
 * Returns false if it isn't a known reaction (or isn't shown now).
 */
export function showReaction(from: PlayerId, r: number): boolean {
  const text = reactionText(r);
  const st = getState();
  const s = st.game?.session;
  if (!text || !s || st.screen !== 'game' || s.phase === 'gameOver') return false;
  sfx('reaction');
  riseFromSeat(from, s, text, r === -1 ? 'float-react emoji' : 'float-react', 3200);
  return true;
}

/**
 * 9ad.5 (2.34): a typed message rises from the sender's seat with their name, like a
 * reaction, but it stays longer (4 s) and wraps to two lines. Returns false if it isn't shown now.
 */
export function showMessage(from: PlayerId, text: string): boolean {
  const st = getState();
  const s = st.game?.session;
  if (!s || st.screen !== 'game' || s.phase === 'gameOver') return false;
  sfx('reaction');
  riseFromSeat(from, s, text, 'float-react msg', 4200);
  return true;
}

/** Shows `text` above `from`'s seat, with their name under it, for `ms` milliseconds. */
function riseFromSeat(from: PlayerId, s: Session, text: string, className: string, ms: number): void {
  const seat = document.querySelector(`.round-table [data-seat="${from}"]`) ?? document.querySelector(`[data-seat="${from}"]`);
  const box = seat?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = className;
  const t = document.createElement('span');
  t.className = 'float-react-text';
  t.textContent = text;
  const who = document.createElement('span');
  who.className = 'float-react-name';
  who.textContent = nameOf(s, from);
  el.append(t, who);
  const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
  const y = box ? box.top + box.height / 2 : 120;
  el.style.left = `${Math.max(70, Math.min(window.innerWidth - 70, x))}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  window.setTimeout(() => el.remove(), ms);
}

function floatText(text: string, e: MouseEvent, emoji: boolean): void {
  sfx('reaction');
  const el = document.createElement('div');
  el.className = emoji ? 'float-emoji' : 'float-phrase';
  el.textContent = text;
  const x = e.clientX || window.innerWidth / 2;
  const y = e.clientY || window.innerHeight / 2;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - 40, x + (Math.random() * 80 - 40)))}px`;
  el.style.top = `${y - 30}px`;
  el.style.setProperty('--drift', `${Math.round(Math.random() * 80 - 40)}px`);
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  window.setTimeout(() => el.remove(), 2500);
}

// ---------------------------------------------------------------------------
// After each draw: auto deal timer and the flying card
// ---------------------------------------------------------------------------

let dealTimer: number | null = null;

let slapTimer: { popup: Popup; id: number } | null = null;

export function afterRender(): void {
  pauseTick();
  driveTrickAnim();
  const top = trickAnim && trickAnim.step !== 'wait' ? undefined : getState().popups[0];
  // 9ai.1 (2.36): only Fast forward or Skip closes a pop-up by itself; otherwise no timer at all.
  if (top && autoClosing() && slapTimer?.popup !== top) {
    if (slapTimer) window.clearTimeout(slapTimer.id);
    const id = window.setTimeout(() => {
      slapTimer = null;
      const cur = getState().popups;
      if (cur[0] === top) update({ popups: cur.slice(1) });
    }, Math.max(300, popupMs(top) - slapElapsed(top)));
    slapTimer = { popup: top, id };
  } else if (slapTimer && (!top || !autoClosing() || slapTimer.popup !== top)) {
    window.clearTimeout(slapTimer.id);
    slapTimer = null;
  }
  if (pendingFly) {
    flyCard(pendingFly);
    pendingFly = null;
  }
  const st = getState();
  const s = st.game?.session;
  // 9ai.3 (2.36): this phone reports whether a pop-up of its own is up (not while Fast forward or Skip runs).
  reportMyBusy(phoneBusyNow());
  // 9an.5 (E-f): the last pop-up closed: the missed batch ends (one sound, then a 180 ms fade on the felt).
  if (catchingUp && st.popups.length === 0) {
    catchingUp = false;
    setCalm(false);
    const felt = document.querySelector('.round-table');
    if (felt) {
      felt.classList.add('catching-up');
      window.setTimeout(() => felt.classList.remove('catching-up'), 180);
    }
  }
  const dealing = st.screen === 'game' && st.game?.net?.role !== 'join' && s?.phase === 'dealing' && s.deal?.mode === 'auto' && s.deal.nextSeat !== null && !s.vote && !s.paused && !shuffling() && !anyoneBusy();
  if (!dealing) {
    if (dealTimer !== null) { window.clearTimeout(dealTimer); dealTimer = null; }
  } else if (dealTimer === null) {
    dealTimer = window.setTimeout(() => {
      dealTimer = null;
      const cur = getState().game?.session;
      if (!cur || cur.paused || cur.phase !== 'dealing' || cur.deal?.mode !== 'auto' || !cur.deal.nextSeat) { afterRender(); return; }
      pendingFly = cur.deal.nextSeat;
      send([{ type: 'autoDealStep', by: cur.dealer }]);
    }, AUTO_DEAL_MS);
  }
  // Computer players take their turns on this phone (CODE.md 9m.5).
  botsTick();
}

function flyCard(seat: PlayerId): void {
  const from = document.getElementById('deck');
  const to = document.querySelector(`[data-seat="${seat}"]`);
  if (!from || !to || !('animate' in HTMLElement.prototype)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'card-back flying';
  el.style.left = `${a.left + a.width / 2 - 18}px`;
  el.style.top = `${a.top + a.height / 2 - 25}px`;
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = el.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${dx > 0 ? 200 : -200}deg) scale(0.6)`, opacity: 0.2 },
    ],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  anim.onfinish = () => el.remove();
}
