/**
 * The round table (version 2.4, PROJECT.md 12a): players sit around an oval
 * table, this phone's player at the bottom (one-phone games: whoever holds
 * the phone), the others clockwise in play order. Cards played this trick lie
 * in front of whoever played them; the middle holds the waste pile (or the
 * deck while dealing). Public information only.
 *
 * Seats keep `data-seat` and the `seat-chip` look, so the flying dealt card,
 * the end-of-trick slide and reactions find them.
 */

import { h, type Child } from './dom.ts';
import { cardFaceFromId, ordinal, SUIT_SYMBOL } from './cards.ts';
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

export function edgeSpot(n: number, k: number): { edge: Edge; t: number } {
  const s = EDGE_SPOTS[n]?.[k - 1];
  return s ? { edge: s[0], t: s[1] } : { edge: 'top', t: 0.5 };
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

/**
 * A fan of card backs for another player (CODE.md 9u Part E3): their count
 * shown as up to 13 backs at the edge of the felt. The number on the chip is the truth.
 */
function edgeFan(count: number, edge: Edge, t: number): HTMLElement {
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
  const place = edge === 'top'
    ? `left:${(t * 100).toFixed(1)}%;top:0`
    : `${edge === 'left' ? 'left:0' : 'right:0'};top:calc(70px + (100% - 70px) * ${t.toFixed(2)})`;
  return h('span', { class: `edge-fan edge-${edge}`, 'aria-hidden': 'true', style: place }, backs);
}

export function roundTable(s: Session, v: PlayerView, o: TableOpts): HTMLElement {
  const seats = tableOrder(s, o.bottom);
  const n = seats.length;
  const red = o.ledSuit === 'hearts' || o.ledSuit === 'diamonds';
  const plays = o.plays ?? [];
  // The pile's look is fixed by the round and the trick's first card, so it never reshuffles mid-trick.
  const spots = pileSpots(plays.map((p) => p.card), `${s.round}:${plays[0]?.card ?? ''}`);
  return h('section', { class: `round-table n${n}`, 'aria-label': 'Table' },
    h('div', { class: 'table-oval', 'aria-hidden': 'true' },
      o.ledSuit ? h('span', { class: red ? 'led-mark red' : 'led-mark' }, SUIT_SYMBOL[o.ledSuit]) : null),
    h('div', { class: 'table-middle' }, o.middle ?? null),
    o.waste ?? null,
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
      const cls = ['seat-chip', 'table-seat', id === o.highlight ? 'turn' : '', out ? 'out' : '', o.onTap ? 'tappable' : '', k === 0 ? 'me' : '', thinking ? 'thinking' : ''].join(' ');
      const inner: Child[] = [
        // A computer player gets a small computer icon, so it is never taken for a person (PROJECT.md 12c).
        h('span', { class: 'seat-name' }, s.players.find((x) => x.id === id)?.computer ? [icon('bot', 'seat-bot'), ' '] : null, p.sessionName),
        h('span', { class: 'seat-count' }, out ? h('span', { class: 'place-badge' }, ordinal(p.place!)) : String(p.cardCount)),
        o.dealer === id ? h('span', { class: 'seat-tag' }, 'Deals') : null,
        // CODE.md 9u A5: a phone that left the screen; its seat is kept for 10 minutes.
        isAwayPlayer(id) ? h('span', { class: 'seat-tag away-tag' }, 'Away') : null,
        p.isHost ? h('span', { class: 'seat-host', 'aria-label': 'Host' }, '★') : null,
        // Computer player choosing its move (CODE.md 9m.5): a line of dots under the name.
        thinking ? h('span', { class: 'think-dots', 'aria-label': 'Thinking' }, 'thinking', h('span', { class: 'dots', 'aria-hidden': 'true' }, '…')) : null,
      ];
      // Seat 0 (you, or whoever holds the phone) sits at the bottom centre; the others on the edges.
      let style: string;
      let fan: HTMLElement | null = null;
      if (k === 0) {
        const at = seatSpot(n, k);
        style = `left:${at.x.toFixed(1)}%;top:${at.y.toFixed(1)}%`;
      } else {
        const e = edgeSpot(n, k);
        if (!out && p.cardCount > 0) fan = edgeFan(p.cardCount, e.edge, e.t);
        style = e.edge === 'top'
          ? `left:${(e.t * 100).toFixed(1)}%;top:60px;translate:-50% 0`
          : `${e.edge === 'left' ? 'left:62px' : 'right:62px'};top:calc(70px + (100% - 70px) * ${e.t.toFixed(2)});translate:0 -50%`;
      }
      const chip = o.onTap
        ? h('button', { class: cls, style, 'data-seat': id, disabled: o.disabled?.includes(id) ?? false, 'aria-label': `${o.tapLabel ?? ''} ${p.sessionName}`.trim(), onclick: () => o.onTap!(id) }, inner)
        : h('div', { class: cls, style, 'data-seat': id }, inner);
      return [fan, chip];
    }),
  );
}

/** The waste pile, in the bottom-right corner of the felt (CODE.md 9u Part E5). */
export function wastePile(count: number): HTMLElement {
  return h('div', { class: 'table-waste corner', 'aria-label': `Waste pile: ${count} cards` },
    h('span', { class: 'waste-pile', 'aria-hidden': 'true' }),
    h('span', { class: 'waste-count' }, `Waste ${count}`));
}
