/**
 * CODE.md 9v.2 (version 2.27): when the game is waiting only on computer
 * players. Fast forward and Skip to end of round are offered only then.
 *
 * Pure functions, no DOM, so the rule can be tested on its own.
 */

import type { PlayerId } from '../rules/types.ts';
import type { Session } from '../session/types.ts';

export interface BotsOnlyInput {
  /** Whose move it is (`actorOf` in game.ts), or null between moves. */
  readonly actor: PlayerId | null;
  readonly isComputer: (id: PlayerId) => boolean;
  /** A pop-up, vote, tap, take-cards request or reshuffle vote is waiting for a person. */
  readonly waitingForPerson: boolean;
  /** Every person's seat is out of the round (`personsOut`). */
  readonly personOut: boolean;
  readonly paused: boolean;
  readonly ended: boolean;
}

/**
 * True only when the game is waiting on computer players and the person is out
 * of the round (answer 1, 2026-11-13 19:59). Everything else is false.
 */
export function botsOnlyNow(input: BotsOnlyInput): boolean {
  if (input.paused || input.ended || input.waitingForPerson || !input.personOut) return false;
  return input.actor === null || input.isComputer(input.actor);
}

/** 9v.3: with Fast forward on, a computer player's thinking time is a quarter of its normal time. */
export const FAST_FORWARD_FACTOR = 0.25;

// Shared state for the two options (not saved: a page reload starts normal).
// Kept here, not in bots.ts, so game.ts can read it without a new import cycle.
let fast = false;
let skip = false;
let note: string | null = null;
let hostSkip = false;

export function fastForwardOn(): boolean { return fast; }
export function setFastForward(on: boolean): void { fast = on; }
export function skipping(): boolean { return skip; }
export function setSkipping(on: boolean): void { skip = on; }
/** A short note shown in the banner (for example "Stopped: too many moves"). */
export function skipNote(): string | null { return note; }
export function setSkipNote(text: string | null): void { note = text; }
/** Joining phones: the host's phone is skipping to the end (9v.5). */
export function hostIsSkipping(): boolean { return hostSkip; }
export function setHostSkipping(on: boolean): void { hostSkip = on; }

/** Clears the host-side options (game left, or a person must act). */
export function resetFastForward(): void {
  fast = false;
  skip = false;
  note = null;
}

/** The thinking time after the fast-forward factor (applied after the random draw, so the draw is unchanged). */
export function fastForwardMs(ms: number, on: boolean): number {
  return on ? Math.round(ms * FAST_FORWARD_FACTOR) : ms;
}

/**
 * Every person (not a computer player) is out of the round. "Out" is the
 * rules engine's own state: the player is in `play.finished` (play.ts).
 */
export function personsOut(s: Session): boolean {
  const play = s.play;
  if (!play) return false;
  return s.players.every((p) => p.computer === true || play.finished.includes(p.id));
}
