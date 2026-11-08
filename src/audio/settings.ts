/**
 * Sound settings, kept on this phone (PROJECT.md 12b, CODE.md 9g).
 * Volumes are slider values 0 to 100. Defaults are quieter than the sample
 * page (music 55, effects 80 there), as the user asked on 2026-11-08; music
 * starts switched off, effects on (08:56).
 */

export interface SoundSettings {
  musicOn: boolean;
  musicVol: number;
  sfxOn: boolean;
  sfxVol: number;
}

const KEY = 'pubby.sound.v2'; // v2: music starts off (user, 2026-11-08 08:56)

export const DEFAULT_SOUND: SoundSettings = { musicOn: false, musicVol: 40, sfxOn: true, sfxVol: 60 };

const clampVol = (v: unknown, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d;

let current: SoundSettings = load();

function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SOUND };
    const o = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      musicOn: typeof o.musicOn === 'boolean' ? o.musicOn : DEFAULT_SOUND.musicOn,
      musicVol: clampVol(o.musicVol, DEFAULT_SOUND.musicVol),
      sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : DEFAULT_SOUND.sfxOn,
      sfxVol: clampVol(o.sfxVol, DEFAULT_SOUND.sfxVol),
    };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function soundSettings(): SoundSettings {
  return current;
}

const listeners: ((s: SoundSettings) => void)[] = [];

export function onSoundChange(fn: (s: SoundSettings) => void): void {
  listeners.push(fn);
}

export function setSound(change: Partial<SoundSettings>): void {
  current = { ...current, ...change };
  current.musicVol = clampVol(current.musicVol, DEFAULT_SOUND.musicVol);
  current.sfxVol = clampVol(current.sfxVol, DEFAULT_SOUND.sfxVol);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage full or blocked: still works for this visit */ }
  for (const fn of listeners) fn(current);
}

/** Nothing at all is playing: both switched off. */
export function allMuted(s: SoundSettings = current): boolean {
  return (!s.musicOn || s.musicVol === 0) && (!s.sfxOn || s.sfxVol === 0);
}
