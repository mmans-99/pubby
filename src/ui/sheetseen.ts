/**
 * Which sheets were open at the last redraw (CODE.md 9ak.1, 2.37). Kept apart from
 * between.ts so that small screens (the Voice sheet, 9aq.12) can use it without
 * pulling in the whole game screen.
 */
const sheetsOpen = new Set<string>();

/**
 * 9ak.1 (2.37): every redraw rebuilds the page, so an open sheet would replay its entrance animation on each
 * − / + / quick-chip tap. Returns true when this sheet was already open at the last redraw (the caller adds
 * the `seen` class, which turns the animation off). Call it on every redraw, open or not, so it resets.
 */
export function sheetSeen(key: string, open: boolean): boolean {
  if (!open) { sheetsOpen.delete(key); return false; }
  const seen = sheetsOpen.has(key);
  sheetsOpen.add(key);
  return seen;
}
