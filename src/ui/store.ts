/**
 * App state and the one way to change it: `update()`.
 * Every change saves what needs saving and redraws (see app.ts `render`).
 */

import type { ProfileStats } from '../session/record.ts';
import type { CsvSheet } from './history.ts';
import type { PlayerId } from '../session/types.ts';
import { saveGame, type SavedGame } from './storage.ts';

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
  | { kind: 'slap'; slapper: PlayerId; slapped: PlayerId; cards: number }
  | { kind: 'out'; player: PlayerId; place: number }
  | {
      kind: 'lastTwo';
      order: readonly PlayerId[];
      shared: readonly PlayerId[] | null;
      forfeitedBy: PlayerId | null;
    }
  | { kind: 'vote'; decidedBy: 'majority' | 'host' | 'both'; result: boolean; text: string }
  | { kind: 'info'; icon: string; title: string; text: string };

export type Screen = 'home' | 'profiles' | 'history' | 'setup' | 'game' | 'nettest';

export interface State {
  screen: Screen;
  profiles: Record<string, ProfileStats>;
  setup: SetupState;
  game: SavedGame | null;
  rulesOpen: boolean;
  menuOpen: boolean;
  /** Something that needs a second tap to confirm (e.g. "delete:Sam"). */
  armed: string | null;
  message: string | null;
  popups: Popup[];
  /** Card the player has tapped once (tap again or press Play to play it). */
  selected: string | null;
  /** Reactions drawer (😂 and catch-phrases) is slid open. */
  reactionsOpen: boolean;
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
  state = { ...state, ...change };
  if (gameChanged) saveGame(state.game);
  if (draw) redraw();
}

export function say(message: string): void {
  update({ message });
  window.setTimeout(() => {
    if (state.message === message) update({ message: null });
  }, 2600);
}
