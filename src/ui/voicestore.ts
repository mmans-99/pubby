/**
 * What this phone keeps about voice chat (CODE.md 9aq.12, Part J, 3.0.0): who is
 * muted (by name, so the mute holds across games), the volume, and whether the
 * mic has been tried. The mic itself is never stored: it is off every time.
 * Storage key `pubby.voice`. A version update never wipes it.
 */

export interface VoiceSaved {
  /** Names of people muted on this phone, lower case and trimmed. */
  muted: string[];
  /** Voice volume, 0 to 100 (Android and desktop only; iPhone ignores audio.volume). */
  volume: number;
  /** The mic has been turned on once (the lobby hint goes away after that). */
  micTried: boolean;
}

const KEY = 'pubby.voice';
const DEFAULT: VoiceSaved = { muted: [], volume: 100, micTried: false };

/** The key a person keeps between games: their name, trimmed and lower case. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function loadVoice(): VoiceSaved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULT, muted: [] };
    const p = JSON.parse(raw) as Partial<VoiceSaved>;
    const muted = Array.isArray(p.muted) ? p.muted.filter((x): x is string => typeof x === 'string') : [];
    const volume = typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 100 ? Math.round(p.volume) : DEFAULT.volume;
    return { muted, volume, micTried: p.micTried === true };
  } catch {
    return { ...DEFAULT, muted: [] };
  }
}

export function saveVoice(v: VoiceSaved): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function isMutedName(v: VoiceSaved, name: string): boolean {
  return v.muted.includes(nameKey(name));
}

/** Mutes or unmutes one person by name. Returns the new state. */
export function setMutedName(v: VoiceSaved, name: string, muted: boolean): VoiceSaved {
  const key = nameKey(name);
  const rest = v.muted.filter((x) => x !== key);
  return { ...v, muted: muted ? [...rest, key] : rest };
}

/** Mute all: every person named. Unmute all: the list is cleared. */
export function muteAll(v: VoiceSaved, names: readonly string[]): VoiceSaved {
  const set = new Set([...v.muted, ...names.map(nameKey)]);
  return { ...v, muted: [...set] };
}

export function unmuteAll(v: VoiceSaved): VoiceSaved {
  return { ...v, muted: [] };
}
