// CODE.md 9z.6 step 3 (regression). Two checks:
//   1. With learning off (habits null, the default) the bots make exactly the moves of 2.34.5:
//      500 recorded decisions (tests/ai/fixtures/moves-2.34.5.json, made by regress-fixture.ts).
//      2.34.5 (9ag): jokers set aside with a last normal card are thrown away at the trick end,
//      so the jokersDiscarded event comes later; games of seeds 1, 2 and 7 change a few moves
//      after a joker is set aside (2.34.3's file is kept as the record before that).
//      2.34.2's file (moves-2.34.2.json) is kept as the record of the moves before the 9af fix.
//   2. Easy never learns: with a live habit table (people in the game, reckless style), every
//      Easy decision is the same as with habits null, for the same rng.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide } from '../../src/ai/decide.ts';
import { learnedFactors, rebuildHabits } from '../../src/ai/learn.ts';
import { seededRng } from '../../src/rules/rng.ts';
import { playBotGame } from './botgame.ts';
import { recordDecisions, type Recorded } from './regress-fixture.ts';

const golden: Recorded[] = JSON.parse(readFileSync(new URL('./fixtures/moves-2.34.5.json', import.meta.url), 'utf8'));

test('learning off: 500 recorded decisions match 2.34.5 exactly', () => {
  assert.equal(golden.length, 500);
  const now = recordDecisions(500);
  assert.equal(now.length, golden.length);
  for (let i = 0; i < golden.length; i++) {
    assert.deepEqual(now[i], golden[i], `decision ${i} (seed ${golden[i]?.seed}, n ${golden[i]?.n}) changed`);
  }
});

test('Easy ignores a live habit table: same move with habits and with null', () => {
  // Four people (the bot code plays them, the session does not tag them), so the table has real evidence.
  let easy = 0;
  let mismatches = 0;
  let normalDiffers = 0;
  for (let seed = 1; seed <= 4; seed++) {
    playBotGame({
      players: 4,
      levels: ['normal', 'hard', 'easy', 'normal'],
      rounds: 1,
      seed,
      people: { count: 4, style: 'reckless' },
      onDecision: ({ seen, memory, persona, session }) => {
        const order = session.order;
        const computerIds = session.players.filter((p) => p.computer).map((p) => p.id);
        const table = rebuildHabits(session.log, order, computerIds);
        const same = decide(seen, memory, persona, seededRng(7), null);
        if (persona.level === 'easy') {
          easy++;
          const learned = decide(seen, memory, persona, seededRng(7), table);
          if (JSON.stringify(learned) !== JSON.stringify(same)) mismatches++;
        } else if (persona.level === 'normal') {
          // The table reaches a Normal player's weights (a card may still be the same: the nudge is small).
          const f = learnedFactors(table);
          if (f.risk !== 1 || f.jokerSave !== 1) normalDiffers++;
        }
      },
    });
  }
  assert.ok(easy >= 50, `expected enough Easy decisions to mean something, got ${easy}`);
  assert.equal(mismatches, 0, `${mismatches} of ${easy} Easy decisions changed with a habit table`);
  // Sanity: the table does reach Normal bots' weights (otherwise the test proves nothing).
  assert.ok(normalDiffers > 0, 'the habit table never changed a Normal player\'s weights');
});
