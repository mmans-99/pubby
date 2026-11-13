/**
 * Which screen is on show, for keeping scroll places (CODE.md 9aa Part A, 2.31).
 *
 * Every redraw rebuilds the page. The page's scrolling boxes get their places
 * back, but only while the screen stays the same: a new screen opens at the top.
 * Pure: no DOM, so it is tested without a browser (tests/ui/scrollkeep.test.ts).
 */

/** The parts of the app state that decide the screen (a subset of store.ts State). */
export interface ScreenLike {
  screen: string;
  game?: { session: { phase: string; round: number } } | null;
}

/**
 * A key for the screen on show. It stays the same while only the contents
 * change (ready-ups, votes, moves, reactions) and changes when the screen,
 * the game's phase or the round changes.
 */
export function screenKey(st: ScreenLike): string {
  if (st.screen !== 'game' || !st.game) return st.screen;
  return `game:${st.game.session.phase}:${st.game.session.round}`;
}
