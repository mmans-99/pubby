/**
 * Round start. See PROJECT.md sections 2, 3 and 5.
 *
 * - Every round starts with the full deck: 52 cards plus jokers (if on).
 * - Round 1: the host shuffles, deals, and leads.
 * - Later rounds: the previous round's loser shuffles and deals; the winner
 *   chooses who leads.
 * - Hidden decks (2 and 3 players) are set aside every round, in the
 *   background, and the hidden swap is offered at the start of every round.
 * - Reshuffle vote passes: the dealer reshuffles the full deck and deals again,
 *   hidden decks included.
 * - A player missing a suit leads, regardless of the above. Two or more:
 *   Reaction Tap, slowest leads.
 */

import type { Card, Suit } from './cards.ts';
import { createDeck, missingSuits } from './cards.ts';
import type { DealMode, DealState, SeatId } from './deal.ts';
import { startDeal } from './deal.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';
import type { PlayerId } from './types.ts';

export interface RoundSetup {
  /** 1-based round number. */
  readonly round: number;
  /** Players in clockwise order. */
  readonly players: readonly PlayerId[];
  readonly hostId: PlayerId;
  readonly jokerRuleEnabled: boolean;
  /** Previous round's result. Required from round 2 on. */
  readonly previous?: { readonly winner: PlayerId; readonly loser: PlayerId };
}

/** Who shuffles and deals this round. */
export function dealerFor(setup: RoundSetup): PlayerId {
  if (!setup.players.includes(setup.hostId)) throw new Error('Host is not a player');
  if (setup.round === 1) return setup.hostId;
  if (!setup.previous) throw new Error('Rounds after the first need the previous result');
  if (!setup.players.includes(setup.previous.loser)) throw new Error('Previous loser is not a player');
  return setup.previous.loser;
}

/**
 * The dealer shuffles a full fresh deck and sets up the deal (hidden decks are
 * set aside here). Also used when a reshuffle vote passes.
 */
export function shuffleAndStartDeal(setup: RoundSetup, rng: Rng, mode: DealMode = 'auto'): DealState {
  const deck = shuffle(createDeck(setup.players.length, setup.jokerRuleEnabled), rng);
  return startDeal(setup.players, deck, mode);
}

// ---------------------------------------------------------------------------
// Hidden swap (2 and 3 players, every round)
// ---------------------------------------------------------------------------

export const MAX_SWAP = 4;

/** The hidden swap is offered at the start of every round in 2 and 3 player games. */
export function swapAllowed(players: number): boolean {
  return players === 2 || players === 3;
}

export interface SwapResult {
  readonly hand: readonly Card[];
  readonly hiddenDecks: Readonly<Record<SeatId, readonly Card[]>>;
  /** Cards the player gave up. They leave the game for this round. */
  readonly removed: readonly Card[];
}

/**
 * A player gives up to 4 of their own cards (or none). The given cards leave
 * the game. The player gets the same number of random cards drawn from the
 * hidden decks. Each player swaps at most once per round; the caller tracks that.
 */
export function hiddenSwap(
  hand: readonly Card[],
  hiddenDecks: Readonly<Record<SeatId, readonly Card[]>>,
  cardIds: readonly string[],
  rng: Rng,
): SwapResult {
  if (cardIds.length > MAX_SWAP) throw new Error(`Swap at most ${MAX_SWAP} cards`);
  if (new Set(cardIds).size !== cardIds.length) throw new Error('Same card chosen twice');
  const removed: Card[] = [];
  for (const id of cardIds) {
    const card = hand.find((c) => c.id === id);
    if (!card) throw new Error(`Card not in hand: ${id}`);
    removed.push(card);
  }

  // Pool every hidden card, remembering which deck it came from.
  const pool: { deck: SeatId; card: Card }[] = [];
  for (const [deck, cards] of Object.entries(hiddenDecks)) {
    for (const card of cards) pool.push({ deck, card });
  }
  if (pool.length < cardIds.length) throw new Error('Not enough hidden cards to swap');
  const drawn = shuffle(pool, rng).slice(0, cardIds.length);
  const drawnIds = new Set(drawn.map((d) => d.card.id));

  const newDecks: Record<SeatId, Card[]> = {};
  for (const [deck, cards] of Object.entries(hiddenDecks)) {
    newDecks[deck] = cards.filter((c) => !drawnIds.has(c.id));
  }
  const removedIds = new Set(cardIds);
  return {
    hand: [...hand.filter((c) => !removedIds.has(c.id)), ...drawn.map((d) => d.card)],
    hiddenDecks: newDecks,
    removed,
  };
}

// ---------------------------------------------------------------------------
// Missing suits and Reaction Tap
// ---------------------------------------------------------------------------

/** Players holding no cards of at least one suit, in clockwise order. */
export function missingSuitPlayers(
  players: readonly PlayerId[],
  hands: Readonly<Record<PlayerId, readonly Card[]>>,
): { player: PlayerId; suits: Suit[] }[] {
  const out: { player: PlayerId; suits: Suit[] }[] = [];
  for (const p of players) {
    const suits = missingSuits(hands[p] ?? []);
    if (suits.length > 0) out.push({ player: p, suits });
  }
  return out;
}

export interface ReactionResult {
  readonly player: PlayerId;
  /** Reaction time in milliseconds. Ignored when falseStart is true. */
  readonly ms: number;
  readonly falseStart: boolean;
}

export type ReactionOutcome =
  | { readonly kind: 'decided'; readonly slowest: PlayerId }
  | { readonly kind: 'replay'; readonly players: readonly PlayerId[] };

/**
 * Slowest reactor leads. A false start counts as the slowest time. If the
 * slowest are tied (including two or more false starts), only they replay.
 */
export function resolveReactionTap(results: readonly ReactionResult[]): ReactionOutcome {
  if (results.length < 2) throw new Error('Reaction Tap needs at least two players');
  const time = (r: ReactionResult) => (r.falseStart ? Number.POSITIVE_INFINITY : r.ms);
  const worst = Math.max(...results.map(time));
  const slowest = results.filter((r) => time(r) === worst).map((r) => r.player);
  if (slowest.length === 1) return { kind: 'decided', slowest: slowest[0] as PlayerId };
  return { kind: 'replay', players: slowest };
}

// ---------------------------------------------------------------------------
// Who leads
// ---------------------------------------------------------------------------

export type LeaderDecision =
  | { readonly kind: 'leader'; readonly leader: PlayerId; readonly reason: 'missingSuit' | 'host' }
  | { readonly kind: 'reactionTap'; readonly players: readonly PlayerId[] }
  | { readonly kind: 'winnerChooses'; readonly winner: PlayerId };

/**
 * Decide who leads round `setup.round`, after the deal, reshuffle vote, and
 * swap are done. Missing-suit players override everything else.
 */
export function decideLeader(
  setup: RoundSetup,
  hands: Readonly<Record<PlayerId, readonly Card[]>>,
): LeaderDecision {
  const missing = missingSuitPlayers(setup.players, hands);
  if (missing.length === 1) {
    return { kind: 'leader', leader: (missing[0] as { player: PlayerId }).player, reason: 'missingSuit' };
  }
  if (missing.length > 1) return { kind: 'reactionTap', players: missing.map((m) => m.player) };
  if (setup.round === 1) return { kind: 'leader', leader: setup.hostId, reason: 'host' };
  if (!setup.previous) throw new Error('Rounds after the first need the previous result');
  return { kind: 'winnerChooses', winner: setup.previous.winner };
}
