/**
 * Network play (Phase 4 slice 2, CODE.md sections 4a, 5 and 9j). Pure: no DOM,
 * no WebRTC, so it can be unit-tested.
 *
 * The host's phone runs the session. After every move it sends each other
 * phone a copy of the session made for that phone (`redactSession`): the
 * phone's own hand is real; every other hand, the cards still to deal, the
 * waste pile and the hidden decks are replaced by blank cards (or removed),
 * so a phone never receives a card it may not see. Take-cards requests that
 * don't involve the phone are left out. The existing screens then draw from
 * that copy exactly as they do in pass-and-play.
 *
 * The event log only grows, so after the first message each phone is sent just
 * the new log entries (`logFrom` counts entries of the host's full log).
 */

import type { Card } from '../rules/cards.ts';
import type { PlayerId, Session, SessionAction, SessionEvent, LogEntry } from '../session/types.ts';

/** A network game on this phone: its role and its player (kept in the app's game state). */
export interface NetInfo {
  readonly role: 'host' | 'join';
  readonly me: PlayerId;
}

/** A card a phone may not see: only its place in a hand or pile is known. */
export function blankCards(n: number, tag: string): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) out.push({ kind: 'joker', id: `hidden-${tag}-${i}` });
  return out;
}

export function isBlank(c: Card): boolean {
  return c.id.startsWith('hidden-');
}

function blankHands(hands: Readonly<Record<PlayerId, readonly Card[]>>, me: PlayerId): Record<PlayerId, readonly Card[]> {
  const out: Record<PlayerId, readonly Card[]> = {};
  for (const [p, cards] of Object.entries(hands)) out[p] = p === me ? cards : blankCards(cards.length, p);
  return out;
}

/** Events only some phones may see (take-cards requests: the two players in them). */
export function eventFor(e: SessionEvent, me: PlayerId): boolean {
  if (e.type === 'takeRequested' || e.type === 'takeAnswered' || e.type === 'takeCancelled') {
    return e.requester === me || e.target === me;
  }
  return true;
}

/** The session as one phone may have it. The log is left out (sent separately). */
export function redactSession(s: Session, me: PlayerId): Session {
  return {
    ...s,
    hands: blankHands(s.hands, me),
    hiddenDecks: {},
    deal: s.deal
      ? {
        ...s.deal,
        hiddenDecks: {},
        remaining: blankCards(s.deal.remaining.length, 'deck'),
        hands: blankHands(s.deal.hands, me),
      }
      : null,
    play: s.play
      ? {
        ...s.play,
        hands: blankHands(s.play.hands, me),
        wastePile: blankCards(s.play.wastePile.length, 'waste'),
      }
      : null,
    takeRequests: s.takeRequests.filter((r) => r.requester === me || r.target === me),
    log: [],
  };
}

export function logFor(entries: readonly LogEntry[], me: PlayerId): LogEntry[] {
  return entries.filter((x) => eventFor(x.event, me));
}

// ---------------------------------------------------------------------------
// Messages (added to the lobby messages in lobby.ts, protocol 2)
// ---------------------------------------------------------------------------

/** Host → joining phone: the game after a move. */
export interface GameUpdate {
  t: 'game';
  /** This phone's player id. */
  me: PlayerId;
  /** True: `log` is the whole log (first message, or after `sync`). False: append it. */
  full: boolean;
  session: Session;
  log: LogEntry[];
  /** What just happened (for pop-ups, sounds and animations). Empty on a full resend. */
  events: SessionEvent[];
}

/** Host → joining phone: a move from this phone wasn't allowed. */
export interface GameRefused {
  t: 'nope';
  why: string;
}

/** Joining phone → host: moves to make (all or nothing). */
export interface GameActions {
  t: 'act';
  actions: SessionAction[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Moves a joining phone may send. The clock (`tick`) is the host's. */
const PHONE_ACTIONS = new Set<string>([
  'setDealMode', 'autoDealStart', 'autoDealStep', 'autoDealAll', 'manualDealCard',
  'callVote', 'castVote', 'closeVote', 'hostDecides',
  'startRound', 'swap', 'reactionTap', 'chooseLeader',
  'playCard', 'pickUpWastePile', 'forfeit',
  'requestTake', 'answerTake', 'withdrawTake',
  'requestPause', 'respondPause', 'pause', 'resume', 'setPauseTimeLimit',
  'readyUp', 'advance', 'endSession',
]);

/**
 * The moves (`actions`) in an `act` message from the phone playing `me`, or a reason to
 * refuse them. Every move must be made by that player (`by`), so a phone can
 * never act for someone else. The session layer then checks the rules.
 */
export function phoneActions(raw: unknown, me: PlayerId): { actions: SessionAction[] } | { why: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return { why: 'Not a move.' };
  const out: SessionAction[] = [];
  for (const a of raw as unknown[]) {
    if (!isObj(a) || typeof a['type'] !== 'string' || !PHONE_ACTIONS.has(a['type'])) return { why: 'Not a move.' };
    if (a['by'] !== me) return { why: 'A phone can only move for its own player.' };
    out.push(a as unknown as SessionAction);
  }
  return { actions: out };
}

/** A game update from the host, or null if it isn't one. */
export function readGameUpdate(raw: unknown): GameUpdate | null {
  if (!isObj(raw) || raw['t'] !== 'game') return null;
  const s = raw['session'];
  if (typeof raw['me'] !== 'string' || !isObj(s) || !Array.isArray(s['order']) || !Array.isArray(raw['log']) || !Array.isArray(raw['events'])) return null;
  return {
    t: 'game',
    me: raw['me'],
    full: raw['full'] === true,
    session: s as unknown as Session,
    log: raw['log'] as LogEntry[],
    events: raw['events'] as SessionEvent[],
  };
}
