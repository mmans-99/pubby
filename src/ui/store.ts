/**
 * App state and the one way to change it: `update()`.
 * Every change saves what needs saving and redraws (see app.ts `render`).
 */

import type { ProfileStats } from '../session/record.ts';
import type { CsvSheet } from './history.ts';
import type { PlayerId, VoteKind } from '../session/types.ts';
import type { Ballot } from '../rules/voting.ts';
import { loadGame, saveGame, type SavedGame } from './storage.ts';
import type { IconName } from './icons.ts';
import type { SetupLevel, Speed } from '../ai/persona.ts';

/** One computer player on the setup screen: its name (editable) and level. */
export interface SetupBot {
  name: string;
  level: SetupLevel;
}

/** "Play against the computer" setup (CODE.md 9m.7). */
export interface SoloSetup {
  /** The person's profile name on this phone. */
  me: string | null;
  /** The computer players, one per seat (1 to 7). */
  seats: SetupBot[];
  speed: Speed;
  reactions: boolean;
  jokers: boolean;
  pauseLimit: number | null;
}

export interface SetupSeat {
  profileName: string;
  /** Optional name for this game only. Empty means use the profile name. */
  sessionName: string;
}

export interface SetupState {
  seats: SetupSeat[];
  hostIndex: number;
  jokers: boolean;
  pauseLimit: number | null;
}

/** Pop-ups shown one after another, never dropped (CODE.md section 5a). */
export type Popup =
  | { kind: 'slap'; slapper: PlayerId; slapped: PlayerId; cards: number; /** The slap ended the round (no pick-up line): 'game' if the game is over too. */ over?: 'round' | 'game' }
  /** Final two: the lower last card laughs at the higher one, who must pick up or forfeit. */
  | { kind: 'haha'; laugher: PlayerId; loser: PlayerId }
  /** 2.34.6 (CODE.md 9ah.3): this phone's player holds all four aces. Private: shown on their own screen only. */
  | { kind: 'badboy'; player: PlayerId }
  /** 2.34.6: someone forfeited the round (last place). Shown on every phone. */
  | { kind: 'pathetic'; player: PlayerId }
  | { kind: 'out'; player: PlayerId; place: number }
  /**
   * 9an.1 (2.38): a take-cards request on every phone except the asker's and the asked player's.
   * `answer` null: "Amy is asking Ben for their cards" (waiting). Else the answer, and the place if they went out.
   */
  | { kind: 'take'; requester: PlayerId; target: PlayerId; answer: { accepted: boolean; place: number | null } | null }
  | {
      kind: 'lastTwo';
      order: readonly PlayerId[];
      shared: readonly PlayerId[] | null;
      forfeitedBy: PlayerId | null;
      /** 9ar.2 (K): the last card was higher again after the one pick-up. */
      higherAgain?: boolean;
      /** 2.32.1: set only for the round-over pop-up of a Skip to end of round: the round's winner (1st). */
      winner?: PlayerId;
    }
  /** 9ai.4 (2.36): a vote was called. Shown on every phone except the asker's. Tap "Vote now" or anywhere to close. */
  | { kind: 'voteAlert'; by: PlayerId; vote: VoteKind; value: number | null; dealer: PlayerId; twoPlayers: boolean }
  /** The result. `kindOf` and `value` give the question; `ballots` the YES and NO rows (9ai.4). */
  | { kind: 'vote'; decidedBy: 'majority' | 'host' | 'both'; result: boolean; text: string; kindOf?: VoteKind; value?: number | null; ballots?: Readonly<Record<PlayerId, Ballot>> }
  /**
   * 9aq.1 (2.39): the round's end on one pop-up, in place of the SLAP!, PATHETIC!!!, HAHAHA! and last-two pop-ups
   * of the same batch. `head` is the word shown big: pathetic (a forfeit) → slap → haha → over (plain end).
   * Built by `mergeRoundEnd` (roundend.ts).
   */
  | {
      kind: 'roundEnd';
      head: 'pathetic' | 'slap' | 'haha' | 'over';
      /** The round-ending slap, if there was one (its `over` is set). */
      slap?: Extract<Popup, { kind: 'slap' }>;
      /** The player who forfeited, if there was a forfeit. */
      forfeiter?: PlayerId;
      /** The HAHAHA! of a final-two choice in the same batch, if there was one. */
      haha?: Extract<Popup, { kind: 'haha' }>;
      end: Extract<Popup, { kind: 'lastTwo' }>;
      gameOver: boolean;
    }
  /** `ms`: how long it stays up (default POPUP_SHOW_MS, 5 s, in game.ts). */
  | { kind: 'info'; icon: IconName; title: string; text: string; ms?: number };

