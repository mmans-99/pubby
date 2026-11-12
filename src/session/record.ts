/**
 * Game record, profile history and CSV export. See PROJECT.md section 10 and
 * CODE.md section 6a.
 *
 * All pure functions. Saving to the phone's storage and opening the share
 * sheet are done by the UI.
 */

import type { PlayerId, RoundRecord, Session, SessionEnd, SessionPlayer } from './types.ts';
import type { Trivia } from './trivia.ts';
import { computeTrivia } from './trivia.ts';

export interface GameRecord {
  /** Unique id, so a game is never added to a profile twice. */
  readonly id: string;
  /** ISO date and time the session ended. */
  readonly savedAt: string;
  readonly playerCount: number;
  readonly players: readonly SessionPlayer[];
  readonly hostId: PlayerId;
  readonly jokerRuleEnabled: boolean;
  readonly jokerTotal: number;
  readonly target: number | null;
  readonly rounds: readonly RoundRecord[];
  readonly ultimate: {
    readonly played: boolean;
    readonly finishingOrder: readonly PlayerId[] | null;
    readonly winner: PlayerId | null;
    readonly losers: readonly PlayerId[];
  };
  readonly final: SessionEnd & { readonly scores: Readonly<Record<PlayerId, number>> };
  readonly trivia: Trivia;
  /** True if any player was a computer player (CODE.md 9m.2). */
  readonly vsComputer: boolean;
}

/** Records saved before computer players existed have no `vsComputer` field: they read as false. */
export function isVsComputer(rec: { readonly vsComputer?: boolean }): boolean {
  return rec.vsComputer === true;
}

/** Build the record when the session has ended. `id` should be unique (e.g. a random id). */
export function buildGameRecord(s: Session, savedAt: Date, id: string): GameRecord {
  if (!s.ended) throw new Error('The session has not ended yet');
  const ult = s.rounds.find((r) => r.ultimate) ?? null;
  return {
    id,
    savedAt: savedAt.toISOString(),
    playerCount: s.order.length,
    players: s.players,
    vsComputer: s.players.some((p) => p.computer === true),
    hostId: s.hostId,
    jokerRuleEnabled: s.jokerRuleEnabled,
    jokerTotal: s.jokerTotal,
    target: s.target,
    rounds: s.rounds,
    ultimate: {
      played: !!ult,
      finishingOrder: ult?.finishingOrder ?? null,
      winner: s.ultimateLabels?.winner ?? null,
      losers: s.ultimateLabels?.losers ?? [],
    },
    final: { ...s.ended, scores: s.scores },
    trivia: computeTrivia(s.log, s.order),
  };
}

// ---------------------------------------------------------------------------
// Profile history
// ---------------------------------------------------------------------------

export interface ProfileStats {
  readonly profileName: string;
  readonly gamesPlayed: number;
  readonly points: number;
  /** Normal rounds only (the Ultimate Round has its own titles). */
  readonly roundWins: number;
  readonly roundLosses: number;
  readonly bottomTwo: number;
  readonly ultimateWinner: number;
  readonly ultimateLoser: number;
  readonly timesSlapped: number;
  readonly slapsGiven: number;
  /** Profile name -> times they slapped this profile. */
  readonly slappedBy: Readonly<Record<string, number>>;
  /** Profile name -> times this profile slapped them. */
  readonly slapped: Readonly<Record<string, number>>;
  /** Game record ids already added, so a game is never counted twice. */
  readonly games: readonly string[];
}

export function emptyProfile(profileName: string): ProfileStats {
  return {
    profileName,
    gamesPlayed: 0,
    points: 0,
    roundWins: 0,
    roundLosses: 0,
    bottomTwo: 0,
    ultimateWinner: 0,
    ultimateLoser: 0,
    timesSlapped: 0,
    slapsGiven: 0,
    slappedBy: {},
    slapped: {},
    games: [],
  };
}

function addCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const out = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return out;
}

