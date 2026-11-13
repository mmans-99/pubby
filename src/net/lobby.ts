/**
 * Network lobby (Phase 4 slice 1, CODE.md section 4a and 9i): the seat list
 * the host's phone keeps while players join over WebRTC, and the messages the
 * phones send each other. Pure: no DOM, no WebRTC, so it can be unit-tested.
 *
 * The host's phone owns the lobby. Joining phones only send their name and
 * changes to it; the host sends every phone the whole lobby after each change.
 */

import { jokerCount, MAX_PLAYERS, MIN_PLAYERS } from '../rules/cards.ts';
import { readGameUpdate, type GameRefused, type GameUpdate } from './netgame.ts';
import { joinNames } from '../session/names.ts';
import type { Level, Speed } from '../ai/persona.ts';

/** Bumped when the messages change, so mixed phones refuse each other. 2: game messages (slice 2). 3: reactions, host adding (2.4). 4: online rooms (2.18). 5: ready at the table (2.19). 6: cards seen after the swap (2.20). 7: away seats and the away/back messages (2.25). 8: computer players in the lobby (2.26). */
export const LOBBY_PROTOCOL = 8; // 8: computer players in the lobby (2.26).
export const NAME_MAX = 16;

export interface LobbySeat {
  /** Link id: "host" for the host's phone, "c1", "c2"… for joining phones. */
  id: string;
  profileName: string;
  /** Optional name for this game only. Empty means use the profile name. */
  sessionName: string;
  isHost: boolean;
  /** False when a phone lost its link after the game was set (slice 4 rejoins). */
  connected: boolean;
  /** Phase 4d: this phone has reached the table screen (the host's phone is always ready). */
  ready: boolean;
  /** CODE.md 9u Part A: the phone left the screen (or lost its link) at this host time (ms). The seat is kept for AWAY_MS. */
  awaySince?: number;
  /** CODE.md 9u Part C (2.26): a computer player, on the host's phone only. Its id is "b1", "b2"… */
  bot?: { level: Level };
}

