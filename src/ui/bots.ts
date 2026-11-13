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
 *
 * 2.27 (CODE.md 9v): Fast forward shortens thinking times. Skip to end of round
 * plays the rest of the round in chunks from `skipChunk()`, with no thinking time,
 * no reactions and no pop-ups except the round-over one.
 */

import { decide, type Decision } from '../ai/decide.ts';
import { reactionFor } from '../ai/react.ts';
import { rebuild, remember, type Memory } from '../ai/memory.ts';
import { thinkMs, type Persona } from '../ai/persona.ts';
import { seenBy, type AiSeen } from '../ai/seen.ts';
import {
  botsOnlyNow, fastForwardMs, fastForwardOn, personsOut, resetFastForward, setFastForward,
  setInstantSkipping, setSkipNote, setSkipping, skipping,
} from '../ai/fastforward.ts';
import { defaultRng } from '../rules/rng.ts';
import type { PlayerId, Session, SessionAction, SessionEvent } from '../session/types.ts';
import { actorOf, CATCH_PHRASES, runActions, runsSession, shuffling, showReaction, trickAnimating } from './game.ts';
import { setThinking } from './thinking.ts';
import { hostSendReaction, hostSendSkipping } from './netplay.ts';
import type { BotsInfo, SavedGame } from './storage.ts';
import { getState, update } from './store.ts';

const rng = defaultRng();
/** A computer player reacts at most once in this many milliseconds. */
const REACT_GAP_MS = 2500;
/** At most this many computer players react to one event. */
const REACT_PER_EVENT = 3;
/** 9v.4: computer moves per chunk of a skip, and the pause between chunks. */
const SKIP_CHUNK = 20;
const SKIP_CHUNK_GAP_MS = 30;
/** 9v.4: a skip stops after this many moves (a safety cap against a loop). */
const SKIP_CAP = 2000;
/** 9v.4: how long a skip waits while a trick or the shuffle animates. */
const SKIP_WAIT_MS = 60;

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
/** 9v.4: identifies the current skip, so an old chunk timer does nothing after a restart. */
let skipToken = 0;

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

/** Something on screen (or a request) is waiting for a person (CODE.md 9v.2). */
function waitingForPerson(s: Session): boolean {
  return getState().popups.length > 0
    || s.vote !== null
    || s.tap !== null
    || s.pauseRequests.length > 0
    || s.takeRequests.some((r) => !r.agreed && !isBot(s, r.target));
}

/**
 * CODE.md 9v.2: the game is waiting only on computer players and the person is
 * out of the round. The menu's Fast forward and Skip items are offered only then.
 */
export function botsOnlyFor(g: SavedGame): boolean {
  const s = g.session;
  if (s.phase !== 'playing' || !s.play) return false;
  return botsOnlyNow({
    actor: actorOf(s),
    isComputer: (id) => isBot(s, id),
    waitingForPerson: waitingForPerson(s),
    personOut: personsOut(s),
    paused: s.paused,
    ended: s.ended !== null,
  });
}

/** Fast forward and skip end when a person must act (the rule's "a person must act"). */
function mustAct(g: SavedGame): boolean {
  const s = g.session;
  const actor = actorOf(s);
  return s.phase !== 'playing' || s.paused || s.ended !== null || !personsOut(s)
    || (actor !== null && !isBot(s, actor));
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
  // 9v.3: with Fast forward on, the reaction delay is shorter (the gap between reactions is not changed).
  const fast = fastForwardOn();
  for (const e of events) {
    let shown = 0;
    for (const id of bots) {
      if (shown >= REACT_PER_EVENT) break;
      if (now - (d.lastReact.get(id) ?? 0) < REACT_GAP_MS) continue;
      const r = reactionFor(e, id, humans, seats[id]!, rng, CATCH_PHRASES);
      if (r === null) continue;
      d.lastReact.set(id, now);
      shown += 1;
      const delay = fast ? Math.random() * 300 : 300 + Math.random() * 900;
      window.setTimeout(() => {
        showReaction(id, r);
        // CODE.md 9u C4: in a network game the host's phone sends it to the other phones.
        if (getState().game?.net?.role === 'host') hostSendReaction(id, r);
      }, delay);
    }
  }
}

/**
 * Learns what has happened since the last look (every computer player), and
 * finds the first computer player with a move. Schedules nothing. Reactions
 * are shown only when `react` is true (9v.4: none while skipping).
 */
function learnAndPick(g: SavedGame, d: Driver, react: boolean): { id: PlayerId; decision: Decision } | null {
  const s = g.session;
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
  if (react && g.bots!.reactions) reactTo(d, s, fresh, bots, g.bots!.seats);

  // The first computer player in seat order (after the last one that moved) with a move.
  const start = d.last ? (bots.indexOf(d.last) + 1) % Math.max(1, bots.length) : 0;
  for (let k = 0; k < bots.length; k++) {
    const id = bots[(start + k) % bots.length]!;
    if (d.skipAt.get(id) === s.log.length) continue;
    const seat = g.bots!.seats[id]!;
    let decision: Decision | null;
    try {
      decision = decide(seens.get(id)!, d.memory.get(id)!, seat, rng);
    } catch (err) {
      console.error('Computer player could not decide', id, err);
      d.skipAt.set(id, s.log.length);
      continue;
    }
    if (decision) return { id, decision };
  }
  return null;
}

