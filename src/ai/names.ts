/**
 * Names for computer players (PROJECT.md 12c): a fixed list from many cultures.
 * A computer player is never called the same as another player in its game.
 */

import type { Rng } from '../rules/rng.ts';

export const BOT_NAMES: readonly string[] = [
  'Aisha', 'Ravi', 'Mei', 'Kwame', 'Sofia', 'Yusuf', 'Priya', 'Hiro', 'Amara', 'Mateo',
  'Zainab', 'Arjun', 'Leila', 'Chen', 'Nia', 'Omar', 'Sana', 'Diego', 'Fatima', 'Tariq',
  'Adebayo', 'Ingrid', 'Kofi', 'Noor', 'Rohan', 'Yuki', 'Imran', 'Lucia', 'Bilal', 'Esi',
  'Farah', 'Jamal', 'Anika', 'Tomas', 'Halima', 'Kenji', 'Ayesha', 'Samir', 'Thandiwe', 'Javier',
  'Mariam', 'Haruto', 'Chiamaka', 'Luca', 'Zara', 'Dev', 'Soo-ah', 'Emeka', 'Rania', 'Pablo',
  'Hana', 'Kamal', 'Olga', 'Ines', 'Musa', 'Lin', 'Asha', 'Malik', 'Elif', 'Kai',
  'Ngozi', 'Mikhail', 'Leyla', 'Gabriel', 'Shreya', 'Teo',
];

/** The longest name a computer player can have (the same limit as a profile name). */
export const BOT_NAME_MAX = 16;

/**
 * Why these computer player names can't be used with the person's name, or
 * null if they can. Names must be filled in, at most BOT_NAME_MAX letters, and
 * different from each other and from the person's name (ignoring case).
 */
export function botNamesProblem(names: readonly string[], me: string | null): string | null {
  const used = new Set<string>();
  if (me && me.trim()) used.add(me.trim().toLowerCase());
  for (const raw of names) {
    const name = raw.trim();
    if (!name) return 'Every computer player needs a name.';
    if (name.length > BOT_NAME_MAX) return `Names can be up to ${BOT_NAME_MAX} letters.`;
    const key = name.toLowerCase();
    if (used.has(key)) return `Two players can't both be called ${name}.`;
    used.add(key);
  }
  return null;
}

/**
 * `n` different names, none equal to a name in `taken` (ignoring case).
 * Throws if there are not enough names left.
 */
export function pickNames(n: number, taken: readonly string[], rng: Rng): string[] {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  const pool = BOT_NAMES.filter((name) => !used.has(name.toLowerCase()));
  if (pool.length < n) throw new Error(`Not enough computer player names: need ${n}, have ${pool.length}`);
  const out: string[] = [];
  const left = pool.slice();
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * left.length);
    out.push(left[j] as string);
    left.splice(j, 1);
  }
  return out;
}
