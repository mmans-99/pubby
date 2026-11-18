// CODE.md 9z.6 step 3 (regression): the moves the bots make with learning off (2.38.0; 2.34.5, 2.34.3 and 2.34.2's files are kept).
// Plays seeded all-computer games and records the first `total` decisions: the seed, the place in
// the game, the seat, its level and the actions sent. regress.test.ts replays the same games and
// checks that every decision is still the same when learning is off (habits null) and on Easy.
//
// Regenerate only if the bot's moves are meant to change (then say so in the DEVLOG):
//   npx tsx tests/ai/regress-fixture.ts > tests/ai/fixtures/moves-2.38.0.json  (2.38.0: Part A's take and ask rules changed the bots' moves; was 2.34.5, 9ag: 2.34.3, 9af: 2.34.2)

import { fileURLToPath } from 'node:url';
import type { SessionAction } from '../../src/session/types.ts';
import { playBotGame, type SeatLevel } from './botgame.ts';

export interface Recorded {
  readonly seed: number;
  readonly n: number;
  readonly me: string;
  readonly level: string;
  readonly actions: SessionAction[];
}

/** The seat levels used by the fixture: Normal, Hard and Easy, so every level is covered. */
export const FIXTURE_LEVELS: readonly SeatLevel[] = ['normal', 'hard', 'easy', 'normal'];

export function recordDecisions(total = 500): Recorded[] {
  const out: Recorded[] = [];
  for (let seed = 1; out.length < total; seed++) {
    let n = 0;
    playBotGame({
      players: 4,
      levels: FIXTURE_LEVELS,
      rounds: 1,
      seed,
      onDecision: ({ seen, persona, decision }) => {
        if (out.length < total) {
          out.push({ seed, n, me: seen.me, level: persona.level, actions: decision.actions });
        }
        n++;
      },
    });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(recordDecisions(), null, 1) + '\n');
}
