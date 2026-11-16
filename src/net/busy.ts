/**
 * Which players are busy right now (CODE.md 9ai.3, 2.36): a phone with a pop-up still
 * open. In a network game nobody plays and computer players don't move until every
 * busy phone has closed its pop-up. The table shows a flipping hourglass on them.
 * The lobby screens keep the set up to date (copied from the host's lobby); the table reads it.
 */

let busy: ReadonlySet<string> = new Set();

/** This phone's own pop-up state, reported by the game screen after each draw. */
let mine = false;
const listeners: Array<(on: boolean) => void> = [];

/** Sets the busy players (player ids like "p2"). */
export function setBusyPlayers(ids: Iterable<string>): void {
  busy = new Set(ids);
}

export function isBusyPlayer(id: string): boolean {
  return busy.has(id);
}

/** True while any person's phone has a pop-up open (network games). */
export function anyoneBusy(): boolean {
  return busy.size > 0;
}

/** The game screen reports this phone's pop-up state. Listeners hear only changes. */
export function reportMyBusy(on: boolean): void {
  if (on === mine) return;
  mine = on;
  for (const f of listeners) f(on);
}

/** The network layer hears when this phone starts or stops being busy. */
export function onMyBusyChange(f: (on: boolean) => void): void {
  listeners.push(f);
}
