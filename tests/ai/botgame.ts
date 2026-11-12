/**
 * Plays whole games with computer players only (CODE.md 9m.4). Shared by the
 * tests and by testbed/ai_arena.ts so both run the same loop.
 *
 * This loop is the app's driver in miniature: each bot gets only `seenBy`
 * (the one door in) and remembers only public events. The host's jobs (start
 * the round, end the session, advance, auto deal, decide a stuck vote) are
 * done here, as the arena does.
 */

import { seededRng, shuffle, type Rng } from '../../src/rules/rng.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import type { PlayerId, Session, SessionAction } from '../../src/session/types.ts';
import { decide, type Decision } from '../../src/ai/decide.ts';
import { remember, newMemory, type Memory } from '../../src/ai/memory.ts';
import { randomPersona, type Level, type Persona } from '../../src/ai/persona.ts';
import { seenBy, type AiSeen } from '../../src/ai/seen.ts';

/** A seat's level in the arena: a real level, or 'random' (random legal moves, the baseline). */
export type SeatLevel = Level | 'random';

export interface BotGameOptions {
  readonly players: number;
  /** Levels for the seats in order, repeated if shorter than the player count. */
  readonly levels: readonly SeatLevel[];
  /** Non-Ultimate rounds before the host ends the session. */
  readonly rounds: number;
  readonly seed: number;
  readonly jokers?: boolean;
  /** Called for every decision that is about to be sent (before it is applied). */
  readonly onDecision?: (info: { seen: AiSeen; memory: Memory; persona: Persona; decision: Decision; session: Session }) => void;
  /** Called when the session refuses a move (should never happen). */
  readonly onRefused?: (info: { action: SessionAction | null; error: string; session: Session }) => void;
}

export interface SeatResult {
  readonly id: PlayerId;
  readonly level: SeatLevel;
  readonly personality: Persona['personality'];
  /** Place in each non-Ultimate round (1 = first out). */
  readonly places: number[];
}

export interface BotGameResult {
  readonly session: Session;
  readonly finished: boolean;
  readonly refused: number;
  readonly crashed: number;
  /** Time spent in decide(), in milliseconds, for every call. */
  readonly decisionMs: { level: SeatLevel; ms: number }[];
  readonly seats: SeatResult[];
}

/** What a random-level seat does: a random legal move, with the same shape as decide(). */
function randomDecision(seen: AiSeen, rng: Rng): Decision | null {
  const v = seen.view;
  const me = seen.me;
  const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];
  if (v.vote) {
    if (v.vote.awaitingHost || v.vote.myBallot !== null) return null;
    return { actions: [{ type: 'castVote', by: me, ballot: rng() < 0.5 ? 'yes' : 'no' }], think: 'easy' };
  }
  if (v.dealer === me && v.phase === 'dealing' && v.deal && v.deal.nextSeat === null) {
    const first = pick(seen.session.order) ?? me;
    return {
      actions: [
        { type: 'setDealMode', by: me, mode: 'auto' },
        { type: 'autoDealStart', by: me, firstSeat: first },
      ],
      think: 'easy',
    };
  }
  if (v.canSwap) {
    const std = v.myHand.filter((c) => c.kind === 'standard');
    const count = Math.floor(rng() * (Math.min(4, std.length) + 1));
    const cardIds = shuffle(std, rng).slice(0, count).map((c) => c.id);
    return { actions: [{ type: 'swap', by: me, cardIds }], think: 'hard' };
  }
  if (v.reactionTap && v.reactionTap.players.includes(me) && !v.reactionTap.tapped.includes(me)) {
    return { actions: [{ type: 'reactionTap', by: me, ms: 100 + Math.floor(rng() * 600), falseStart: false }], think: 'forced' };
  }
  if (v.chooser === me) {
    const holders = v.players.filter((p) => p.cardCount > 0).map((p) => p.id);
    return { actions: [{ type: 'chooseLeader', by: me, leader: pick(holders) ?? me }], think: 'hard' };
  }
  const pending = seen.session.takeRequests.find((r) => r.target === me && !r.agreed);
  if (pending) {
    return { actions: [{ type: 'answerTake', by: me, requester: pending.requester, accept: rng() < 0.5 }], think: 'easy' };
  }
  if (v.pendingFinalTwo === me) {
    return { actions: [{ type: rng() < 0.5 ? 'pickUpWastePile' : 'forfeit', by: me }], think: 'hard' };
  }
  if (v.turn === me && !seen.session.takeRequests.some((r) => !r.agreed)) {
    const card = pick(v.legalCardIds);
    return card ? { actions: [{ type: 'playCard', by: me, cardId: card }], think: 'hard' } : null;
  }
  if (v.phase === 'results' && !v.players.find((p) => p.id === me)?.ready) {
    return { actions: [{ type: 'readyUp', by: me }], think: 'easy' };
  }
  return null;
}

