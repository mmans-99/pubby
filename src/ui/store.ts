/**
 * App state and the one way to change it: `update()`.
 * Every change saves what needs saving and redraws (see app.ts `render`).
 */

import type { ProfileStats } from '../session/record.ts';
import type { CsvSheet } from './history.ts';
import type { PlayerId } from '../session/types.ts';
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
  | { kind: 'out'; player: PlayerId; place: number }
  | {
      kind: 'lastTwo';
      order: readonly PlayerId[];
      shared: readonly PlayerId[] | null;
      forfeitedBy: PlayerId | null;
      /** 2.32.1: set only for the round-over pop-up of a Skip to end of round: the round's winner (1st). */
      winner?: PlayerId;
    }
  | { kind: 'vote'; decidedBy: 'majority' | 'host' | 'both'; result: boolean; text: string }
  /** `ms`: how long it stays up (default POP_MS in game.ts). */
  | { kind: 'info'; icon: IconName; title: string; text: string; ms?: number };

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
  /** Sound sheet (music and effects switches and volumes). */
  soundOpen: boolean;
  menuOpen: boolean;
  /** Something that needs a second tap to confirm (e.g. "delete:Sam"). */
  armed: string | null;
  message: string | null;
  popups: Popup[];
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
