/**
 * Cards and the deck. See PROJECT.md sections 4 and 7.
 *
 * - One standard 52-card deck for every player count.
 * - Ace is high: 2 is lowest, then 3 to 10, J, Q, K, A.
 * - Jokers (when the joker rule is on): 2 for 2 to 5 players, 3 for 6 to 8.
 *   They are shuffled into the player deck and dealt like any other card.
 */

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

/** 2..10 as numbers, then J = 11, Q = 12, K = 13, A = 14 (Ace high). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface StandardCard {
  readonly kind: 'standard';
  readonly id: string; // e.g. "spades-14"
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface JokerCard {
  readonly kind: 'joker';
  readonly id: string; // e.g. "joker-1"
}

export type Card = StandardCard | JokerCard;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export function assertPlayerCount(players: number): void {
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new RangeError(`Pubby needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${players}`);
  }
}

/** Number of jokers in the game. 0 when the host turns the joker rule off. */
export function jokerCount(players: number, jokerRuleEnabled: boolean): number {
  assertPlayerCount(players);
  if (!jokerRuleEnabled) return 0;
  return players <= 5 ? 2 : 3;
}

/** The 52 standard cards, in a fixed order (not shuffled). */
export function standardCards(): StandardCard[] {
  const cards: StandardCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ kind: 'standard', id: `${suit}-${rank}`, suit, rank });
    }
  }
  return cards;
}

/** The full player deck for a game: 52 cards plus any jokers. Not shuffled. */
export function createDeck(players: number, jokerRuleEnabled: boolean): Card[] {
  const jokers: JokerCard[] = [];
  for (let i = 1; i <= jokerCount(players, jokerRuleEnabled); i++) {
    jokers.push({ kind: 'joker', id: `joker-${i}` });
  }
  return [...standardCards(), ...jokers];
}

export function isJoker(card: Card): card is JokerCard {
  return card.kind === 'joker';
}

export function isStandard(card: Card): card is StandardCard {
  return card.kind === 'standard';
}

/** Suits a hand has no cards of. Jokers don't count towards any suit. */
export function missingSuits(hand: readonly Card[]): Suit[] {
  const held = new Set<Suit>();
  for (const c of hand) if (isStandard(c)) held.add(c.suit);
  return SUITS.filter((s) => !held.has(s));
}

/** Short label for logs and tests, e.g. "A♠", "10♥", "Joker". */
export function cardLabel(card: Card): string {
  if (isJoker(card)) return 'Joker';
  const names: Partial<Record<Rank, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const symbols: Record<Suit, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
  return `${names[card.rank] ?? String(card.rank)}${symbols[card.suit]}`;
}
