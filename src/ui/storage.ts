/**
 * Phone storage for the app: saved profiles and the game in progress.
 * Uses the browser's local storage. Every read and write is wrapped, because
 * storage can be full, blocked (private browsing) or cleared by the phone.
 */

import { emptyProfile, isVsComputer, type GameRecord, type ProfileStats } from '../session/record.ts';
import type { NetInfo } from '../net/netgame.ts';
import type { Session } from '../session/types.ts';

const PROFILES_KEY = 'pubby.profiles';
const GAME_KEY = 'pubby.currentGame';
const RECORDS_KEY = 'pubby.gameRecords';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ----- Profiles (keyed by profile name) -----

export type Profiles = Record<string, ProfileStats>;

export function loadProfiles(): Profiles {
  return read<Profiles>(PROFILES_KEY, {});
}

export function saveProfiles(p: Profiles): boolean {
  return write(PROFILES_KEY, p);
}

/** Profile names are unique on a phone, ignoring upper and lower case. */
export function findProfile(p: Profiles, name: string): string | null {
  const want = name.trim().toLowerCase();
  return Object.keys(p).find((k) => k.toLowerCase() === want) ?? null;
}

export function addProfile(p: Profiles, name: string): Profiles {
  const clean = name.trim();
  return { ...p, [clean]: emptyProfile(clean) };
}

export function deleteProfile(p: Profiles, name: string): Profiles {
  const out = { ...p };
  delete out[name];
  return out;
}

// ----- Game in progress (so closing the browser doesn't lose it) -----

/**
 * Where the phone is in pass-and-play:
 * - `table`: the shared screen everyone can see (dealing, votes, results).
 * - `handoff`: "Pass the phone to X". Shows only public information.
 * - `hand`: X's own cards. Only X should be looking.
 */
export type GameStage = 'table' | 'handoff' | 'hand';

/** One card played in a trick, as shown in "Last trick". */
export interface TrickPlay {
  readonly player: string;
  /** Card id, or "joker". */
  readonly card: string;
  readonly label: string;
}

export interface LastTrick {
  readonly plays: readonly TrickPlay[];
  readonly slap: { readonly slapper: string; readonly slapped: string } | null;
  readonly nextLeader: string | null;
}

export interface SavedGame {
  readonly session: Session;
  readonly stage: GameStage;
  /** Who is holding the phone (pass-and-play). */
  readonly holder: string;
  /** Cards played so far in the current trick, jokers included. */
  readonly trickLog: readonly TrickPlay[];
  /** The trick that just finished, so the next player knows what happened. */
  readonly lastTrick: LastTrick | null;
  /** Private messages per player (take-cards answers), shown only on their own hand screen. */
  readonly notes?: Readonly<Record<string, readonly string[]>>;
  /** Set when the game has ended and its record was saved on this phone. */
  readonly recordId?: string;
  /** Network game (Phase 4): this phone's role and player. Never saved to storage (slice 4 adds that). */
  readonly net?: NetInfo;
}

// ----- Finished games (game records, newest first) -----

export function loadRecords(): GameRecord[] {
  const r = read<GameRecord[]>(RECORDS_KEY, []);
  // Records saved before computer players have no vsComputer field: they read as false (CODE.md 9m.2).
  return Array.isArray(r) ? r.map((rec) => ({ ...rec, vsComputer: isVsComputer(rec) })) : [];
}

/** Adds a record (once: a record already saved is not added again). */
export function saveRecord(rec: GameRecord): boolean {
  const all = loadRecords();
  if (all.some((r) => r.id === rec.id)) return true;
  return write(RECORDS_KEY, [rec, ...all]);
}

export function deleteRecord(id: string): boolean {
  return write(RECORDS_KEY, loadRecords().filter((r) => r.id !== id));
}

export function loadGame(): SavedGame | null {
  const g = read<Partial<SavedGame> | null>(GAME_KEY, null);
  if (!g || !g.session || g.session.ended) return null;
  // Games saved by an older build: fill in what's missing.
  const stage: GameStage = g.stage === 'hand' || g.stage === 'handoff' ? g.stage : 'table';
  return { session: g.session, stage, holder: g.holder ?? g.session.hostId, trickLog: g.trickLog ?? [], lastTrick: g.lastTrick ?? null, notes: g.notes ?? {} };
}

export function saveGame(g: SavedGame | null): boolean {
  return write(GAME_KEY, g);
}
