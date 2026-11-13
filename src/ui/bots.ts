/**
 * The computer players in the app (CODE.md 9m.5, slice B). This phone runs the
 * game and the computer players take their turns here, one at a time.
 *
 * - Each computer player only ever gets `seenBy()` (the one door in, 9m.1) and
 *   remembers only the public log (`remember`).
 * - One move at a time: the first player in seat order (after the last one
 *   that moved) with a decision is scheduled after a thinking time. Its seat
 *   shows "thinking…" meanwhile (thinking.ts).
 * - When the timer ends, the move is sent through `runActions`, the same path as
 *   a person's move. If the game moved on in the meantime, the move is dropped.
 * - Nothing moves while a pop-up, the end-of-trick animation, the shuffle or an
 *   auto deal is on screen, or while the game is paused or the screen isn't the game.
 * - Reactions (😂 and the catch-phrases) come from `reactionFor`, with limits.
 *
 * `botsTick()` runs after every draw (game.ts afterRender), so the driver
 * never needs its own loop: each move's redraw asks for the next one.
 */

import { decide, type Decision } from '../ai/decide.ts';
import { reactionFor } from '../ai/react.ts';
import { rebuild, remember, type Memory } from '../ai/memory.ts';
import { thinkMs, type Persona } from '../ai/persona.ts';
import { seenBy, type AiSeen } from '../ai/seen.ts';
import { defaultRng } from '../rules/rng.ts';
import type { PlayerId, Session, SessionAction, SessionEvent } from '../session/types.ts';
import { CATCH_PHRASES, runActions, runsSession, shuffling, showReaction, trickAnimating } from './game.ts';
import { setThinking } from './thinking.ts';
import type { BotsInfo, SavedGame } from './storage.ts';
import { getState } from './store.ts';

const rng = defaultRng();
/** A computer player reacts at most once in this many milliseconds. */
const REACT_GAP_MS = 2500;
/** At most this many computer players react to one event. */
const REACT_PER_EVENT = 3;

interface Pending {
  bot: PlayerId;
  /** The log length when the move was decided: if it changed, the move is stale. */
  logLen: number;
  actions: SessionAction[];
  timer: number;
}

/** Driver state for one saved game (keyed by the game's `bots` object). */
interface Driver {
  readonly key: BotsInfo;
  readonly memory: Map<PlayerId, Memory>;
  /** Log events below this index have been learnt by every computer player. */
  seenUpTo: number;
  /** A player whose move was refused waits until the log changes again. */
  readonly skipAt: Map<PlayerId, number>;
  last: PlayerId | null;
  readonly lastReact: Map<PlayerId, number>;
}

let driver: Driver | null = null;
let pending: Pending | null = null;

function isBot(s: Session, id: PlayerId): boolean {
  return s.players.find((p) => p.id === id)?.computer === true;
}

/** True when a move may be made now (nothing on screen is waiting for the person). */
function canMove(g: SavedGame): boolean {
  const st = getState();
  const s = g.session;
  if (st.screen !== 'game' || s.paused || s.ended || s.phase === 'gameOver') return false;
  if (st.popups.length || trickAnimating() || shuffling()) return false;
  if (s.phase === 'dealing' && s.deal?.mode === 'auto' && s.deal.nextSeat !== null) return false;
  return true;
}

function stop(): void {
  if (pending) {
    window.clearTimeout(pending.timer);
    pending = null;
  }
  setThinking(null);
}

/**
 * The driver for this game. A new game (or a game loaded again after a page
 * reload) starts with every computer player's memory rebuilt from the public
 * log of the current round (`rebuild`).
 */
function driverFor(g: SavedGame): Driver {
  const info = g.bots!;
  if (driver && driver.key === info) return driver;
  stop();
  const s = g.session;
  const memory = new Map<PlayerId, Memory>();
  for (const id of s.order) {
    const seat = info.seats[id];
    if (seat && isBot(s, id)) memory.set(id, rebuild(id, seat.level, s, rng));
  }
  driver = {
    key: info,
    memory,
    seenUpTo: s.log.length,
    skipAt: new Map(),
    last: null,
    lastReact: new Map(),
  };
  return driver;
}

