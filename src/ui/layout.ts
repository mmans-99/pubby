/**
 * The game screen as one fixed screen (CODE.md 9x.2, 9x.3, 2.29). Pure: no DOM,
 * so it is tested without a browser (tests/ui/layout.test.ts).
 *
 * Portrait: three rows under the top bar: the table (takes what is left), the
 * hand (fixed height for the whole round, so it never jumps), and the action
 * bar (the main button, or a hint).
 * Landscape: two rows. The action bar is a column at the right of the hand, so
 * the table keeps most of the height on a short phone.
 */
import { clamp, tableBoxFor, type TableBox } from './table.ts';

/** The table never gets smaller than this in portrait (CODE.md 9x.2 rule 2). */
export const MIN_TABLE_H = 240;
/** Portrait: top bar 48, padding 8, gap under the bar 6, two row gaps 12, the table's margin 4. */
export const CHROME_PORTRAIT = 78;
/** Landscape: top bar 40, padding 8, gap under the bar 4, one row gap 4, the table's margin 4, and 4 more under the bar (CODE.md 9x.3). */
export const CHROME_LANDSCAPE = 60;
/** The shortest table in landscape (a 568 × 320 phone): the cards are small there (CODE.md 9x.3). */
export const MIN_TABLE_LANDSCAPE = 96;
/** Landscape: the action bar's column beside the hand (CODE.md 9x.3). */
export const SIDE_BAR_W = 170;

export interface LayoutOpts {
  /** Is there a hand? (Pass-the-phone and look-at-hands screens may have no cards to show.) */
  hand?: boolean;
  /** Height of the action bar in px (portrait) or the bar's height when it is a column (landscape). 0 = no bar. */
  bar?: number;
}

export interface GameLayout {
  landscape: boolean;
  /** Table size in CSS px. */
  tableW: number;
  tableH: number;
  /** Hand row height in CSS px (0 when there is no hand and no bar). */
  handH: number;
  /** Hand width in CSS px (landscape: less the action column). */
  handW: number;
  /** Portrait: the action bar's row height. Landscape: 0 (the bar is a column). */
  barH: number;
  /** Landscape: the action column's width. Portrait: 0. */
  sideW: number;
  /** The table's scale number and box for drawing. */
  box: TableBox;
}

/**
 * The sizes of the rows for a window of viewW × viewH.
 * Portrait: the hand is a fifth of the window (120 to 190 px), and it gives way
 * to the table (down to 120 px) when the window is short.
 * Landscape: the hand row is 30% of the height (96 to 200 px); the bar is a
 * column of 170 px beside the hand (it needs a row only when there is no hand).
 */
export function gameLayout(viewW: number, viewH: number, opts: LayoutOpts = {}): GameLayout {
  const landscape = viewW > viewH;
  const wantHand = opts.hand ?? true;
  const bar = opts.bar ?? 52;
  if (!landscape) {
    const room = viewH - CHROME_PORTRAIT - bar; // for the table and the hand together
    let handH = wantHand ? clamp(0.2 * viewH, 120, 190) : 0;
    if (wantHand && room - handH < MIN_TABLE_H) handH = Math.max(120, room - MIN_TABLE_H);
    const tableW = Math.min(viewW - 16, 760);
    const tableH = room - handH;
    return { landscape, tableW, tableH, handH, handW: Math.min(viewW - 16, 1100), barH: bar, sideW: 0, box: tableBoxFor(tableW, tableH, false) };
  }
  const sideW = bar > 0 ? SIDE_BAR_W : 0;
  const handH = wantHand || bar > 0 ? clamp(0.3 * viewH, 96, 200) : 0;
  const tableW = Math.min(viewW - 16, 1100);
  const tableH = Math.max(MIN_TABLE_LANDSCAPE, viewH - CHROME_LANDSCAPE - handH);
  return { landscape, tableW, tableH, handH, handW: viewW - 16 - sideW, barH: 0, sideW, box: tableBoxFor(tableW, tableH, true) };
}
