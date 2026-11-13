/**
 * Computer player levels, personalities and thinking times. See PROJECT.md 12c
 * and CODE.md 9m.3. Pure: seeded randomness only.
 */

import type { Rng } from '../rules/rng.ts';

export type Level = 'easy' | 'normal' | 'hard';
export type Personality = 'careful' | 'reckless' | 'counter' | 'windup';
export type Speed = 'relaxed' | 'normal' | 'fast';

export interface Persona {
  readonly level: Level;
  readonly personality: Personality;
}

export const PERSONALITIES: readonly Personality[] = ['careful', 'reckless', 'counter', 'windup'];

/** Levels the setup screen can give a computer player (CODE.md 9m.7). */
export type SetupLevel = 'easy' | 'normal' | 'hard';

/** What "Mixed" draws from (all three levels from slice D). */
export const MIXED_LEVELS: readonly SetupLevel[] = ['easy', 'normal', 'hard'];

export function mixedLevel(rng: Rng): SetupLevel {
  return MIXED_LEVELS[Math.floor(rng() * MIXED_LEVELS.length)] ?? 'normal';
}

/** How each personality nudges the rules of thumb (never what it can see). */
export const PERSONALITY_WEIGHTS: Record<Personality, { risk: number; jokerSave: number; reactRate: number; reshuffleBar: number }> = {
  careful: { risk: 0.7, jokerSave: 1.3, reactRate: 0.1, reshuffleBar: 0.9 },
  reckless: { risk: 1.4, jokerSave: 0.7, reactRate: 0.25, reshuffleBar: 1.1 },
  counter: { risk: 1.0, jokerSave: 1.0, reactRate: 0.15, reshuffleBar: 1.0 },
  windup: { risk: 1.0, jokerSave: 1.0, reactRate: 0.6, reshuffleBar: 1.0 },
};

export function randomPersona(level: Level, rng: Rng): Persona {
  const personality = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)] ?? 'counter';
  return { level, personality };
}

/** Kinds of decision, from how much there is to think about. */
export type ThinkKind = 'forced' | 'easy' | 'hard';

const THINK_MS: Record<ThinkKind, [number, number]> = {
  forced: [400, 700],
  easy: [900, 1800],
  hard: [1300, 2500],
};

const SPEED_FACTOR: Record<Speed, number> = { relaxed: 1.5, normal: 1, fast: 0.5 };

/** A thinking time in milliseconds, for the kind of decision and the speed setting. */
export function thinkMs(kind: ThinkKind, speed: Speed, rng: Rng): number {
  const [lo, hi] = THINK_MS[kind];
  return Math.round((lo + rng() * (hi - lo)) * SPEED_FACTOR[speed]);
}
