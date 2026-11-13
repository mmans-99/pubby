/**
 * Session layer types. See CODE.md sections 2 and 6.
 *
 * A session is one game: from setup, through every round, to the end. It holds
 * the full state (every hand and the hidden decks), so it runs on the host's
 * phone (or the one phone in pass-and-play). Players only ever get a
 * `PlayerView` (see view.ts).
 */

import type { Card, Suit } from '../rules/cards.ts';
import type { DealMode, DealState, SeatId } from '../rules/deal.ts';
import type { PlayEvent, PlayState } from '../rules/play.ts';
import type { PlayerId } from '../rules/types.ts';
import type { Ballot } from '../rules/voting.ts';

export type { PlayerId };

export interface SessionPlayer {
  readonly id: PlayerId;
  /** Saved profile name (the player's default name). */
  readonly profileName: string;
  /** Name for this session only. Defaults to the profile name. */
  readonly sessionName: string;
  /** True for a computer player (CODE.md 9m). Nothing in the rules reads it. */
  readonly computer?: boolean;
}

export interface SessionSetup {
  /** Players in clockwise order. 2 to 8. */
  readonly players: readonly { id: PlayerId; profileName: string; sessionName?: string; computer?: boolean }[];
  readonly hostId: PlayerId;
  /** Host setup option. On by default. */
  readonly jokerRuleEnabled?: boolean;
  /** Optional pause time limit in seconds. Default: none. */
  readonly pauseTimeLimitSec?: number | null;
}

export type SessionPhase =
  | 'dealing'
  | 'reshuffle' // after the deal: anyone may call the reshuffle vote
  | 'swap' // hidden swap (2 and 3 players)
  | 'reactionTap' // two or more players missing a suit
  | 'chooseLeader' // last round's winner picks who leads
  | 'playing'
  | 'results' // results screen after a round
  | 'gameOver';

export type VoteKind = 'reshuffle' | 'target' | 'ultimate';

export interface VoteState {
  readonly kind: VoteKind;
  /** Null when the game started it (target reached starts an Ultimate vote). */
  readonly calledBy: PlayerId | null;
  readonly ballots: Readonly<Record<PlayerId, Ballot>>;
  /** Proposed target score, for target votes. */
  readonly value: number | null;
  /** No majority: waiting for the host to decide. */
  readonly awaitingHost: boolean;
  /**
   * Set on an Ultimate vote offered because the top score is a draw at the end
   * of the game: 1 = first offer, 2 = the second chance after "Coward!".
   */
  readonly draw?: 1 | 2;
}

export interface RoundRecord {
  readonly round: number;
  readonly ultimate: boolean;
  /** First place to last place. */
  readonly finishingOrder: readonly PlayerId[];
  /** Points this round (empty for the Ultimate Round, which is outside the score). */
  readonly points: Readonly<Record<PlayerId, number>>;
  /** Running totals after this round. */
  readonly totals: Readonly<Record<PlayerId, number>>;
  readonly sharedSecondLast: readonly PlayerId[] | null;
  readonly forfeitedBy: PlayerId | null;
}

export interface UltimateLabels {
  readonly winner: PlayerId | null;
  /** Usually one player. Both final players if they shared second-last on jokers. */
  readonly losers: readonly PlayerId[];
}

export interface SessionEnd {
  /** Final standings, first to last. */
  readonly standings: readonly PlayerId[];
  /** Game winner(s). More than one only if the top scores tie. */
  readonly winners: readonly PlayerId[];
  readonly decidedBy: 'ultimate' | 'highestScore';
  /** Why the session ended. */
  readonly reason: 'ultimatePlayed' | 'ultimateVoteFailedAtTarget' | 'hostEnded' | 'drawDeclined';
}

export interface TapEntry {
  readonly ms: number;
  readonly falseStart: boolean;
}

export interface TakeRequest {
  readonly requester: PlayerId;
  readonly target: PlayerId;
  /** The asked player said yes; the cards move at the next gap between tricks. */
  readonly agreed: boolean;
}

export interface Session {
  readonly hostId: PlayerId;
  readonly players: readonly SessionPlayer[];
  /** Player ids in clockwise order. */
  readonly order: readonly PlayerId[];
  readonly jokerRuleEnabled: boolean;
  /** Total jokers in the deck, shown to everyone at game start. */
  readonly jokerTotal: number;

