// CODE.md 9ag.4 (5): either of the last two may now forfeit at any time (2.34.5), but computer
// players are unchanged: they only forfeit from the pick-up-or-forfeit choice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playBotGame } from './botgame.ts';

test('200 bot games: a computer player forfeits only when facing the final-two choice', () => {
  let forfeits = 0;
  let couldForfeit = 0;
  for (let g = 0; g < 200; g++) {
    const players = 2 + (g % 4);
    playBotGame({
      players,
      levels: ['easy', 'normal', 'hard'],
      rounds: 1,
      seed: 1000 + g,
      onDecision: ({ seen, decision }) => {
        const play = seen.session.play;
        if (play && !play.over && play.pendingFinalTwo !== seen.me) {
          const left = play.order.filter((p) => !play.finished.includes(p));
          if (left.length === 2 && left.includes(seen.me)) couldForfeit++;
        }
        for (const a of decision.actions) {
          if (a.type !== 'forfeit') continue;
          forfeits++;
          assert.equal(play?.pendingFinalTwo, seen.me, `game ${g}: forfeit without the pick-up choice`);
        }
      },
    });
  }
  assert.ok(couldForfeit > 100, `the any-time forfeit was open often enough (${couldForfeit})`);
  assert.ok(forfeits >= 0);
});
