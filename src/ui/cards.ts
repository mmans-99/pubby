/** Card faces, card backs, hand sorting and small text helpers. */

import type { Card, Suit } from '../rules/cards.ts';
import { h } from './dom.ts';

export const SUIT_ORDER: readonly Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
export const SUIT_SYMBOL: Record<Suit, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
export const SUIT_NAME: Record<Suit, string> = { clubs: 'clubs', diamonds: 'diamonds', hearts: 'hearts', spades: 'spades' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function shortLabel(c: Card): string {
  return c.kind === 'joker' ? 'Joker' : `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`;
}

/** Jokers first, then spades, hearts, clubs, diamonds (colours alternate), low to high. */
export function sortHand(cards: readonly Card[]): Card[] {
  const key = (c: Card): number => (c.kind === 'joker' ? -1 : SUIT_ORDER.indexOf(c.suit) * 100 + c.rank);
  return [...cards].sort((a, b) => key(a) - key(b));
}

/*
 * Classic card faces (CODE.md 9u Part D, 2.24). Suits are drawn as SVG, not font
 * symbols, because font suits turn into emoji on some phones. Court cards are
 * Pubby's own simple designs. Path text below is our own constant, never user text.
 */
const SUIT_PATH: Record<Suit, string> = {
  hearts: '<path d="M50 92C22 68 2 50 2 29 2 13 14 2 28 2c10 0 18 6 22 14C54 8 62 2 72 2c14 0 26 11 26 27 0 21-20 39-48 63z"/>',
  diamonds: '<path d="M50 2 90 50 50 98 10 50z"/>',
  spades: '<path d="M50 2C62 22 98 38 98 63c0 14-11 24-24 24-9 0-16-4-20-10 1 9 5 16 12 21H34c7-5 11-12 12-21-4 6-11 10-20 10C13 87 2 77 2 63 2 38 38 22 50 2z"/>',
  clubs: '<circle cx="50" cy="26" r="22"/><circle cx="25" cy="58" r="22"/><circle cx="75" cy="58" r="22"/><path d="M46 56c0 20-5 32-14 42h36c-9-10-14-22-14-42z"/>',
};
const CROWN_PATH: Record<'J' | 'Q' | 'K', string> = {
  K: '<path d="M4 46 10 10 30 30 50 4 70 30 90 10 96 46z"/>',
  Q: '<path d="M6 46 14 18a6 6 0 1 1 6 0l12 16 12-26a6 6 0 1 1 6 0l12 26 12-16a6 6 0 1 1 6 0l8 28z"/>',
  J: '<path d="M10 46 18 16h64l8 30zM30 16 50 4l20 12z"/>',
};
const STAR_PATH = '<path d="M50 4 62 38 98 38 69 60 80 95 50 74 20 95 31 60 2 38 38 38z"/>';

/** An SVG element from fixed path text (our own constants only). */
function shape(paths: string, cls: string, viewBox = '0 0 100 100'): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="${cls}" viewBox="${viewBox}" fill="currentColor" aria-hidden="true">${paths}</svg>`;
  return t.content.firstElementChild as SVGSVGElement;
}

export function suitShape(suit: Suit, cls = ''): SVGSVGElement { return shape(SUIT_PATH[suit], cls); }

export function cardFace(c: Card, extraClass = ''): HTMLElement {
  if (c.kind === 'joker') {
    return h('div', { class: `card joker ${extraClass}`, 'aria-label': 'Joker' },
      h('div', { class: 'idx' }, h('span', { class: 'r' }, 'JOKER')),
      shape(STAR_PATH, 'jstar'));
  }
  const rank = rankLabel(c.rank);
  const court = c.rank >= 11 && c.rank <= 13 ? (c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : 'K') : null;
  const idxRank = c.rank === 10 ? 'r ten' : 'r';
  return h('div', { class: `card ${isRed(c.suit) ? 'red' : ''} ${extraClass}`, 'aria-label': `${rank} of ${c.suit}` },
    h('div', { class: 'idx' }, h('span', { class: idxRank }, rank), suitShape(c.suit)),
    court
      ? h('div', { class: 'court' },
        shape(CROWN_PATH[court], 'crown', '0 0 100 50'),
        h('span', { class: 'big-letter' }, court),
        suitShape(c.suit, 'crest'))
      : suitShape(c.suit, 'pip-big'));
}

/** One card's place in a fanned hand (pure, so it can be unit-tested). */
export interface FanSpot { x: number; y: number; rot: number; z: number }

/**
 * Places n cards in one fanned row, or two rows when there are more than 15
 * (CODE.md 9x.2 rule 4, 2.29; was 12). Every visible strip stays at least 20 px
 * wide on a 320 px phone: the tap target. `maxH` (2.29) limits the height: the
 * card size is chosen so the fan fits, one row or two, and the card size does not
 * depend on the card count while there is one row (so 12 and 13 cards look the same).
 */
export function fanLayout(n: number, width: number, maxCardW?: number, minCardW = 64, maxH?: number): { cardW: number; height: number; spots: FanSpot[] } {
  // CODE.md 9w.5: landscape passes a smaller maxCardW (the hand is shorter) and a 48 px minimum.
  let cardW = Math.min(maxCardW ?? 96, 96, Math.max(minCardW, width * 0.19));
  const twoRows = n > 15;
  // Height = card height (1.4 × width), plus 0.55 card heights for a second row, plus 30 px of room.
  if (maxH !== undefined) cardW = Math.min(cardW, (maxH - 30) / (twoRows ? 1.4 * 1.55 : 1.4));
  const cardH = cardW * 1.4;
  const rows = twoRows ? [Math.ceil(n / 2), n - Math.ceil(n / 2)] : [n];
  const spots: FanSpot[] = [];
  rows.forEach((m, ri) => {
    const usable = width - 16;
    const step = m > 1 ? Math.min(cardW * 0.62, (usable - cardW) / (m - 1)) : 0;
    const x0 = (width - (cardW + step * (m - 1))) / 2;
    const ang = Math.min(3, 30 / Math.max(1, m));
    const mid = (m - 1) / 2;
    // 2.37 (9ak.6): the curve's drop at the ends is capped at 30 px (the height's room). A long hand (a pick-up of the
    // waste pile, up to about 50 cards) used to drop past the bottom of the hand slot; short hands keep the 0.9 curve.
    const curve = Math.min(0.9, 30 / Math.max(1, mid * mid));
    for (let i = 0; i < m; i++) {
      const d = i - mid;
      spots.push({ x: x0 + i * step, y: ri * cardH * 0.55 + d * d * curve, rot: d * ang, z: spots.length + 1 });
    }
  });
  return { cardW, height: cardH + (rows.length > 1 ? cardH * 0.55 : 0) + 30, spots };
}

/** The box the fanned cards really cover (rotation and the curve included), in px. */
export function fanBounds(fan: { cardW: number; spots: readonly FanSpot[] }): { left: number; top: number; right: number; bottom: number } {
  const w = fan.cardW, hgt = fan.cardW * 1.4;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of fan.spots) {
    const a = (Math.abs(p.rot) * Math.PI) / 180;
    const bw = w * Math.cos(a) + hgt * Math.sin(a);
    const bh = w * Math.sin(a) + hgt * Math.cos(a);
    const cx = p.x + w / 2, cy = p.y + hgt / 2;
    left = Math.min(left, cx - bw / 2); right = Math.max(right, cx + bw / 2);
    top = Math.min(top, cy - bh / 2); bottom = Math.max(bottom, cy + bh / 2);
  }
  if (!fan.spots.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left, top, right, bottom };
}

/**
 * The fanned hand for a hand slot of `width` × `height` px (CODE.md 9ag.3 fix 1, 2.34.5).
 * Starts from the usual fan (so a phone's hand that already fits is unchanged) and, when
 * the cards would go past the slot (below it, or wider than it), makes them smaller until
 * they fit: the card size is the smaller of "fits the height" and "fits the width". The
 * returned height is what the cards cover, so the centred fan never runs below the slot.
 * `lift` is the raised card's lift (it may stick up above the slot; not counted).
 */
export function fitFan(n: number, width: number, height: number, landscape: boolean): { cardW: number; height: number; spots: FanSpot[] } {
  const twoRows = n > 15;
  const first = landscape
    ? fanLayout(n, width, (height - 30) / (twoRows ? 1.4 * 1.55 : 1.4), 48)
    : fanLayout(n, width, undefined, 64, height);
  // The fan's box is centred in the slot; every card must be inside the slot. Sideways, a tilted end
  // card may reach into the screen's 8 px side padding (as it always has on phones).
  const SIDE = 8;
  const fits = (f: { cardW: number; height: number; spots: FanSpot[] }): boolean => {
    const b = fanBounds(f);
    const top = (height - f.height) / 2;
    return top + b.top >= -0.5 && top + b.bottom <= height + 0.5 && b.left >= -SIDE && b.right <= width + SIDE;
  };
  if (n === 0 || fits(first)) return first;
  let fan = first;
  let cardW = first.cardW;
  for (let i = 0; i < 40; i++) {
    cardW *= 0.95;
    fan = fanLayout(n, width, cardW, Math.min(48, cardW), undefined);
    const b = fanBounds(fan);
    if (b.bottom - b.top <= height && b.left >= -SIDE && b.right <= width + SIDE) break;
  }
  // The fan's box is what the cards cover, so the centred fan never runs past the slot.
  const b = fanBounds(fan);
  return { cardW: fan.cardW, height: b.bottom - b.top, spots: fan.spots.map((p) => ({ ...p, y: p.y - b.top })) };
}

/** 2.34.6 (CODE.md 9ah.3): all four aces in one hand ("You are the Ultimate Badboy!!"). */
export function hasFourAces(hand: readonly Card[]): boolean {
  return hand.filter((c) => c.kind === 'standard' && c.rank === 14).length === 4;
}

/** Face of a card from its id ("spades-14", "joker-1"), for the last-trick row. */
export function cardFaceFromId(id: string, extraClass = ''): HTMLElement {
  if (id.startsWith('joker')) return cardFace({ kind: 'joker', id }, extraClass);
  const [suit, rank] = id.split('-');
  return cardFace({ kind: 'standard', id, suit: suit as Suit, rank: Number(rank) as 2 }, extraClass);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
