/**
 * Which players are away right now (CODE.md 9u Part A5): a phone that left the
 * screen, or lost its link, and whose seat is kept. The table shows an "Away" tag
 * on them. The lobby screens keep this set up to date; the table only reads it.
 */

let away: ReadonlySet<string> = new Set();

/** Sets the players who are away (player ids like "p2"). */
export function setAwayPlayers(ids: Iterable<string>): void {
  away = new Set(ids);
}

export function isAwayPlayer(id: string): boolean {
  return away.has(id);
}
