/**
 * Which computer player is "thinking…" right now (CODE.md 9m.5). The bot
 * driver (bots.ts) sets it; the round table shows it on that player's seat.
 * Kept here, not in bots.ts, so table.ts can read it without an import cycle.
 */

import type { PlayerId } from '../session/types.ts';
import { update } from './store.ts';

let thinking: PlayerId | null = null;

export function thinkingSeat(): PlayerId | null {
  return thinking;
}

/** Sets the seat; redraws only when it changes (the redraw comes after the current draw). */
export function setThinking(id: PlayerId | null): void {
  if (thinking === id) return;
  thinking = id;
  window.setTimeout(() => update({}), 0);
}
