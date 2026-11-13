/**
 * Imagined deals for the Hard level (CODE.md 9m.3, slice D). From the bot's
 * memory only: every card it cannot place is dealt, at random, into the other
 * players' unknown slots, respecting what it knows about voids. Cards the bot
 * knows a player holds stay with that player. Nothing here reads the real
 * hidden cards: the input is the same AiSeen the bot gets.
 */

import { isStandard, type Card } from '../rules/cards.ts';
import { shuffle, type Rng } from '../rules/rng.ts';
import type { PlayerId } from '../session/types.ts';
import { unknownPool, type Memory } from './memory.ts';
import type { AiSeen } from './seen.ts';

const TRIES_WITH_VOIDS = 20;

/** One attempt: deal `pool` into each other player's slots. Null if the rules can't be met. */
function tryDeal(
  pool: readonly Card[],
  others: readonly PlayerId[],
  slots: Readonly<Record<PlayerId, number>>,
  m: Memory,
  rng: Rng,
  respectVoids: boolean,
): Record<PlayerId, Card[]> | null {
  const left = shuffle(pool, rng);
  const dealt: Record<PlayerId, Card[]> = {};
  for (const p of others) {
    const need = slots[p] ?? 0;
    const voids = respectVoids ? m.voids[p] : undefined;
    const got: Card[] = [];
    for (let i = 0; i < left.length && got.length < need; ) {
      const c = left[i] as Card;
      if (isStandard(c) && voids?.has(c.suit)) {
        i++;
        continue;
      }
      got.push(c);
      left.splice(i, 1);
    }
    if (got.length < need) return null;
    dealt[p] = got;
  }
  return dealt;
}

/**
 * `n` imagined deals. Each maps every other player to a full hand: their known
 * cards plus sampled unknown cards. If voids can't be met after a few tries,
 * that sample ignores them (the plan's fallback). Never throws.
 */
export function sampleDeals(m: Memory, seen: AiSeen, n: number, rng: Rng): Record<PlayerId, Card[]>[] {
  const pool = unknownPool(m, seen);
  const others = m.order.filter((p) => p !== m.me);
  const slots: Record<PlayerId, number> = {};
  const known: Record<PlayerId, Card[]> = {};
  for (const p of others) {
    known[p] = [...(m.known[p]?.values() ?? [])];
    const count = seen.view.players.find((x) => x.id === p)?.cardCount ?? 0;
    slots[p] = Math.max(0, count - known[p].length);
  }

  const out: Record<PlayerId, Card[]>[] = [];
  for (let k = 0; k < n; k++) {
    let dealt: Record<PlayerId, Card[]> | null = null;
    for (let t = 0; t < TRIES_WITH_VOIDS && !dealt; t++) dealt = tryDeal(pool, others, slots, m, rng, true);
    dealt ??= tryDeal(pool, others, slots, m, rng, false) ?? emptyDeal(others);
    const deal: Record<PlayerId, Card[]> = {};
    for (const p of others) deal[p] = [...(known[p] ?? []), ...(dealt[p] ?? [])];
    out.push(deal);
  }
  return out;
}

function emptyDeal(others: readonly PlayerId[]): Record<PlayerId, Card[]> {
  const d: Record<PlayerId, Card[]> = {};
  for (const p of others) d[p] = [];
  return d;
}
