/**
 * Hard level's card choice (CODE.md 9m.3, slice D). For each legal card, play
 * it in several imagined deals (sample.ts), play the rest of the round out with
 * a simple rule for every player, and keep the card with the best average
 * score. Only the card on my turn is searched; everything else uses moves.ts.
 *
 * Scoring for me: +3 if I go out, -1 for each card I pick up (waste pile or a
 * slap), -0.2 for each card left in my hand at the end.
 *
 * The work is bounded by a fixed number of samples and plays, not by the clock,
 * so the same position and the same rng always give the same card (the
 * no-cheating fair-play test depends on that). Pure: reads AiSeen and Memory only.
 */

import { isStandard, SUITS, type Card, type StandardCard, type Suit } from '../rules/cards.ts';
import { legalCards, playCard, pickUpWastePile, type PlayEvent, type PlayResult, type PlayState } from '../rules/play.ts';
import type { Rng } from '../rules/rng.ts';
import type { PlayerId } from '../session/types.ts';
import { handDanger } from './eval.ts';
import { sampleDeals } from './sample.ts';
import type { Memory } from './memory.ts';
import type { AiSeen } from './seen.ts';

/** Imagined deals per decision. */
export const HARD_SAMPLES = 40;
/**
 * Score weights (CODE.md 9m.9, D2.1). Score = out bonus, minus picked-up cards,
 * minus danger of the hand left at the cut-off (eval.ts handDanger).
 */
export const SEARCH_WEIGHTS = { out: 3, pick: 0.25, danger: 4 };
/** Tricks played out after my card (the one in progress, then two more) before the round is scored as it stands. */
const TRICKS_AHEAD = 3;
/** A guard on plays, in case a rollout never ends a trick. */
const MAX_STEPS = 200;

/** The waste pile as far as I know it: the cards in it, from memory. */
function wastePileFrom(m: Memory): Card[] {
  const out: Card[] = [];
  for (const id of m.waste) {
    const c = m.played.get(id);
    if (c) out.push(c);
  }
  return out;
}

/** The public state with the real hands swapped for one imagined deal. */
function imagine(state: PlayState, deal: Record<PlayerId, Card[]>, pile: Card[], me: PlayerId): PlayState {
  const hands: Record<PlayerId, readonly Card[]> = { ...state.hands };
  for (const p of state.order) if (p !== me) hands[p] = deal[p] ?? [];
  return { ...state, hands, wastePile: pile };
}

function highest(cards: readonly StandardCard[]): StandardCard | undefined {
  return [...cards].sort((a, b) => b.rank - a.rank)[0];
}

function lowest(cards: readonly StandardCard[]): StandardCard | undefined {
  return [...cards].sort((a, b) => a.rank - b.rank)[0];
}

/** True if `q` (in this imagined deal) holds no standard card of `suit`. */
function voidIn(state: PlayState, q: PlayerId, suit: Suit): boolean {
  return !(state.hands[q] ?? []).some((c) => isStandard(c) && c.suit === suit);
}

/** Players who still have to play in this trick after `p` (imagined hands). */
function stillToPlay(state: PlayState, p: PlayerId): PlayerId[] {
  return state.trick.participants.filter(
    (q) => q !== p && !state.trick.acted.includes(q) && (state.hands[q]?.length ?? 0) > 0,
  );
}

/**
 * The rule the imagined players use (D2.2): close to moves.ts. Lead the suit
 * that the fewest others are void in, high if none of them is void, else low.
 * Follow: play high when nobody after me can slap; otherwise the highest card
 * under the top card, else low. Slap with the highest card (a lone card of its
 * suit scores extra). Jokers only when no standard card is legal.
 */
