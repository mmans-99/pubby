/**
 * Hand-made positions for the computer player tests (CODE.md 9m.9). A position
 * is a real session in the middle of a round, built from card ids such as
 * "hearts-10" and "joker-1", plus the memory a bot would have from the events
 * it has seen.
 */

import type { Card, Rank, StandardCard, Suit } from '../../src/rules/cards.ts';
import { seededRng } from '../../src/rules/rng.ts';
import type { PlayState } from '../../src/rules/play.ts';
import { createSession } from '../../src/session/session.ts';
import type { PlayerId, Session, SessionEvent, TakeRequest } from '../../src/session/types.ts';
import { newMemory, remember, type Memory } from '../../src/ai/memory.ts';
import type { Level, Persona } from '../../src/ai/persona.ts';
import { seenBy, type AiSeen } from '../../src/ai/seen.ts';

/** "hearts-10" -> the card. "joker-1" -> a joker. */
export function card(id: string): Card {
  if (id.startsWith('joker')) return { kind: 'joker', id };
  const [suit, rank] = id.split('-');
  return { kind: 'standard', id, suit: suit as Suit, rank: Number(rank) as Rank };
}

export function cards(...ids: string[]): Card[] {
  return ids.map(card);
}

export function standard(id: string): StandardCard {
  const c = card(id);
  if (c.kind !== 'standard') throw new Error(`Not a standard card: ${id}`);
  return c;
}

export interface PositionOptions {
  readonly order: readonly PlayerId[];
  readonly me: PlayerId;
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  readonly leader: PlayerId;
  /** Whose turn it is now. */
  readonly turn: PlayerId;
  /** Cards already played to this trick, in order (ids). */
  readonly plays?: readonly { player: PlayerId; cardId: string }[];
  /** Public events the bot has seen so far (its memory is built from these). */
  readonly events?: readonly SessionEvent[];
  readonly waste?: readonly Card[];
  readonly takeRequests?: readonly TakeRequest[];
  readonly jokers?: boolean;
  readonly level?: Level;
  readonly personality?: Persona['personality'];
  readonly pendingFinalTwo?: PlayerId | null;
}

export interface Position {
  readonly session: Session;
  readonly memory: Memory;
  readonly seen: AiSeen;
  readonly persona: Persona;
}

/** A round in the play phase, with the bot's memory built from `events`. */
export function position(o: PositionOptions): Position {
  const base = createSession(
    {
      players: o.order.map((id) => ({ id, profileName: id })),
      hostId: o.order[0] ?? o.me,
      jokerRuleEnabled: o.jokers ?? false,
    },
    seededRng(1),
  ).session;

  const plays = (o.plays ?? []).map((p) => {
    const c = standard(p.cardId);
    return { player: p.player, card: c };
  });
  const play: PlayState = {
    order: o.order.slice(),
    hands: { ...o.hands },
    turn: o.turn,
    trick: {
      participants: o.order.filter((p) => (o.hands[p] ?? []).length > 0),
      ledSuit: plays[0]?.card.suit ?? null,
      plays,
      acted: plays.map((p) => p.player),
    },
    wastePile: [...(o.waste ?? [])],
    usedJokers: [],
    finished: o.order.filter((p) => (o.hands[p] ?? []).length === 0),
    pendingFinalTwo: o.pendingFinalTwo ?? null,
    forfeitAllowed: [],
    loser: null,
    over: false,
  };
  const session: Session = {
    ...base,
    phase: 'playing',
    round: 1,
    dealer: o.leader,
    hands: { ...o.hands },
    hiddenDecks: {},
    deal: null,
    play,
    takeRequests: [...(o.takeRequests ?? [])],
    log: [],
  };

  const persona: Persona = { level: o.level ?? 'normal', personality: o.personality ?? 'counter' };
  const memory = newMemory(o.me, persona.level, o.order);
  remember(memory, o.events ?? [], seededRng(7));
  const seen = seenBy(session, o.me, 0);
  return { session, memory, seen, persona };
}
