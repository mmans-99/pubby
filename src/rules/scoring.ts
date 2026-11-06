/**
 * Points by finishing position. See PROJECT.md section 9.
 * 1st = first player out. Last = the player left holding cards (or a forfeit).
 */

import { assertPlayerCount } from './cards.ts';

export const SCORING_TABLE: Readonly<Record<number, readonly number[]>> = {
  2: [2, 1],
  3: [2, 1, 0],
  4: [2, 1, 0, -1],
  5: [3, 2, 1, 0, -1],
  6: [3, 2, 1, 0, -1, -2],
  7: [3, 2, 1, 0, -1, -2, -3],
  8: [4, 3, 2, 1, 0, -1, -2, -3],
};

/** Points for a 1-based finishing place. */
export function pointsFor(players: number, place: number): number {
  assertPlayerCount(players);
  const row = SCORING_TABLE[players] as readonly number[];
  if (!Number.isInteger(place) || place < 1 || place > players) {
    throw new RangeError(`Place must be 1 to ${players}, got ${place}`);
  }
  return row[place - 1] as number;
}

/**
 * Points for one round. `finishingOrder` lists player ids from 1st to last.
 * Every player in the round must appear exactly once.
 */
export function scoreRound(finishingOrder: readonly string[]): Record<string, number> {
  const n = finishingOrder.length;
  assertPlayerCount(n);
  if (new Set(finishingOrder).size !== n) throw new Error('A player appears twice in the order');
  const out: Record<string, number> = {};
  finishingOrder.forEach((id, i) => {
    out[id] = pointsFor(n, i + 1);
  });
  return out;
}

/** Add one round's points to running totals. Returns new totals. */
export function addScores(
  totals: Readonly<Record<string, number>>,
  round: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = { ...totals };
  for (const [id, pts] of Object.entries(round)) out[id] = (out[id] ?? 0) + pts;
  return out;
}