export function _rolloutCard(state: PlayState, p: PlayerId): Card | undefined {
  const legal = legalCards(state, p);
  if (legal.length === 0) return undefined;
  const std = legal.filter(isStandard);
  const jokers = legal.filter((c) => !isStandard(c));
  const led = state.trick.ledSuit;

  if (led === null) {
    if (std.length === 0) return jokers[0];
    const others = state.order.filter((q) => q !== p && (state.hands[q]?.length ?? 0) > 0);
    let best: { suit: Suit; voids: number; cards: StandardCard[] } | undefined;
    for (const suit of SUITS) {
      const cards = std.filter((c) => c.suit === suit);
      if (cards.length === 0) continue;
      const voids = others.filter((q) => voidIn(state, q, suit)).length;
      if (!best || voids < best.voids) best = { suit, voids, cards };
    }
    if (!best) return jokers[0];
    return best.voids === 0 ? highest(best.cards) : lowest(best.cards);
  }

  const following = std.filter((c) => c.suit === led);
  if (following.length > 0) {
    const top = Math.max(0, ...state.trick.plays.filter((t) => t.card.suit === led).map((t) => t.card.rank));
    const danger = stillToPlay(state, p).some((q) => voidIn(state, q, led));
    if (!danger) return highest(following);
    const under = following.filter((c) => c.rank < top);
    return highest(under) ?? lowest(following);
  }
  if (std.length === 0) return jokers[0];
  const score = (c: StandardCard): number => c.rank + (std.filter((x) => x.suit === c.suit).length === 1 ? 6 : 0);
  return [...std].sort((a, b) => score(b) - score(a))[0];
}

/** Score for me after the imagined round is played on (or cut off). Null if the rules refused a play. */
function scoreRound(start: PlayState, me: PlayerId, first: readonly PlayEvent[]): number | null {
  let state = start;
  let picked = 0;
  let tricks = 0;
  const count = (events: readonly PlayEvent[]): void => {
    for (const e of events) {
      if (e.type === 'wastePilePickedUp' && e.player === me) picked += e.cards;
      if (e.type === 'slapped' && e.slapped === me) picked += e.cardsPickedUp;
      if (e.type === 'trickResolved') tricks++;
    }
  };
  count(first);
  for (let step = 0; step < MAX_STEPS && !state.over && tricks < TRICKS_AHEAD; step++) {
    let result: PlayResult;
    try {
      if (state.pendingFinalTwo !== null) {
        result = pickUpWastePile(state, state.pendingFinalTwo);
      } else {
        const p = state.turn;
        if (p === null) break;
        const card = _rolloutCard(state, p);
        if (!card) break;
        result = playCard(state, p, card.id);
      }
    } catch {
      return null;
    }
    count(result.events);
    state = result.state;
  }
  const out = state.finished.includes(me);
  const hand = state.hands[me] ?? [];
  return (out ? SEARCH_WEIGHTS.out : 0) - SEARCH_WEIGHTS.pick * picked - SEARCH_WEIGHTS.danger * handDanger(hand);
}

/**
 * Every legal card with its average score over the same imagined deals
 * (D2.3). Empty when the search does not apply (not my turn, a choice
 * pending, or the round is not in play).
 */
export function searchScores(seen: AiSeen, m: Memory, rng: Rng, samples = HARD_SAMPLES): { id: string; avg: number }[] {
  const v = seen.view;
  const state = seen.session.play;
  if (!state || v.turn !== seen.me || v.pendingFinalTwo !== null) return [];
  const legal = v.legalCardIds;
  if (legal.length < 2) return [];

  const deals = sampleDeals(m, seen, samples, rng);
  const pile = wastePileFrom(m);
  const out: { id: string; avg: number }[] = [];
  for (const cardId of legal) {
    let total = 0;
    let n = 0;
    for (const deal of deals) {
      const start = imagine(state, deal, pile, seen.me);
      let first: PlayResult;
      try {
        first = playCard(start, seen.me, cardId);
      } catch {
        continue;
      }
      const score = scoreRound(first.state, seen.me, first.events);
      if (score === null) continue;
      total += score;
      n++;
    }
    if (n > 0) out.push({ id: cardId, avg: total / n });
  }
  return out;
}

/** The best legal card by search alone (the second opinion is in moves.ts). */
export function searchCard(seen: AiSeen, m: Memory, rng: Rng, samples = HARD_SAMPLES): string | null {
  const scores = searchScores(seen, m, rng, samples);
  if (scores.length === 0) return seen.view.legalCardIds[0] ?? null;
  return scores.reduce((a, b) => (b.avg > a.avg ? b : a)).id;
}
