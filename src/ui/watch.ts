/**
 * 9an.3 (2.38): watching a hand after you are out. Network games and single player only.
 * Screens: the eye button in the action row, the "Watch whose hand?" sheet and its confirm view,
 * the asked player's card (Show / Refuse), the viewer's fan of the watched cards, and the target's pill.
 * The watched cards only ever arrive on the viewer's own copy of the session (redactSession).
 */

import { peeksOn } from '../session/session.ts';
import type { PlayerId, Session } from '../session/types.ts';
import type { PlayerView } from '../session/view.ts';
import { cardFace } from './cards.ts';
import { h, type Child } from './dom.ts';
import { nameOf, send } from './game.ts';
import { icon } from './icons.ts';
import { miniDisc } from './roundstart.ts';
import { getState, update } from './store.ts';

/** Out of the round, the round still on, no watch of mine open, and someone left to watch. */
export function canAskToWatch(s: Session, v: PlayerView): boolean {
  if (s.phase !== 'playing' || !s.play || s.paused || !peeksOn(s)) return false;
  if (s.players.find((p) => p.id === v.me)?.computer) return false;
  if (v.myHand.length > 0) return false;
  if (v.myPeeks.some((p) => p.viewer === v.me)) return false;
  return v.players.some((p) => p.id !== v.me && p.cardCount > 0);
}

/** 9an.3 item 8: the eye button, in the action row. Opens the "Watch whose hand?" sheet. */
export function watchEyeButton(s: Session, v: PlayerView): HTMLElement | null {
  if (!canAskToWatch(s, v)) return null;
  const open = getState().armed === 'watch';
  return h('button', {
    class: open ? 'icon-btn watch-btn on' : 'icon-btn watch-btn',
    'aria-label': 'Watch a hand',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : 'watch', watchPick: null, menuOpen: false }),
  }, icon('eye'));
}

/** The sheet: one row per player with cards, then a confirm view for the one picked. */
export function watchSheet(s: Session, v: PlayerView): HTMLElement | null {
  if (getState().armed !== 'watch' || !canAskToWatch(s, v)) return null;
  const pick: PlayerId | null = getState().watchPick ?? null;
  const holders = v.players.filter((p) => p.id !== v.me && p.cardCount > 0);
  const close = (): void => update({ armed: null, watchPick: null });
  const sheet = (title: string, kids: Child[]): HTMLElement =>
    h('div', { class: 'overlay take-sheet-overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
      h('section', { class: 'sheet take-sheet', role: 'dialog', 'aria-label': title },
        h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
        ...kids));

  const picked = holders.find((p) => p.id === pick);
  if (picked) {
    const name = nameOf(s, picked.id);
    const n = picked.cardCount;
    return sheet(`Ask ${name} to show you their cards?`, [
      h('div', { class: 'take-confirm-disc' }, miniDisc(s, picked.id, '64px')),
      h('h2', { class: 'take-title center' }, `Ask ${name} to show you their cards?`),
      h('p', { class: 'muted small center' }, `${name} has ${n} ${n === 1 ? 'card' : 'cards'}. ${name} can say no. You see them until the round ends, or until either of you stops.`),
      h('button', {
        class: 'big take-go',
        onclick: () => { send([{ type: 'requestPeek', by: v.me, target: picked.id }]); update({ armed: null, watchPick: null }); },
      }, 'Ask'),
      h('button', { class: 'ghost big', onclick: () => update({ watchPick: null }) }, 'Back'),
    ]);
  }

  return sheet('Watch whose hand?', [
    h('div', { class: 'sheet-head' },
      h('span', { class: 'take-icon-circle' }, icon('eye')),
      h('div', null, h('h2', { class: 'take-title' }, 'Watch whose hand?'), h('p', { class: 'take-sub' }, 'Out of the round · one player at a time'))),
    h('div', { class: 'sheet-rows' }, holders.map((p) =>
      h('button', { class: 'sheet-row', 'aria-label': `Pick ${nameOf(s, p.id)}`, onclick: () => update({ watchPick: p.id }) },
        miniDisc(s, p.id, '40px'),
        h('span', { class: 'sheet-name' }, h('b', null, nameOf(s, p.id)), h('small', null, `${p.cardCount} ${p.cardCount === 1 ? 'card' : 'cards'}`)),
        h('span', { class: 'ask-chip' }, 'Pick', icon('arrow'))))),
    h('button', { class: 'ghost big', onclick: close }, 'Cancel'),
  ]);
}

/** 9an.3 item 9: the player being watched sees the ask: Show my cards (green) or Refuse. */
export function watchAskCard(s: Session, v: PlayerView): HTMLElement | null {
  const peek = v.myPeeks.find((p) => p.target === v.me && !p.showing);
  if (!peek) return null;
  const who = nameOf(s, peek.viewer);
  return h('div', { class: 'overlay take-overlay' },
    h('section', { class: 'take-card', role: 'alertdialog', 'aria-label': `${who} wants to watch your hand` },
      h('div', { class: 'take-pop-disc' }, miniDisc(s, peek.viewer, '56px')),
      h('h2', { class: 'take-title' }, `${who} wants to watch your hand`),
      h('p', { class: 'muted small center' }, 'They’re out, so they can’t play. They’ll see your cards until the end of the round.'),
      h('button', {
        class: 'big take-give',
        onclick: () => send([{ type: 'answerPeek', by: v.me, viewer: peek.viewer, accept: true }]),
      }, icon('check'), ' Show my cards'),
      h('button', {
        class: 'big btn-outline-no',
        onclick: () => send([{ type: 'answerPeek', by: v.me, viewer: peek.viewer, accept: false }]),
      }, 'Refuse'),
    ));
}

/** 9an.3 item 11: while I am being watched, a small pill above my hand with Stop. */
export function watchPill(s: Session, v: PlayerView): HTMLElement | null {
  const peek = v.myPeeks.find((p) => p.target === v.me && p.showing);
  if (!peek) return null;
  return h('div', { class: 'watch-pill', role: 'status' },
    icon('eye'),
    h('span', null, `${nameOf(s, peek.viewer)} is watching`),
    h('button', { class: 'ghost', onclick: () => send([{ type: 'stopPeek', by: v.me, other: peek.viewer }]) }, 'Stop'));
}

/** 9an.3 item 10: the viewer's place for the watched cards: a fan, face up, not tappable, with Stop. */
export function watchingBlock(s: Session, v: PlayerView): HTMLElement | null {
  if (!v.watching) return null;
  const target = v.watching.target;
  const who = nameOf(s, target);
  return h('section', { class: 'watching-hand', 'aria-label': `${who}’s cards` },
    h('div', { class: 'hand-head' },
      h('h2', null, `${who}’s cards`),
      h('button', { class: 'ghost', onclick: () => send([{ type: 'stopPeek', by: v.me, other: target }]) }, icon('x'), ' Stop watching')),
    h('div', { class: 'watch-fan' }, v.watching.cards.map((c) => cardFace(c, 'watch-card'))));
}
