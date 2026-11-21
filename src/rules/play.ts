/**
 * Trick play. See PROJECT.md sections 4, 4.1, 6 and 7.
 *
 * - The leader plays any card. Clockwise, each player must follow the led
 *   suit if they can.
 * - Slap: a player with no card of the led suit plays any other card. The
 *   trick stops at once. Whoever played the highest card of the led suit
 *   picks up every card in the trick (the slap card too) and leads next.
 * - Normal trick: once every player has played, the cards go to the waste
 *   pile and the highest card of the led suit leads next. If that player is
 *   out, the next highest card of the led suit leads.
 * - Joker: wild, played on your own turn, even if you could follow suit. It
 *   skips your turn and leaves the game. A joker led as the first card passes
 *   the lead to the next player clockwise.
 * - Nobody holds only jokers: when a player plays their last normal card, any
 *   jokers left in their hand are set aside, so that card is their last card.
 *   A joker is never a last card. When the trick ends (or the round ends) the
 *   aside jokers are thrown away if the player went out, and come back to the
 *   hand if they picked up (slapped, or the final-two pick-up). PROJECT.md 7.
 * - Final two: jokers can always be played (the "no jokers against a last
 *   card" block was dropped on 2026-11-07). A joker led is still the same
 *   trick: the other player plays any card, or a joker (missed round). A last
 *   card answered or met only by a joker goes out unopposed and wins.
 * - Going out is checked when the trick ends (a player who played their last
 *   card and is then slapped picks up and stays in).
 * - Final two (any game size): when only two players hold cards and one of
 *   them plays their last card:
 *     - lower than the other player's card, or a slap: they win;
 *     - higher than the other player's card: they must pick up the whole
 *       waste pile and play on, or forfeit (take last place);
 *     - both go out in the same trick: the lower card, or the slapper, wins.
 *   Both play jokers in a trick without going out: missed round, the player
 *   who played first leads again.
 * - Either of the last two players can forfeit at any time (PROJECT.md 6, 12s):
 *   they take last place, the other player the higher place.
 * - The round ends when one player is left holding cards: the loser.
 */

import type { Card, StandardCard, Suit } from './cards.ts';
import { isJoker, isStandard } from './cards.ts';
import type { PlayerId } from './types.ts';

export interface TrickPlay {
  readonly player: PlayerId;
  readonly card: StandardCard;
}

export interface TrickState {
  /** Players holding cards when the trick started, clockwise from the leader. */
  readonly participants: readonly PlayerId[];
  readonly ledSuit: Suit | null;
  readonly plays: readonly TrickPlay[];
  /** Participants who have had their turn (played a card or a joker). */
  readonly acted: readonly PlayerId[];
  /**
   * 9an.8 (2.38): how many players the trick started with. A removed player
   * leaves `participants`, but the trick keeps its rules (a trick that started
   * with three finishes under normal rules). Old saved games: participants.length.
   */
  readonly size?: number;
}

export interface PlayState {
  /** All players in clockwise order. */
  readonly order: readonly PlayerId[];
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Whose turn it is. Null when the round is over or a final-two choice is pending. */
  readonly turn: PlayerId | null;
  readonly trick: TrickState;
  readonly wastePile: readonly Card[];
  /** Jokers that have been played. They are out of the game for this round. */
  readonly usedJokers: readonly Card[];
  /** Players who are out, first out first. */
  readonly finished: readonly PlayerId[];
  /** Final two: player who must choose to pick up the waste pile or forfeit. */
  readonly pendingFinalTwo: PlayerId | null;
  /**
   * Players who picked up the waste pile. Kept for saved games; no longer
   * decides anything (either of the last two can forfeit at any time, 2.34.5).
   */
  readonly forfeitAllowed: readonly PlayerId[];
  /**
   * 9ar.2 (K): the waste pile has been picked up once this round. A second higher
   * last card then ends the round (no pick-up). False at each deal; missing in
   * saved games counts as false.
   */
  readonly finalTwoPickUpUsed?: boolean;
  /** Jokers set aside with a player's last normal card (PROJECT.md 7). Thrown away if that player goes out; back into the hand if they pick up (slapped, or the final-two pick-up). */
  readonly asideJokers?: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Set when the round ends: the player left holding cards. */
  readonly loser: PlayerId | null;
  /** True once the round has ended. */
  readonly over: boolean;
}

