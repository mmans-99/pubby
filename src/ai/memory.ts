/**
 * What one computer player remembers this round (CODE.md 9m.3). It is updated
 * only from public events, so it holds no more than a person at the table
 * would know. Easy forgets some of it after each trick; Normal and Hard don't.
 *
 * Two things the plan's table does not list, added so the bot can work out
 * who is still to play in a trick (eval.ts `yetToPlay`) and how often it has
 * asked for cards this round:
 *   - `leader`: the player who started the current trick (the first to act).
 *   - `asks`: take-cards requests this bot has made this round.
 */

import { isJoker, isStandard, standardCards, type Card, type StandardCard, type Suit } from '../rules/cards.ts';
import type { Rng } from '../rules/rng.ts';
import type { PlayerId, Session, SessionEvent } from '../session/types.ts';
import type { AiSeen } from './seen.ts';
import type { Level } from './persona.ts';

export interface TrickEntry {
  readonly player: PlayerId;
  readonly cardId: string;
  readonly card: StandardCard;
}

export interface Memory {
  readonly me: PlayerId;
  readonly level: Level;
  readonly order: readonly PlayerId[];
  round: number;
  /** Current trick so far (from cardPlayed). */
  trick: TrickEntry[];
  /** Suit of the led card, once a standard card has been played this trick. */
  ledSuit: Suit | null;
  /** First player to act in the current trick (see the file comment). */
  leader: PlayerId | null;
  /** Cards seen played this round and still remembered. */
  played: Map<string, Card>;
  /** Ids of seen cards that went to the waste pile. */
  waste: Set<string>;
  /** Cards known to be in a player's hand. */
  known: Record<PlayerId, Map<string, Card>>;
  /** Suits a player is known to have none of. */
  voids: Record<PlayerId, Set<Suit>>;
  /** Jokers gone from the game: played, or thrown away with the last normal card. */
  jokersPlayed: number;
  trickCount: number;
  /** Take-cards requests this bot has made this round. */
  asks: number;
}

function emptyRound(m: Memory): void {
  m.trick = [];
  m.ledSuit = null;
  m.leader = null;
  m.played = new Map();
  m.waste = new Set();
  m.jokersPlayed = 0;
  m.trickCount = 0;
  m.asks = 0;
  clearKnowledge(m);
}

function clearKnowledge(m: Memory): void {
  for (const p of m.order) {
    m.known[p] = new Map();
    m.voids[p] = new Set();
  }
}

export function newMemory(me: PlayerId, level: Level, order: readonly PlayerId[]): Memory {
  const m: Memory = {
    me,
    level,
    order: order.slice(),
    round: 0,
    trick: [],
    ledSuit: null,
    leader: null,
    played: new Map(),
    waste: new Set(),
    known: {},
    voids: {},
    jokersPlayed: 0,
    trickCount: 0,
    asks: 0,
  };
  clearKnowledge(m);
  return m;
}

