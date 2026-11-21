/**
 * 9ar.2 (O): Stats while you are out of the round. A "Stats" button sits beside Watch; the sheet has the
 * Places, Points and Awards tabs for the game so far (finished rounds), and a "This round" line (slaps, pick-ups,
 * fastest Reaction Tap). Only the public log is used, so nothing shown is private to another player.
 */

import type { PlayerId, Session } from '../session/types.ts';
import type { PlayerView } from '../session/view.ts';
import { awardCards, scoreSheet, sheetSeen, slappedByTable } from './between.ts';
import { h, type Child } from './dom.ts';
import { nameOf } from './game.ts';
import { icon } from './icons.ts';
import { miniDisc } from './roundstart.ts';
import { getState, update } from './store.ts';

type StatsTab = 'places' | 'points' | 'awards';
let statsTab: StatsTab = 'places';

/** The sheet is open for this round only (the key carries the round number, so it never reopens next round). */
const key = (s: Session): string => `stats:${s.round}`;

/** Out of the round: the round is on and my hand is empty. */
export function canShowStats(s: Session, v: PlayerView): boolean {
  return s.phase === 'playing' && !!s.play && v.myHand.length === 0;
}

/** The Stats button, for the action row beside Watch. */
export function statsButton(s: Session, v: PlayerView): HTMLElement | null {
  if (!canShowStats(s, v)) return null;
  const open = getState().armed === key(s);
  return h('button', {
    class: open ? 'icon-btn stats-btn on' : 'icon-btn stats-btn',
    'aria-label': 'Stats',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : key(s), menuOpen: false }),
  }, icon('chart'), h('span', { class: 'watch-word', 'aria-hidden': 'true' }, 'Stats'));
}

/** "This round": slaps so far, pick-ups, and the fastest Reaction Tap (its player and time). */
export function thisRoundLine(s: Session): string {
  const events = s.log.filter((e) => e.round === s.round && !e.ultimate).map((e) => e.event);
  const slaps = events.filter((e) => e.type === 'slapped').length;
  const pickUps = events.filter((e) => e.type === 'wastePilePickedUp').length;
  let best: { player: PlayerId; ms: number } | null = null;
  for (const e of events) {
    if (e.type === 'reactionTapped' && !e.falseStart && (!best || e.ms < best.ms)) best = { player: e.player, ms: e.ms };
  }
  const parts = [
    `${slaps} ${slaps === 1 ? 'slap' : 'slaps'}`,
    `${pickUps} ${pickUps === 1 ? 'pick-up' : 'pick-ups'}`,
    best ? `fastest Reaction Tap ${nameOf(s, best.player)} ${best.ms} ms` : null,
  ];
  return `This round: ${parts.filter((x): x is string => x !== null).join(' · ')}`;
}

/** Places for the game so far: how many rounds each player won and came last in. */
function placesSoFar(s: Session, me: PlayerId): Child {
  const rounds = s.rounds.filter((r) => !r.ultimate);
  if (!rounds.length) return h('p', { class: 'muted small center' }, 'No rounds finished yet.');
  const rows = s.order.map((id) => ({
    id,
    first: rounds.filter((r) => r.finishingOrder[0] === id).length,
    last: rounds.filter((r) => r.finishingOrder[r.finishingOrder.length - 1] === id).length,
  }));
  rows.sort((a, b) => b.first - a.first || a.last - b.last);
  return h('div', { class: 'place-list' }, rows.map((r) => h('div', { class: r.id === me ? 'place-row mine' : 'place-row' },
    miniDisc(s, r.id, '34px'),
    h('span', { class: 'place-name' }, nameOf(s, r.id), r.id === me ? ' (you)' : ''),
    h('span', { class: 'place-pts' }, h('b', null, `${r.first} ${r.first === 1 ? 'win' : 'wins'}`), h('small', null, `${r.last} last`)))));
}

function awardsSoFar(s: Session): Child {
  const cards = awardCards(s);
  return h('div', { class: 'stack' },
    cards.length
      ? h('div', { class: 'awards-grid' }, cards.map((a) => h('div', { class: 'award-card' },
        h('span', { class: 'award-icon', 'aria-hidden': 'true' }, icon('trophy')),
        h('small', { class: 'award-label' }, a.label),
        h('b', { class: 'award-value' }, a.short))))
      : h('p', { class: 'muted small center' }, 'No slaps yet.'),
    slappedByTable(s));
}

/** The sheet, open from the Stats button. Cancel or a tap outside closes it. */
export function statsSheet(s: Session, v: PlayerView): HTMLElement | null {
  // 9ap.B pattern (as the Watch sheet): the sheet's seen state is tracked on every redraw, open or not.
  const open = canShowStats(s, v) && getState().armed === key(s);
  const seen = sheetSeen('stats', open);
  if (!open) return null;
  const close = (): void => update({ armed: null });
  const tabLabels: [StatsTab, string][] = [['places', 'Places'], ['points', 'Points'], ['awards', 'Awards']];
  const body = statsTab === 'places' ? placesSoFar(s, v.me)
    : statsTab === 'points' ? (scoreSheet(s, { me: v.me }) ?? h('p', { class: 'muted small center' }, 'No points yet.'))
      : awardsSoFar(s);
  return h('div', { class: seen ? 'overlay take-sheet-overlay seen' : 'overlay take-sheet-overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('section', { class: seen ? 'sheet take-sheet seen stats-sheet' : 'sheet take-sheet stats-sheet', role: 'dialog', 'aria-label': 'Stats' },
      h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
      h('h2', { class: 'center' }, 'Stats'),
      h('div', { class: 'results-tabs', role: 'tablist', 'aria-label': 'Stats' },
        tabLabels.map(([t, label]) => h('button', {
          class: statsTab === t ? 'results-tab on' : 'results-tab',
          role: 'tab',
          'aria-selected': statsTab === t ? 'true' : 'false',
          onclick: () => { statsTab = t; update({}); },
        }, label))),
      h('div', { class: 'stats-body' }, body),
      h('p', { class: 'small center stats-round' }, thisRoundLine(s)),
      h('div', { class: 'row round-buttons' }, h('button', { class: 'secondary', onclick: close }, 'Cancel'))));
}
