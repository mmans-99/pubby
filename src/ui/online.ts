/**
 * The online play screens (CODE.md 9r.5.4, PROJECT.md 12d): the room form
 * (host), the room list and the passcode screen (join). They only draw what
 * they are given; netlobby.ts keeps the state and does the work.
 */

import { h } from './dom.ts';
import { icon } from './icons.ts';
import type { RoomInfo } from '../net/relayproto.ts';

type View = (HTMLElement | null)[];

/** The host's form: room name and passcode. */
export function roomFormView(head: HTMLElement, o: {
  name: string;
  code: string;
  error: string;
  maxName: number;
  onName: (v: string) => void;
  onCode: (v: string) => void;
  onNewCode: () => void;
  onMake: () => void;
}): View {
  return [
    head,
    h('section', { class: 'panel' },
      h('label', { class: 'field' },
        h('span', null, 'Room name'),
        h('input', { type: 'text', maxlength: o.maxName, value: o.name, 'aria-label': 'Room name', autocomplete: 'off', oninput: (e: Event) => o.onName((e.target as HTMLInputElement).value) }),
      ),
      h('label', { class: 'field' },
        h('span', null, 'Passcode (4 digits)'),
        h('input', { type: 'text', inputmode: 'numeric', maxlength: 4, value: o.code, 'aria-label': 'Passcode', autocomplete: 'off', class: 'room-code-input', oninput: (e: Event) => o.onCode((e.target as HTMLInputElement).value) }),
      ),
      h('button', { class: 'big secondary', onclick: o.onNewCode }, 'New code'),
    ),
    o.error ? h('p', { class: 'note warn' }, o.error) : null,
    h('button', { class: 'big', onclick: o.onMake }, icon('crown'), ' Make the room'),
    h('p', { class: 'muted small center' }, 'Other players find the room in their room list, or from your invite. They need the passcode.'),
  ];
}

/**
 * The rooms that are open. A room made on another Pubby version is greyed:
 * it can't be joined from this version.
 */
export function roomListView(head: HTMLElement, o: {
  rooms: RoomInfo[];
  loaded: boolean;
  problem: string;
  version: string;
  onPick: (r: RoomInfo) => void;
}): View {
  const items = o.rooms.map((r) => {
    const other = r.version !== o.version;
    return h('button', { class: other ? 'room-item off' : 'room-item', disabled: other, onclick: () => o.onPick(r) },
      h('span', { class: 'room-name' }, r.name),
      h('span', { class: 'muted small block' }, `Host: ${r.hostName} · ${r.seats} / ${r.maxSeats}${r.away ? ' · Host away' : ''}`),
      other ? h('span', { class: 'muted small block' }, `Made on Pubby ${r.version}. You have ${o.version}, so update Pubby to join.`) : null,
    );
  });
  let empty = '';
  if (!items.length) empty = o.loaded ? 'No rooms are open right now. Host one, or wait: rooms appear here by themselves.' : 'Looking for rooms…';
  return [
    head,
    o.problem ? h('p', { class: 'note warn' }, o.problem) : null,
    items.length ? h('div', { class: 'stack room-list' }, items) : h('p', { class: 'muted center' }, empty),
  ];
}

/** Join: the passcode for one room. */
export function roomPassView(head: HTMLElement, o: {
  name: string;
  value: string;
  error: string;
  onInput: (v: string) => void;
  onJoin: () => void;
}): View {
  return [
    head,
    h('section', { class: 'panel' },
      h('h2', null, o.name || 'Room'),
      h('label', { class: 'field' },
        h('span', null, 'Passcode (4 digits)'),
        h('input', { type: 'text', inputmode: 'numeric', maxlength: 4, value: o.value, 'aria-label': 'Passcode', autocomplete: 'off', class: 'room-code-input', oninput: (e: Event) => o.onInput((e.target as HTMLInputElement).value) }),
      ),
    ),
    o.error ? h('p', { class: 'note warn' }, o.error) : null,
    h('button', { class: 'big', onclick: o.onJoin }, 'Join the room'),
  ];
}
