/**
 * CODE.md 9an.8 (Part H, items 6 and 7): the host's "Remove from game" sheet. Opened from the
 * connection notice on the host's phone (armed "remove:<id>"). Two steps: the player's status and
 * "Remove from game" (red), then the confirm view ("removeok:<id>"). Network games only.
 */

import type { PlayerId, Session } from '../session/types.ts';
import { removeAllowed } from '../session/session.ts';
import { h, type Child } from './dom.ts';
import { icon } from './icons.ts';
import { nameOf } from './game.ts';
import { netSeats } from './netlobby.ts';
import { hostClock, hostRemove, linkIdOf, movedAgoMs } from './netplay.ts';
import type { SavedGame } from './storage.ts';
import { getState, update } from './store.ts';

/** "3:12" for a number of milliseconds. */
export function clockText(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** H-h: the status line for a seat: "Away 3:12" or "Last move 1:40 ago". */
export function statusLine(p: PlayerId): string {
  const link = linkIdOf(p);
  const seat = link === undefined ? undefined : netSeats()?.find((x) => x.id === link);
  if (seat?.awaySince !== undefined) return `Away ${clockText(hostClock() - seat.awaySince)}`;
  const moved = movedAgoMs(p);
  return moved === null ? 'No move yet' : `Last move ${clockText(moved)} ago`;
}

/** The sheet, when the host has opened it for a player (armed "remove:<id>" or "removeok:<id>"). */
export function removeSheet(g: SavedGame): HTMLElement | null {
  if (!g.net || g.net.role !== 'host') return null;
  const arm = getState().armed ?? '';
  const confirm = arm.startsWith('removeok:');
  if (!confirm && !arm.startsWith('remove:')) return null;
  const id = arm.slice(arm.indexOf(':') + 1) as PlayerId;
  const s: Session = g.session;
  if (!s.order.includes(id) || id === s.hostId) {
    update({ armed: null });
    return null;
  }
  const close = (): void => update({ armed: null });
  const who = nameOf(s, id);
  const results = s.phase === 'results';
  const sheet = (title: string, kids: Child[]): HTMLElement =>
    h('div', { class: 'overlay take-sheet-overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
      h('section', { class: 'sheet take-sheet', role: 'dialog', 'aria-label': title },
        h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
        ...kids));

  if (!confirm) {
    const why = removeAllowed(s, s.hostId, id);
    return sheet(`${who} · remove`, [
      h('div', { class: 'sheet-head' },
        h('span', { class: 'take-icon-circle' }, icon('x')),
        h('div', null, h('h2', { class: 'take-title' }, who), h('p', { class: 'take-sub' }, statusLine(id)))),
      why ? h('p', { class: 'note warn' }, why) : null,
      h('button', {
        class: 'big btn-outline-no',
        disabled: why !== null,
        onclick: () => update({ armed: `removeok:${id}` }),
      }, 'Remove from game'),
      h('button', { class: 'ghost big', onclick: close }, 'Cancel'),
    ]);
  }

  // H-b confirm view: "Remove Ben? Their cards leave the game and they come last this round." (results: they leave before the next round)
  const line = results
    ? `Remove ${who}? They leave before the next round.`
    : `Remove ${who}? Their cards leave the game and they come last this round.`;
  return sheet(`Remove ${who}?`, [
    h('div', { class: 'sheet-head' },
      h('span', { class: 'take-icon-circle' }, icon('x')),
      h('div', null, h('h2', { class: 'take-title' }, line))),
    h('button', {
      class: 'big btn-outline-no',
      onclick: () => {
        const why = hostRemove(id);
        close();
        if (why) update({ message: why });
      },
    }, 'Remove'),
    h('button', { class: 'ghost big', onclick: () => update({ armed: `remove:${id}` }) }, 'Back'),
  ]);
}
