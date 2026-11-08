/**
 * Network lobby (Phase 4 slice 1, CODE.md section 4a and 9i): the seat list
 * the host's phone keeps while players join over WebRTC, and the messages the
 * phones send each other. Pure: no DOM, no WebRTC, so it can be unit-tested.
 *
 * The host's phone owns the lobby. Joining phones only send their name and
 * changes to it; the host sends every phone the whole lobby after each change.
 */

import { jokerCount, MAX_PLAYERS, MIN_PLAYERS } from '../rules/cards.ts';

/** Bumped when the messages change, so mixed phones refuse each other. */
export const LOBBY_PROTOCOL = 1;
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
}

export interface Lobby {
  seats: LobbySeat[];
  jokers: boolean;
  pauseLimit: number | null;
  /** The host pressed Start: no more joining (no late joining). */
  started: boolean;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Joining phone → host. */
export type ToHost =
  | { t: 'hello'; protocol: number; version: string; profileName: string; sessionName: string }
  | { t: 'rename'; sessionName: string }
  | { t: 'leave' }
  | { t: 'ping' };

/** Host → joining phone. */
export type ToJoiner =
  | { t: 'lobby'; you: string; lobby: Lobby }
  | { t: 'refused'; why: string }
  | { t: 'removed' }
  | { t: 'closed' }
  | { t: 'ping' };

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
        seats.push({ id: s['id'], profileName: s['profileName'], sessionName: s['sessionName'], isHost: s['isHost'] === true, connected: s['connected'] !== false });
      }
      const pl = l['pauseLimit'];
      return {
        t: 'lobby', you: raw['you'],
        lobby: { seats, jokers: l['jokers'] !== false, pauseLimit: typeof pl === 'number' ? pl : null, started: l['started'] === true },
      };
    }
    case 'refused': return { t: 'refused', why: isStr(raw['why']) ? raw['why'] : 'The host said no.' };
    case 'removed': return { t: 'removed' };
    case 'closed': return { t: 'closed' };
    case 'ping': return { t: 'ping' };
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
    seats: [{ id: 'host', profileName: cleanName(hostProfile), sessionName: '', isHost: true, connected: true }],
    jokers: true,
    pauseLimit: null,
    started: false,
  };
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
  return { ...lobby, seats: [...lobby.seats, { id, profileName: cleanName(profileName), sessionName: cleanName(sessionName), isHost: false, connected: true }] };
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
export function sessionPlayers(lobby: Lobby): { players: { id: string; profileName: string; sessionName?: string }[]; hostId: string; linkIds: Record<string, string> } {
  const linkIds: Record<string, string> = {};
  let hostId = 'p1';
  const players = lobby.seats.map((s, i) => {
    const id = `p${i + 1}`;
    linkIds[id] = s.id;
    if (s.isHost) hostId = id;
    return { id, profileName: s.profileName, sessionName: s.sessionName.trim() || undefined };
  });
  return { players, hostId, linkIds };
}
