/**
 * 9ar.3 (Q): the table fits its slot. The rows of the game screen start from guessed heights (layout.ts); where the
 * real bars, notices or window differ from the guess, the round table is scaled down to the room its slot really has,
 * so it is never cut off. The action row is sized to its content in CSS, and the hand row gives way first.
 * Measured after each draw (requestAnimationFrame) and whenever a slot changes size (ResizeObserver).
 */

import { scaleToFit } from './layout.ts';

let observer: ResizeObserver | null = null;
const observed = new WeakSet<Element>();

/** Measure every game table slot on the page and scale its table to fit. Safe to call any time. */
export function fitGameTables(): void {
  for (const slot of document.querySelectorAll<HTMLElement>('.game-table-slot')) {
    const table = slot.querySelector<HTMLElement>(':scope > .round-table');
    if (!table) continue;
    table.style.transform = '';
    const k = scaleToFit(slot.clientWidth, slot.clientHeight, table.offsetWidth, table.offsetHeight);
    table.style.transform = k < 1 ? `scale(${k.toFixed(4)})` : '';
    table.style.transformOrigin = 'center center';
    if (observer && !observed.has(slot)) { observed.add(slot); observer.observe(slot); }
  }
}

/** After a draw: the slots are in the page, so measure them on the next frame. */
export function scheduleTableFit(): void {
  if (!observer && typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(() => fitGameTables());
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fitGameTables());
}
