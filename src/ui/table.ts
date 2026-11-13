/**
 * The round table (version 2.4, PROJECT.md 12a; quiet seats and any-screen
 * sizing in 2.28, CODE.md 9w): players sit around the table, this phone's
 * player at the bottom (one-phone games: whoever holds the phone), the others
 * clockwise in play order. Each other player is their fan of card backs with a
 * count bubble and a small name (9w.1). Cards played this trick lie in the
 * middle; the waste pile is in the corner. Public information only.
 *
 * Seats keep `data-seat`, so the flying dealt card, the end-of-trick slide and
 * reactions find them. The sizes and places are pure functions (9w.2, 9w.3),
 * so they are tested without a browser.
 */

import { seatInitials } from './initials.ts';
import { h, type Child } from './dom.ts';
import { cardFaceFromId, fanLayout, ordinal, SUIT_SYMBOL } from './cards.ts';
import { thinkingSeat } from './thinking.ts';
import { isAwayPlayer } from '../net/away.ts';
import { icon } from './icons.ts';
import type { PlayerId, Session } from '../session/types.ts';
import type { PlayerView } from '../session/view.ts';
import type { Suit } from '../rules/cards.ts';

export interface TableOpts {
  /** Who sits at the bottom (this phone's player, or whoever holds the phone). */
  bottom: PlayerId;
  /** The glowing seat (whose turn it is). */
  highlight?: PlayerId | null;
  /** Seats become buttons (dealing, picking who leads). */
  onTap?: (id: PlayerId) => void;
  tapLabel?: string;
  disabled?: readonly PlayerId[];
  /** Cards in front of the players: this trick so far. */
  plays?: readonly { player: PlayerId; card: string }[];
  /** Plays from this index drop in (the newest). */
  newFrom?: number;
  /** The middle of the table: the deck while dealing. */
  middle?: Child;
  /** The waste pile, in the bottom-right corner of the felt (CODE.md 9u Part E5). */
  waste?: HTMLElement | null;
  /** Led suit, drawn faintly on the felt. */
  ledSuit?: Suit | null;
  /** Dealer tag on the dealer's seat. */
  dealer?: PlayerId | null;
  /** The table's size (CODE.md 9w.2). Default: the window's size. */
  box?: TableBox;
  /** This phone's own seat, shown as "You" (CODE.md 9w.1). */
  you?: boolean;
  /** The last trick, as a small stack in the felt's top-left corner (CODE.md 9x.2 rule 3). */
  last?: Child;
  /** The last trick had a slap: the stack's room includes the slap mark (CODE.md 9aa Part D). */
  lastSlap?: boolean;
}

/** Where seat number `k` (0 = bottom, then clockwise) of `n` sits, in % of the table box. */
export function seatSpot(n: number, k: number, radius = 1): { x: number; y: number } {
  const a = ((90 + (k * 360) / n) * Math.PI) / 180;
  return { x: 50 + 39 * radius * Math.cos(a), y: 50 + 41 * radius * Math.sin(a) };
}

/** Seats in table order: `bottom` first, then clockwise (play order). */
export function tableOrder(s: Session, bottom: PlayerId): PlayerId[] {
  const i = Math.max(0, s.order.indexOf(bottom));
  return [...s.order.slice(i), ...s.order.slice(0, i)];
}

export type Edge = 'top' | 'left' | 'right';

/*
 * Where the other players sit (CODE.md 9u Part E2): clockwise from your left
 * (k = 1 … n-1). t is 0..1 along that edge (top: left→right; sides: top→bottom).
 */
const EDGE_SPOTS: Record<number, [Edge, number][]> = {
  2: [['top', 0.5]],
  3: [['top', 0.28], ['top', 0.72]],
  4: [['left', 0.4], ['top', 0.5], ['right', 0.4]],
  5: [['left', 0.4], ['top', 0.28], ['top', 0.72], ['right', 0.4]],
  6: [['left', 0.45], ['top', 0.2], ['top', 0.5], ['top', 0.8], ['right', 0.45]],
  7: [['left', 0.7], ['left', 0.22], ['top', 0.3], ['top', 0.7], ['right', 0.22], ['right', 0.7]],
  8: [['left', 0.75], ['left', 0.2], ['top', 0.18], ['top', 0.5], ['top', 0.82], ['right', 0.2], ['right', 0.75]],
};