export interface Lobby {
  seats: LobbySeat[];
  jokers: boolean;
  pauseLimit: number | null;
  /** The host pressed Start: no more joining (no late joining). */
  started: boolean;
  /** The host is adding a player right now (2.4: shown on the other phones). */
  adding?: boolean;
  /** CODE.md 9u C2: the computer players' speed and reactions (host options; shown on every phone). */
  botSpeed?: Speed;
  botReactions?: boolean;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Joining phone → host. */
export type ToHost =
  | { t: 'hello'; protocol: number; version: string; profileName: string; sessionName: string }
  | { t: 'rename'; sessionName: string }
  | { t: 'leave' }
  | { t: 'ping' }
  /** Moves in a network game; checked with `phoneActions` (netgame.ts). */
  | { t: 'act'; actions: unknown }
  /** Send me the whole game again. */
  | { t: 'sync' }
  /** A reaction (2.4): -1 = the laugh, else a catch-phrase number. */
  | { t: 'react'; r: number }
  /** Phase 4d: this phone has reached the table screen. */
  | { t: 'ready' }
  /** CODE.md 9u A5: this phone left the screen, and is back. */
  | { t: 'away' }
  | { t: 'back' };

/** Host → joining phone. */
export type ToJoiner =
  | { t: 'lobby'; you: string; lobby: Lobby }
  | { t: 'refused'; why: string }
  | { t: 'removed' }
  | { t: 'closed' }
  | { t: 'ping' }
  | GameUpdate
  | GameRefused
  /** Someone's reaction, for every other phone (2.4). */
  | { t: 'react'; from: string; r: number }
  /** CODE.md 9u A5: the host's phone left the screen, and is back. */
  | { t: 'hostAway' }
  | { t: 'hostBack' };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isStr = (x: unknown): x is string => typeof x === 'string';

/** A message from a joining phone, or null if it isn't one. */
export function readToHost(raw: unknown): ToHost | null {
  if (!isObj(raw)) return null;
  switch (raw['t']) {
    case 'hello':
      if (typeof raw['protocol'] !== 'number' || !isStr(raw['version']) || !isStr(raw['profileName']) || !isStr(raw['sessionName'])) return null;
      return { t: 'hello', protocol: raw['protocol'], version: raw['version'], profileName: raw['profileName'], sessionName: raw['sessionName'] };
    case 'rename':
      return isStr(raw['sessionName']) ? { t: 'rename', sessionName: raw['sessionName'] } : null;
    case 'leave': return { t: 'leave' };
    case 'ping': return { t: 'ping' };
    case 'ready': return { t: 'ready' };
    case 'away': return { t: 'away' };
    case 'back': return { t: 'back' };
    case 'act': return { t: 'act', actions: raw['actions'] };
    case 'sync': return { t: 'sync' };
    case 'react': return Number.isInteger(raw['r']) ? { t: 'react', r: raw['r'] as number } : null;
  }
  return null;
}

/** A message from the host, or null if it isn't one. */
export function readToJoiner(raw: unknown): ToJoiner | null {
  if (!isObj(raw)) return null;
  switch (raw['t']) {
    case 'lobby': {
      const l = raw['lobby'];
      if (!isStr(raw['you']) || !isObj(l) || !Array.isArray(l['seats'])) return null;
      const seats: LobbySeat[] = [];
      for (const s of l['seats'] as unknown[]) {
        if (!isObj(s) || !isStr(s['id']) || !isStr(s['profileName']) || !isStr(s['sessionName'])) return null;
        const seat: LobbySeat = { id: s['id'], profileName: s['profileName'], sessionName: s['sessionName'], isHost: s['isHost'] === true, connected: s['connected'] !== false, ready: s['ready'] === true };
        if (typeof s['awaySince'] === 'number') seat.awaySince = s['awaySince'];
        const bot = s['bot'];
        if (isObj(bot) && (bot['level'] === 'easy' || bot['level'] === 'normal' || bot['level'] === 'hard')) seat.bot = { level: bot['level'] };
        seats.push(seat);
      }
      const pl = l['pauseLimit'];
      return {
        t: 'lobby', you: raw['you'],
        lobby: {
          seats, jokers: l['jokers'] !== false, pauseLimit: typeof pl === 'number' ? pl : null, started: l['started'] === true, adding: l['adding'] === true,
          botSpeed: l['botSpeed'] === 'relaxed' || l['botSpeed'] === 'fast' ? l['botSpeed'] : 'normal',
          botReactions: l['botReactions'] !== false,
        },
      };
    }
    case 'refused': return { t: 'refused', why: isStr(raw['why']) ? raw['why'] : 'The host said no.' };
    case 'removed': return { t: 'removed' };
    case 'closed': return { t: 'closed' };
    case 'ping': return { t: 'ping' };
    case 'game': return readGameUpdate(raw);
    case 'nope': return { t: 'nope', why: isStr(raw['why']) ? raw['why'] : 'Not allowed.' };
    case 'react': return isStr(raw['from']) && Number.isInteger(raw['r']) ? { t: 'react', from: raw['from'], r: raw['r'] as number } : null;
    case 'hostAway': return { t: 'hostAway' };
    case 'hostBack': return { t: 'hostBack' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

export function seatName(seat: LobbySeat): string {
  return seat.sessionName.trim() || seat.profileName;
}

// ---------------------------------------------------------------------------
// Lobby changes (host's phone). Each returns a new lobby.
// ---------------------------------------------------------------------------

export function newLobby(hostProfile: string): Lobby {
  return {
    seats: [{ id: 'host', profileName: cleanName(hostProfile), sessionName: '', isHost: true, connected: true, ready: true }],
    jokers: true,
    pauseLimit: null,
    started: false,
    botSpeed: 'normal',
    botReactions: true,
  };
}

/** The next computer player id ("b1", "b2"…), never used by another seat. */
export function nextBotId(lobby: Lobby): string {
  let n = 1;
  while (lobby.seats.some((s) => s.id === `b${n}`)) n += 1;
  return `b${n}`;
}

/** CODE.md 9u C1: a computer player at the end of the table. Always connected and ready. */
export function addBot(lobby: Lobby, id: string, name: string, level: Level): Lobby {
  if (lobby.seats.some((s) => s.id === id)) return lobby;
  return {
    ...lobby,
    seats: [...lobby.seats, { id, profileName: cleanName(name), sessionName: '', isHost: false, connected: true, ready: true, bot: { level } }],
  };
}

/** CODE.md 9u C2: a computer player's level, as the host sets it. */
export function setBotLevel(lobby: Lobby, id: string, level: Level): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id && s.bot ? { ...s, bot: { level } } : s)) };
}

/** Why a new phone can't join right now, or null if it can. */
export function joinProblem(lobby: Lobby, hello: { protocol: number; version: string; profileName: string }, hostVersion: string): string | null {
  if (hello.protocol !== LOBBY_PROTOCOL || hello.version !== hostVersion) {
    return `The phones have different Pubby versions (host ${hostVersion}, this phone ${hello.version}). Open Pubby with internet on both phones to update, then try again.`;
  }
  if (lobby.started) return 'The game has already started. No joining once it has started.';
  if (lobby.seats.length >= MAX_PLAYERS) return `The game is full (${MAX_PLAYERS} players).`;
  if (!cleanName(hello.profileName)) return 'This phone needs a name first.';
  return null;
}

