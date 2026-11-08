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

export function cardFace(c: Card, extraClass = ''): HTMLElement {
  if (c.kind === 'joker') {
    return h('div', { class: `card joker ${extraClass}`, 'aria-label': 'Joker' },
      h('span', { class: 'rank' }, '★'), h('span', { class: 'suit tiny' }, 'Joker'));
  }
  const rank = rankLabel(c.rank);
  return h('div', { class: `card ${isRed(c.suit) ? 'red' : ''} ${extraClass}`, 'aria-label': `${rank} of ${c.suit}` },
    h('span', { class: 'rank' }, rank),
    h('span', { class: 'suit' }, SUIT_SYMBOL[c.suit]));
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