export interface RoundEnd {
  /** Every player, first place to last place. */
  readonly finishingOrder: readonly PlayerId[];
  readonly loser: PlayerId | null;
  /**
   * Two players who both went out on jokers shared second-last place. No
   * longer possible (a joker is never a last card); always null. Kept so
   * scoring and saved games still read.
   */
  readonly sharedSecondLast: readonly PlayerId[] | null;
  readonly forfeitedBy: PlayerId | null;
  /** 9ar.2 (K): 'secondHigher' when the last card was higher again after the one pick-up. */
  readonly reason?: 'secondHigher' | null;
}

export type PlayEvent =
  | { readonly type: 'cardPlayed'; readonly player: PlayerId; readonly card: StandardCard }
  | { readonly type: 'jokerPlayed'; readonly player: PlayerId; readonly asLeader: boolean }
  /** Jokers set aside with a player's last normal card are thrown away (the player went out). Comes when the trick or round ends. */
  | { readonly type: 'jokersDiscarded'; readonly player: PlayerId; readonly count: number }
  | {
      readonly type: 'slapped';
      readonly slapper: PlayerId;
      readonly slapped: PlayerId;
      readonly cardsPickedUp: number;
    }
  | { readonly type: 'trickResolved'; readonly nextLeader: PlayerId | null }
  | { readonly type: 'playerOut'; readonly player: PlayerId; readonly place: number }
  | { readonly type: 'finalTwoChoice'; readonly player: PlayerId }
  | { readonly type: 'wastePilePickedUp'; readonly player: PlayerId; readonly cards: number }
  | { readonly type: 'forfeited'; readonly player: PlayerId }
  | { readonly type: 'cardsTaken'; readonly requester: PlayerId; readonly target: PlayerId; readonly count: number }
  | ({ readonly type: 'roundEnded' } & RoundEnd);

