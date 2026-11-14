import type { PlayerId, Session } from '../session/types.ts';

/**
 * CODE.md 9ad.4 (2.34): one row of the points table. Pure (no DOM), so it can be tested.
 * `points` has one number per normal round (Ultimate Rounds are not columns).
 */
export interface ScoreRow { id: PlayerId; place: string; points: number[]; total: number }

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st... (same rule as `ordinal` in cards.ts). */
function ordinalWord(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]!);
}

/**
 * The points table's rows, best total first. Ties keep the seat order and share
 * a place: both read "=2nd", and the next player is "4th" (standard ranking).
 * A player with no points in a round counts as 0.
 */
export function scoreRows(s: Session): ScoreRow[] {
  const rounds = s.rounds.filter((r) => !r.ultimate);
  const rows = s.order.map((id) => ({
    id,
    total: s.scores[id] ?? 0,
    points: rounds.map((r) => r.points[id] ?? 0),
  }));
  // Array.prototype.sort is stable, so equal totals keep the seat order.
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return sorted.map((row) => {
    const rank = sorted.filter((o) => o.total > row.total).length + 1;
    const shared = sorted.some((o) => o !== row && o.total === row.total);
    return { id: row.id, place: (shared ? '=' : '') + ordinalWord(rank), points: row.points, total: row.total };
  });
}
