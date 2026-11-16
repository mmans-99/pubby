// CODE.md 9ag.4: the view's canForfeit is true for both of the last two, false for anyone else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { playerView } from '../../src/session/view.ts';
import { act, start, step } from './helpers.ts';

test('canForfeit: both of the last two, nobody else; forfeit through the session', () => {
  for (const n of [2, 3, 4]) {
    let checked = false;
    // Some rounds skip the last two (two players go out in one trick); try seeds until one doesn't.
    for (let seed = 1; seed < 40 && !checked; seed++) {
      const rng = seededRng(seed * 10 + n);
      let s = start(n, rng);
      for (let i = 0; i < 5000 && s.phase !== 'results' && !checked; i++) {
        const play = s.play;
        if (s.phase === 'playing' && play && !play.over && !s.takeRequests.length) {
          const left = play.order.filter((p) => !play.finished.includes(p));
          for (const p of s.order) {
            assert.equal(playerView(s, p).canForfeit, left.length === 2 && left.includes(p), `n=${n} ${p}`);
          }
          if (left.length === 2) {
            // The one not on turn forfeits.
            const who = left.find((p) => p !== play.turn) ?? left[0]!;
            const t = act(s, { type: 'forfeit', by: who }, rng);
            assert.equal(t.phase, 'results');
            checked = true;
            break;
          }
          if (left.length > 2) {
            assert.throws(() => act(s, { type: 'forfeit', by: left[0]! }, rng));
          }
        }
        s = step(s, rng);
      }
    }
    assert.ok(checked, `n=${n}: reached the last two`);
  }
});