export interface PlayResult {
  readonly state: PlayState;
  readonly events: readonly PlayEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handOf(state: Pick<PlayState, 'hands'>, p: PlayerId): readonly Card[] {
  return state.hands[p] ?? [];
}

/** Players still holding cards, clockwise starting from `from` (inclusive). */
function activeFrom(order: readonly PlayerId[], hands: PlayState['hands'], from: PlayerId): PlayerId[] {
  const start = Math.max(0, order.indexOf(from));
  const out: PlayerId[] = [];
  for (let i = 0; i < order.length; i++) {
    const p = order[(start + i) % order.length] as PlayerId;
    if ((hands[p] ?? []).length > 0) out.push(p);
  }
  return out;
}

function newTrick(state: Pick<PlayState, 'order' | 'hands'>, leader: PlayerId): TrickState {
  const participants = activeFrom(state.order, state.hands, leader);
  return { participants, ledSuit: null, plays: [], acted: [], size: participants.length };
}

/** Plays of the led suit, highest first. */
function ledSuitPlaysHighFirst(trick: TrickState): TrickPlay[] {
  return trick.plays.filter((p) => p.card.suit === trick.ledSuit).sort((a, b) => b.card.rank - a.card.rank);
}

/** Next participant after `p` (clockwise) who has not acted yet. */
function nextToAct(trick: TrickState, p: PlayerId): PlayerId | null {
  const i = trick.participants.indexOf(p);
  for (let k = 1; k <= trick.participants.length; k++) {
    const q = trick.participants[(i + k) % trick.participants.length] as PlayerId;
    if (!trick.acted.includes(q)) return q;
  }
  return null;
}

function otherOf(pair: readonly PlayerId[], p: PlayerId): PlayerId {
  return (pair[0] === p ? pair[1] : pair[0]) as PlayerId;
}

/**
 * Settle jokers set aside with a last normal card: back into the hand if the
 * player holds cards again (picked up), otherwise thrown away.
 */
function settleAsideJokers(state: PlayState, events: PlayEvent[]): PlayState {
  const aside = state.asideJokers ?? {};
  const players = Object.keys(aside) as PlayerId[];
  if (players.length === 0) return state;
  let hands = state.hands;
  let usedJokers = state.usedJokers;
  for (const p of players) {
    const jokers = aside[p] ?? [];
    if (jokers.length === 0) continue;
    const hand = handOf({ hands }, p);
    if (hand.length > 0) {
      hands = { ...hands, [p]: [...hand, ...jokers] };
    } else {
      usedJokers = [...usedJokers, ...jokers];
      events.push({ type: 'jokersDiscarded', player: p, count: jokers.length });
    }
  }
  return { ...state, hands, usedJokers, asideJokers: {} };
}

/** End the round with a complete order from first to last. */
function endRound(
  stateIn: PlayState,
  events: PlayEvent[],
  orderFirstToLast: readonly PlayerId[],
  wastePile: readonly Card[],
  extra: { sharedSecondLast?: readonly PlayerId[]; forfeitedBy?: PlayerId; reason?: 'secondHigher' } = {},
): PlayResult {
  const state = settleAsideJokers(stateIn, events);
  for (let i = state.finished.length; i < orderFirstToLast.length - 1; i++) {
    events.push({ type: 'playerOut', player: orderFirstToLast[i] as PlayerId, place: i + 1 });
  }
  const last = orderFirstToLast[orderFirstToLast.length - 1] ?? null;
  const end: RoundEnd = {
    finishingOrder: orderFirstToLast.slice(),
    loser: last,
    sharedSecondLast: extra.sharedSecondLast ?? null,
    forfeitedBy: extra.forfeitedBy ?? null,
    ...(extra.reason ? { reason: extra.reason } : {}),
  };
  events.push({ type: 'roundEnded', ...end });
  return {
    state: {
      ...state,
      wastePile,
      finished: orderFirstToLast.slice(0, -1),
      loser: last,
      turn: null,
      pendingFinalTwo: null,
      over: true,
    },
    events,
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Start trick play for a round, after the deal, swap and leader decision. */
export function startPlay(
  order: readonly PlayerId[],
  hands: Readonly<Record<PlayerId, readonly Card[]>>,
  leader: PlayerId,
): PlayState {
  if (!order.includes(leader)) throw new Error(`Leader is not a player: ${leader}`);
  if ((hands[leader] ?? []).length === 0) throw new Error('Leader has no cards');
  const base = { order: order.slice(), hands: { ...hands } };
  return {
    ...base,
    turn: leader,
    trick: newTrick(base, leader),
    wastePile: [],
    usedJokers: [],
    finished: [],
    pendingFinalTwo: null,
    forfeitAllowed: [],
    finalTwoPickUpUsed: false,
    asideJokers: {},
    loser: null,
    over: false,
  };
}

/** Cards the player may legally play right now (empty if not their turn). */
export function legalCards(state: PlayState, player: PlayerId): Card[] {
  if (state.over || state.turn !== player) return [];
  const hand = handOf(state, player);
  const jokers = hand.filter(isJoker);
  const normal = hand.filter(isStandard);
  const led = state.trick.ledSuit;
  if (led === null) return [...normal, ...jokers];
  const following = normal.filter((c) => c.suit === led);
  // Must follow suit if able. Jokers can always be played on your turn.
  if (following.length > 0) return [...following, ...jokers];
  return [...normal, ...jokers]; // any card: a slap (or a joker)
}

// ---------------------------------------------------------------------------
// Play a card
// ---------------------------------------------------------------------------

export function playCard(state: PlayState, player: PlayerId, cardId: string): PlayResult {
  if (state.over) throw new Error('The round is over');
  if (state.pendingFinalTwo !== null) throw new Error('Waiting for the pick-up or forfeit choice');
  if (state.turn !== player) throw new Error(`Not ${player}'s turn`);
  const hand = handOf(state, player);
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card not in hand: ${cardId}`);
  if (!legalCards(state, player).some((c) => c.id === cardId)) {
    throw new Error('You must follow the led suit');
  }

  const events: PlayEvent[] = [];
  const hands = { ...state.hands, [player]: hand.filter((c) => c.id !== cardId) };
  const trick = state.trick;

  // Joker: skips this player's turn and leaves the game.
  if (isJoker(card)) {
    const asLeader = trick.plays.length === 0;
    events.push({ type: 'jokerPlayed', player, asLeader });
    const nextTrick: TrickState = { ...trick, acted: [...trick.acted, player] };
    const s: PlayState = { ...state, hands, trick: nextTrick, usedJokers: [...state.usedJokers, card] };
    return finishTurn(s, player, events);
  }

  const std = card as StandardCard;
  events.push({ type: 'cardPlayed', player, card: std });

  // Last normal card: any jokers left are set aside, so this is the last card.
  // They are thrown away or come back when the trick ends (settleAsideJokers).
  const rest = hands[player] ?? [];
  let base: PlayState = state;
  if (rest.length > 0 && rest.every(isJoker)) {
    hands[player] = [];
    const aside = state.asideJokers ?? {};
    base = { ...state, asideJokers: { ...aside, [player]: [...(aside[player] ?? []), ...rest] } };
  }

  // Leading card sets the suit.
  if (trick.ledSuit === null) {
    const nextTrick: TrickState = {
      ...trick,
      ledSuit: std.suit,
      plays: [{ player, card: std }],
      acted: [...trick.acted, player],
    };
    return finishTurn({ ...base, hands, trick: nextTrick }, player, events);
  }

  const plays = [...trick.plays, { player, card: std }];

  // Slap: off-suit card. Trick stops now.
  if (std.suit !== trick.ledSuit) {
    const high = ledSuitPlaysHighFirst(trick)[0] as TrickPlay;
    const pickup = plays.map((p) => p.card);
    const afterHands = { ...hands, [high.player]: [...(hands[high.player] ?? []), ...pickup] };
    events.push({ type: 'slapped', slapper: player, slapped: high.player, cardsPickedUp: pickup.length });
    const resolvedTrick: TrickState = { ...trick, plays, acted: [...trick.acted, player] };
    return resolveTrick({ ...base, hands: afterHands, trick: resolvedTrick }, high.player, [], events);
  }

  // Normal follow.
  const nextTrick: TrickState = { ...trick, plays, acted: [...trick.acted, player] };
  return finishTurn({ ...base, hands, trick: nextTrick }, player, events);
}

/** After a play or joker that did not stop the trick: next turn, or resolve. */
function finishTurn(state: PlayState, player: PlayerId, events: PlayEvent[]): PlayResult {
  const next = nextToAct(state.trick, player);
  if (next !== null) {
    // Includes a joker lead: the next player starts the trick with any card.
    return { state: { ...state, turn: next }, events };
  }
  return afterLastTurn(state, events);
}

/**
 * Everyone in the trick has had their turn: final two, a joker-only trick, or
 * the normal close. Also used when a removed player was the last to act (9an.8).
 */
function afterLastTurn(state: PlayState, events: PlayEvent[]): PlayResult {
  const trick = state.trick;
  if ((trick.size ?? trick.participants.length) === 2) return resolveFinalTwo(state, events);

  // Everyone has acted.
  if (trick.plays.length === 0) {
    // Every participant played a joker: next player clockwise holding cards leads.
    return resolveTrick(state, null, [], events);
  }
  const ranked = ledSuitPlaysHighFirst(trick);
  // Highest led-suit card leads; if that player is out, the next highest.
  const leader = ranked.find((p) => handOf(state, p.player).length > 0)?.player ?? null;
  const waste = trick.plays.map((p) => p.card);
  return resolveTrick(state, leader, waste, events, (ranked[0] as TrickPlay).player);
}

/** Final two: both players have acted and nobody slapped. */
function resolveFinalTwo(state: PlayState, events: PlayEvent[]): PlayResult {
  const trick = state.trick;
  const pair = trick.participants;
  const waste = trick.plays.map((p) => p.card);
  const emptied = pair.filter((p) => handOf(state, p).length === 0);
  const playOf = (p: PlayerId) => trick.plays.find((x) => x.player === p);

  // Both played jokers (nobody can go out on a joker): missed round, the
  // player who played first leads again.
  if (trick.plays.length === 0) {
    return resolveTrick(state, trick.acted[0] as PlayerId, [], events);
  }

  if (emptied.length === 0) {
    const leader = (ledSuitPlaysHighFirst(trick)[0] as TrickPlay).player;
    return resolveTrick(state, leader, waste, events);
  }

  if (emptied.length === 2) {
    // Both went out in this trick: the lower card wins.
    const [a, b] = pair as [PlayerId, PlayerId];
    const pa = playOf(a);
    const pb = playOf(b);
    let winner: PlayerId;
    if (!pa) winner = a;
    else if (!pb) winner = b;
    else winner = pa.card.rank < pb.card.rank ? a : b;
    const wastePile = [...state.wastePile, ...waste];
    return endRound(state, events, [...state.finished, winner, otherOf(pair, winner)], wastePile);
  }

  // One player played their last card.
  const x = emptied[0] as PlayerId;
  const o = otherOf(pair, x);
  const xp = playOf(x);
  const op = playOf(o);
  // A lower last card wins. A last card met only by a joker (no normal card
  // from the other player) goes out unopposed and wins too.
  if (!xp || !op || xp.card.rank < op.card.rank) {
    const wastePile = [...state.wastePile, ...waste];
    return endRound(state, events, [...state.finished, x, o], wastePile);
  }

  // 9ar.2 (K): the one pick-up is used: a higher last card again. No choice;
  // x takes last place and o the higher place.
  if (state.finalTwoPickUpUsed) {
    const wastePile = [...state.wastePile, ...waste];
    return endRound(state, events, [...state.finished, o, x], wastePile, { reason: 'secondHigher' });
  }

  // Higher last card: x must pick up the waste pile or forfeit.
  events.push({ type: 'trickResolved', nextLeader: null });
  events.push({ type: 'finalTwoChoice', player: x });
  return {
    state: {
      ...state,
      wastePile: [...state.wastePile, ...waste],
      pendingFinalTwo: x,
      turn: null,
    },
    events,
  };
}

/**
 * Close the trick: move cards to the waste pile, mark players out, check for
 * the end of the round, and start the next trick.
 * `fallbackFrom` is used when no led-suit player is left holding cards.
 */
function resolveTrick(
  state: PlayState,
  leader: PlayerId | null,
  waste: readonly Card[],
  events: PlayEvent[],
  fallbackFrom?: PlayerId,
): PlayResult {
  // Aside jokers first: a slapped player gets them back and is not out.
  state = settleAsideJokers(state, events);
  const trick = state.trick;
  const wastePile = [...state.wastePile, ...waste];

  // Who went out in this trick, in the order they played.
  const finished = [...state.finished];
  for (const p of trick.acted) {
    if (handOf(state, p).length === 0 && !finished.includes(p)) finished.push(p);
  }

  const stillIn = state.order.filter((p) => handOf(state, p).length > 0);
  if (stillIn.length <= 1) {
    events.push({ type: 'trickResolved', nextLeader: null });
    return endRound({ ...state }, events, [...finished, ...stillIn], wastePile);
  }

  for (let i = state.finished.length; i < finished.length; i++) {
    events.push({ type: 'playerOut', player: finished[i] as PlayerId, place: i + 1 });
  }

  let next = leader;
  if (next === null || !stillIn.includes(next)) {
    // Nobody who played the led suit still holds cards: next player clockwise.
    const from = fallbackFrom ?? trick.acted[trick.acted.length - 1] ?? (state.order[0] as PlayerId);
    next = activeFrom(state.order, state.hands, from)[0] as PlayerId;
  }
  events.push({ type: 'trickResolved', nextLeader: next });
  const forfeitAllowed = state.forfeitAllowed.filter((p) => stillIn.includes(p));
  return {
    state: { ...state, wastePile, finished, forfeitAllowed, turn: next, trick: newTrick(state, next) },
    events,
  };
}

// ---------------------------------------------------------------------------
// Final two: pick up or forfeit
// ---------------------------------------------------------------------------

/** The player with the higher last card picks up the whole waste pile and plays on. */
export function pickUpWastePile(state: PlayState, player: PlayerId): PlayResult {
  if (state.pendingFinalTwo !== player) throw new Error(`${player} has no pick-up choice`);
  const cards = state.wastePile;
  const events: PlayEvent[] = [];
  const settled = settleAsideJokers(
    { ...state, hands: { ...state.hands, [player]: [...handOf(state, player), ...cards] } },
    events,
  );
  const hands = settled.hands;
  const s: PlayState = {
    ...settled,
    hands,
    wastePile: [],
    pendingFinalTwo: null,
    finalTwoPickUpUsed: true,
    forfeitAllowed: state.forfeitAllowed.includes(player) ? state.forfeitAllowed : [...state.forfeitAllowed, player],
    turn: player,
    trick: newTrick({ order: state.order, hands }, player),
  };
  return {
    state: s,
    events: [
      ...events,
      { type: 'wastePilePickedUp', player, cards: cards.length },
      { type: 'trickResolved', nextLeader: player },
    ],
  };
}

/**
 * True when `player` may forfeit: the round is not over and they are one of
 * exactly two players not yet finished (PROJECT.md 6, 12s). While the other
 * player faces the pick-up choice they hold no cards but are not finished, so
 * the count is still two.
 */
export function canForfeit(state: PlayState, player: PlayerId): boolean {
  if (state.over) return false;
  const remaining = state.order.filter((p) => !state.finished.includes(p));
  return remaining.length === 2 && remaining.includes(player);
}

/**
 * Forfeit: the player takes last place and the other player takes the higher
 * place. Either of the last two can forfeit at any time.
 */
export function forfeit(state: PlayState, player: PlayerId): PlayResult {
  if (state.over) throw new Error('The round is over');
  if (!canForfeit(state, player)) throw new Error(`${player} cannot forfeit`);
  const remaining = state.order.filter((p) => !state.finished.includes(p));
  const other = otherOf(remaining, player);
  const events: PlayEvent[] = [{ type: 'forfeited', player }];
  return endRound(state, events, [...state.finished, other, player], state.wastePile, { forfeitedBy: player });
}

// ---------------------------------------------------------------------------
// Removing a player during the round (9an.8, Part H)
// ---------------------------------------------------------------------------

/**
 * The host removed `p` during the round (CODE.md 9an.8 H-d). Their hand, their
 * aside jokers and their cards on the felt leave the game (not the waste pile,
 * not `usedJokers`). `p` leaves `order`. The session adds the bottom places.
 * If one player is left holding cards, the round ends and that player loses.
 */
export function removeFromPlay(state: PlayState, p: PlayerId): PlayResult {
  if (state.over) throw new Error('The round is over');
  if (!state.order.includes(p)) throw new Error(`${p} is not in the round`);

  const trick = state.trick;
  const myTurn = state.turn === p;
  const betweenTricks = trick.acted.length === 0 && state.pendingFinalTwo === null;
  // Their turn, mid-trick: who acts next, counting p as having acted (so the
  // search skips them). Worked out before p leaves.
  const nextAfterP = myTurn ? nextToAct({ ...trick, acted: [...trick.acted, p] }, p) : null;
  // Between tricks: the next player clockwise who still holds cards leads.
  const clockwiseHolder = activeFrom(state.order, state.hands, p).find((x) => x !== p) ?? null;

  const order = state.order.filter((x) => x !== p);
  // Final-two pick-up pending: the trick's cards already went to the waste pile,
  // so p's card comes off the pile (and is not counted again below).
  const pending = state.pendingFinalTwo !== null;
  const theirCardIds = new Set(trick.plays.filter((x) => x.player === p).map((x) => x.card.id));
  const pile = pending ? state.wastePile.filter((x) => !theirCardIds.has(x.id)) : state.wastePile;
  const hands: Record<PlayerId, readonly Card[]> = { ...state.hands };
  delete hands[p];
  let asideJokers: PlayState['asideJokers'] = undefined;
  if (state.asideJokers) {
    const aside: Record<PlayerId, readonly Card[]> = { ...state.asideJokers };
    delete aside[p];
    asideJokers = aside;
  }
  const plays = trick.plays.filter((x) => x.player !== p);
  const newTrickState: TrickState = {
    size: trick.size ?? trick.participants.length,
    participants: trick.participants.filter((x) => x !== p),
    ledSuit: plays.length === 0 ? null : trick.ledSuit,
    plays,
    acted: trick.acted.filter((x) => x !== p),
  };
  const s: PlayState = {
    ...state,
    order,
    hands,
    asideJokers,
    wastePile: pile,
    forfeitAllowed: state.forfeitAllowed.filter((x) => x !== p),
    trick: newTrickState,
  };
  const events: PlayEvent[] = [];

  // One player left holding cards: the round ends. The trick cards still on the
  // felt go to the waste pile (a pending pick-up has them there already); the
  // one left is the loser.
  const left = order.filter((x) => !state.finished.includes(x));
  if (left.length <= 1) {
    const waste = [...pile, ...(pending ? [] : plays.map((x) => x.card))];
    return endRound(s, events, [...state.finished, ...left], waste);
  }

  // Between tricks: a fresh trick starts from the right player.
  if (betweenTricks) {
    const turn = myTurn ? clockwiseHolder : state.turn;
    if (turn === null) throw new Error('No player left to lead the next trick');
    return { state: { ...s, turn, trick: newTrick(s, turn) }, events };
  }

  // Mid-trick, their turn: the next player to act takes over, or the trick closes.
  if (myTurn) {
    if (nextAfterP !== null) return { state: { ...s, turn: nextAfterP }, events };
    return afterLastTurn({ ...s, turn: null }, events);
  }

  // Mid-trick, someone else's turn: the trick carries on.
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Take-cards request (PROJECT.md section 4.2)
// ---------------------------------------------------------------------------

/** Players still holding cards. */
export function playersHoldingCards(state: PlayState): PlayerId[] {
  return state.order.filter((p) => handOf(state, p).length > 0);
}

/** True between tricks: the trick has started but nobody has played a card or a joker yet. */
export function betweenTricks(state: PlayState): boolean {
  return !state.over && state.pendingFinalTwo === null && state.trick.acted.length === 0;
}

/** A take is only possible while three or more players hold cards (with two left it would just be a forfeit). */
export function takeAllowed(state: PlayState, requester: PlayerId, target: PlayerId): string | null {
  if (state.over) return 'The round is over';
  if (requester === target) return 'You cannot take your own cards';
  if (!state.order.includes(requester) || !state.order.includes(target)) return 'Unknown player';
  if (handOf(state, requester).length === 0) return 'You are out of this round';
  if (handOf(state, target).length === 0) return 'That player is already out';
  if (playersHoldingCards(state).length < 3) return 'Not allowed with only two players left';
  if (state.turn !== requester) return 'Only the player about to lead can ask for cards';
  return null;
}

/**
 * The requester takes all of the target's cards, unseen. Only between tricks,
 * and only the player about to lead can ask (9an.1). The target has no cards
 * left, so they go out and take the next place. The requester, who asked
 * instead of playing a first card, leads the next trick.
 */
export function takeCards(state: PlayState, requester: PlayerId, target: PlayerId): PlayResult {
  const why = takeAllowed(state, requester, target);
  if (why) throw new Error(why);
  if (!betweenTricks(state)) throw new Error('Cards can only be taken between tricks');
  const taken = handOf(state, target);
  const hands = { ...state.hands, [requester]: [...handOf(state, requester), ...taken], [target]: [] };
  const finished = [...state.finished, target];
  const events: PlayEvent[] = [
    { type: 'cardsTaken', requester, target, count: taken.length },
    { type: 'playerOut', player: target, place: finished.length },
  ];
  const leader = requester;
  const base = { order: state.order, hands };
  const stillIn = state.order.filter((p) => (hands[p] ?? []).length > 0);
  return {
    state: {
      ...state,
      hands,
      finished,
      forfeitAllowed: state.forfeitAllowed.filter((p) => stillIn.includes(p)),
      turn: leader,
      trick: newTrick(base, leader),
    },
    events,
  };
}