/** Landscape (CODE.md 9w.3 rule 1): more room on top, less on the sides. */
const EDGE_SPOTS_WIDE: Record<number, [Edge, number][]> = {
  2: [['top', 0.5]],
  3: [['top', 0.3], ['top', 0.7]],
  4: [['left', 0.45], ['top', 0.5], ['right', 0.45]],
  5: [['left', 0.5], ['top', 0.3], ['top', 0.7], ['right', 0.5]],
  6: [['left', 0.5], ['top', 0.2], ['top', 0.5], ['top', 0.8], ['right', 0.5]],
  7: [['left', 0.55], ['top', 0.15], ['top', 0.38], ['top', 0.62], ['top', 0.85], ['right', 0.55]],
  8: [['left', 0.6], ['left', 0.15], ['top', 0.25], ['top', 0.5], ['top', 0.75], ['right', 0.15], ['right', 0.6]],
};

/** The edge and place of each other player for `n` players (portrait or landscape table). */
export function edgeListFor(n: number, landscape: boolean): [Edge, number][] {
  return (landscape ? EDGE_SPOTS_WIDE : EDGE_SPOTS)[n] ?? [];
}

export function edgeSpot(n: number, k: number): { edge: Edge; t: number } {
  const s = EDGE_SPOTS[n]?.[k - 1];
  return s ? { edge: s[0], t: s[1] } : { edge: 'top', t: 0.5 };
}

/* ---------------------------------------------------------------------------
 * Sizes and places (CODE.md 9w.2, 9w.3, 9w.5). Pure: no DOM in these functions.
 * ------------------------------------------------------------------------- */

/** Height of the top bar on the game screen in landscape (CODE.md 9w.4). */
export const TOP_BAR = 48;

/** The table's size on this screen, in CSS px, and one scale number `u` (CODE.md 9w.2). */
export interface TableBox { w: number; h: number; u: number; landscape: boolean }

/** A rectangle in px from the felt's top-left. */
export interface Box { x: number; y: number; w: number; h: number }

/** One other player's place at the table (CODE.md 9w.3). */
export interface SeatSpot {
  edge: Edge;
  /** Centre of the fan of card backs. */
  fan: { x: number; y: number };
  /** Centre of the disc (9ac: the initial disc; the count badge sits on its corner). */
  bubble: { x: number; y: number };
  /** Top-left of the name line (or top-centre / top-right, see `align`). */
  name: { x: number; y: number; align: 'center' | 'left' | 'right' };
  /** The seat's tap area: the fan, bubble and name together, at least 44 × 44. */
  hit: Box;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Height of the hand area below the table (CODE.md 9w.5). Landscape: a share of
 * the window. Portrait: the height the fanned hand needs for a 13-card hand.
 */
export function handH(viewW: number, viewH: number): number {
  if (viewW > viewH) return clamp(0.3 * viewH, 96, 200);
  return fanLayout(13, Math.min(viewW, 1100) - 12).height;
}

/** The table's box for a window of viewW × viewH (CODE.md 9w.2). Portrait when the window is not wider than tall. */
export function tableBox(viewW: number, viewH: number): TableBox {
  const landscape = viewW > viewH;
  let w: number, h: number;
  if (!landscape) {
    w = Math.min(viewW - 12, 760);
    h = clamp(0.52 * viewH, 300, 0.9 * w + 80);
  } else {
    w = Math.min(viewW - 12, 1100);
    // 160 (not 200) so a 568 × 320 phone still fits the top bar, table and hand (9w.7 test 1).
    h = Math.max(160, viewH - TOP_BAR - handH(viewW, viewH) - 12);
  }
  return tableBoxFor(w, h, landscape);
}

/** A table box of w × h px: the scale `u` is the smaller of the width and 1.3 × the height, over 34 (CODE.md 9w.2). */
export function tableBoxFor(w: number, h: number, landscape: boolean): TableBox {
  const u = clamp(Math.min(w, h * 1.3) / 34, 8, 16);
  return { w, h, u, landscape };
}

/**
 * The box to draw for `n` players (CODE.md 9w.3 rule 7): if a name, bubble,
 * your pill, the waste pile or the middle zone collide, shrink `u` by 5% and
 * try again, at most 6 times. Returns the box unchanged when nothing collides.
 */
export function fitBox(n: number, box: TableBox): TableBox {
  let cur = box;
  for (let tries = 0; tries <= 6; tries++) {
    if (!seatCollisions(n, cur).length) return cur;
    cur = { ...cur, u: cur.u * 0.95 };
  }
  return cur;
}

/** The overlaps that 9w.3 rules 5 and 6 forbid, as readable names (empty when the layout is clean). */
export function seatCollisions(n: number, box: TableBox): string[] {
  const layout = seatLayout(n, box);
  const boxes: [string, Box][] = [];
  layout.forEach((s, i) => { boxes.push([`bubble ${i}`, bubbleBox(s, box.u)], [`name ${i}`, nameBox(s, box.u)]); });
  boxes.push(['your seat', ownSeatBox(n, box)], ['waste pile', wasteBox(box)], ['last trick', lastBox(box, n)]);
  const bad: string[] = [];
  for (const [name, b] of boxes) if (overlaps(b, middleBox(box))) bad.push(`${name} in the middle`);
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      if (overlaps(boxes[a]![1], boxes[b]![1])) bad.push(`${boxes[a]![0]} / ${boxes[b]![0]}`);
    }
  }
  return bad;
}