/**
 * Called after every draw. Learns the new public events, then schedules the
 * next computer move (if one is ready). Safe to call at any time.
 */
export function botsTick(): void {
  const g = getState().game;
  if (!g?.bots) {
    // No computer players in this game: the options can't be on (9v.1).
    resetFastForward();
    stop();
    return;
  }
  if (!runsSession(g) || !canMove(g)) {
    stop();
    return;
  }
  if (mustAct(g)) resetFastForward();
  const s = g.session;
  if (pending) {
    if (pending.logLen === s.log.length) return; // the move already waiting is still right
    stop();
  }
  const d = driverFor(g);
  const found = learnAndPick(g, d, !skipping());
  if (!found) {
    setThinking(null);
    return;
  }
  // While skipping, the skip loop plays the move itself (CODE.md 9v.4).
  if (skipping()) return;
  schedule(d, found.id, found.decision, s.log.length, g.bots.speed);
}

function schedule(d: Driver, id: PlayerId, decision: Decision, logLen: number, speed: BotsInfo['speed']): void {
  const timer = window.setTimeout(fire, fastForwardMs(thinkMs(decision.think, speed, rng), fastForwardOn()));
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

// ---------------------------------------------------------------------------
// CODE.md 9v (2.27): Fast forward and Skip to end of round
// ---------------------------------------------------------------------------

/** Tells the joining phones (network game, host only): the host is skipping or has stopped. */
function setSkippingNow(on: boolean): void {
  setSkipping(on);
  if (getState().game?.net?.role === 'host') hostSendSkipping(on);
}

/**
 * Fast forward (the menu item and the bottom button). 2.32.1: the visible quick play
 * (what Skip used to show), in chunks, so the table still shows each trick. It stays on
 * until Stop or a person must act. Stop is the one button at the bottom.
 */
export function startFastForward(): void {
  const g = getState().game;
  if (!g?.bots || !runsSession(g) || !botsOnlyFor(g)) return;
  stop();
  setSkipNote(null);
  setFastForward(true);
  setSkippingNow(true);
  skipMoves = 0;
  const token = ++skipToken;
  skipChunk(token);
}

/**
 * Skip to end of round (the menu item and the bottom button). 2.32.1: plays every
 * computer move left in the round in one go, with nothing shown on the way. The
 * round-over pop-up then names the winner (`popupsFor` in game.ts).
 */
export function startSkip(): void {
  const g = getState().game;
  if (!g?.bots || !runsSession(g) || !botsOnlyFor(g)) return;
  stop();
  setFastForward(false);
  setSkipNote(null);
  skipToken++; // any Fast forward chunk still waiting does nothing
  setInstantSkipping(true);
  let moves = 0;
  try {
    while (moves < SKIP_CAP) {
      const cur = getState().game;
      if (!cur?.bots || !runsSession(cur) || !botsOnlyFor(cur)) break;
      const found = learnAndPick(cur, driverFor(cur), false);
      if (!found) break;
      const err = runActions(found.decision.actions);
      if (err) {
        console.error('Computer move refused during skip:', err);
        break;
      }
      moves += 1;
    }
    if (moves >= SKIP_CAP) {
      console.error('Skip to end of round stopped: too many moves');
      setSkipNote('Stopped: too many moves');
    }
  } finally {
    setInstantSkipping(false);
  }
  update({});
}

/** The Stop button: ends Fast forward or a skip at the next move. */
export function stopFastForward(): void {
  setFastForward(false);
  if (skipping()) {
    skipToken++; // any chunk already waiting does nothing
    setSkippingNow(false);
  }
  update({});
}

let skipMoves = 0;

/** Ends a skip and hands the game back to the normal driver. */
function endSkip(): void {
  skipToken++;
  setSkippingNow(false);
  update({}); // redraws (the banner goes) and runs botsTick
}

/**
 * 9v.4: plays up to SKIP_CHUNK computer moves, then returns to the browser so
 * Stop still works. Every move goes through `runActions`, as in normal play.
 */
function skipChunk(token: number): void {
  if (token !== skipToken || !skipping()) return;
  const g = getState().game;
  if (!g?.bots || !runsSession(g) || !botsOnlyFor(g)) {
    endSkip();
    return;
  }
  // A trick or the shuffle is still animating: wait for it (its redraw does not restart a skip).
  if (trickAnimating() || shuffling()) {
    window.setTimeout(() => skipChunk(token), SKIP_WAIT_MS);
    return;
  }
  let moved = 0;
  while (moved < SKIP_CHUNK) {
    const cur = getState().game;
    if (!cur?.bots || !botsOnlyFor(cur) || trickAnimating() || shuffling()) break;
    const found = learnAndPick(cur, driverFor(cur), false);
    if (!found) {
      endSkip();
      return;
    }
    if (skipMoves >= SKIP_CAP) {
      console.error('Skip to end of round stopped: too many moves');
      setSkipNote('Stopped: too many moves');
      endSkip();
      return;
    }
    const err = runActions(found.decision.actions);
    if (err) {
      console.error('Computer move refused during skip:', err);
      endSkip();
      return;
    }
    skipMoves += 1;
    moved += 1;
    if (token !== skipToken) return; // a Stop during the move
  }
  window.setTimeout(() => skipChunk(token), SKIP_CHUNK_GAP_MS);
}
