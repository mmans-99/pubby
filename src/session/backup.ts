/**
 * Stats backup and restore (CODE.md 9ad.5b, Part F, 2.34). Pure: no DOM and no
 * storage, so it is tested with plain node.
 */
import { emptyProfile, type GameRecord, type ProfileStats } from './record.ts';

/** Profile name -> its stats. */
export type Profiles = Record<string, ProfileStats>;

/** The file Pubby saves and reads back: `pubby-backup-YYYY-MM-DD.json`. */
export interface Backup {
  readonly app: 'pubby';
  readonly backup: 1;
  readonly version: string;
  readonly savedAt: number;
  readonly profiles: Profiles;
  readonly vsProfiles: Profiles;
  readonly records: GameRecord[];
}

export function makeBackup(p: Profiles, vs: Profiles, recs: GameRecord[], version: string, now: number): Backup {
  return { app: 'pubby', backup: 1, version, savedAt: now, profiles: p, vsProfiles: vs, records: recs };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const NUMBER_FIELDS = ['gamesPlayed', 'points', 'roundWins', 'roundLosses', 'bottomTwo', 'ultimateWinner', 'ultimateLoser', 'timesSlapped', 'slapsGiven'] as const;

/** A profile from a file: every field that is there has the right type (missing fields are filled in later). */
function profileIsSound(x: unknown): boolean {
  if (!isObj(x)) return false;
  for (const f of NUMBER_FIELDS) if (x[f] !== undefined && typeof x[f] !== 'number') return false;
  if (x['games'] !== undefined && !Array.isArray(x['games'])) return false;
  for (const f of ['slappedBy', 'slapped'] as const) if (x[f] !== undefined && !isObj(x[f])) return false;
  return true;
}

function profilesAreSound(x: unknown): x is Profiles {
  return isObj(x) && Object.values(x).every(profileIsSound);
}

/**
 * Reads a backup file's contents. Returns null if it isn't a Pubby backup (wrong
 * app or version, a missing list, or a field with the wrong type).
 */
export function readBackup(raw: unknown): Backup | null {
  if (!isObj(raw)) return null;
  if (raw['app'] !== 'pubby' || raw['backup'] !== 1) return null;
  if (typeof raw['version'] !== 'string' || typeof raw['savedAt'] !== 'number') return null;
  if (!profilesAreSound(raw['profiles']) || !profilesAreSound(raw['vsProfiles'])) return null;
  const records = raw['records'];
  if (!Array.isArray(records) || !records.every((r) => isObj(r) && typeof r['id'] === 'string')) return null;
  return {
    app: 'pubby', backup: 1, version: raw['version'], savedAt: raw['savedAt'],
    profiles: normaliseProfiles(raw['profiles']), vsProfiles: normaliseProfiles(raw['vsProfiles']),
    records: records as GameRecord[],
  };
}

/**
 * 2.34 (Part F): profiles saved by an older build may lack newer fields. Fill them in
 * from an empty profile, and drop entries that aren't objects at all.
 */
export function normaliseProfiles(raw: unknown): Profiles {
  if (!isObj(raw)) return {};
  const out: Profiles = {};
  for (const [name, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    out[name] = { ...emptyProfile(name), ...(v as Partial<ProfileStats>) };
  }
  return out;
}

export interface MergeResult {
  readonly profiles: Profiles;
  readonly vsProfiles: Profiles;
  readonly records: GameRecord[];
  /** Profiles whose stats on this phone were kept (this phone had at least as much). */
  readonly kept: string[];
  /** Profiles whose stats were replaced by the backup's. */
  readonly replaced: string[];
  /** Profiles only in the backup, now added. */
  readonly added: string[];
}

/** Profile names match ignoring upper and lower case (as `findProfile` does). */
function keyFor(p: Profiles, name: string): string | null {
  const want = name.trim().toLowerCase();
  return Object.keys(p).find((k) => k.toLowerCase() === want) ?? null;
}

/**
 * Merges a backup into this phone's data. Game records join by id (no doubles),
 * newest first. A profile in both places: if one side's games contain all of the
 * other's, the bigger side wins; if each side has games the other lacks (played on
 * two phones), the one with more games played wins (this phone on a tie). Stats from
 * the two sides are never added together, because shared games would count twice.
 */
export function mergeBackup(
  local: { profiles: Profiles; vsProfiles: Profiles; records: GameRecord[] },
  b: Backup,
): MergeResult {
  const kept: string[] = [];
  const replaced: string[] = [];
  const added: string[] = [];
  const profiles = mergeSet(local.profiles, b.profiles, kept, replaced, added);
  const vsProfiles = mergeSet(local.vsProfiles, b.vsProfiles, [], [], []);
  const byId = new Map<string, GameRecord>();
  for (const r of [...local.records, ...b.records]) if (!byId.has(r.id)) byId.set(r.id, r);
  const records = [...byId.values()].sort((a, c) => (a.savedAt < c.savedAt ? 1 : a.savedAt > c.savedAt ? -1 : 0));
  return { profiles, vsProfiles, records, kept, replaced, added };
}

function mergeSet(local: Profiles, incoming: Profiles, kept: string[], replaced: string[], added: string[]): Profiles {
  const out: Profiles = { ...local };
  for (const [name, inc] of Object.entries(incoming)) {
    const key = keyFor(out, name);
    if (key === null) { out[name] = inc; added.push(name); continue; }
    const mine = out[key]!;
    const haveOnlyMine = mine.games.filter((id) => !inc.games.includes(id));
    const haveOnlyTheirs = inc.games.filter((id) => !mine.games.includes(id));
    const backupWins = haveOnlyMine.length === 0 && haveOnlyTheirs.length > 0
      ? true
      : haveOnlyTheirs.length === 0
        ? false
        : inc.gamesPlayed > mine.gamesPlayed;
    if (backupWins) { out[key] = { ...inc, profileName: key }; replaced.push(key); }
    else kept.push(key);
  }
  return out;
}
