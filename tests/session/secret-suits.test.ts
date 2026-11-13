// CODE.md 9p, PROJECT.md 5 (2026-11-13): a missing suit is known to be missing,
// but which suit is never logged or sent to anyone until it is found out in play.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { missingSuitPlayers } from '../../src/rules/round.ts';
import type { SessionEvent } from '../../src/session/types.ts';
import { dealAll, playRound, start, step } from './helpers.ts';

const logged = (log: readonly { event: SessionEvent }[]): SessionEvent[] => log.map((e) => e.event);

test('a missing suit is logged without its suit, and the leader still follows the real hands', () => {
  let rounds = 0;
  for (let seed = 1; seed <= 400 && rounds < 8; seed++) {
    const rng = seededRng(seed);
    let s = dealAll(start(4, rng), rng);
    const missing = missingSuitPlayers(s.order, s.hands);
    if (!missing.length) continue;
    rounds++;
    for (let i = 0; i < 50 && !['playing', 'chooseLeader', 'reactionTap'].includes(s.phase); i++) s = step(s, rng);
    if (s.phase === 'chooseLeader' || s.phase === 'reactionTap') s = step(s, rng);
    const events = logged(s.log);
    const declared = events.filter((e) => e.type === 'missingSuitDeclared');
    assert.equal(declared.length, missing.length, `seed ${seed}: one event per missing player`);
    for (const e of declared) {
      assert.equal('suits' in e, false, `seed ${seed}: no suit is logged`);
      assert.ok(missing.some((m) => m.player === (e as { player: string }).player), `seed ${seed}: the logged player is missing a suit`);
    }
    const suitWords = ['hearts', 'diamonds', 'clubs', 'spades'];
    for (const e of declared) {
      const text = JSON.stringify(e);
      assert.ok(suitWords.every((w) => !text.includes(w)), `seed ${seed}: no suit name in the event`);
    }
    const chosen = events.find((e) => e.type === 'leaderChosen');
    if (chosen && chosen.type === 'leaderChosen' && chosen.reason === 'missingSuit') {
      assert.ok(missing.some((m) => m.player === chosen.leader), `seed ${seed}: the missing-suit leader really is missing a suit`);
    }
  }
  assert.ok(rounds >= 8, 'found rounds with a missing suit to check');
});

test('no logged missingSuitDeclared carries a suit, in whole rounds at 2, 3, 5 and 8 players', () => {
  for (const n of [2, 3, 5, 8]) {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed * 31 + n);
      const s = playRound(dealAll(start(n, rng), rng), rng);
      for (const e of logged(s.log)) {
        if (e.type === 'missingSuitDeclared') assert.equal('suits' in e, false, `${n} players, seed ${seed}: no suit logged`);
      }
    }
  }
});