  readonly phase: SessionPhase;
  readonly round: number;
  /** True while the current (or next, on the results screen) round is the Ultimate Round. */
  readonly ultimateRound: boolean;
  readonly previous: { readonly winner: PlayerId; readonly loser: PlayerId } | null;
  readonly dealer: PlayerId;

  /** Deal in progress (phase 'dealing'). */
  readonly deal: DealState | null;
  readonly dealMode: DealMode;
  /** Hands once the deal is done, until play starts (then `play.hands`). */
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Hidden decks (2 and 3 players). Never sent to any player. */
  readonly hiddenDecks: Readonly<Record<SeatId, readonly Card[]>>;
  /** Only one reshuffle vote per round. */
  readonly reshuffleUsed: boolean;
  readonly swapDone: readonly PlayerId[];
  readonly tap: { readonly players: readonly PlayerId[]; readonly results: Readonly<Record<PlayerId, TapEntry>> } | null;
  readonly play: PlayState | null;
  /** Take-cards requests this round, oldest first (PROJECT.md section 4.2). */
  readonly takeRequests: readonly TakeRequest[];

  readonly vote: VoteState | null;

  readonly paused: boolean;
  /** Time the pause started (ms), for the optional time limit. */
  readonly pausedAt: number | null;
  readonly pauseTimeLimitSec: number | null;
  readonly pauseRequests: readonly PlayerId[];

  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly target: number | null;
  /** Set once a player has reached the target and the Ultimate vote has started. */
  readonly targetReachedHandled: boolean;
  readonly rounds: readonly RoundRecord[];
  readonly ready: readonly PlayerId[];
  readonly ultimateLabels: UltimateLabels | null;
  readonly ended: SessionEnd | null;

  /** Everything that happened, oldest first. Trivia and the game record are built from it. */
  readonly log: readonly LogEntry[];
}

/** Every action a player (or the host) can send. `by` is the player sending it. */
export type SessionAction =
  // Dealing (dealer only)
  | { type: 'setDealMode'; by: PlayerId; mode: DealMode }
  | { type: 'autoDealStart'; by: PlayerId; firstSeat: PlayerId }
  | { type: 'autoDealStep'; by: PlayerId }
  | { type: 'autoDealAll'; by: PlayerId }
  | { type: 'manualDealCard'; by: PlayerId; seat: PlayerId }
  // Votes
  | { type: 'callVote'; by: PlayerId; kind: VoteKind; value?: number }
  | { type: 'castVote'; by: PlayerId; ballot: Ballot }
  | { type: 'closeVote'; by: PlayerId } // host: count now, even if some have not voted
  | { type: 'hostDecides'; by: PlayerId; yes: boolean }
  // Round start
  | { type: 'startRound'; by: PlayerId } // host: close the reshuffle window
  | { type: 'swap'; by: PlayerId; cardIds: readonly string[] }
  | { type: 'reactionTap'; by: PlayerId; ms: number; falseStart: boolean }
  | { type: 'chooseLeader'; by: PlayerId; leader: PlayerId }
  // Play
  | { type: 'playCard'; by: PlayerId; cardId: string }
  | { type: 'pickUpWastePile'; by: PlayerId }
  | { type: 'forfeit'; by: PlayerId }
  // Take-cards request
  | { type: 'requestTake'; by: PlayerId; target: PlayerId }
  | { type: 'answerTake'; by: PlayerId; requester: PlayerId; accept: boolean }
  | { type: 'withdrawTake'; by: PlayerId; target: PlayerId }
  // Pause
  | { type: 'requestPause'; by: PlayerId }
  | { type: 'respondPause'; by: PlayerId; requester: PlayerId; approve: boolean; at: number }
  | { type: 'pause'; by: PlayerId; at: number }
  | { type: 'resume'; by: PlayerId }
  | { type: 'setPauseTimeLimit'; by: PlayerId; seconds: number | null }
  | { type: 'tick'; at: number } // clock: ends a timed pause
  // Results screen
  | { type: 'readyUp'; by: PlayerId }
  | { type: 'advance'; by: PlayerId } // host: next round
  | { type: 'endSession'; by: PlayerId }; // host

