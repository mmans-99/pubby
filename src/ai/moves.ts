/**
 * The rules of thumb (PROJECT.md 12c, CODE.md 9m.3). Each function looks at
 * one decision and returns the session action to send, or null. Every move
 * must pass the session rules; the arena and the tests check that.
 *
 * `w` below is the personality's weights. Nothing here reads a hidden card:
 * it works from the AiSeen and the bot's memory only.
 */

import { isJoker, isStandard, type Card, type StandardCard, type Suit, SUITS } from '../rules/cards.ts';
import { betweenTricks, takeAllowed } from '../rules/play.ts';
import type { Rng } from '../rules/rng.ts';
import type { PlayerId, SessionAction } from '../session/types.ts';
import { PERSONALITY_WEIGHTS, type Persona } from './persona.ts';
import { handBadness, leadRisk, pSlapAfterMe, rankValue, yetToPlay } from './eval.ts';
import { unknownPool, type Memory } from './memory.ts';
import { searchScores } from './search.ts';
import type { AiSeen } from './seen.ts';

function pickRandom<T>(items: readonly T[], rng: Rng): T | undefined {
  return items[Math.floor(rng() * items.length)];
}

function byRankDesc(cards: readonly StandardCard[]): StandardCard[] {
  return [...cards].sort((a, b) => b.rank - a.rank);
}

function lowestOf(cards: readonly StandardCard[]): StandardCard | undefined {
  return [...cards].sort((a, b) => a.rank - b.rank)[0];
}

function jokerOf(hand: readonly Card[], legal: ReadonlySet<string>): string | undefined {
  const j = hand.find(isJoker);
  return j && legal.has(j.id) ? j.id : undefined;
}

/** Average rank of the standard cards that are still unknown to me. */
function avgUnknownRank(m: Memory, seen: AiSeen): number {
  const std = unknownPool(m, seen).filter(isStandard);
  if (std.length === 0) return 0;
  return std.reduce((sum, c) => sum + c.rank, 0) / std.length;
}