export function addSeat(lobby: Lobby, id: string, profileName: string, sessionName: string): Lobby {
  if (lobby.seats.some((s) => s.id === id)) return lobby;
  return { ...lobby, seats: [...lobby.seats, { id, profileName: cleanName(profileName), sessionName: cleanName(sessionName), isHost: false, connected: true, ready: false }] };
}

export function removeSeat(lobby: Lobby, id: string): Lobby {
  return { ...lobby, seats: lobby.seats.filter((s) => s.id !== id || s.isHost) };
}

export function renameSeat(lobby: Lobby, id: string, sessionName: string): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id ? { ...s, sessionName: cleanName(sessionName) } : s)) };
}

export function moveSeat(lobby: Lobby, id: string, by: -1 | 1): Lobby {
  const i = lobby.seats.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= lobby.seats.length) return lobby;
  const seats = [...lobby.seats];
  [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  return { ...lobby, seats };
}

export function setConnected(lobby: Lobby, id: string, connected: boolean): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id ? { ...s, connected } : s)) };
}

/** CODE.md 9u A5: a phone left the screen (or lost its link) at host time `at`. The seat is kept. */
export function setAway(lobby: Lobby, id: string, at: number): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id && !s.isHost && s.awaySince === undefined ? { ...s, awaySince: at } : s)) };
}

/** CODE.md 9u A5: the phone is back. */
export function setBack(lobby: Lobby, id: string): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id && s.awaySince !== undefined ? { ...s, awaySince: undefined } : s)) };
}

/** True when the phone is away (its seat is kept, not judged by the normal lost-link timer). */
export function isAway(lobby: Lobby, id: string): boolean {
  return lobby.seats.some((s) => s.id === id && s.awaySince !== undefined);
}

/** Phase 4d: a joining phone has reached the table screen. */
export function setReady(lobby: Lobby, id: string, ready: boolean): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === id && !s.isHost ? { ...s, ready } : s)) };
}

/** Phase 4d: the seats the game is still waiting for (not at the table yet, without a link, or away). */
export function waitingSeats(lobby: Lobby): LobbySeat[] {
  return lobby.seats.filter((s) => !s.isHost && (!s.ready || !s.connected || s.awaySince !== undefined));
}

/**
 * Phase 4d: "Waiting for Fay", "Waiting for Ben and Fay", "Waiting for Ann, Ben and Fay".
 * Null when nobody is missing. Names come from the seats, so the host's phone
 * and every joining phone show the same text.
 */
export function waitingText(lobby: Lobby): string | null {
  const names = waitingSeats(lobby).map(seatName);
  if (names.length === 0) return null;
  return `Waiting for ${joinNames(names)}`;
}

/** Problems that stop the host starting. Same rules as the one-phone setup. */
export function lobbyProblems(lobby: Lobby): string[] {
  const out: string[] = [];
  if (lobby.seats.length < MIN_PLAYERS) out.push(`Add at least ${MIN_PLAYERS} players.`);
  const shown = lobby.seats.map((s) => seatName(s).toLowerCase());
  const dupAt = shown.findIndex((n, i) => shown.indexOf(n) !== i);
  const dup = lobby.seats[dupAt];
  if (dup) out.push(`Two players are called ${seatName(dup)}. One of them changes their name for this game on their phone.`);
  return out;
}

/** "3 jokers" line for the settings summary. */
export function jokerLine(lobby: Lobby): string {
  if (!lobby.jokers) return 'Joker rule off';
  const n = jokerCount(Math.max(lobby.seats.length, MIN_PLAYERS), true);
  return `Joker rule on · ${n} jokers`;
}

/**
 * The players for `createSession`, in seat order: p1, p2… Kept with the link
 * id of each phone, so slice 2 can send each phone its own player view.
 */
export function sessionPlayers(lobby: Lobby): { players: { id: string; profileName: string; sessionName?: string; computer?: boolean }[]; hostId: string; linkIds: Record<string, string> } {
  const linkIds: Record<string, string> = {};
  let hostId = 'p1';
  const players = lobby.seats.map((s, i) => {
    const id = `p${i + 1}`;
    // CODE.md 9u C1: a computer player has no link; its moves are made on the host's phone.
    linkIds[id] = s.bot ? 'bot' : s.id;
    if (s.isHost) hostId = id;
    return { id, profileName: s.profileName, sessionName: s.sessionName.trim() || undefined, ...(s.bot ? { computer: true } : {}) };
  });
  return { players, hostId, linkIds };
}
