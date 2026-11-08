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
import { eventFor, logFor, phoneActions, redactSession, type GameUpdate, type NetInfo } from '../net/netgame.ts';
import type { ToJoiner } from '../net/lobby.ts';
import { getState, say, update } from './store.ts';
import { receive, runActions, startShuffle } from './game.ts';
import { sfx } from '../audio/sfx.ts';
import { clearSwapReveal } from './roundstart.ts';
import type { SavedGame } from './storage.ts';

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

export function setTransport(t: Transport): void {
  transport = t;
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

/** Host pressed Start: the game begins on every phone. */
export function hostStart(session: Session, links: Record<PlayerId, string>, me: PlayerId): void {
  linkOf = {};
  for (const [p, l] of Object.entries(links)) if (l !== 'host') linkOf[p] = l;
  sentLog.clear();
  const g: SavedGame = { session, stage: 'hand', holder: me, trickLog: [], lastTrick: null, notes: {}, net: { role: 'host', me } };
  update({ game: g, screen: 'game', popups: [], selected: null, armed: null, menuOpen: false });
  startShuffle();
  for (const p of Object.keys(linkOf)) sendUpdate(p, session, [], true);
}

function sendUpdate(p: PlayerId, s: Session, events: readonly SessionEvent[], full: boolean): void {
  const link = linkOf[p];
  if (!link || !transport) return;
  const from = full ? 0 : (sentLog.get(link) ?? 0);
  const msg: GameUpdate = {
    t: 'game',
    me: p,
    full,
    session: redactSession(s, p),
    log: logFor(s.log.slice(from), p),
    events: full ? [] : events.filter((e) => eventFor(e, p)),
  };
  if (transport.sendTo(link, msg)) sentLog.set(link, s.log.length);
}

/** game.ts `send` on the host's phone, after every change. */
export function hostBroadcast(s: Session, events: readonly SessionEvent[]): void {
  for (const p of Object.keys(linkOf)) sendUpdate(p, s, events, false);
}

/** Moves from another phone. */
export function hostGotAct(linkId: string, raw: unknown): void {
  const g = getState().game;
  const p = playerOfLink(linkId);
  if (!g?.net || g.net.role !== 'host' || !p) return;
  const checked = phoneActions(raw, p);
  if ('why' in checked) { transport?.sendTo(linkId, { t: 'nope', why: checked.why }); return; }
  const why = runActions(checked.actions);
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
  const g = getState().game;
  const have = g?.net?.role === 'join' ? g : null;
  if (!m.full && !have) { transport?.sendHost({ t: 'sync' }); return; }
  const log = m.full || !have ? m.log : [...have.session.log, ...m.log];
  const session: Session = { ...m.session, log };
  if (!have) {
    // First message: the game starts on this phone.
    const fresh: SavedGame = { session, stage: 'hand', holder: m.me, trickLog: [], lastTrick: null, notes: {}, net: { role: 'join', me: m.me } };
    update({ game: fresh, screen: 'game', popups: [], selected: null, armed: null, menuOpen: false, rulesOpen: false });
    startShuffle();
    return;
  }
  receive(session, m.events);
}

export function joinNope(why: string): void {
  clearSwapReveal();
  sfx('notAllowed');
  say(why);
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

(window as unknown as Record<string, unknown>)['pubbyNet'] = {
  info: () => netInfo(),
  session: () => getState().game?.session ?? null,
  /** Send moves exactly as this phone's screens would (to check the host refuses bad ones). */
  send: (actions: SessionAction[]) => (netInfo()?.role === 'join' ? joinSend(actions) : runActions(actions) === null),
};
