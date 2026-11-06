/**
 * Draft game state and action types. See CODE.md section 6.
 * Field names are a draft for the Phase 1 design review; later rule modules
 * (tricks, slaps, missing suits, final two, jokers, pause, Ultimate Round)
 * will fill these in.
 */

import type { Card, Suit } from './cards.ts';
import type { DealMode, DealState, SeatId } from './deal.ts';
import type { Ballot } from './voting.ts';

export type PlayerId = string;

export interface Player {
  readonly id: PlayerId;
  readonly profileName: string;
  /** Name for this session only; defaults to the profile name. */
  readonly sessionName: string;
  readonly hand: readonly Card[];
  readonly status: 'active' | 'out';
  readonly missingSuits: readonly Suit[];
}

export type Phase =
  | 'setup'
  | 'dealing'
  | 'reshuffleVote'
  | 'swap'
  | 'missingSuit'
  | 'playing'
  | 'roundEnd'
  | 'gameOver';

export interface PlayedCard {
  readonly player: PlayerId;
  readonly card: Card;
}

export interface Trick {
  readonly ledSuit: Suit | null;
  readonly plays: readonly PlayedCard[];
}

export interface Vote {
  readonly kind: 'reshuffle' | 'target' | 'ultimate';
  readonly calledBy: PlayerId | null; // null when started automatically
  readonly ballots: Readonly<Record<PlayerId, Ballot>>;
  /** Proposed target score, for target votes. */
  readonly value?: number;
}

export interface Game {
  readonly hostId: PlayerId;
  readonly players: readonly Player[];
  /** Player ids in clockwise order. */
  readonly turnOrder: readonly PlayerId[];
  readonly phase: Phase;
  /** True while the host has paused. Kept separate so the phase is restored on resume. */
  readonly paused: boolean;
  readonly pauseTimeLimitSec: number | null;
  readonly pendingPauseRequests: readonly PlayerId[];
  readonly round: number;
  readonly dealer: PlayerId;
  readonly deal: DealState | null;
  readonly dealMode: DealMode;
  readonly leader: PlayerId | null;
  readonly currentTrick: Trick | null;
  readonly wastePile: readonly Card[];
  /** Hidden decks keyed by id, e.g. "hidden-1" (2 and 3 player games only). Never shown. */
  readonly hiddenDecks: Readonly<Record<SeatId, readonly Card[]>>;
  readonly jokerRuleEnabled: boolean;
  readonly jokerTotal: number;
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly target: number | null;
  readonly vote: Vote | null;
  readonly readyPlayers: readonly PlayerId[];
  readonly ultimateRound: boolean;
  readonly ultimateLabels: { readonly winner: PlayerId | null; readonly loser: PlayerId | null };
}

/** Everything a player (or the host) can do. Handled by later rule modules. */
export type Action =
  | { type: 'setDealMode'; mode: DealMode }
  | { type: 'autoDealStart'; firstSeat: SeatId }
  | { type: 'autoDealStep' }
  | { type: 'manualDealCard'; seat: SeatId }
  | { type: 'callReshuffleVote'; by: PlayerId }
  | { type: 'castVote'; by: PlayerId; ballot: Ballot }
  | { type: 'hostDecides'; yes: boolean }
  | { type: 'swapHidden'; by: PlayerId; cardIds: readonly string[] }
  | { type: 'declareMissingSuit'; by: PlayerId; suits: readonly Suit[] }
  | { type: 'reactionTap'; by: PlayerId; ms: number; falseStart: boolean }
  | { type: 'chooseLeader'; by: PlayerId; leader: PlayerId }
  | { type: 'playCard'; by: PlayerId; cardId: string }
  | { type: 'pickUpWastePile'; by: PlayerId }
  | { type: 'forfeit'; by: PlayerId }
  | { type: 'requestPause'; by: PlayerId }
  | { type: 'respondPause'; requester: PlayerId; approve: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'setPauseTimeLimit'; seconds: number | null }
  | { type: 'readyUp'; by: PlayerId }
  | { type: 'advanceFromResults' }
  | { type: 'callTargetVote'; by: PlayerId; target: number }
  | { type: 'triggerUltimate'; by: PlayerId }
  | { type: 'endSession' };
