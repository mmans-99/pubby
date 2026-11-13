// D2.3 (CODE.md 9m.9): Hard starts from Normal's card and only switches when
// the search is clearly better (HARD_TUNING.switchMargin).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { chooseCard, HARD_TUNING } from '../../src/ai/moves.ts';
import { searchCard } from '../../src/ai/search.ts';
import { randomPersona } from '../../src/ai/persona.ts';
import { playBotGame } from './botgame.ts';

function actionId(a: ReturnType<typeof chooseCard>): string | undefined {
  return a && a.type === 'playCard' ? a.cardId : undefined;
}

test('Hard plays Normal\'s card when the switch margin is never reached (fallback, 50 positions)', () => {
  const saved = HARD_TUNING.switchMargin;
  HARD_TUNING.switchMargin = Number.POSITIVE_INFINITY;
  let checked = 0;
  try {
    for (let g = 0; g < 6 && checked < 50; g++) {
      playBotGame({
        players: 3 + (g % 3),
        levels: ['hard'],
        rounds: 1,
        seed: 10100 + g,
        onDecision: ({ seen, memory, persona }) => {
          if (checked >= 50 || seen.view.turn !== seen.me || seen.view.legalCardIds.length < 2) return;
          const hard = chooseCard(seen, memory, persona, seededRng(checked));
          const normal = chooseCard(seen, memory, { ...persona, level: 'normal' }, seededRng(checked));
          assert.equal(actionId(hard), actionId(normal));
          checked++;
        },
      });
    }
  } finally {
    HARD_TUNING.switchMargin = saved;
  }
  assert.ok(checked >= 50, `only ${checked} positions checked`);
});

test('Hard plays the search\'s best card when the switch margin is 0', () => {
  const saved = HARD_TUNING.switchMargin;
  HARD_TUNING.switchMargin = 0;
  let checked = 0;
  try {
    playBotGame({
      players: 4,
      levels: ['hard'],
      rounds: 1,
      seed: 10200,
      onDecision: ({ seen, memory, persona }) => {
        if (seen.view.turn !== seen.me || seen.view.legalCardIds.length < 2) return;
        const hard = chooseCard(seen, memory, persona, seededRng(checked + 1));
        const best = searchCard(seen, memory, seededRng(checked + 1));
        assert.equal(actionId(hard), best);
        checked++;
      },
    });
  } finally {
    HARD_TUNING.switchMargin = saved;
  }
  assert.ok(checked > 0, 'no positions checked');
});

test('randomPersona keeps the level it is given', () => {
  assert.equal(randomPersona('hard', seededRng(1)).level, 'hard');
});
