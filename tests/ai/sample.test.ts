// Slice D (CODE.md 9m.3): the Hard level's imagined deals and card search.
// sample.test.ts: every imagined deal gives each other player the right number
// of cards, keeps the cards the bot knows they hold, and (where it can) respects
// known voids. search.test.ts: the search returns a legal card on the bot's turn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { sampleDeals } from '../../src/ai/sample.ts';
import { searchCard } from '../../src/ai/search.ts';
import { playBotGame } from './botgame.ts';

test('imagined deals keep every hand size and every known card (3 and 5 players)', () => {
  let checked = 0;
  for (const n of [3, 5]) {
    playBotGame({
      players: n,
      levels: ['hard', 'normal'],
      rounds: 3,
      seed: 7000 + n,
      onDecision: ({ seen, memory }) => {
        if (checked >= 400) return;
        const deals = sampleDeals(memory, seen, 3, seededRng(checked + 1));
        for (const deal of deals) {
          for (const p of memory.order) {
            if (p === memory.me) continue;
            const count = seen.view.players.find((x) => x.id === p)?.cardCount ?? 0;
            assert.equal(deal[p]?.length, count, `hand size for ${p}`);
            for (const c of memory.known[p]?.values() ?? []) {
              assert.ok(deal[p]?.some((d) => d.id === c.id), `known card ${c.id} missing for ${p}`);
            }
          }
          // No card appears twice in one imagined deal.
          const ids = Object.values(deal).flat().map((c) => c.id);
          assert.equal(new Set(ids).size, ids.length, 'duplicate card in an imagined deal');
        }
        checked++;
      },
    });
  }
  assert.ok(checked >= 150, `only ${checked} decisions checked`);
});

test('imagined deals respect known voids when they can', () => {
  let withVoids = 0;
  let total = 0;
  let broken = 0;
  for (let g = 0; g < 4; g++) {
    playBotGame({
      players: 4,
      levels: ['hard'],
      rounds: 2,
      seed: 8100 + g,
      onDecision: ({ seen, memory }) => {
        const voidPlayers = memory.order.filter((p) => p !== memory.me && (memory.voids[p]?.size ?? 0) > 0);
        if (voidPlayers.length === 0) return;
        withVoids++;
        const deals = sampleDeals(memory, seen, 5, seededRng(g + total));
        for (const deal of deals) {
          total++;
          // A sample may break a void only when the other cards can't fill the hands (CODE.md 9m.3 fallback).
          const broke = voidPlayers.some((p) => (deal[p] ?? []).some((c) => c.kind === 'standard' && memory.voids[p]?.has(c.suit) && !memory.known[p]?.has(c.id)));
          if (broke) broken++;
        }
      },
    });
  }
  assert.ok(withVoids > 0, 'no decisions with a known void were found to check');
  assert.ok(broken / total <= 0.1, `${broken} of ${total} imagined deals broke a known void`);
});