/** The host's job when no bot has a move. */
function hostAction(s: Session, nonUltimateRounds: number, rounds: number): SessionAction | null {
  const host = s.hostId;
  if (s.vote?.awaitingHost) return { type: 'hostDecides', by: host, yes: false };
  if (s.vote) return null;
  if (s.phase === 'reshuffle') return { type: 'startRound', by: host };
  if (s.phase === 'dealing' && s.deal && s.deal.nextSeat !== null) return { type: 'autoDealAll', by: s.dealer };
  if (s.phase === 'results' && s.ready.length === s.order.length) {
    // After an Ultimate Round has been agreed, the next round is the last one: advance into it.
    return nonUltimateRounds >= rounds && !s.ultimateRound ? { type: 'endSession', by: host } : { type: 'advance', by: host };
  }
  return null;
}

/** Play one game with computer players only, until the session ends (or stalls). */
export function playBotGame(opts: BotGameOptions): BotGameResult {
  const rng = seededRng(opts.seed);
  const ids = Array.from({ length: opts.players }, (_, i) => `p${i + 1}`);
  const seatLevels = ids.map((_, i) => opts.levels[i % opts.levels.length] ?? 'normal');
  const personas = new Map<PlayerId, Persona>();
  ids.forEach((id, i) => {
    const level = seatLevels[i] ?? 'normal';
    personas.set(id, randomPersona(level === 'random' ? 'normal' : level, rng));
  });

  let s = createSession(
    {
      players: ids.map((id) => ({ id, profileName: `computer:${id}`, sessionName: id, computer: true })),
      hostId: 'p1',
      jokerRuleEnabled: opts.jokers ?? true,
    },
    rng,
  ).session;

  const memories = new Map<PlayerId, Memory>();
  const logIndex = new Map<PlayerId, number>();
  const skipUntil = new Map<PlayerId, number>();
  for (const id of ids) {
    const level = seatLevels[ids.indexOf(id)] ?? 'normal';
    memories.set(id, newMemory(id, level === 'random' ? 'normal' : level, ids));
    logIndex.set(id, 0);
  }

  let refused = 0;
  let crashed = 0;
  const decisionMs: { level: SeatLevel; ms: number }[] = [];
  const maxSteps = 400000;
  let finished = false;

  for (let step = 0; step < maxSteps; step++) {
    if (s.phase === 'gameOver') {
      finished = true;
      break;
    }
    let acted = false;
    for (const id of ids) {
      if (skipUntil.get(id) === s.log.length) continue;
      const seat = ids.indexOf(id);
      const level = seatLevels[seat] ?? 'normal';
      const persona = personas.get(id)!;
      const memory = memories.get(id)!;
      const seen = seenBy(s, id, logIndex.get(id) ?? 0);
      remember(memory, seen.events, rng);
      logIndex.set(id, s.log.length);

      const t0 = performance.now();
      let decision: Decision | null;
      try {
        decision = level === 'random' ? randomDecision(seen, rng) : decide(seen, memory, persona, rng);
      } catch {
        crashed++;
        skipUntil.set(id, s.log.length);
        continue;
      }
      decisionMs.push({ level, ms: performance.now() - t0 });
      if (!decision) continue;

      opts.onDecision?.({ seen, memory, persona, decision, session: s });
      try {
        for (const action of decision.actions) s = applyAction(s, action, rng).session;
      } catch (err) {
        refused++;
        opts.onRefused?.({ action: decision.actions[0] ?? null, error: String(err), session: s });
        skipUntil.set(id, s.log.length);
        continue;
      }
      acted = true;
      break;
    }
    if (acted) continue;

    const nonUltimate = s.rounds.filter((r) => !r.ultimate).length;
    const a = hostAction(s, nonUltimate, opts.rounds);
    if (!a) break; // stalled: nothing anyone can do
    try {
      s = applyAction(s, a, rng).session;
    } catch (err) {
      refused++;
      opts.onRefused?.({ action: a, error: String(err), session: s });
      break;
    }
  }

  const seats: SeatResult[] = ids.map((id, i) => {
    const places = s.rounds
      .filter((r) => !r.ultimate)
      .map((r) => r.finishingOrder.indexOf(id) + 1)
      .filter((p) => p > 0);
    return {
      id,
      level: seatLevels[i] ?? 'normal',
      personality: personas.get(id)!.personality,
      places,
    };
  });
  return { session: s, finished: finished || s.phase === 'gameOver', refused, crashed, decisionMs, seats };
}
