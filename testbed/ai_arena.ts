// The arena (CODE.md 9m.4): plays whole games with computer players only and
// prints how well each level plays. Run with:
//   npx tsx testbed/ai_arena.ts [--games N] [--players 2..8] [--levels normal,easy,random]
//                               [--rounds R] [--seed S]
//   npx tsx testbed/ai_arena.ts --bars     (the pass bars in CODE.md 9m.4, 2000 games each)
//
// Output is JSON: games finished, refused moves (must be 0), crashed moves
// (must be 0), average place by level and personality (place 1 = first out,
// lower is better), decision time p50 and p95 by level, and average place by seat.
// The arena does the host's jobs (start, advance, end, auto deal). The bots
// only ever get seenBy (tests/ai/botgame.ts).

import { playBotGame, type BotGameResult, type SeatLevel } from '../tests/ai/botgame.ts';

interface Args {
  games: number;
  players: number;
  levels: SeatLevel[];
  rounds: number;
  seed: number;
  bars: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const levels = (get('levels') ?? 'normal').split(',').map((x) => x.trim()) as SeatLevel[];
  return {
    games: Number(get('games') ?? 200),
    players: Number(get('players') ?? 4),
    levels,
    rounds: Number(get('rounds') ?? 3),
    seed: Number(get('seed') ?? 1),
    bars: argv.includes('--bars'),
  };
}

interface Acc {
  sum: number;
  n: number;
}

function mean(a: Acc | undefined): number | null {
  return a && a.n > 0 ? Math.round((a.sum / a.n) * 1000) / 1000 : null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round((sorted[i] ?? 0) * 100) / 100;
}

interface Totals {
  games: number;
  finished: number;
  refused: number;
  crashed: number;
  byLevel: Map<string, Acc>;
  byPersonality: Map<string, Acc>;
  bySeat: Map<number, Acc>;
  decisionMs: Map<string, number[]>;
}

function emptyTotals(): Totals {
  return { games: 0, finished: 0, refused: 0, crashed: 0, byLevel: new Map(), byPersonality: new Map(), bySeat: new Map(), decisionMs: new Map() };
}

function add(map: Map<string | number, Acc>, key: string | number, value: number): void {
  const a = map.get(key) ?? { sum: 0, n: 0 };
  a.sum += value;
  a.n += 1;
  map.set(key, a);
}

function absorb(t: Totals, r: BotGameResult): void {
  t.games++;
  if (r.finished) t.finished++;
  t.refused += r.refused;
  t.crashed += r.crashed;
  r.seats.forEach((seat, i) => {
    for (const place of seat.places) {
      add(t.byLevel, seat.level, place);
      add(t.byPersonality, seat.personality, place);
      add(t.bySeat, i, place);
    }
  });
  for (const d of r.decisionMs) {
    const list = t.decisionMs.get(d.level) ?? [];
    list.push(d.ms);
    t.decisionMs.set(d.level, list);
  }
}

function report(t: Totals, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const decision: Record<string, unknown> = {};
  for (const [level, ms] of t.decisionMs) {
    const sorted = ms.slice().sort((a, b) => a - b);
    decision[level] = { calls: sorted.length, p50ms: percentile(sorted, 0.5), p95ms: percentile(sorted, 0.95) };
  }
  return {
    games: t.games,
    finished: t.finished,
    refusedMoves: t.refused,
    crashedMoves: t.crashed,
    averagePlaceByLevel: Object.fromEntries([...t.byLevel].map(([k, a]) => [k, mean(a)])),
    averagePlaceByPersonality: Object.fromEntries([...t.byPersonality].map(([k, a]) => [k, mean(a)])),
    averagePlaceBySeat: Object.fromEntries([...t.bySeat].map(([k, a]) => [`seat${k + 1}`, mean(a)])),
    decisionTime: decision,
    ...extra,
  };
}

/** Runs `games` games with a fixed seat pattern; returns totals. */
function runMany(games: number, players: number, levels: SeatLevel[], rounds: number, seedBase: number): Totals {
  const t = emptyTotals();
  for (let g = 0; g < games; g++) absorb(t, playBotGame({ players, levels, rounds, seed: seedBase + g }));
  return t;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bars) {
    const t = runMany(args.games, args.players, args.levels, args.rounds, args.seed);
    console.log(JSON.stringify(report(t, { players: args.players, levels: args.levels, rounds: args.rounds }), null, 2));
    return;
  }

  // Pass bars (CODE.md 9m.4), slice A: 2000 four-player games each.
  const N = 2000;
  const rounds = args.rounds;
  const mixed = runMany(N, 4, ['normal', 'random'], rounds, args.seed);
  const normalAvg = mean(mixed.byLevel.get('normal'));
  const randomAvg = mean(mixed.byLevel.get('random'));
  const vsRandom = normalAvg !== null && randomAvg !== null ? Math.round((randomAvg - normalAvg) * 1000) / 1000 : null;

  const versus = runMany(N, 4, ['normal', 'easy'], rounds, args.seed + 1_000_000);
  const normalVsEasyAvg = mean(versus.byLevel.get('normal'));
  const easyAvg = mean(versus.byLevel.get('easy'));
  const vsEasy = normalVsEasyAvg !== null && easyAvg !== null ? Math.round((easyAvg - normalVsEasyAvg) * 1000) / 1000 : null;

  const timing = runMany(200, 4, ['easy', 'normal'], rounds, args.seed + 2_000_000);
  const p95 = (level: string): number | null => {
    const ms = (timing.decisionMs.get(level) ?? []).slice().sort((a, b) => a - b);
    return percentile(ms, 0.95);
  };

  const bars = {
    noRefusedMoves: { value: mixed.refused + versus.refused + timing.refused, pass: mixed.refused + versus.refused + timing.refused === 0 },
    noCrashes: { value: mixed.crashed + versus.crashed + timing.crashed, pass: mixed.crashed + versus.crashed + timing.crashed === 0 },
    allGamesFinish: { value: `${mixed.finished + versus.finished + timing.finished} of ${mixed.games + versus.games + timing.games}`, pass: mixed.finished + versus.finished + timing.finished === mixed.games + versus.games + timing.games },
    normalBeatsRandomBy0_3: { value: vsRandom, pass: vsRandom !== null && vsRandom >= 0.3 },
    normalBeatsEasyBy0_15: { value: vsEasy, pass: vsEasy !== null && vsEasy >= 0.15 },
    easyP95UnderMs20: { value: p95('easy'), pass: (p95('easy') ?? Infinity) < 20 },
    normalP95UnderMs20: { value: p95('normal'), pass: (p95('normal') ?? Infinity) < 20 },
  };
  console.log(JSON.stringify({
    note: 'Pass bars, CODE.md 9m.4. Place 1 = first out (lower is better). Gaps: random minus normal, easy minus normal.',
    rounds,
    normalVsRandom: { games: N, normalAvg, randomAvg, gain: vsRandom },
    normalVsEasy: { games: N, normalAvg: normalVsEasyAvg, easyAvg, gain: vsEasy },
    bars,
    allPass: Object.values(bars).every((b) => b.pass),
  }, null, 2));
}

main();
