// CODE.md 9an.7 (2.38, Part G-a): the saved online game, so a closed or reloaded Pubby can come back.
// Two keys: `pubby.rejoin` (a joining phone) and `pubby.hostGame` (the host). Both expire after
// AWAY_MS (10 minutes), the same grace the room gives a dropped phone or host.

import type { SavedGame } from './storage.ts';
import type { Lobby } from '../net/lobby.ts';
import { AWAY_MS } from '../net/relayproto.ts';

const JOIN_KEY = 'pubby.rejoin';
const HOST_KEY = 'pubby.hostGame';
/** G-b: the joining phone refreshes its saved time at most this often. */
const JOIN_REFRESH_MS = 60_000;

export interface JoinSaved {
  readonly roomId: string;
  readonly joinToken: string;
  readonly roomName: string;
  readonly profileName: string;
  readonly savedAt: number;
}

export interface HostSaved {
  readonly game: SavedGame;
  readonly lobby: Lobby;
  readonly roomId: string;
  readonly roomName: string;
  readonly roomCode: string;
  readonly hostToken: string;
  readonly profileName: string;
  readonly savedAt: number;
}

/** A save is usable only while it is younger than the room's grace (AWAY_MS). */
export function isFresh(savedAt: number, now: number = Date.now()): boolean {
  return Number.isFinite(savedAt) && now - savedAt >= 0 && now - savedAt < AWAY_MS;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readKey<T extends { savedAt: number }>(key: string, store: Store, now: number): T | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as T | null;
    if (!v || typeof v !== 'object' || !isFresh(v.savedAt, now)) {
      store.removeItem(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function loadJoin(store: Store = localStorage, now = Date.now()): JoinSaved | null {
  return readKey<JoinSaved>(JOIN_KEY, store, now);
}

export function loadHost(store: Store = localStorage, now = Date.now()): HostSaved | null {
  return readKey<HostSaved>(HOST_KEY, store, now);
}

export function saveJoin(j: JoinSaved, store: Store = localStorage): void {
  store.setItem(JOIN_KEY, JSON.stringify(j));
}

export function saveHost(h: HostSaved, store: Store = localStorage): void {
  store.setItem(HOST_KEY, JSON.stringify(h));
}

export function deleteJoin(store: Store = localStorage): void {
  store.removeItem(JOIN_KEY);
}

export function deleteHost(store: Store = localStorage): void {
  store.removeItem(HOST_KEY);
}

// ----- What the live screens hand over (registered by netlobby.ts, so this module imports nothing live) -----

type JoinParts = Omit<JoinSaved, 'savedAt'> | null;
type HostParts = Omit<HostSaved, 'savedAt' | 'game'> & { readonly game: SavedGame | null } | null;

let joinParts: () => JoinParts = () => null;
let hostParts: () => HostParts = () => null;

export function setJoinParts(f: () => JoinParts): void {
  joinParts = f;
}

export function setHostParts(f: () => HostParts): void {
  hostParts = f;
}

/** G-b: save this joining phone's room (throttled to one write a minute for the same token). */
export function saveJoinNow(now = Date.now(), store: Store = localStorage): void {
  const p = joinParts();
  if (!p) return;
  const old = loadJoin(store, now);
  if (old && old.joinToken === p.joinToken && now - old.savedAt < JOIN_REFRESH_MS) return;
  saveJoin({ ...p, savedAt: now }, store);
}

/**
 * G-d: save the host's whole game and lobby. `session` replaces the live game's session, so the
 * save matches a change that is being sent right now.
 */
export function saveHostNow(session?: SavedGame['session'], now = Date.now(), store: Store = localStorage): void {
  const p = hostParts();
  if (!p || !p.game) return;
  const game: SavedGame = session ? { ...p.game, session } : p.game;
  saveHost({ ...p, game, savedAt: now }, store);
}