/** Card back size on the edges, in px (CODE.md 9w.2). */
export function cardBackSize(u: number): { bw: number; bh: number } {
  const bw = Math.round(3.9 * u);
  return { bw, bh: Math.round(bw * 1.4) };
}

/** Where each other player sits, in px, for `n` players in this box (CODE.md 9w.3). */
export function seatLayout(n: number, box: TableBox): SeatSpot[] {
  const { w, h, u } = box;
  const { bh } = cardBackSize(u);
  const topBand = 6.2 * u, bottomBand = 4.5 * u;
  const list = edgeListFor(n, box.landscape);
  const out: SeatSpot[] = [];
  for (let k = 1; k <= n - 1; k++) {
    const [edge, t] = list[k - 1] ?? ['top', 0.5];
    let spot: Omit<SeatSpot, 'hit'>;
    if (edge === 'top') {
      const x = t * w;
      const by = 0.95 * bh;
      spot = { edge, fan: { x, y: 0 }, bubble: { x, y: by }, name: { x, y: by + 1.5 * u, align: 'center' } };
    } else {
      const y = topBand + (h - topBand - bottomBand) * t;
      const left = edge === 'left';
      spot = {
        edge,
        fan: { x: left ? 0 : w, y },
        bubble: { x: left ? 0.95 * bh : w - 0.95 * bh, y },
        name: { x: left ? 0.95 * bh : w - 0.95 * bh, y: y + 1.5 * u, align: 'center' },
      };
    }
    out.push({ ...spot, hit: hitBox(spot, u, bh) });
  }
  return out;
}

