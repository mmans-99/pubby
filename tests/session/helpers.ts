import { betweenTricks, legalCards, takeAllowed } from '../../src/rules/play.ts';
import type { Rng } from '../../src/rules/rng.ts';
import { applyAction, createSession } from '../../src/session/session.ts';
import type { Session, SessionAction, SessionSetup } from '../../src/session/types.ts';

export function setupFor(n: number, jokers = true): SessionSetup {
  return {
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, profileName: `Player ${i + 1}` })),
    hostId: 'p1',
    jokerRuleEnabled: jokers,
  };
}

export function start(n: number, rng: Rng, jokers = true): Session {
  return createSession(setupFor(n, jokers), rng).session;
}

export function act(s: Session, a: SessionAction, rng: Rng): Session {
  return applyAction(s, a, rng).session;
}

/** Deal every card (auto, starting from the dealer). */
export function dealAll(s: Session, rng: Rng): Session {
  s = act(s, { type: 'autoDealStart', by: s.dealer, firstSeat: s.dealer }, rng);
  return act(s, { type: 'autoDealAll', by: s.dealer }, rng);
}

/**
 * One automatic step through the round: deals, starts the round, keeps hands,
 * taps, picks a leader, plays the first legal card, and forfeits on a
 * final-two choice. Returns the session after one action.
 */
export function step(s: Session, rng: Rng): Session {
  switch (s.phase) {
    case 'dealing':
      return s.deal?.nextSeat === null ? act(s, { type: 'autoDealStart', by: s.dealer, firstSeat: s.dealer }, rng)
        : act(s, { type: 'autoDealAll', by: s.dealer }, rng);
    case 'reshuffle':
      return act(s, { type: 'startRound', by: s.hostId }, rng);
    case 'swap': {
      const who = s.order.find((p) => !s.swapDone.includes(p))!;
      return act(s, { type: 'swap', by: who, cardIds: [] }, rng);
    }
    case 'reactionTap': {
      const who = s.tap!.players.find((p) => !s.tap!.results[p])!;
      return act(s, { type: 'reactionTap', by: who, ms: Math.floor(rng() * 500) + 100, falseStart: false }, rng);
    }
    case 'chooseLeader':
      return act(s, { type: 'chooseLeader', by: s.previous!.winner, leader: s.previous!.winner }, rng);
    case 'playing': {
      const play = s.play!;
      if (play.pendingFinalTwo) {
        return act(s, { type: rng() < 0.5 ? 'pickUpWastePile' : 'forfeit', by: play.pendingFinalTwo }, rng);
      }
      // Answer any take-cards request; now and then make one.
      const pending = s.takeRequests.find((r) => !r.agreed);
      if (pending) {
        return act(s, { type: 'answerTake', by: pending.target, requester: pending.requester, accept: rng() < 0.5 }, rng);
      }
      if (rng() < 0.03 && betweenTricks(play)) {
        const a = s.order[Math.floor(rng() * s.order.length)]!;
        const b = s.order[Math.floor(rng() * s.order.length)]!;
        if (!takeAllowed(play, a, b) && !s.takeRequests.some((r) => r.requester === a)) {
          return act(s, { type: 'requestTake', by: a, target: b }, rng);
        }
      }
      const turn = play.turn!;
      const legal = legalCards(play, turn);
      const card = legal[Math.floor(rng() * legal.length)]!;
      return act(s, { type: 'playCard', by: turn, cardId: card.id }, rng);
    }
    default:
      throw new Error(`step: nothing to do in ${s.phase}`);
  }
}

/** Play until the results screen or the end of the session. */
export function playRound(s: Session, rng: Rng): Session {
  for (let i = 0; i < 20000; i++) {
    if (s.phase === 'results' || s.phase === 'gameOver') return s;
    s = step(s, rng);
  }
  throw new Error('Round did not finish');
}

/** Host ends the game; if the top score is a draw, everyone turns down both Ultimate offers. */
export function endGame(s: Session, rng: Rng): Session {
  s = act(s, { type: 'endSession', by: s.hostId }, rng);
  while (s.vote && s.vote.draw) {
    for (const p of s.order) {
      if (!s.vote || s.vote.ballots[p]) continue;
      s = act(s, { type: 'castVote', by: p, ballot: 'no' }, rng);
    }
  }
  return s;
}