function unknownOfSuit(m: Memory, seen: AiSeen, suit: Suit): number {
  return unknownPool(m, seen).filter((c) => isStandard(c) && c.suit === suit).length;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * Hard's card (D2.3): Normal's card is the default. The imagined-deal search
 * (search.ts) replaces it only when its best card beats Normal's by at least
 * the switch margin. Tuning lives in HARD_TUNING so tests can change it.
 */
export const HARD_TUNING = { switchMargin: 0.3 };

function hardCard(seen: AiSeen, m: Memory, ruleCard: () => string | undefined, rng: Rng): string | undefined {
  const normal = ruleCard();
  const scores = searchScores(seen, m, rng);
  if (scores.length === 0) return normal;
  const best = scores.reduce((a, b) => (b.avg > a.avg ? b : a));
  if (normal === undefined) return best.id;
  const mine = scores.find((x) => x.id === normal);
  if (!mine) return normal;
  return best.avg - mine.avg >= HARD_TUNING.switchMargin ? best.id : normal;
}

/** My card on my turn (not a final-two choice). */
export function chooseCard(seen: AiSeen, m: Memory, persona: Persona, rng: Rng): SessionAction | null {
  const v = seen.view;
  if (v.turn !== seen.me || v.pendingFinalTwo !== null) return null;
  const legal = v.legalCardIds;
  if (legal.length === 0) return null;
  const legalSet = new Set(legal);

  const ruleCard = (): string | undefined =>
    v.ledSuit === null ? leadCard(seen, m, persona, legalSet) : followCard(seen, m, persona, legalSet);

  let cardId: string | undefined;
  if (persona.level === 'hard') {
    cardId = hardCard(seen, m, ruleCard, rng);
  } else if (persona.level === 'easy' && rng() < 0.2) {
    cardId = pickRandom(legal, rng);
  } else {
    cardId = ruleCard();
  }
  // Every choice above is a legal card; falling back to the first legal one keeps the game moving.
  const chosen = cardId !== undefined && legalSet.has(cardId) ? cardId : legal[0];
  return chosen === undefined ? null : { type: 'playCard', by: seen.me, cardId: chosen };
}

/** Leading (nothing led yet, or only a joker has been played). */
function leadCard(seen: AiSeen, m: Memory, persona: Persona, legal: ReadonlySet<string>): string | undefined {
  const w = PERSONALITY_WEIGHTS[persona.personality];
  const hand = seen.view.myHand;
  const std = hand.filter(isStandard);
  const jokerId = jokerOf(hand, legal);
  if (std.length === 0) return jokerId;

  // Final two, and the other player has one card left: lead my lowest card,
  // unless a joker lead is safer (my lowest card is above what they probably hold).
  const holders = seen.view.players.filter((p) => p.cardCount > 0);
  const other = holders.filter((p) => p.id !== seen.me);
  if (holders.length === 2 && other.length === 1 && other[0]?.cardCount === 1) {
    const low = lowestOf(std);
    if (low && jokerId && low.rank > avgUnknownRank(m, seen)) return jokerId;
    return low?.id;
  }

  const options = SUITS.filter((s) => std.some((c) => c.suit === s)).map((suit) => {
    const cards = byRankDesc(std.filter((c) => c.suit === suit));
    return { cards, risk: leadRisk(m, seen, suit) * w.risk, unknown: unknownOfSuit(m, seen, suit), len: cards.length };
  });
  options.sort((a, b) => a.risk - b.risk || b.unknown - a.unknown || b.len - a.len);
  const best = options[0];
  if (!best) return jokerId;
  if (jokerId && options.every((o) => o.risk > 0.7)) return jokerId;
  // Low risk: lead my highest card of the suit. Otherwise my lowest.
  return best.risk < 0.15 ? best.cards[0]?.id : lowestOf(best.cards)?.id;
}

/** Following the led suit, or slapping when I have none of it. */
function followCard(seen: AiSeen, m: Memory, persona: Persona, legal: ReadonlySet<string>): string | undefined {
  const w = PERSONALITY_WEIGHTS[persona.personality];
  const led = seen.view.ledSuit;
  if (led === null) return undefined;
  const hand = seen.view.myHand;
  const sameSuit = byRankDesc(hand.filter(isStandard).filter((c) => c.suit === led));
  if (sameSuit.length === 0) return slapCard(seen, legal);

  const top = Math.max(...seen.view.trick.filter((t) => t.card.suit === led).map((t) => t.card.rank), 0);
  const d = pSlapAfterMe(m, seen, led) * w.risk;
  const last = yetToPlay(m, seen).length === 0;
  if (d < 0.25 || last) return sameSuit[0]?.id;
  const under = sameSuit.find((c) => c.rank < top);
  if (under) return under.id;
  const jokerId = jokerOf(hand, legal);
  if (jokerId && d > 0.6 / w.jokerSave) return jokerId;
  return lowestOf(sameSuit)?.id;
}

/** A slap: the card I most want rid of. Never a joker while I have a standard card. */
function slapCard(seen: AiSeen, legal: ReadonlySet<string>): string | undefined {
  const hand = seen.view.myHand;
  const std = hand.filter(isStandard);
  if (std.length === 0) return jokerOf(hand, legal);
  let best: { id: string; score: number } | undefined;
  for (const c of std) {
    const alone = std.filter((x) => x.suit === c.suit).length === 1;
    const score = rankValue(c) + (alone ? 6 : 0);
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best?.id;
}

/** Final two, when I must pick up the waste pile or forfeit. */
export function chooseFinalTwo(seen: AiSeen, persona: Persona, rng: Rng): SessionAction {
  const pile = seen.view.wastePileCount;
  let pickUp: boolean;
  if (pile < 12) pickUp = true;
  else if (pile > 25) pickUp = false;
  else {
    const mult = persona.personality === 'careful' ? 1.2 : persona.personality === 'reckless' ? 0.8 : 1;
    pickUp = rng() < Math.min(1, ((25 - pile) / 13) * mult);
  }
  return pickUp ? { type: 'pickUpWastePile', by: seen.me } : { type: 'forfeit', by: seen.me };
}

// ---------------------------------------------------------------------------
// Round start
// ---------------------------------------------------------------------------

/** The hidden swap: which of my cards to give up (an empty list keeps my hand). */
export function chooseSwap(seen: AiSeen, persona: Persona, rng: Rng): SessionAction {
  const std = byRankDesc(seen.view.myHand.filter(isStandard));
  let cardIds: string[] = [];
  if (persona.level === 'easy') {
    const count = Math.floor(rng() * 3); // 0, 1 or 2 of my highest cards
    cardIds = std.slice(0, count).map((c) => c.id);
  } else {
    // My shortest suit (1 to 4 cards): if its top card is 9 or more, give all of it away, so I become void.
    const shorts = SUITS.map((s) => std.filter((c) => c.suit === s))
      .filter((cs) => cs.length >= 1 && cs.length <= 4)
      .sort((a, b) => a.length - b.length || (b[0]?.rank ?? 0) - (a[0]?.rank ?? 0));
    const short = shorts[0];
    if (short && (short[0]?.rank ?? 0) >= 9) cardIds = short.map((c) => c.id);
    // Fill the rest with my Q, K and A, highest first.
    for (const c of std) {
      if (cardIds.length >= 4) break;
      if (c.rank >= 12 && !cardIds.includes(c.id)) cardIds.push(c.id);
    }
  }
  return { type: 'swap', by: seen.me, cardIds };
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** My ballot on the open vote (the caller checks that I have not voted). */
export function chooseVote(seen: AiSeen, persona: Persona, rng: Rng): SessionAction | null {
  const v = seen.view;
  const vote = v.vote;
  if (!vote) return null;
  const w = PERSONALITY_WEIGHTS[persona.personality];
  const me = seen.me;
  const n = v.players.length;
  const myScore = v.players.find((p) => p.id === me)?.score ?? 0;
  let yes: boolean;
  if (vote.kind === 'reshuffle') {
    yes = handBadness(v.myHand) > 0.35 * w.reshuffleBar;
  } else if (vote.kind === 'target') {
    // Yes if my score is in the top half of the table.
    const place = 1 + v.players.filter((p) => p.id !== me && p.score > myScore).length;
    yes = place * 2 <= n;
  } else if (seen.session.vote?.draw) {
    // The top score is drawn: the players on it are for an Ultimate Round; the rest flip a coin.
    const top = Math.max(...v.players.map((p) => p.score));
    const drawn = v.players.filter((p) => p.score === top).map((p) => p.id);
    yes = drawn.includes(me) ? true : rng() < 0.5;
  } else {
    // Ultimate: yes unless I am alone in the lead; then reckless and wind-up players sometimes say yes.
    const top = Math.max(...v.players.map((p) => p.score));
    const leaders = v.players.filter((p) => p.score === top);
    const alone = leaders.length === 1 && leaders[0]?.id === me;
    yes = !alone || ((persona.personality === 'reckless' || persona.personality === 'windup') && rng() < 0.5);
  }
  return { type: 'castVote', by: me, ballot: yes ? 'yes' : 'no' };
}

/** During the reshuffle window: call a reshuffle vote if my hand is bad. */
export function chooseCallVote(seen: AiSeen, persona: Persona): SessionAction | null {
  if (!seen.view.canCallReshuffle) return null;
  const w = PERSONALITY_WEIGHTS[persona.personality];
  if (handBadness(seen.view.myHand) > 0.5 * w.reshuffleBar) {
    return { type: 'callVote', by: seen.me, kind: 'reshuffle' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Take-cards requests
// ---------------------------------------------------------------------------

/** A request is waiting for me: always agree. With several askers, the first in seat order. */
export function chooseTakeAnswer(seen: AiSeen): SessionAction | null {
  const askers = seen.session.takeRequests.filter((r) => r.target === seen.me && !r.agreed).map((r) => r.requester);
  const requester = seen.session.order.find((p) => askers.includes(p));
  if (!requester) return null;
  return { type: 'answerTake', by: seen.me, requester, accept: true };
}

/**
 * Ask a player for their cards: only between tricks, at most once per round,
 * when I hold at least twice the average of the others and at least three
 * players still hold cards. Asks the player with the fewest cards.
 */
export function chooseTakeAsk(seen: AiSeen, m: Memory, rng: Rng): SessionAction | null {
  const play = seen.session.play;
  if (!play || !betweenTricks(play)) return null;
  if (m.asks > 0) return null;
  if (seen.session.takeRequests.some((r) => r.requester === seen.me)) return null;
  const holders = seen.view.players.filter((p) => p.cardCount > 0);
  if (holders.length < 3) return null;
  const mine = holders.find((p) => p.id === seen.me);
  if (!mine) return null;
  const others = holders.filter((p) => p.id !== seen.me);
  const avg = others.reduce((sum, p) => sum + p.cardCount, 0) / others.length;
  if (mine.cardCount < 2 * avg) return null;
  const fewest = Math.min(...others.map((p) => p.cardCount));
  const candidates = others.filter((p) => p.cardCount === fewest && takeAllowed(play, seen.me, p.id) === null);
  const target = pickRandom(candidates, rng);
  return target ? { type: 'requestTake', by: seen.me, target: target.id } : null;
}

// ---------------------------------------------------------------------------
// Round setup, reaction tap, results
// ---------------------------------------------------------------------------

/** As last round's winner: usually the previous loser (chance 0.6), else a random other player still holding cards. */
export function chooseLeader(seen: AiSeen, rng: Rng): SessionAction {
  const holding = seen.view.players.filter((p) => p.cardCount > 0 && p.id !== seen.me).map((p) => p.id);
  const loser = seen.session.previous?.loser;
  let leader: PlayerId = seen.me;
  if (loser && loser !== seen.me && holding.includes(loser) && rng() < 0.6) leader = loser;
  else leader = pickRandom(holding, rng) ?? seen.me;
  return { type: 'chooseLeader', by: seen.me, leader };
}

/** As dealer: switch to auto deal and start it from a random seat (the app animates the rest). */
export function chooseDeal(seen: AiSeen, rng: Rng): SessionAction[] {
  const first = pickRandom(seen.session.order, rng) ?? seen.me;
  return [
    { type: 'setDealMode', by: seen.me, mode: 'auto' },
    { type: 'autoDealStart', by: seen.me, firstSeat: first },
  ];
}

/** Reaction Tap: a human-sized reaction time (normal curve), sometimes a false start. */
export function chooseTap(persona: Persona, rng: Rng, me: PlayerId): SessionAction {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.min(650, Math.max(190, Math.round(310 + 60 * z)));
  const falseStart = rng() < (persona.level === 'easy' ? 0.06 : 0.03);
  return { type: 'reactionTap', by: me, ms, falseStart };
}

/** On the results screen: ready up, if I am not already. */
export function chooseReady(seen: AiSeen): SessionAction | null {
  const me = seen.view.players.find((p) => p.id === seen.me);
  if (seen.view.phase !== 'results' || !me || me.ready) return null;
  return { type: 'readyUp', by: seen.me };
}
