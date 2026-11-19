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
/** Landscape: the action bar's column beside the hand on a phone (CODE.md 9x.3). */
export const SIDE_BAR_W = 170;
/** 9ak.6 (2.37): a landscape phone (height 500 or less) keeps its buttons in a rail down the left. */
export const RAIL_MAX_H = 500;
/** The rail's width, and the gap the screen keeps after it (the screen's left padding is their sum). */
export const RAIL_W = 56;
export const RAIL_GAP = 8;
/** Rail: top padding 8, row gap 4, margins 8 (no top bar row, CODE.md 9ak.6). */
export const CHROME_RAIL = 20;
/** Rail: the action column beside the hand. */
export const RAIL_SIDE_W = 150;

/**
 * Landscape: the action column's width (CODE.md 9ag.3 fix 2, 2.34.5). 17% of the
 * window, at least 170 (phones keep 170) and at most 240, so a tablet's column
 * has room for the deal buttons and the 😂 button above Play.
 */
export function sideBarW(viewW: number): number {
  return Math.floor(clamp(0.17 * viewW, SIDE_BAR_W, 240));
}

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
  /** 9ak.6 (2.37): landscape phones (height 500 or less): the top bar is a rail down the left (RAIL_W wide). */
  rail: boolean;
}

/**
 * The sizes of the rows for a window of viewW × viewH.
 * Portrait: the hand is a fifth of the window (120 to 190 px), and it gives way
 * to the table (down to 120 px) when the window is short.
 * Landscape: the hand row is 30% of the height (96 to 200 px); the bar is a
 * column of sideBarW px beside the hand (it needs a row only when there is no hand).
 */
export function gameLayout(viewW: number, viewH: number, opts: LayoutOpts = {}): GameLayout {
  const landscape = viewW > viewH;
  // 2.34.5: the game screen is at most 1100 px wide (styles.css .screen.game), padded 8 px each side.
  const inner = Math.min(viewW, 1100) - 16;
  const wantHand = opts.hand ?? true;
  const bar = opts.bar ?? 52;
  const rail = landscape && viewH <= RAIL_MAX_H;
  if (!landscape) {
    const room = viewH - CHROME_PORTRAIT - bar; // for the table and the hand together
    let handH = wantHand ? clamp(0.2 * viewH, 120, 190) : 0;
    if (wantHand && room - handH < MIN_TABLE_H) handH = Math.max(120, room - MIN_TABLE_H);
    const tableW = Math.min(viewW - 16, 760);
    const tableH = room - handH;
    return { landscape, tableW, tableH, handH, handW: inner, barH: bar, sideW: 0, box: tableBoxFor(tableW, tableH, false), rail: false };
  }
  // 9ak.6 (2.37): a short landscape phone: the rail, the table and the hand are taller, and the action column is 150 px.
  if (rail) {
    const railInner = viewW - RAIL_W - RAIL_GAP - RAIL_GAP; // the screen pads RAIL_W + RAIL_GAP on the left, RAIL_GAP on the right
    const sideRailW = bar > 0 ? RAIL_SIDE_W : 0;
    const handRailH = wantHand || bar > 0 ? clamp(0.32 * viewH, 96, 150) : 0;
    const tableRailH = Math.max(MIN_TABLE_LANDSCAPE, viewH - CHROME_RAIL - handRailH);
    const handRailW = railInner - (sideRailW ? sideRailW + RAIL_GAP : 0);
    return { landscape, tableW: railInner, tableH: tableRailH, handH: handRailH, handW: handRailW, barH: 0, sideW: sideRailW, box: tableBoxFor(railInner, tableRailH, true), rail: true };
  }
  const sideW = bar > 0 ? sideBarW(viewW) : 0;
  const handH = wantHand || bar > 0 ? clamp(0.3 * viewH, 96, 200) : 0;
  const tableW = inner;
  const tableH = Math.max(MIN_TABLE_LANDSCAPE, viewH - CHROME_LANDSCAPE - handH);
  return { landscape, tableW, tableH, handH, handW: inner - sideW, barH: 0, sideW, box: tableBoxFor(tableW, tableH, true), rail: false };
}

/**
 * 9aq.15 A2 (3.0.1): the rail's top group. Each button is RAIL_BTN px, RAIL_ROW_GAP px apart, from the top
 * padding (RAIL_TOP). The bottom group (quick rules, sound, 😂) floats from the bottom, so the top group
 * must end above RAIL_FLOAT_H px from the bottom of the window.
 */
export const RAIL_BTN = 40;
export const RAIL_ROW_GAP = 6;
export const RAIL_TOP = 8;
export const RAIL_FLOAT_H = 150;

/**
 * 9aq.15 A2: how many of `items` (in order of importance) fit in the rail's top group at this height.
 * The rest are `overflow`: the game menu takes them. Items are never shrunk or hidden under the floating buttons.
 * Sums: 320 high → 3, 360 → 4, 390 → 5, 412 → 5, 500 → 7.
 */
export function railFit<T>(viewH: number, items: readonly T[]): { shown: T[]; overflow: T[] } {
  // n buttons take RAIL_TOP + n*RAIL_BTN + (n-1)*RAIL_ROW_GAP, which must stay above the floating group.
  const room = viewH - RAIL_FLOAT_H - RAIL_TOP;
  const n = Math.max(0, Math.min(items.length, Math.floor((room + RAIL_ROW_GAP) / (RAIL_BTN + RAIL_ROW_GAP))));
  return { shown: items.slice(0, n) as T[], overflow: items.slice(n) as T[] };
}

/**
 * 9aq.16 Fix 2: the portrait top bar. The screen pads 8 px each side, and the right 98 px are kept for the
 * sound and rules buttons (styles.css `.game-bar` padding-right). At 380 px or less the bar is narrower
 * (styles.css: 2 px gaps, 4 px left padding), so the same rule is applied with those numbers.
 */
export const BAR_SCREEN_PAD = 16;
export const BAR_RIGHT_KEEP = 98;
export const BAR_NARROW_MAX_W = 380;

/**
 * 9aq.16 Fix 2: how many of the bar's buttons fit in a portrait window of `viewW` px. `widths` is each
 * button's width in order (the order is the bar's order, the same as railFit: the first ones are kept).
 * Gaps are 8 px (2 px when narrow). Whatever does not fit goes to the game menu's shelf.
 */
export function barFit(viewW: number, widths: readonly number[]): number {
  const narrow = viewW <= BAR_NARROW_MAX_W;
  const room = viewW - BAR_SCREEN_PAD - BAR_RIGHT_KEEP - (narrow ? 4 : 0);
  const gap = narrow ? 2 : 8;
  let used = 0;
  let n = 0;
  for (const w of widths) {
    const next = n === 0 ? w : used + gap + w;
    if (next > room) break;
    used = next;
    n += 1;
  }
  return n;
}
