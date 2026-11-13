/**
 * What one player may see. See PROJECT.md section 12 and CODE.md sections 5 and 5a.
 *
 * A player view holds the player's own hand and public information only.
 * Other players' hands are card counts. Hidden decks are never included in any
 * form: no cards, no count. The waste pile is a count.
 */

import type { Card, StandardCard, Suit } from '../rules/cards.ts';
import type { DealMode } from '../rules/deal.ts';
import { legalCards } from '../rules/play.ts';
import { swapAllowed } from '../rules/round.ts';
import { handOf, targetVoteAllowed } from './session.ts';
import type { LeadNotice, PlayerId, RoundRecord, Session, SessionEnd, SessionPhase, UltimateLabels, VoteKind } from './types.ts';

export interface PlayerSummary {
  readonly id: PlayerId;
  readonly sessionName: string;
  readonly profileName: string;
  readonly cardCount: number;
  readonly isHost: boolean;
  /** Place this round if out (1-based), else null. */
  readonly place: number | null;
  readonly score: number;
  readonly ready: boolean;
}

export interface PlayerView {
  readonly me: PlayerId;
  /** 2.30: the notice on screen (phase leadNotice) and who has tapped OK on it. Public. */
  readonly notice: LeadNotice | null;
  readonly noticeSeen: readonly PlayerId[];
  readonly isHost: boolean;
  readonly phase: SessionPhase;
  readonly round: number;
  readonly ultimateRound: boolean;
  readonly hostId: PlayerId;
  readonly dealer: PlayerId;
  readonly jokerRuleEnabled: boolean;
  readonly jokerTotal: number;
  readonly players: readonly PlayerSummary[];
  readonly myHand: readonly Card[];
  readonly deal: { readonly remaining: number; readonly mode: DealMode; readonly nextSeat: PlayerId | null } | null;
  readonly canCallReshuffle: boolean;
  /** A target score vote can be proposed now. */
  readonly canProposeTarget: boolean;
  readonly canSwap: boolean;
  /** 2.20: after the swap, who has pressed Done on their new hand (null outside cardCheck). */
  readonly cardCheck: { readonly seen: readonly PlayerId[] } | null;
  readonly reactionTap: { readonly players: readonly PlayerId[]; readonly tapped: readonly PlayerId[] } | null;
  readonly chooser: PlayerId | null;
  readonly turn: PlayerId | null;
  readonly legalCardIds: readonly string[];
  readonly ledSuit: Suit | null;
  readonly trick: readonly { readonly player: PlayerId; readonly card: StandardCard }[];
  readonly wastePileCount: number;
  readonly pendingFinalTwo: PlayerId | null;
  readonly canForfeit: boolean;
  /** Take-cards requests involving this player only. */
  readonly myTakeRequests: readonly { readonly requester: PlayerId; readonly target: PlayerId; readonly agreed: boolean }[];
  readonly vote: {
    readonly kind: VoteKind;
    readonly calledBy: PlayerId | null;
    readonly value: number | null;
    readonly voted: readonly PlayerId[];
    readonly myBallot: 'yes' | 'no' | null;
    readonly awaitingHost: boolean;
  } | null;
  readonly paused: boolean;
  readonly pauseTimeLimitSec: number | null;
  /** Pause requests waiting for the host (shown to the host). */
  readonly pauseRequests: readonly PlayerId[];
  readonly target: number | null;
  readonly rounds: readonly RoundRecord[];
  readonly ultimateLabels: UltimateLabels | null;
  readonly ended: SessionEnd | null;
}

export function playerView(s: Session, me: PlayerId): PlayerView {
  if (!s.order.includes(me)) throw new Error(`Unknown player: ${me}`);
  const play = s.phase === 'playing' ? s.play : null;
  const placeOf = (p: PlayerId): number | null => {
    if (!play) return null;
    const i = play.finished.indexOf(p);
    return i === -1 ? null : i + 1;
  };
  const players: PlayerSummary[] = s.players.map((p) => ({
    id: p.id,
    sessionName: p.sessionName,
    profileName: p.profileName,
    cardCount: handOf(s, p.id).length,
    isHost: p.id === s.hostId,
    place: placeOf(p.id),
    score: s.scores[p.id] ?? 0,
    ready: s.ready.includes(p.id),
  }));
  const v = s.vote;
  return {
    me,
    isHost: me === s.hostId,
    phase: s.phase,
    round: s.round,
    ultimateRound: s.ultimateRound,
    hostId: s.hostId,
    dealer: s.dealer,
    jokerRuleEnabled: s.jokerRuleEnabled,
    jokerTotal: s.jokerTotal,
    players,
    myHand: handOf(s, me).slice(),
    deal:
      s.phase === 'dealing' && s.deal
        ? { remaining: s.deal.remaining.length, mode: s.deal.mode, nextSeat: s.deal.nextSeat }
        : null,
    canCallReshuffle: s.phase === 'reshuffle' && !s.reshuffleUsed && !s.vote && !s.paused,
    canProposeTarget: targetVoteAllowed(s),
    canSwap: s.phase === 'swap' && swapAllowed(s.order.length) && !s.swapDone.includes(me),
    cardCheck: s.phase === 'cardCheck' ? { seen: s.handSeen } : null,
    reactionTap:
      s.phase === 'reactionTap' && s.tap ? { players: s.tap.players, tapped: Object.keys(s.tap.results) } : null,
    chooser: s.phase === 'chooseLeader' ? (s.previous?.winner ?? null) : null,
    notice: s.phase === 'leadNotice' ? s.notice : null,
    noticeSeen: s.phase === 'leadNotice' ? s.noticeSeen : [],
    turn: play?.turn ?? null,
    legalCardIds: play && !s.paused ? legalCards(play, me).map((c) => c.id) : [],
    ledSuit: play?.trick.ledSuit ?? null,
    trick: play ? play.trick.plays.map((t) => ({ player: t.player, card: t.card })) : [],
    wastePileCount: play?.wastePile.length ?? 0,
    pendingFinalTwo: play?.pendingFinalTwo ?? null,
    myTakeRequests: s.takeRequests.filter((r) => r.requester === me || r.target === me),
    canForfeit: !!play && !play.over && (play.pendingFinalTwo === me || play.forfeitAllowed.includes(me)),
    vote: v
      ? {
          kind: v.kind,
          calledBy: v.calledBy,
          value: v.value,
          voted: Object.keys(v.ballots),
          myBallot: v.ballots[me] ?? null,
          awaitingHost: v.awaitingHost,
        }
      : null,
    paused: s.paused,
    pauseTimeLimitSec: s.pauseTimeLimitSec,
    pauseRequests: me === s.hostId ? s.pauseRequests : s.pauseRequests.filter((p) => p === me),
    target: s.target,
    rounds: s.rounds,
    ultimateLabels: s.ultimateLabels,
    ended: s.ended,
  };
}