/** Take the public events in order. `rng` is only used by Easy's forgetting. */
export function remember(m: Memory, events: readonly SessionEvent[], rng: Rng): void {
  for (const e of events) {
    switch (e.type) {
      case 'roundStarted':
        emptyRound(m);
        m.round = e.round;
        break;
      case 'reshuffled':
        clearKnowledge(m);
        break;
      case 'missingSuitDeclared':
        for (const suit of e.suits) m.voids[e.player]?.add(suit);
        break;
      case 'swapped':
        m.known[e.player]?.clear();
        break;
      case 'cardPlayed': {
        const before = m.ledSuit;
        if (m.leader === null) m.leader = e.player;
        m.trick.push({ player: e.player, cardId: e.card.id, card: e.card });
        m.played.set(e.card.id, e.card);
        m.known[e.player]?.delete(e.card.id);
        // Off-suit card: a slap, so this player has none of the led suit.
        if (before !== null && e.card.suit !== before) m.voids[e.player]?.add(before);
        if (before === null) m.ledSuit = e.card.suit;
        break;
      }
      case 'jokerPlayed':
        m.jokersPlayed++;
        if (m.leader === null) m.leader = e.player;
        break;
      case 'jokersDiscarded':
        // Thrown away with the last normal card: out of the game, like a played joker.
        m.jokersPlayed += e.count;
        break;
      case 'slapped': {
        // The trick goes face up into the slapped player's hand.
        for (const t of m.trick) {
          m.known[e.slapped]?.set(t.cardId, t.card);
          m.voids[e.slapped]?.delete(t.card.suit);
          m.played.delete(t.cardId);
        }
        m.trick = [];
        break;
      }
      case 'trickResolved':
        if (m.trick.length > 0) for (const t of m.trick) m.waste.add(t.cardId);
        m.trick = [];
        m.ledSuit = null;
        m.leader = null;
        m.trickCount++;
        if (m.level === 'easy') forget(m, rng);
        break;
      case 'wastePilePickedUp': {
        const suits = new Set<Suit>();
        for (const id of m.waste) {
          const card = m.played.get(id);
          if (!card) continue;
          m.known[e.player]?.set(id, card);
          m.played.delete(id);
          if (isStandard(card)) suits.add(card.suit);
        }
        m.waste.clear();
        for (const suit of suits) m.voids[e.player]?.delete(suit);
        break;
      }
      case 'cardsTaken': {
        // The requester takes the whole hand: what we knew about the target is now theirs.
        const target = m.known[e.target];
        const requester = m.known[e.requester];
        if (target && requester) {
          for (const [id, card] of target) requester.set(id, card);
          target.clear();
        }
        const rv = m.voids[e.requester];
        const tv = m.voids[e.target];
        if (rv && tv) for (const suit of [...rv]) if (!tv.has(suit)) rv.delete(suit);
        break;
      }
      case 'takeRequested':
        if (e.requester === m.me) m.asks++;
        break;
      default:
        // Nothing to remember from the other events.
        break;
    }
  }
}

/** Easy only: after each trick, some of what it remembers is lost. */
function forget(m: Memory, rng: Rng): void {
  for (const id of [...m.played.keys()]) {
    if (rng() < 0.5) {
      m.played.delete(id);
      m.waste.delete(id);
    }
  }
  for (const p of m.order) {
    for (const id of [...(m.known[p]?.keys() ?? [])]) {
      if (rng() < 0.3) m.known[p]?.delete(id);
    }
    for (const suit of [...(m.voids[p] ?? [])]) {
      if (rng() < 0.15) m.voids[p]?.delete(suit);
    }
  }
}

/**
 * Rebuild the memory for the round in progress from the log (Carry on, when
 * a saved game is opened). Replays from the last roundStarted entry.
 */
export function rebuild(me: PlayerId, level: Level, s: Pick<Session, 'log' | 'order'>, rng: Rng): Memory {
  let start = 0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    if (s.log[i]?.event.type === 'roundStarted') {
      start = i;
      break;
    }
  }
  const m = newMemory(me, level, s.order);
  remember(m, s.log.slice(start).map((entry) => entry.event), rng);
  return m;
}

/**
 * Cards this bot cannot place: the full deck (52 cards plus the jokers in play)
 * minus its own hand, minus cards seen played, minus cards known to be in
 * someone's hand, minus jokers gone. Jokers are counted, not named.
 */
export function unknownPool(m: Memory, seen: AiSeen): Card[] {
  const out: Card[] = [];
  const excluded = new Set<string>(m.played.keys());
  for (const p of m.order) for (const id of m.known[p]?.keys() ?? []) excluded.add(id);
  const hand = seen.view.myHand;
  for (const c of hand) excluded.add(c.id);
  for (const c of standardCards()) if (!excluded.has(c.id)) out.push(c);

  const total = seen.session.jokerRuleEnabled ? seen.session.jokerTotal : 0;
  const myJokers = hand.filter(isJoker).length;
  const jokersLeft = Math.max(0, total - myJokers - m.jokersPlayed);
  for (let i = 0; i < jokersLeft; i++) out.push({ kind: 'joker', id: `unknown-joker-${i}` });
  return out;
}
