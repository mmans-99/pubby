/**
 * Results screen trivia. See PROJECT.md section 11 and CODE.md section 6a.
 *
 * Everything is computed from the session's event log, so it can never drift
 * from what happened. No effect on scores.
 */

import type { LogEntry, PlayerId } from './types.ts';

/** Top players for a stat. More than one when tied. Null when nobody has any. */
export interface Top {
  readonly players: readonly PlayerId[];
  readonly count: number;
}

export interface PlayerTrivia {
  readonly slapsGiven: number;
  readonly timesSlapped: number;
  /** The player who has slapped this player the most. */
  readonly slappedByMost: Top | null;
  /** The player this player has slapped the most. */
  readonly slappedMost: Top | null;
  /** Rounds finished in the bottom two (Ultimate Round not counted). */
  readonly bottomTwo: number;
}

export interface Rival {
  readonly slapper: PlayerId;
  readonly slapped: PlayerId;
  readonly count: number;
}

export interface Trivia {
  readonly mostSlapped: Top | null;
  readonly mostSlapper: Top | null;
  /** The pair(s) with the most slaps from one player to another. All ties shown. */
  readonly rivals: readonly Rival[];
  readonly perPlayer: Readonly<Record<PlayerId, PlayerTrivia>>;
  /** Most rounds in the bottom two. */
  readonly alwaysFightingForSurvival: Top | null;
  /** Most cards picked up in one slap (players = who picked them up). */
  readonly biggestPickUp: Top | null;
  readonly mostForfeits: Top | null;
  /** Most reshuffle votes called. */
  readonly mostReshuffleVotes: Top | null;
  /** Slowest Reaction Tap time in ms (false starts not counted as a time). */
  readonly slowestReaction: Top | null;
  /** Slap counts: slapper -> slapped -> count. Used for profile history. */
  readonly pairs: Readonly<Record<PlayerId, Readonly<Record<PlayerId, number>>>>;
}

function top(counts: Readonly<Record<PlayerId, number>>): Top | null {
  const vals = Object.values(counts);
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  if (max <= 0) return null;
  return { players: Object.keys(counts).filter((p) => counts[p] === max), count: max };
}

function bump(m: Record<PlayerId, number>, p: PlayerId, by = 1): void {
  m[p] = (m[p] ?? 0) + by;
}

export function computeTrivia(log: readonly LogEntry[], players: readonly PlayerId[]): Trivia {
  const given: Record<PlayerId, number> = {};
  const received: Record<PlayerId, number> = {};
  const pairs: Record<PlayerId, Record<PlayerId, number>> = {};
  const bottomTwo: Record<PlayerId, number> = {};
  const forfeits: Record<PlayerId, number> = {};
  const reshuffleCalls: Record<PlayerId, number> = {};
  const biggest: Record<PlayerId, number> = {};
  const slowest: Record<PlayerId, number> = {};

  for (const { event: e, ultimate } of log) {
    switch (e.type) {
      case 'slapped':
        bump(given, e.slapper);
        bump(received, e.slapped);
        bump((pairs[e.slapper] ??= {}), e.slapped);
        biggest[e.slapped] = Math.max(biggest[e.slapped] ?? 0, e.cardsPickedUp);
        break;
      case 'roundScored':
        if (!ultimate) for (const p of e.finishingOrder.slice(-2)) bump(bottomTwo, p);
        break;
      case 'forfeited':
        bump(forfeits, e.player);
        break;
      case 'voteCalled':
        if (e.kind === 'reshuffle' && e.by) bump(reshuffleCalls, e.by);
        break;
      case 'reactionTapped':
        if (!e.falseStart) slowest[e.player] = Math.max(slowest[e.player] ?? 0, e.ms);
        break;
      default:
        break;
    }
  }

  // Rivals: the highest slapper -> slapped count, every pair that ties.
  let rivalMax = 0;
  for (const row of Object.values(pairs)) for (const n of Object.values(row)) rivalMax = Math.max(rivalMax, n);
  const rivals: Rival[] = [];
  if (rivalMax > 0) {
    for (const slapper of players) {
      for (const slapped of players) {
        if ((pairs[slapper]?.[slapped] ?? 0) === rivalMax) rivals.push({ slapper, slapped, count: rivalMax });
      }
    }
  }

  const perPlayer: Record<PlayerId, PlayerTrivia> = {};
  for (const p of players) {
    const by: Record<PlayerId, number> = {};
    for (const q of players) if (pairs[q]?.[p]) by[q] = pairs[q]![p]!;
    perPlayer[p] = {
      slapsGiven: given[p] ?? 0,
      timesSlapped: received[p] ?? 0,
      slappedByMost: top(by),
      slappedMost: top(pairs[p] ?? {}),
      bottomTwo: bottomTwo[p] ?? 0,
    };
  }

  return {
    mostSlapped: top(received),
    mostSlapper: top(given),
    rivals,
    perPlayer,
    alwaysFightingForSurvival: top(bottomTwo),
    biggestPickUp: top(biggest),
    mostForfeits: top(forfeits),
    mostReshuffleVotes: top(reshuffleCalls),
    slowestReaction: top(slowest),
    pairs,
  };
}
