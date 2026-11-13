/**
 * One decision for one computer player (CODE.md 9m.3). Given only what the
 * player may see (AiSeen) and what it remembers (Memory), return the move to
 * send, or null if it has nothing to do now.
 *
 * Order of checks (the first that applies wins):
 *   paused or game over -> nothing; an open vote -> my ballot (or nothing while
 *   others vote); I am the dealer and the deal has not started -> deal;
 *   swap; Reaction Tap; I choose the leader; a take-cards request to me -> agree;
 *   final two -> pick up or forfeit; my turn -> a card; between tricks -> maybe
 *   ask for cards; reshuffle window -> maybe call a reshuffle; results -> ready up.
 *
 * `think` says how long the player should look like it is thinking (persona.ts
 * thinkMs): 'forced' when there was only one legal card, 'hard' for a
 * considered choice (a card with several options, final two, swap, leader,
 * asking for cards), 'easy' for the rest (votes, deals, answers, taps, ready-up).
 *
 * Pure: decide() never changes its inputs, so the same position always gives
 * the same answer for the same rng.
 */

import type { Rng } from '../rules/rng.ts';
import { betweenTricks } from '../rules/play.ts';
import type { SessionAction } from '../session/types.ts';
import {
  chooseCallVote,
  chooseCard,
  chooseDeal,
  chooseFinalTwo,
  chooseLeader,
  chooseReady,
  chooseSeenHand,
  chooseSwap,
  chooseTakeAnswer,
  chooseTakeAsk,
  chooseTap,
  chooseVote,
} from './moves.ts';
import type { Memory } from './memory.ts';
import type { Persona, ThinkKind } from './persona.ts';
import type { AiSeen } from './seen.ts';

export interface Decision {
  readonly actions: SessionAction[];
  readonly think: ThinkKind;
}

export function decide(seen: AiSeen, m: Memory, persona: Persona, rng: Rng): Decision | null {
  const v = seen.view;
  const s = seen.session;
  const me = seen.me;
  if (v.paused || v.phase === 'gameOver') return null;

  const one = (action: SessionAction | null, think: ThinkKind): Decision | null =>
    action ? { actions: [action], think } : null;

  // Votes come before anything else: nothing else moves while one is open.
  if (v.vote) {
    if (v.vote.awaitingHost || v.vote.myBallot !== null) return null;
    return one(chooseVote(seen, persona, rng), 'easy');
  }

  if (v.dealer === me && v.phase === 'dealing' && v.deal && v.deal.nextSeat === null) {
    return { actions: chooseDeal(seen, rng), think: 'easy' };
  }

  if (v.canSwap) return one(chooseSwap(seen, persona, rng), 'hard');
  // 2.20: after the swap, nobody leads before every player has seen their hand.
  if (v.cardCheck && !v.cardCheck.seen.includes(me)) return one(chooseSeenHand(seen), 'easy');

  if (v.reactionTap && v.reactionTap.players.includes(me) && !v.reactionTap.tapped.includes(me)) {
    return one(chooseTap(persona, rng, me), 'forced');
  }

  if (v.chooser === me) return one(chooseLeader(seen, rng), 'hard');

  if (v.phase === 'playing') {
    const answer = chooseTakeAnswer(seen);
    if (answer) return one(answer, 'easy');
  }

  if (v.pendingFinalTwo === me) return one(chooseFinalTwo(seen, persona, rng), 'hard');

  if (v.turn === me) {
    // A take-cards request is waiting: the trick waits for it.
    if (s.takeRequests.some((r) => !r.agreed)) return null;
    const card = chooseCard(seen, m, persona, rng);
    return one(card, v.legalCardIds.length === 1 ? 'forced' : 'hard');
  }

  if (v.phase === 'playing' && s.play && betweenTricks(s.play)) {
    return one(chooseTakeAsk(seen, m, rng), 'hard');
  }

  if (v.phase === 'reshuffle') return one(chooseCallVote(seen, persona), 'easy');

  if (v.phase === 'results') return one(chooseReady(seen), 'easy');

  return null;
}