/** The tap area: the union of the fan, bubble and name, grown to at least 44 × 44 px. */
function hitBox(s: Omit<SeatSpot, 'hit'>, u: number, bh: number): Box {
  const bw = Math.round(3.9 * u);
  const fan = { x: s.fan.x - bw / 2 - 12, y: s.fan.y - bh / 2 - 12, w: bw + 24, h: bh + 24 };
  const bubble = bubbleBox(s as SeatSpot, u);
  const name = nameBox({ ...s, hit: { x: 0, y: 0, w: 0, h: 0 } }, u);
  const x0 = Math.min(fan.x, bubble.x, name.x), y0 = Math.min(fan.y, bubble.y, name.y);
  const x1 = Math.max(fan.x + fan.w, bubble.x + bubble.w, name.x + name.w);
  const y1 = Math.max(fan.y + fan.h, bubble.y + bubble.h, name.y + name.h);
  let w = x1 - x0, hh = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w = Math.max(w, 44); hh = Math.max(hh, 44);
  return { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
}

/**
 * The seat's disc and count badge as one box (CODE.md 9ac.2). The disc is 2.6u across;
 * the badge (1.5u) sits on the disc's upper corner, its centre 1.3u out and 1.3u up (on the right edge, 1.3u left and 1.3u up).
 */
export function bubbleBox(s: SeatSpot, u: number): Box {
  const dir = s.edge === 'right' ? -1 : 1;
  const bx = s.bubble.x + dir * 1.3 * u, by = s.bubble.y - 1.3 * u; // badge centre: on the disc's corner, outside the letter
  const x0 = Math.min(s.bubble.x - 1.3 * u, bx - 0.75 * u);
  const x1 = Math.max(s.bubble.x + 1.3 * u, bx + 0.75 * u);
  const y0 = Math.min(s.bubble.y - 1.3 * u, by - 0.75 * u);
  const y1 = Math.max(s.bubble.y + 1.3 * u, by + 0.75 * u);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The name as a box (7u wide, 1.4u high, CODE.md 9ac.2 step 5), centred under the disc. */
export function nameBox(s: SeatSpot, u: number): Box {
  const w = 7 * u, hh = 1.4 * u;
  const x = s.name.align === 'center' ? s.name.x - w / 2 : s.name.align === 'left' ? s.name.x : s.name.x - w;
  return { x, y: s.name.y, w, h: hh };
}

/** Your own seat: the small pill at the bottom centre of the felt (9u × 2.2u). */
export function ownSeatBox(n: number, box: TableBox): Box {
  const c = seatSpot(n, 0);
  const cx = (c.x / 100) * box.w, cy = (c.y / 100) * box.h;
  return { x: cx - 4.5 * box.u, y: cy - 1.1 * box.u, w: 9 * box.u, h: 2.2 * box.u };
}

/**
 * How far each last-trick card sits from the one under it (CODE.md 9aa Part D):
 * far enough to show its whole corner (number and suit), and the whole stack
 * stays left of the "You" pill (0.4 of the table's width).
 */
export function lastStep(box: TableBox, n: number): number {
  const want = 1.6 * box.u; // one corner index wide
  const maxW = 0.4 * box.w;
  return n <= 1 ? 0 : Math.max(1.0 * box.u, Math.min(want, (maxW - 3.6 * box.u) / (n - 1)));
}

/**
 * The last trick's corner stack at the felt's bottom-left (CODE.md 9x.2 rule 3):
 * a label and up to `n` small cards, each card `lastStep` further along. The room
 * is kept for `n` cards, so the stack never grows into a seat once it is drawn.
 * A slap adds room for the slap mark (CODE.md 9aa Part D).
 * (The bottom-left is free: the waste pile is bottom-right, your pill bottom-centre.)
 */
export function lastBox(box: TableBox, n: number, slap = false): Box {
  const { u } = box;
  const h = 6.5 * u;
  const w = 3.6 * u + Math.max(0, n - 1) * lastStep(box, n) + (slap ? 1.4 * u : 0);
  return { x: 8, y: box.h - 8 - h, w, h };
}

/** The waste pile: 5u × 6.5u in the bottom-right corner (16 px in from the edges). */
export function wasteBox(box: TableBox): Box {
  return { x: box.w - 16 - 5 * box.u, y: box.h - 16 - 6.5 * box.u, w: 5 * box.u, h: 6.5 * box.u };
}

/** The middle of the table, kept clear for the trick: 0.36w × 0.36h around (w/2, 0.45h). */
export function middleBox(box: TableBox): Box {
  return { x: 0.32 * box.w, y: 0.27 * box.h, w: 0.36 * box.w, h: 0.36 * box.h };
}

/** True when two boxes overlap (touching edges do not count). */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** A number 0..1 from a text, always the same for the same text (so a card never jumps on a redraw). */
export function seeded(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Where each card of the trick lands (CODE.md 9u Part E4): down-right of the one
 * before, with a random tilt, so every earlier card keeps its top-left corner showing.
 */
export function pileSpots(cardIds: readonly string[], salt: string): { x: number; y: number; rot: number }[] {
  let x = 0, y = 0;
  const out = cardIds.map((id, k) => {
    if (k > 0) { x += 20 + seeded(`${salt}:${id}:x`) * 7; y += 8 + seeded(`${salt}:${id}:y`) * 14; }
    return { x, y, rot: (seeded(`${salt}:${id}:r`) - 0.5) * 28 };
  });
  // Centre the whole pile on (0, 0).
  const cx = x / 2, cy = y / 2;
  return out.map((p) => ({ x: p.x - cx, y: p.y - cy, rot: p.rot }));
}

/* ---------------------------------------------------------------------------
 * Drawing
 * ------------------------------------------------------------------------- */

/**
 * A fan of card backs for another player (CODE.md 9u Part E3): their count
 * shown as up to 13 backs. `at` places the fan's centre inside the seat.
 */
function edgeFan(count: number, edge: Edge, at: string): HTMLElement {
  const k = Math.min(count, 13);
  const mid = (k - 1) / 2;
  const backs = Array.from({ length: k }, (_, i) => {
    const d = i - mid;
    const ad = Math.abs(d);
    let x: number, y: number, rot: number;
    if (edge === 'top') {
      x = d * Math.min(8, 70 / k); y = 9 + ad * 0.8; rot = 180 + d * 2.5;
    } else {
      x = edge === 'left' ? -8 + ad * 0.6 : 8 - ad * 0.6; y = d * Math.min(6, 55 / k); rot = (edge === 'left' ? 90 : -90) + d * 2.5;
    }
    return h('span', { class: 'edge-back', style: `translate:calc(-50% + ${x.toFixed(1)}px) calc(-50% + ${y.toFixed(1)}px);rotate:${rot.toFixed(1)}deg` });
  });
  return h('span', { class: `edge-fan edge-${edge}`, 'aria-hidden': 'true', style: at }, backs);
}

type PlayerRow = PlayerView['players'][number];

/** Everything after a seat's name: host, dealer, away, place, thinking dots (CODE.md 9w.1). */
function seatTags(id: PlayerId, p: PlayerRow, o: TableOpts, thinking: boolean, place: boolean): Child[] {
  return [
    p.isHost ? h('span', { class: 'seat-host', 'aria-label': 'Host' }, '★') : null,
    o.dealer === id ? h('span', { class: 'seat-dealer', 'aria-label': 'Deals' }, 'D') : null,
    // CODE.md 9u A5: a phone that left the screen; its seat is kept for 10 minutes.
    isAwayPlayer(id) ? h('span', { class: 'seat-away' }, 'Away') : null,
    place && p.place !== null ? h('span', { class: 'place-badge' }, ordinal(p.place)) : null,
    // Computer player choosing its move (CODE.md 9m.5, 9w.1): three dots, no word.
    thinking ? h('span', { class: 'think-dots', 'aria-label': 'Thinking' }, [0, 1, 2].map((i) => h('span', { class: 'dot', style: `--i:${i}`, 'aria-hidden': 'true' }, '•'))) : null,
  ];
}

/** A seat as a button when it can be tapped, else a plain element. */
function seatEl(o: TableOpts, id: PlayerId, cls: string, style: string, label: string, kids: Child[]): HTMLElement {
  const disabled = o.disabled?.includes(id) ?? false;
  const full = `${cls}${disabled ? ' disabled' : ''}`;
  return o.onTap
    ? h('button', { class: full, style, 'data-seat': id, disabled, 'aria-label': `${o.tapLabel ?? ''} ${label}`.trim(), onclick: () => o.onTap!(id) }, kids)
    : h('div', { class: full, style, 'data-seat': id }, kids);
}

export function roundTable(s: Session, v: PlayerView, o: TableOpts): HTMLElement {
  const seats = tableOrder(s, o.bottom);
  const n = seats.length;
  const discTags = seatInitials(s.players.map((p) => ({ id: p.id, name: p.sessionName ?? p.profileName })));
  const box = fitBox(n, o.box ?? tableBox(typeof window === 'undefined' ? 390 : window.innerWidth, typeof window === 'undefined' ? 844 : window.innerHeight));
  const { bw, bh } = cardBackSize(box.u);
  const layout = seatLayout(n, box);
  const red = o.ledSuit === 'hearts' || o.ledSuit === 'diamonds';
  const plays = o.plays ?? [];
  // The pile's look is fixed by the round and the trick's first card, so it never reshuffles mid-trick.
  const spots = pileSpots(plays.map((p) => p.card), `${s.round}:${plays[0]?.card ?? ''}`);
  const felt = `width:${box.w.toFixed(1)}px;height:${box.h.toFixed(1)}px;--u:${box.u.toFixed(2)}px;--bw:${bw}px;--bh:${bh}px`;
  return h('section', { class: `round-table n${n}${box.landscape ? ' landscape' : ' portrait'}`, 'aria-label': 'Table', style: felt },
    h('div', { class: 'table-oval', 'aria-hidden': 'true' },
      o.ledSuit ? h('span', { class: red ? 'led-mark red' : 'led-mark' }, SUIT_SYMBOL[o.ledSuit]) : null),
    h('div', { class: 'table-middle' }, o.middle ?? null),
    o.waste ?? null,
    o.last ? h('div', { class: 'table-last', style: lastStyle(n, box, !!o.lastSlap) }, o.last) : null,
    plays.length ? h('div', { class: 'trick-pile' },
      plays.map((p, i) => {
        const at = spots[i]!;
        const cls = ['table-play', 'trick-play', i >= (o.newFrom ?? plays.length) ? 'new' : '', i === plays.length - 1 ? 'newest' : ''].filter(Boolean).join(' ');
        return h('div', {
          class: cls,
          style: `translate:calc(-50% + ${at.x.toFixed(1)}px) calc(-50% + ${at.y.toFixed(1)}px);rotate:${at.rot.toFixed(1)}deg;z-index:${2 + i};--i:${i}`,
          'aria-label': `${s.players.find((x) => x.id === p.player)?.sessionName ?? ''} played`,
        }, cardFaceFromId(p.card, 'small-card'));
      })) : null,
    seats.map((id, k) => {
      const p = v.players.find((x) => x.id === id)!;
      const out = p.place !== null;
      const thinking = thinkingSeat() === id;
      const turn = id === o.highlight;
      const computer = s.players.find((x) => x.id === id)?.computer ?? false;
      // A computer player gets a small computer icon, so it is never taken for a person (PROJECT.md 12c).
      const nameKids: Child[] = [computer ? icon('bot', 'seat-bot') : null, h('span', { class: 'table-name' }, o.you && k === 0 ? 'You' : p.sessionName)];
      const cls = (extra: string): string => ['table-seat', extra, turn ? 'turn' : '', out ? 'out' : '', isAwayPlayer(id) ? 'away' : '', o.onTap ? 'tappable' : '', thinking ? 'thinking' : ''].filter(Boolean).join(' ');

      if (k === 0) {
        // Your own seat: a small pill "You · 6" at the bottom centre of the felt (9w.1).
        // Out of the round, the place replaces the count.
        const at = seatSpot(n, 0);
        const count = out ? h('span', { class: 'place-badge' }, ordinal(p.place!)) : h('span', { class: 'pill-count' }, String(p.cardCount));
        // 2.32.1: the pill's centre stays at least 14px above the bottom of the table area, so it is never cut off.
        return seatEl(o, id, cls('me-pill'), `left:${at.x.toFixed(2)}%;top:min(${at.y.toFixed(2)}%, calc(100% - 14px))`, p.sessionName,
          [h('span', { class: 'pill-label' }, ...nameKids, ' · ', count), ...seatTags(id, p, o, thinking, false)]);
      }
      const tags = seatTags(id, p, o, thinking, true);

      // Another player: the fan is the seat (9w.1). Positions come from seatLayout, relative to the seat's tap area.
      const L = layout[k - 1]!;
      const rel = (x: number, y: number): string => `left:${(x - L.hit.x).toFixed(1)}px;top:${(y - L.hit.y).toFixed(1)}px`;
      const align = L.name.align;
      const tx = align === 'center' ? '-50%' : align === 'left' ? '0' : '-100%';
      const kids: Child[] = [];
      if (!out && p.cardCount > 0) kids.push(edgeFan(p.cardCount, L.edge, rel(L.fan.x, L.fan.y)));
      // 9ac.3: the initial disc (always shown, fades when out); the card count is a badge on it (hidden when out).
      const tag = discTags[id] ?? '?';
      kids.push(h('span', { class: `seat-disc${out ? ' out-disc' : ''}`, 'aria-hidden': 'true', style: `${rel(L.bubble.x, L.bubble.y)}` },
        h('span', { class: `seat-initial${tag.length >= 3 ? ' three' : tag.length === 2 ? ' two' : ''}` }, tag),
        !out ? h('span', { class: `disc-count ${L.edge === 'right' ? 'at-left' : 'at-right'}` }, String(p.cardCount)) : null));
      kids.push(h('span', { class: `seat-label al-${align}`, style: `${rel(L.name.x, L.name.y)};translate:${tx} 0` }, [...nameKids, ...tags]));
      const seatCls = cls(`seat-quiet edge-${L.edge}`);
      const hitStyle = `left:${L.hit.x.toFixed(1)}px;top:${L.hit.y.toFixed(1)}px;width:${L.hit.w.toFixed(1)}px;height:${L.hit.h.toFixed(1)}px`;
      return seatEl(o, id, seatCls, hitStyle, p.sessionName, kids);
    }),
  );
}

/**
 * Where the last-trick stack sits, in px (CODE.md 9x.2 rule 3). `--step` is the
 * card spacing for this table's box (CODE.md 9aa Part D); the cards inherit it.
 */
function lastStyle(n: number, box: TableBox, slap: boolean): string {
  const b = lastBox(box, n, slap);
  return `left:${b.x.toFixed(1)}px;top:${b.y.toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h.toFixed(1)}px;--step:${lastStep(box, n).toFixed(1)}px`;
}

/** The waste pile, in the bottom-right corner of the felt (CODE.md 9u Part E5). */
export function wastePile(count: number): HTMLElement {
  return h('div', { class: 'table-waste corner', 'aria-label': `Waste pile: ${count} cards` },
    h('span', { class: 'waste-pile', 'aria-hidden': 'true' }),
    h('span', { class: 'waste-count' }, `Waste ${count}`));
}