export type SessionEvent =
  | PlayEvent
  | {
      readonly type: 'gameStarted';
      readonly players: readonly PlayerId[];
      readonly hostId: PlayerId;
      readonly jokerRuleEnabled: boolean;
      readonly jokerTotal: number;
    }
  | { readonly type: 'roundStarted'; readonly round: number; readonly dealer: PlayerId; readonly ultimate: boolean }
  | { readonly type: 'dealModeChanged'; readonly mode: DealMode }
  | { readonly type: 'dealComplete'; readonly handSizes: Readonly<Record<PlayerId, number>> }
  | { readonly type: 'voteCalled'; readonly kind: VoteKind; readonly by: PlayerId | null; readonly value: number | null }
  | { readonly type: 'voteCast'; readonly kind: VoteKind; readonly by: PlayerId; readonly ballot: Ballot }
  | { readonly type: 'voteNeedsHost'; readonly kind: VoteKind }
  | {
      readonly type: 'voteResolved';
      readonly kind: VoteKind;
      readonly result: boolean;
      readonly decidedBy: 'majority' | 'host';
      readonly value: number | null;
    }
  | { readonly type: 'reshuffled'; readonly dealer: PlayerId }
  | { readonly type: 'reshuffleWindowClosed' }
  | { readonly type: 'swapped'; readonly player: PlayerId; readonly count: number }
  // Secret (PROJECT.md 5, 2026-11-13): only the player is logged. `suits` is read from old saved games only.
  | { readonly type: 'missingSuitDeclared'; readonly player: PlayerId; readonly suits?: readonly Suit[] }
  | { readonly type: 'reactionTapStarted'; readonly players: readonly PlayerId[] }
  | { readonly type: 'reactionTapped'; readonly player: PlayerId; readonly ms: number; readonly falseStart: boolean }
  | { readonly type: 'reactionTapReplay'; readonly players: readonly PlayerId[] }
  | {
      readonly type: 'leaderChosen';
      readonly leader: PlayerId;
      readonly reason: 'host' | 'missingSuit' | 'reactionTap' | 'winnerChose';
    }
  | {
      readonly type: 'roundScored';
      readonly round: number;
      readonly ultimate: boolean;
      readonly finishingOrder: readonly PlayerId[];
      readonly points: Readonly<Record<PlayerId, number>>;
      readonly totals: Readonly<Record<PlayerId, number>>;
    }
  | { readonly type: 'ultimateLabels'; readonly winner: PlayerId | null; readonly losers: readonly PlayerId[] }
  | { readonly type: 'targetReached'; readonly players: readonly PlayerId[]; readonly target: number }
  /** The game would end with the top score drawn: an Ultimate Round is offered. */
  | { readonly type: 'drawAtEnd'; readonly players: readonly PlayerId[] }
  /** The first draw offer was turned down: "No one's a winner! Coward!", then a second chance. */
  | { readonly type: 'drawCoward'; readonly players: readonly PlayerId[] }
  | { readonly type: 'takeRequested'; readonly requester: PlayerId; readonly target: PlayerId }
  | { readonly type: 'takeAnswered'; readonly requester: PlayerId; readonly target: PlayerId; readonly accepted: boolean }
  | {
      readonly type: 'takeCancelled';
      readonly requester: PlayerId;
      readonly target: PlayerId;
      readonly reason: 'withdrawn' | 'notPossible';
    }
  | { readonly type: 'pauseRequested'; readonly by: PlayerId }
  | { readonly type: 'pauseDeclined'; readonly requester: PlayerId }
  | { readonly type: 'paused'; readonly requestedBy: PlayerId | null }
  | { readonly type: 'resumed'; readonly reason: 'host' | 'timeLimit' }
  | { readonly type: 'pauseTimeLimitSet'; readonly seconds: number | null }
  | { readonly type: 'playerReady'; readonly player: PlayerId }
  | ({ readonly type: 'sessionEnded' } & SessionEnd);

export interface LogEntry {
  readonly round: number;
  readonly ultimate: boolean;
  readonly event: SessionEvent;
}

export interface ActionResult {
  readonly session: Session;
  /** Events from this action only (also appended to `session.log`). */
  readonly events: readonly SessionEvent[];
}