/**
 * 9aq.3 (2.39): a small notice on the felt. It never blocks play and never needs a tap: it shows for
 * NOTICE_MS (game.ts) and then goes. Built from the info-style lines that used to be pop-ups.
 */
export interface Notice {
  id: number;
  icon: IconName;
  title: string;
  text: string;
  /** Local clock (ms) when it was made. */
  at: number;
}

export type Screen = 'home' | 'profiles' | 'history' | 'setup' | 'solo' | 'game' | 'netlobby' | 'bye';

export interface State {
  screen: Screen;
  profiles: Record<string, ProfileStats>;
  setup: SetupState;
  solo: SoloSetup;
  game: SavedGame | null;
  rulesOpen: boolean;
  /** Quick rules card to open at ("Dealing", "Hidden decks"…); null = the top. */
  rulesTopic?: string | null;
  /** 9an.1 (2.38): the player the taker picked on the take sheet, before "Ask" is tapped. */
  takePick?: PlayerId | null;
  /** 9an.3 (2.38): the player picked on the "Watch whose hand?" sheet, before "Ask" is tapped. */
  watchPick?: PlayerId | null;
  /** Sound sheet (music and effects switches and volumes). */
  soundOpen: boolean;
  menuOpen: boolean;
  /** Something that needs a second tap to confirm (e.g. "delete:Sam"). */
  armed: string | null;
  /** 9ar.2 (M): who is calling the Ultimate Round vote while it waits for confirmation (armed 'ultimateconfirm'). */
  ultimateBy?: string | null;
  message: string | null;
  popups: Popup[];
  /** 9aq.3 (2.39): small notices on the felt, newest last. Optional so existing state literals still compile. */
  notices?: Notice[];
  /** Card the player has tapped once (tap again or press Play to play it). */
  selected: string | null;
  /** Reactions drawer (😂 and catch-phrases) is slid open. */
  reactionsOpen: boolean;
  /** The last trick is open big on the game screen (2.29, CODE.md 9x.2 rule 3). */
  lastOpen?: boolean;
  /** Profile opened on the profiles screen (details and share). */
  openProfile: string | null;
  /** Game opened on the past games screen. */
  openRecord: string | null;
  /** CSV shown as text when the share sheet can't take a file. */
  csvSheet: CsvSheet | null;
  /** "Exit Pubby?" question after a back gesture on the main menu. */
  exitAsk: boolean;
}

let state: State;
let redraw: () => void = () => {};

export function initState(s: State, render: () => void): void {
  state = s;
  redraw = render;
}

export function getState(): State {
  return state;
}

/** Change state, save the game if it changed, and redraw. */
export function update(change: Partial<State>, draw = true): void {
  const gameChanged = 'game' in change;
  const wasNet = !!state.game?.net;
  state = { ...state, ...change };
  if (gameChanged) {
    if (state.game?.net) {
      // A network game is never saved over a one-phone game (slice 4 adds saving on the host).
    } else if (wasNet && state.game === null) {
      // Leaving a network game: the one-phone game saved on this phone (if any) is back.
      state = { ...state, game: loadGame() };
    } else {
      saveGame(state.game);
    }
  }
  if (draw) redraw();
}

export function say(message: string): void {
  update({ message });
  window.setTimeout(() => {
    if (state.message === message) update({ message: null });
  }, 2600);
}
