/**
 * Network play glue (Phase 4 slice 2, CODE.md section 9j).
 *
 * Host's phone: runs the session as in pass-and-play. After every move
 * (game.ts `send`) it sends each other phone its own copy (`redactSession`) and
 * the events of the move. Moves from other phones arrive as `act` messages,
 * are checked (`phoneActions`: only for that phone's own player) and run
 * through the same `send`.
 *
 * Joining phone: never runs the rules. Its moves go to the host; what comes
 * back is drawn with the same screens (game.ts `receive`).
 *
 * The links themselves (WebRTC, pings, lost phones) stay in netlobby.ts.
 */

import type { PlayerId, Session, SessionAction, SessionEvent } from '../session/types.ts';
import { eventFor, logFor, phoneActions, redactSession, stampHostTime, type GameUpdate, type NetInfo } from '../net/netgame.ts';
import type { ToJoiner } from '../net/lobby.ts';
import { getState, say, update } from './store.ts';
import { phoneBusyNow, receive, runActions, showMessage, showReaction, startShuffle } from './game.ts';
import { sfx } from '../audio/sfx.ts';
import { clearSwapReveal } from './roundstart.ts';
import { makesPopup } from './popupevents.ts';
import { deleteHost, deleteJoin, loadHost, loadJoin, saveHostNow, saveJoinNow } from './rejoin.ts';
import { clearWait, newWaits, nextSeq, noteAck, pendingPlayers, startWait, type PopupWaits } from '../net/popupwait.ts';
import { setPendingPlayers } from '../net/busy.ts';
import { isAwayPlayer } from '../net/away.ts';
import type { BotsInfo, SavedGame } from './storage.ts';

export type { NetInfo };

/** How the host's phone reaches the others (set by netlobby.ts). */
export interface Transport {
  sendTo(linkId: string, msg: ToJoiner): boolean;
  sendHost(msg: unknown): boolean;
}

let transport: Transport | null = null;
/** Host: player id → link id ("c1"…) for every other phone. */
let linkOf: Record<PlayerId, string> = {};
/** Host: how many entries of the full log each link has been sent. */
const sentLog = new Map<string, number>();
/** Joining phone: host clock minus this phone's clock (ms), from the last game message. */
let clockOffset = 0;

export function setTransport(t: Transport): void {
  transport = t;
}

/** The host's clock as this phone knows it (pause countdowns use it, so phone clocks don't matter). */
export function hostClock(): number {
  return Date.now() + clockOffset;
}

export function netInfo(): NetInfo | null {
  return getState().game?.net ?? null;
}

export function inNetGame(): boolean {
  return !!getState().game?.net;
}

