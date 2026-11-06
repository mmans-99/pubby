/**
 * Dealing. See PROJECT.md sections 2b and 3.
 *
 * - Hidden decks (2 players: 2, 3 players: 1, 4+: none) are dealt first,
 *   automatically in the background, before the dealer starts. They are never
 *   sent to any player view or shown on any screen; only the swap uses them.
 *   Each hidden deck gets one player's share: the deck size divided by
 *   (players + hidden decks), rounded down. Leftover cards go to the players.
 * - The dealer then deals the remaining cards to the players only.
 * - Auto deal: the dealer taps the first player, then cards go one at a time,
 *   clockwise, until every card is dealt. The UI calls autoDealStep once per
 *   animation frame and can switch to manual between steps.
 * - Manual deal: the dealer taps a seat and one card goes to it.
 * - The dealer can switch between modes at any time. Uneven hands are fine.
 */

import type { Card } from './cards.ts';
import { assertPlayerCount } from './cards.ts';

export type SeatId = string;
export type DealMode = 'auto' | 'manual';

export interface DealState {
  /** Players in clockwise order. Hidden decks are not seats. */
  readonly seats: readonly SeatId[];
  /** Hidden decks, dealt face down before the dealer starts. Never shown. */
  readonly hiddenDecks: Readonly<Record<SeatId, readonly Card[]>>;
  /** Cards still to deal, top of the pile first. */
  readonly remaining: readonly Card[];
  /** Cards dealt to each seat so far. */
  readonly hands: Readonly<Record<SeatId, readonly Card[]>>;
  readonly mode: DealMode;
  /** Seat that gets the next auto-dealt card. Null until auto deal starts. */
  readonly nextSeat: SeatId | null;
}

/** Number of hidden decks for a player count. */
export function hiddenDeckCount(players: number): number {
  assertPlayerCount(players);
  if (players === 2) return 2;
  if (players === 3) return 1;
  return 0;
}

export function hiddenSeatId(index: number): SeatId {
  return `hidden-${index + 1}`;
}

export function isHiddenSeat(seat: SeatId): boolean {
  return seat.startsWith('hidden-');
}

/** Cards in each hidden deck: one player's share, rounded down. */
export function hiddenDeckSize(players: number, deckSize: number): number {
  const hidden = hiddenDeckCount(players);
  if (hidden === 0) return 0;
  return Math.floor(deckSize / (players + hidden));
}

/**
 * Set up a deal. `playersClockwise` is the table order of player ids.
 * `shuffledDeck` should already be shuffled by the dealer.
 * Hidden decks are dealt here, automatically, before the dealer starts.
 */
export function startDeal(
  playersClockwise: readonly SeatId[],
  shuffledDeck: readonly Card[],
  mode: DealMode = 'auto',
): DealState {
  const players = playersClockwise.length;
  assertPlayerCount(players);
  if (new Set(playersClockwise).size !== players) {
    throw new Error('Player ids must be unique');
  }
  if (playersClockwise.some(isHiddenSeat)) {
    throw new Error('Player ids cannot start with "hidden-"');
  }

  // Hidden decks first: one card at a time to each hidden deck in turn.
  const count = hiddenDeckCount(players);
  const size = hiddenDeckSize(players, shuffledDeck.length);
  const hiddenDecks: Record<SeatId, Card[]> = {};
  for (let i = 0; i < count; i++) hiddenDecks[hiddenSeatId(i)] = [];
  let pos = 0;
  for (let round = 0; round < size; round++) {
    for (let i = 0; i < count; i++) {
      (hiddenDecks[hiddenSeatId(i)] as Card[]).push(shuffledDeck[pos++] as Card);
    }
  }

  const hands: Record<SeatId, Card[]> = {};
  for (const s of playersClockwise) hands[s] = [];
  return {
    seats: playersClockwise.slice(),
    hiddenDecks,
    remaining: shuffledDeck.slice(pos),
    hands,
    mode,
    nextSeat: null,
  };
}

export function isDealComplete(state: DealState): boolean {
  return state.remaining.length === 0;
}

function assertSeat(state: DealState, seat: SeatId): void {
  if (!state.seats.includes(seat)) throw new Error(`Unknown seat: ${seat}`);
}

function giveTopCard(state: DealState, seat: SeatId): DealState {
  const [top, ...rest] = state.remaining;
  if (!top) throw new Error('No cards left to deal');
  return {
    ...state,
    remaining: rest,
    hands: { ...state.hands, [seat]: [...(state.hands[seat] ?? []), top] },
  };
}

function nextClockwise(state: DealState, seat: SeatId): SeatId {
  const i = state.seats.indexOf(seat);
  return state.seats[(i + 1) % state.seats.length] as SeatId;
}

/** Switch deal mode. Allowed at any time, including mid auto deal. */
export function setDealMode(state: DealState, mode: DealMode): DealState {
  return { ...state, mode };
}

/** Dealer taps the first seat for an auto deal. */
export function autoDealStart(state: DealState, firstSeat: SeatId): DealState {
  assertSeat(state, firstSeat);
  return { ...state, mode: 'auto', nextSeat: firstSeat };
}

/** Deal one card in auto mode to `nextSeat`, then move clockwise. */
export function autoDealStep(state: DealState): DealState {
  if (state.mode !== 'auto') throw new Error('Not in auto deal mode');
  if (state.nextSeat === null) throw new Error('Auto deal has not started');
  const seat = state.nextSeat;
  const dealt = giveTopCard(state, seat);
  return { ...dealt, nextSeat: nextClockwise(dealt, seat) };
}

/** Run auto deal to the end. Used by tests and by a "skip animation" option. */
export function autoDealAll(state: DealState): DealState {
  let s = state;
  while (!isDealComplete(s)) s = autoDealStep(s);
  return s;
}

/**
 * Manual deal: one card to the tapped seat. If the dealer switched from auto,
 * the next auto seat is kept, so switching back resumes the rotation.
 */
export function manualDealCard(state: DealState, seat: SeatId): DealState {
  if (state.mode !== 'manual') throw new Error('Not in manual deal mode');
  assertSeat(state, seat);
  return giveTopCard(state, seat);
}