/** Shows reactions from the computer players for the events just learnt (CODE.md 9m.3 react.ts). */
function reactTo(d: Driver, s: Session, events: readonly SessionEvent[], bots: readonly PlayerId[], seats: BotsInfo['seats']): void {
  const humans = s.players.filter((p) => !p.computer).map((p) => p.id);
  const now = Date.now();
  for (const e of events) {
    let shown = 0;
    for (const id of bots) {
      if (shown >= REACT_PER_EVENT) break;
      if (now - (d.lastReact.get(id) ?? 0) < REACT_GAP_MS) continue;
      const r = reactionFor(e, id, humans, seats[id]!, rng, CATCH_PHRASES);
      if (r === null) continue;
      d.lastReact.set(id, now);
      shown += 1;
      window.setTimeout(() => { showReaction(id, r); }, 300 + Math.random() * 900);
    }
  }
}

/**
 * Called after every draw. Learns the new public events, then schedules the
 * next computer move (if one is ready). Safe to call at any time.
 */
export function botsTick(): void {
  const g = getState().game;
  if (!g?.bots || !runsSession(g) || !canMove(g)) {
    stop();
    return;
  }
  const s = g.session;
  if (pending) {
    if (pending.logLen === s.log.length) return; // the move already waiting is still right
    stop();
  }
  const d = driverFor(g);
  const bots = s.order.filter((id) => isBot(s, id) && g.bots!.seats[id]);

  // Everyone learns what has happened since the last look (public events only).
  const seens = new Map<PlayerId, AiSeen>();
  for (const id of bots) {
    const seen = seenBy(s, id, d.seenUpTo);
    remember(d.memory.get(id)!, seen.events, rng);
    seens.set(id, seen);
  }
  const fresh = bots.length ? seens.get(bots[0]!)!.events : [];
  d.seenUpTo = s.log.length;
  if (g.bots.reactions) reactTo(d, s, fresh, bots, g.bots.seats);

  // The first computer player in seat order (after the last one that moved) with a move.
  const start = d.last ? (bots.indexOf(d.last) + 1) % Math.max(1, bots.length) : 0;
  for (let k = 0; k < bots.length; k++) {
    const id = bots[(start + k) % bots.length]!;
    if (d.skipAt.get(id) === s.log.length) continue;
    const seat = g.bots.seats[id]!;
    let decision: Decision | null;
    try {
      decision = decide(seens.get(id)!, d.memory.get(id)!, seat, rng);
    } catch (err) {
      console.error('Computer player could not decide', id, err);
      d.skipAt.set(id, s.log.length);
      continue;
    }
    if (decision) {
      schedule(d, id, decision, s.log.length, g.bots.speed);
      return;
    }
  }
  setThinking(null);
}

function schedule(d: Driver, id: PlayerId, decision: Decision, logLen: number, speed: BotsInfo['speed']): void {
  const timer = window.setTimeout(fire, thinkMs(decision.think, speed, rng));
  pending = { bot: id, logLen, actions: decision.actions, timer };
  d.last = id;
  setThinking(id);
}

/** The thinking time is up: send the move, unless the game has moved on or can't take it now. */
function fire(): void {
  const p = pending;
  pending = null;
  setThinking(null);
  const g = getState().game;
  if (!p || !g?.bots || !driver) return;
  if (g.session.log.length !== p.logLen || !canMove(g)) {
    botsTick();
    return;
  }
  const err = runActions(p.actions);
  if (err) {
    // Should never happen (decide() only returns legal moves): skip that player until the log changes.
    console.error('Computer move refused:', err);
    driver.skipAt.set(p.bot, g.session.log.length);
    botsTick();
  }
  // A move that worked redraws the game, which calls botsTick for the next one.
}
