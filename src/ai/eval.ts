/**
 * Plain numbers the move rules use (CODE.md 9m.3). Everything here reads the
 * bot's memory and its `AiSeen`; nothing reads a hidden card.
 */

import { isStandard, SUITS, type Card, type Suit } from '../rules/cards.ts';
import type { PlayerId } from '../session/types.ts';
import type { AiSeen } from './seen.ts';
import { unknownPool, type Memory } from './memory.ts';

/** 2..14 for a standard card (Ace high), 0 for a joker. */
export function rankValue(c: Card): number {
  return isStandard(c) ? c.rank : 0;
}

function cardCountOf(seen: AiSeen, p: PlayerId): number {
  return seen.view.players.find((x) => x.id === p)?.cardCount ?? 0;
}

/** Players other than me who still hold cards. */
function activeOthers(m: Memory, seen: AiSeen): PlayerId[] {
  return m.order.filter((p) => p !== m.me && cardCountOf(seen, p) > 0);
}

/**
 * Players still to play in the current trick: clockwise after me, holding
 * cards, and before the trick's leader (who has already acted). Empty when I
 * am last.
 */
export function yetToPlay(m: Memory, seen: AiSeen): PlayerId[] {
  const n = m.order.length;
  const me = m.order.indexOf(m.me);
  const out: PlayerId[] = [];
  for (let step = 1; step < n; step++) {
    const p = m.order[(me + step) % n] as PlayerId;
    if (m.leader !== null && p === m.leader) break;
    if (cardCountOf(seen, p) > 0) out.push(p);
  }
  return out;
}

/**
 * Chance that player p is out of `suit`. 1 if p is known void and holds no
 * known card of it; 0 if p is known to hold one; otherwise, with u unknown cards
 * of the suit out of U unknown cards, and k of p's cards unknown:
 * ((U - u) / U) ** k.
 */
export function pVoid(m: Memory, seen: AiSeen, p: PlayerId, suit: Suit): number {
  const known = m.known[p] ?? new Map();
  for (const c of known.values()) if (isStandard(c) && c.suit === suit) return 0;
  if (m.voids[p]?.has(suit)) return 1;
  const pool = unknownPool(m, seen);
  const total = pool.length;
  if (total === 0) return 0;
  const u = pool.filter((c) => isStandard(c) && c.suit === suit).length;
  const k = Math.max(0, cardCountOf(seen, p) - known.size);
  if (k === 0) return 1;
  return ((total - u) / total) ** k;
}

/** Chance that someone still to play in this trick cannot follow `suit` (a slap). */
export function pSlapAfterMe(m: Memory, seen: AiSeen, suit: Suit): number {
  let none = 1;
  for (const p of yetToPlay(m, seen)) none *= 1 - pVoid(m, seen, p, suit);
  return 1 - none;
}

/** Chance that anyone else still holding cards cannot follow `suit`, if I lead it. */
export function leadRisk(m: Memory, seen: AiSeen, suit: Suit): number {
  let none = 1;
  for (const p of activeOthers(m, seen)) none *= 1 - pVoid(m, seen, p, suit);
  return 1 - none;
}

/**
 * How bad a hand is to keep (higher is worse): the average rank of its standard
 * cards, a little worse for each suit longer than five, better for each
 * missing suit and each joker.
 */
export function handBadness(hand: readonly Card[]): number {
  const standard = hand.filter(isStandard);
  const avg = standard.length === 0 ? 0 : standard.reduce((sum, c) => sum + (c.rank - 8) / 6, 0) / standard.length;
  let score = avg;
  for (const suit of SUITS) {
    const count = standard.filter((c) => c.suit === suit).length;
    if (count > 5) score += 0.15;
    if (count === 0) score -= 0.3;
  }
  score -= 0.4 * hand.filter((c) => !isStandard(c)).length;
  return score;
}

/**
 * How dangerous a hand is to be left holding (higher is worse), used by the
 * Hard search at the cut-off. A high card is a liability (it wins tricks and
 * gets slapped), a kept joker is an asset, and each suit I hold none of helps.
 * Per standard card: 0.1 + ((rank - 2) / 12) ** 2 (2 -> 0.1, 8 -> 0.35, Ace -> 1.1).
 * Per joker: -0.5. If any standard card is held: -0.3 per suit with none.
 * An empty hand is 0.
 */
export function handDanger(hand: readonly Card[]): number {
  if (hand.length === 0) return 0;
  const standard = hand.filter(isStandard);
  let score = 0;
  for (const c of standard) score += 0.1 + ((c.rank - 2) / 12) ** 2;
  score -= 0.5 * (hand.length - standard.length);
  if (standard.length > 0) {
    for (const suit of SUITS) if (!standard.some((c) => c.suit === suit)) score -= 0.3;
  }
  return score;
}
