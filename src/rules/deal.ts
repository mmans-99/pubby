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
 * - Even deal: once a seat gets a card it is locked until every seat has had
 *   one in this lap, then all open again (except the seat that just got the
 *   last card: never two in a row). Auto deal skips locked seats too.
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
  /** Seat that got the last card. The next card must go to someone else. */
  readonly lastSeat?: SeatId | null;
  /** Seats that have had a card in the current lap. Cleared once every seat has one. */
  readonly lap?: readonly SeatId[];
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
    lastSeat: null,
    lap: [],
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
  const lap = [...(state.lap ?? []).filter((x) => x !== seat), seat];
  return {
    ...state,
    remaining: rest,
    hands: { ...state.hands, [seat]: [...(state.hands[seat] ?? []), top] },
    lastSeat: seat,
    lap: lap.length >= state.seats.length ? [] : lap,
  };
}

/** Seats that can't get the next card: everyone dealt to this lap, and whoever got the last card. */
export function lockedSeats(state: DealState): SeatId[] {
  const locked = new Set(state.lap ?? []);
  if (state.lastSeat) locked.add(state.lastSeat);
  return state.seats.filter((x) => locked.has(x));
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
  // Skip seats locked for this lap (after manual cards), clockwise.
  const locked = lockedSeats(state);
  let seat = state.nextSeat;
  for (let i = 0; i < state.seats.length && locked.includes(seat); i++) seat = nextClockwise(state, seat);
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
  if (lockedSeats(state).includes(seat)) {
    throw new Error(seat === state.lastSeat
      ? 'The next card has to go to someone else'
      : 'Everyone gets a card before anyone gets another');
  }
  return giveTopCard(state, seat);
}