/**
 * Add one game to the profiles of the players on this phone. Profiles are
 * keyed by profile name. Updated once per game: a record already added is
 * skipped.
 */
export function addGameToProfiles(
  profiles: Readonly<Record<string, ProfileStats>>,
  record: GameRecord,
  profilesOnThisPhone: readonly string[],
): Record<string, ProfileStats> {
  const out: Record<string, ProfileStats> = { ...profiles };
  const profileOf = (id: PlayerId) => record.players.find((p) => p.id === id)?.profileName ?? id;
  const normal = record.rounds.filter((r) => !r.ultimate);
  for (const player of record.players) {
    const name = player.profileName;
    if (!profilesOnThisPhone.includes(name)) continue;
    const prev = out[name] ?? emptyProfile(name);
    if (prev.games.includes(record.id)) continue;
    const id = player.id;
    const t = record.trivia;
    const slapped: Record<string, number> = {};
    const slappedBy: Record<string, number> = {};
    for (const [other, n] of Object.entries(t.pairs[id] ?? {})) slapped[profileOf(other)] = (slapped[profileOf(other)] ?? 0) + n;
    for (const [slapper, row] of Object.entries(t.pairs)) {
      const n = row[id];
      if (n) slappedBy[profileOf(slapper)] = (slappedBy[profileOf(slapper)] ?? 0) + n;
    }
    out[name] = {
      ...prev,
      gamesPlayed: prev.gamesPlayed + 1,
      points: prev.points + (record.final.scores[id] ?? 0),
      roundWins: prev.roundWins + normal.filter((r) => r.finishingOrder[0] === id).length,
      roundLosses:
        prev.roundLosses +
        normal.filter((r) => r.finishingOrder[r.finishingOrder.length - 1] === id && !r.sharedSecondLast?.includes(id)).length,
      bottomTwo: prev.bottomTwo + (t.perPlayer[id]?.bottomTwo ?? 0),
      ultimateWinner: prev.ultimateWinner + (record.ultimate.winner === id ? 1 : 0),
      ultimateLoser: prev.ultimateLoser + (record.ultimate.losers.includes(id) ? 1 : 0),
      timesSlapped: prev.timesSlapped + (t.perPlayer[id]?.timesSlapped ?? 0),
      slapsGiven: prev.slapsGiven + (t.perPlayer[id]?.slapsGiven ?? 0),
      slappedBy: addCounts(prev.slappedBy, slappedBy),
      slapped: addCounts(prev.slapped, slapped),
      games: [...prev.games, record.id],
    };
  }
  return out;
}