function playerOfLink(linkId: string): PlayerId | null {
  return Object.keys(linkOf).find((p) => linkOf[p] === linkId) ?? null;
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

/**
 * Host pressed Start: the game begins on every phone. `bots` (CODE.md 9u C3) are the
 * computer players, which run on this phone only: they have no link.
 */
export function hostStart(session: Session, links: Record<PlayerId, string>, me: PlayerId, bots?: BotsInfo): void {
  linkOf = {};
  waits = newWaits();
  setPendingPlayers([]);
  for (const [p, l] of Object.entries(links)) if (l !== 'host' && l !== 'bot') linkOf[p] = l;
  sentLog.clear();
  const g: SavedGame = { session, stage: 'hand', holder: me, trickLog: [], lastTrick: null, notes: {}, net: { role: 'host', me }, ...(bots ? { bots } : {}) };
  // Shuffle first, so the first screen drawn already shows it (2.4 fix).
  startShuffle();
  update({ game: g, screen: 'game', popups: [], selected: null, armed: null, menuOpen: false });
  for (const p of Object.keys(linkOf)) sendUpdate(p, session, [], true);
}

/** 9an.5 (E-a, E-c, 2.38): the host's pop-up waits, per player. */
let waits: PopupWaits = newWaits();
/** 9an.5 (E-e): the update number this phone last drew (a gap later asks for a sync, Part F). */
let lastSeq = 0;
/** 9an.5 (E-g): test hook, a fixed delay before a joining phone reads what the host sent. */
let testDelay = 0;

/** A player the host is waiting on, sent to the busy set (never an away phone). */
function publishWaits(): void {
  setPendingPlayers(pendingPlayers(waits, Object.keys(linkOf)).filter((p) => !isAwayPlayer(p)));
}

/** 9an.5 (item 6): a phone that has not answered within 8 s gets a full copy and the wait ends. */
const ANSWER_MS = 8000;
function armGuard(p: PlayerId, seq: number): void {
  window.setTimeout(() => {
    if (waits.waitSeq[p] !== seq) return; // answered, or a newer update is being waited on
    console.warn(`Pubby: ${p} did not answer update ${seq} within ${ANSWER_MS / 1000} s; sending the whole game again.`);
    clearWait(waits, p);
    publishWaits();
    const g = getState().game;
    if (g?.net?.role === 'host') sendUpdate(p, g.session, [], true);
  }, ANSWER_MS);
}

function sendUpdate(p: PlayerId, s: Session, events: readonly SessionEvent[], full: boolean): void {
  const link = linkOf[p];
  if (!link || !transport) return;
  const from = full ? 0 : (sentLog.get(link) ?? 0);
  const seq = nextSeq(waits, p);
  // E-a: an update that may make a pop-up must be answered once drawn, even if nothing changes on the phone.
  const ack = !full && events.some((e) => makesPopup(e, p));
  const msg: GameUpdate = {
    t: 'game',
    me: p,
    full,
    session: redactSession(s, p),
    log: logFor(s.log.slice(from), p),
    events: full ? [] : events.filter((e) => eventFor(e, p)),
    hostNow: Date.now(),
    seq,
    ...(ack ? { ack: true } : {}),
  };
  if (!transport.sendTo(link, msg)) return;
  sentLog.set(link, s.log.length);
  if (ack) { startWait(waits, p, seq); armGuard(p, seq); }
  publishWaits();
}

/** 9an.5 (E-a): a phone has drawn update `seq`. */
export function hostGotBusy(linkId: string, seq: number): void {
  const p = playerOfLink(linkId);
  if (!p) return;
  noteAck(waits, p, seq);
  publishWaits();
}

/** 2.27 (CODE.md 9v.5): tells every joining phone the host is skipping to the end of the round (or has stopped). */
export function hostSendSkipping(on: boolean): void {
  for (const link of Object.values(linkOf)) transport?.sendTo(link, { t: 'skipping', on });
}

/** CODE.md 9u C4: a computer player's reaction goes to every other phone too (the host shows it as well). */
export function hostSendReaction(from: PlayerId, r: number): void {
  for (const link of Object.values(linkOf)) transport?.sendTo(link, { t: 'react', from, r });
}

/** game.ts `send` on the host's phone, after every change. */
export function hostBroadcast(s: Session, events: readonly SessionEvent[]): void {
  for (const p of Object.keys(linkOf)) sendUpdate(p, s, events, false);
  // G-d (2.38): the host's game is saved after every change, so a reload comes back to it (rejoin.ts).
  if (s.ended) deleteHost(); else saveHostNow(s);
}

/**
 * G-e (2.38): puts a saved game back on the host's phone. Sends nothing: the phones are
 * told when the room answers (their "joined" leads to a whole-game resend, see addOnlineLink).
 */
export function hostResume(game: SavedGame, links: Record<PlayerId, string>): void {
  linkOf = {};
  for (const [p, l] of Object.entries(links)) if (l !== 'host' && l !== 'bot') linkOf[p] = l;
  sentLog.clear();
  waits = newWaits();
  setPendingPlayers([]);
  update({ game, screen: 'game', popups: [], selected: null, armed: null, menuOpen: false });
}

/** Moves from another phone. */
export function hostGotAct(linkId: string, raw: unknown): void {
  const g = getState().game;
  const p = playerOfLink(linkId);
  if (!g?.net || g.net.role !== 'host' || !p) return;
  const checked = phoneActions(raw, p);
  if ('why' in checked) { transport?.sendTo(linkId, { t: 'nope', why: checked.why }); return; }
  const why = runActions(stampHostTime(checked.actions, Date.now()));
  if (why) transport?.sendTo(linkId, { t: 'nope', why });
}

/** A phone asked for the whole game again. */
export function hostSync(linkId: string): void {
  const g = getState().game;
  const p = playerOfLink(linkId);
  if (g?.net?.role === 'host' && p) sendUpdate(p, g.session, [], true);
}

// ---------------------------------------------------------------------------
// Joining phone
// ---------------------------------------------------------------------------

/** A move on a joining phone: off to the host, which sends the result back. */
export function joinSend(actions: readonly SessionAction[]): boolean {
  if (!transport?.sendHost({ t: 'act', actions })) {
    sfx('notAllowed');
    say('Not connected to the host.');
    return false;
  }
  // This phone's move is on its way: its raised card and any "tap again" are done with.
  update({ selected: null, armed: null });
  return true;
}

export function joinGotGame(m: GameUpdate): void {
  clockOffset = m.hostNow - Date.now();
  // G-b (2.38): a joining phone keeps its room for a reload; an ended game forgets it.
  window.setTimeout(() => { if (m.session.ended) deleteJoin(); else saveJoinNow(); }, 0);
  const g = getState().game;
  const have = g?.net?.role === 'join' ? g : null;
  if (!m.full && !have) { transport?.sendHost({ t: 'sync' }); return; }
  // 9an.6 (F-3, 2.38): a skipped update number means one was lost. Apply this one, then ask for the whole game once.
  const gap = !m.full && have !== null && m.seq !== undefined && m.seq !== lastSeq + 1;
  if (gap) window.setTimeout(() => transport?.sendHost({ t: 'sync' }), 0);
  if (m.seq !== undefined) lastSeq = m.seq;
  if (m.ack && m.seq !== undefined) answerAfterDraw(m.seq);
  const log = m.full || !have ? m.log : [...have.session.log, ...m.log];
  const session: Session = { ...m.session, log };
  if (!have) {
    // First message: the game starts on this phone.
    const fresh: SavedGame = { session, stage: 'hand', holder: m.me, trickLog: [], lastTrick: null, notes: {}, net: { role: 'join', me: m.me } };
    startShuffle();
    update({ game: fresh, screen: 'game', popups: [], selected: null, armed: null, menuOpen: false, rulesOpen: false });
    return;
  }
  receive(session, m.events);
}

/** 9an.5 (E-a): once this update is on screen, tell the host what this phone shows (even when nothing changed). */
function answerAfterDraw(seq: number): void {
  window.setTimeout(() => {
    transport?.sendHost({ t: 'busy', on: phoneBusyNow(), seq });
  }, 0);
}

/** 9an.6 (F-5): test hook, the number of game updates still to drop on this phone. */
let dropNext = 0;

/** True when the next game update should be dropped (test hook); consumes one drop. */
export function takeDrop(): boolean {
  if (dropNext <= 0) return false;
  dropNext--;
  return true;
}

/** For the joining phone's gap check (Part F) and tests. */
export function joinLastSeq(): number {
  return lastSeq;
}

/** 9an.5 (E-g): the test hook's delay, applied by the phone's message reader. */
export function joinDelayMs(): number {
  return testDelay;
}

export function joinNope(why: string): void {
  clearSwapReveal();
  sfx('notAllowed');
  say(why);
}

// ---------------------------------------------------------------------------
// Reactions (2.4): shown on every phone, from the sender's seat
// ---------------------------------------------------------------------------

/** Host: when each link last sent reactions, to keep a stuck finger from flooding the table. */
const reactTimes = new Map<string, number[]>();
const REACT_BURST = 6;
const REACT_WINDOW_MS = 3000;

/** This phone sent a reaction (already shown here): pass it on. */
export function sendReaction(r: number): void {
  const g = getState().game;
  if (!g?.net || !transport) return;
  if (g.net.role === 'join') { transport.sendHost({ t: 'react', r }); return; }
  for (const link of Object.values(linkOf)) transport.sendTo(link, { t: 'react', from: g.net.me, r });
}

/** Host: a reaction from another phone: show it, and pass it to the rest. */
export function hostGotReact(linkId: string, r: number): void {
  const g = getState().game;
  const p = playerOfLink(linkId);
  if (!g?.net || g.net.role !== 'host' || !p) return;
  const now = Date.now();
  const recent = (reactTimes.get(linkId) ?? []).filter((t) => now - t < REACT_WINDOW_MS);
  if (recent.length >= REACT_BURST) return;
  recent.push(now);
  reactTimes.set(linkId, recent);
  if (!showReaction(p, r)) return;
  for (const [q, link] of Object.entries(linkOf)) if (q !== p) transport?.sendTo(link, { t: 'react', from: p, r });
}

export function joinGotReact(from: PlayerId, r: number): void {
  if (getState().game?.net?.role === 'join') showReaction(from, r);
}

// ---------------------------------------------------------------------------
// Typed messages (CODE.md 9ad.5, 2.34): the same routes and flood limit as reactions
// ---------------------------------------------------------------------------

/** This phone sent a typed message (already cleaned): show it here and pass it on. */
export function sendMessage(text: string): void {
  const g = getState().game;
  if (!g) return;
  // One phone (or single player against the computer): nobody is "this phone's player", so use the host's seat (or the human's).
  if (!g.net) { showMessage(g.bots?.me ?? g.session.hostId, text); return; }
  const me = g.net.me;
  showMessage(me, text);
  if (!transport) return;
  if (g.net.role === 'join') { transport.sendHost({ t: 'say', text }); return; }
  for (const link of Object.values(linkOf)) transport.sendTo(link, { t: 'say', from: me, text });
}

/** Host: a typed message from another phone: show it, and pass it to the rest. */
export function hostGotSay(linkId: string, text: string): void {
  const g = getState().game;
  const p = playerOfLink(linkId);
  if (!g?.net || g.net.role !== 'host' || !p) return;
  const now = Date.now();
  const recent = (reactTimes.get(linkId) ?? []).filter((t) => now - t < REACT_WINDOW_MS);
  if (recent.length >= REACT_BURST) return;
  recent.push(now);
  reactTimes.set(linkId, recent);
  if (!showMessage(p, text)) return;
  for (const [q, link] of Object.entries(linkOf)) if (q !== p) transport?.sendTo(link, { t: 'say', from: p, text });
}

export function joinGotSay(from: PlayerId, text: string): void {
  if (getState().game?.net?.role === 'join') showMessage(from, text);
}

// ---------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------

/**
 * The link to the host ended while this phone was in the game. A finished game
 * stays on screen (the host going home closes the links); otherwise the lobby
 * screen shows what happened (lost, closed, removed).
 */
export function joinEnded(): void {
  const g = getState().game;
  if (!g?.net) return;
  if (g.session.ended) return;
  update({ game: null, screen: 'netlobby', popups: [], menuOpen: false, rulesOpen: false, soundOpen: false });
}

/** Lobby seats changed during the game (a phone lost its link): redraw the banner. */
export function netChanged(): void {
  if (getState().screen === 'game' && inNetGame()) update({});
}

// ---------------------------------------------------------------------------
// Automated test hook (testbed/netgame_check.py)
// ---------------------------------------------------------------------------

/** G-h: a saved game with its token replaced, for the checks. */
function hideToken<T extends object>(v: T | null, key: string): T | null {
  return v === null ? null : { ...v, [key]: '…' };
}

(window as unknown as Record<string, unknown>)['pubbyNet'] = {
  info: () => netInfo(),
  session: () => getState().game?.session ?? null,
  /** 9an.7 (G-h): the saved online games (tokens hidden), for the reload checks. */
  saved: () => ({
    join: hideToken(loadJoin(), 'joinToken'),
    host: hideToken(loadHost(), 'hostToken'),
  }),
  /** 9an.6 (F-5): drop the next N game updates on this phone (checks only, to test the gap). */
  get dropNext(): number { return dropNext; },
  set dropNext(n: number) { dropNext = Math.max(0, Math.round(n)); },
  /** 9an.5 (E-g): a delay in ms before this phone reads what the host sends (checks only). */
  get delayMs(): number { return testDelay; },
  set delayMs(ms: number) { testDelay = Math.max(0, Math.round(ms)); },
  /** Send moves exactly as this phone's screens would (to check the host refuses bad ones). */
  send: (actions: SessionAction[]) => (netInfo()?.role === 'join' ? joinSend(actions) : runActions(actions) === null),
};
