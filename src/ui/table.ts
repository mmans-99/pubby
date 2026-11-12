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
  /** The middle of the table: waste pile, deck… */
  middle?: Child;
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

function miniBacks(count: number): HTMLElement {
  const k = Math.min(count, 4);
  return h('span', { class: 'mini-fan', 'aria-hidden': 'true' },
    Array.from({ length: k }, (_, i) => h('span', { class: 'mini-back', style: `--r:${((i - (k - 1) / 2) * 10).toFixed(0)}deg` })));
}

export function roundTable(s: Session, v: PlayerView, o: TableOpts): HTMLElement {
  const seats = tableOrder(s, o.bottom);
  const n = seats.length;
  const red = o.ledSuit === 'hearts' || o.ledSuit === 'diamonds';
  const plays = o.plays ?? [];
  return h('section', { class: `round-table n${n}`, 'aria-label': 'Table' },
    h('div', { class: 'table-oval', 'aria-hidden': 'true' },
      o.ledSuit ? h('span', { class: red ? 'led-mark red' : 'led-mark' }, SUIT_SYMBOL[o.ledSuit]) : null),
    h('div', { class: 'table-middle' }, o.middle ?? null),
    plays.map((p, i) => {
      const k = seats.indexOf(p.player);
      const at = seatSpot(n, Math.max(0, k), 0.5);
      return h('div', {
        class: i >= (o.newFrom ?? plays.length) ? 'table-play trick-play new' : 'table-play trick-play',
        style: `left:${at.x.toFixed(1)}%;top:${at.y.toFixed(1)}%;--i:${i}`,
        'aria-label': `${s.players.find((x) => x.id === p.player)?.sessionName ?? ''} played`,
      }, cardFaceFromId(p.card, 'small-card'));
    }),
    seats.map((id, k) => {
      const p = v.players.find((x) => x.id === id)!;
      const at = seatSpot(n, k);
      const out = p.place !== null;
      const thinking = thinkingSeat() === id;
      const cls = ['seat-chip', 'table-seat', id === o.highlight ? 'turn' : '', out ? 'out' : '', o.onTap ? 'tappable' : '', k === 0 ? 'me' : '', thinking ? 'thinking' : ''].join(' ');
      const inner: Child[] = [
        // A computer player gets a small computer icon, so it is never taken for a person (PROJECT.md 12c).
        h('span', { class: 'seat-name' }, s.players.find((x) => x.id === id)?.computer ? [icon('bot', 'seat-bot'), ' '] : null, p.sessionName),
        h('span', { class: 'seat-count' }, out ? h('span', { class: 'place-badge' }, ordinal(p.place!)) : [miniBacks(p.cardCount), String(p.cardCount)]),
        o.dealer === id ? h('span', { class: 'seat-tag' }, 'Deals') : null,
        p.isHost ? h('span', { class: 'seat-host', 'aria-label': 'Host' }, '★') : null,
        // Computer player choosing its move (CODE.md 9m.5): a line of dots under the name.
        thinking ? h('span', { class: 'think-dots', 'aria-label': 'Thinking' }, 'thinking', h('span', { class: 'dots', 'aria-hidden': 'true' }, '…')) : null,
      ];
      const style = `left:${at.x.toFixed(1)}%;top:${at.y.toFixed(1)}%`;
      return o.onTap
        ? h('button', { class: cls, style, 'data-seat': id, disabled: o.disabled?.includes(id) ?? false, 'aria-label': `${o.tapLabel ?? ''} ${p.sessionName}`.trim(), onclick: () => o.onTap!(id) }, inner)
        : h('div', { class: cls, style, 'data-seat': id }, inner);
    }),
  );
}

/** The waste pile for the middle of the table. */
export function wasteMiddle(count: number): HTMLElement {
  return h('div', { class: 'table-waste', 'aria-label': `Waste pile: ${count} cards` },
    h('span', { class: 'waste-pile', 'aria-hidden': 'true' }),
    h('span', { class: 'waste-count' }, String(count)));
}