/** Overall "slapped by most" and "slapped most" for a profile. Ties give several names. */
export function profileRivals(p: ProfileStats): { slappedByMost: string[]; slappedMost: string[] } {
  const best = (m: Readonly<Record<string, number>>) => {
    const max = Math.max(0, ...Object.values(m));
    return max === 0 ? [] : Object.keys(m).filter((k) => m[k] === max);
  };
  return { slappedByMost: best(p.slappedBy), slappedMost: best(p.slapped) };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function cell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rows(lines: (string | number | boolean | null | undefined)[][]): string {
  return lines.map((l) => l.map(cell).join(',')).join('\r\n');
}

/** Session stats as CSV: game details, every round, final standings, per-player stats, trivia. */
export function sessionCsv(r: GameRecord): string {
  const name = (id: PlayerId) => r.players.find((p) => p.id === id)?.sessionName ?? id;
  const profile = (id: PlayerId) => r.players.find((p) => p.id === id)?.profileName ?? id;
  const names = (ids: readonly PlayerId[] | undefined) => (ids ?? []).map(name).join(' & ');
  const t = r.trivia;
  const lines: (string | number | boolean | null)[][] = [
    ['Pubby game record'],
    ['Date', r.savedAt],
    ['Players', r.playerCount],
    ['Joker rule', r.jokerRuleEnabled ? `on (${r.jokerTotal})` : 'off'],
    ['Target score', r.target ?? 'none'],
    ['Ended because', r.final.reason],
    ['Winner', names(r.final.winners)],
    ['Decided by', r.final.decidedBy === 'ultimate' ? 'Ultimate Round' : 'highest score'],
    [],
    ['Round', 'Ultimate', 'Place', 'Session name', 'Profile name', 'Points', 'Total'],
  ];
  for (const round of r.rounds) {
    round.finishingOrder.forEach((id, i) => {
      lines.push([
        round.round,
        round.ultimate ? 'yes' : 'no',
        i + 1,
        name(id),
        profile(id),
        round.ultimate ? '' : (round.points[id] ?? 0),
        round.totals[id] ?? 0,
      ]);
    });
  }
  lines.push([], ['Final place', 'Session name', 'Profile name', 'Score', 'Title']);
  r.final.standings.forEach((id, i) => {
    const title = r.ultimate.winner === id ? 'Ultimate Winner' : r.ultimate.losers.includes(id) ? 'Ultimate Loser' : '';
    lines.push([i + 1, name(id), profile(id), r.final.scores[id] ?? 0, title]);
  });
  lines.push([], ['Player', 'Slaps given', 'Times slapped', 'Slapped most', 'Slapped by most', 'Bottom two']);
  for (const p of r.players) {
    const pt = t.perPlayer[p.id];
    lines.push([
      p.sessionName,
      pt?.slapsGiven ?? 0,
      pt?.timesSlapped ?? 0,
      names(pt?.slappedMost?.players),
      names(pt?.slappedByMost?.players),
      pt?.bottomTwo ?? 0,
    ]);
  }
  const topRow = (label: string, top: { players: readonly PlayerId[]; count: number } | null, unit = '') =>
    [label, top ? `${names(top.players)} (${top.count}${unit})` : '—'];
  lines.push(
    [],
    ['Trivia', 'Value'],
    topRow('Most slapped', t.mostSlapped),
    topRow('Most slapper', t.mostSlapper),
    ['Rivals', t.rivals.map((x) => `${name(x.slapper)} slaps ${name(x.slapped)} (${x.count})`).join('; ') || '—'],
    topRow('Always fighting for survival', t.alwaysFightingForSurvival),
    topRow('Biggest pick-up', t.biggestPickUp, ' cards'),
    topRow('Most forfeits', t.mostForfeits),
    topRow('Most reshuffle votes', t.mostReshuffleVotes),
    topRow('Slowest reaction', t.slowestReaction, ' ms'),
  );
  return rows(lines) + '\r\n';
}

/** One profile's overall stats as CSV. */
/** The stat lines of one profile block (the name line is added by the caller). */
function profileLines(p: ProfileStats): (string | number)[][] {
  const r = profileRivals(p);
  return [
    ['Games played', p.gamesPlayed],
    ['Points', p.points],
    ['Round wins', p.roundWins],
    ['Round losses', p.roundLosses],
    ['Bottom two', p.bottomTwo],
    ['Ultimate Winner', p.ultimateWinner],
    ['Ultimate Loser', p.ultimateLoser],
    ['Times slapped', p.timesSlapped],
    ['Slaps given', p.slapsGiven],
    ['Slapped by most', r.slappedByMost.join(' & ') || '—'],
    ['Slapped most', r.slappedMost.join(' & ') || '—'],
  ];
}

/**
 * Profile stats as CSV. With `vs` (games against the computer, CODE.md 9m.8)
 * and any such games, a second block follows the normal one.
 */
export function profileCsv(p: ProfileStats, vs?: ProfileStats): string {
  let out = rows([['Pubby profile', p.profileName], ...profileLines(p)]) + '\r\n';
  if (vs && vs.gamesPlayed > 0) {
    out += rows([[], ['Vs computer', vs.profileName], ...profileLines(vs)]) + '\r\n';
  }
  return out;
}
