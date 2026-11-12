/**
 * "Play against the computer" (CODE.md 9m.7): the setup screen and the start of
 * a single-player game. The person is player 1 and host; the computer players
 * sit in the other seats. Slice B: Normal level only, names picked at random.
 */

import { pickNames } from '../ai/names.ts';
import { randomPersona, type Speed } from '../ai/persona.ts';
import { MAX_PLAYERS, MIN_PLAYERS } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { createSession } from '../session/session.ts';
import type { PlayerId } from '../session/types.ts';
import { h } from './dom.ts';
import { startShuffle } from './game.ts';
import { icon } from './icons.ts';
import { addProfile, findProfile, saveProfiles, type BotInfo } from './storage.ts';
import { getState, say, update, type SoloSetup } from './store.ts';

const rng = defaultRng();
const NAME_MAX = 16;
const MAX_BOTS = MAX_PLAYERS - 1;
const PAUSE_LIMITS: readonly { label: string; sec: number | null }[] = [
  { label: 'No limit', sec: null },
  { label: '1 min', sec: 60 },
  { label: '2 min', sec: 120 },
  { label: '5 min', sec: 300 },
];
const SPEEDS: readonly { value: Speed; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function soloSetupFresh(): SoloSetup {
  return { me: null, bots: 3, speed: 'normal', reactions: true, jokers: true, pauseLimit: null };
}

function setSolo(change: Partial<SoloSetup>): void {
  update({ solo: { ...getState().solo, ...change } });
}

/** A new profile from this screen: saved on the phone and chosen as the person. */
function addPerson(name: string): void {
  const st = getState();
  const clean = name.trim();
  if (!clean) { say('Type a name first.'); return; }
  if (clean.length > NAME_MAX) { say(`Names can be up to ${NAME_MAX} letters.`); return; }
  const same = findProfile(st.profiles, clean);
  if (same) { say(`There's already a profile called ${same}.`); return; }
  const profiles = addProfile(st.profiles, clean);
  if (!saveProfiles(profiles)) say('Could not save to this phone. Profiles will be lost when the page closes.');
  update({ profiles, solo: { ...st.solo, me: clean } });
}

export function soloScreen(): HTMLElement {
  const st = getState();
  const solo = st.solo;
  const names = Object.keys(st.profiles).sort((a, b) => a.localeCompare(b));
  const input = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'New profile name', 'aria-label': 'New profile name', autocomplete: 'off' });
  const add = (): void => addPerson(input.value);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  return h('main', { class: 'screen' },
    topBar('Play vs computer', () => update({ screen: 'home', armed: null })),

    h('section', { class: 'panel' },
      h('h2', null, 'You'),
      names.length
        ? h('div', { class: 'chips center-chips' }, names.map((n) => h('button', {
          class: solo.me === n ? 'quick on' : 'quick',
          'aria-pressed': solo.me === n ? 'true' : 'false',
          onclick: () => setSolo({ me: n }),
        }, n)))
        : h('p', { class: 'muted small' }, 'No profiles yet. Add yours below.'),
      h('div', { class: 'row' }, input, h('button', { onclick: add }, 'Add')),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Computer players'),
      h('div', { class: 'row center-row' },
        h('button', {
          class: 'icon', 'aria-label': 'One fewer computer player', disabled: solo.bots <= 1,
          onclick: () => setSolo({ bots: solo.bots - 1 }),
        }, '−'),
        h('span', { class: 'grow center', 'aria-live': 'polite' },
          icon('bot'), ` ${solo.bots} ${solo.bots === 1 ? 'computer player' : 'computer players'}`),
        h('button', {
          class: 'icon', 'aria-label': 'One more computer player', disabled: solo.bots >= MAX_BOTS,
          onclick: () => setSolo({ bots: solo.bots + 1 }),
        }, '+'),
      ),
      h('p', { class: 'muted small' }, 'Their names are picked when you start.'),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Level'),
      h('div', { class: 'chips center-chips' }, h('button', { class: 'quick on', 'aria-pressed': 'true' }, 'Normal')),
      h('p', { class: 'muted small' }, 'Easy and Hard come in a later update.'),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Speed'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Speed' }, SPEEDS.map((o) =>
        h('button', {
          class: solo.speed === o.value ? 'seg-btn on' : 'seg-btn',
          'aria-pressed': solo.speed === o.value ? 'true' : 'false',
          onclick: () => setSolo({ speed: o.value }),
        }, o.label))),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Table'),
      toggle('Reactions from the computer players', solo.reactions, (on) => setSolo({ reactions: on })),
      toggle('Joker rule', solo.jokers, (on) => setSolo({ jokers: on })),
      h('label', { class: 'field' },
        h('span', null, 'Pause time limit'),
        h('select', {
          onchange: (e) => {
            const v = (e.target as HTMLSelectElement).value;
            setSolo({ pauseLimit: v === '' ? null : Number(v) });
          },
        }, PAUSE_LIMITS.map((p) =>
          h('option', { value: p.sec === null ? '' : String(p.sec), selected: p.sec === solo.pauseLimit }, p.label)))),
    ),

    h('button', { class: 'big sticky', disabled: !solo.me, onclick: startSoloGame },
      solo.me ? `Start game · you and ${solo.bots} computer ${solo.bots === 1 ? 'player' : 'players'}` : 'Choose your profile first'),
  );
}

function toggle(label: string, on: boolean, change: (on: boolean) => void): HTMLElement {
  return h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: on, onchange: (e) => change((e.target as HTMLInputElement).checked) }),
    h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
    h('span', { class: 'grow' }, label));
}

function topBar(title: string, back: () => void): HTMLElement {
  return h('div', { class: 'top-bar' },
    h('button', { class: 'ghost', onclick: back }, '‹ Back'),
    h('h1', null, title));
}

/** Starts the game: the person at the bottom of the table, the computer players in the other seats. */
export function startSoloGame(): void {
  const st = getState();
  const solo = st.solo;
  const me = solo.me;
  if (!me || !(me in st.profiles)) { say('Choose your profile first.'); return; }
  const count = Math.min(Math.max(solo.bots, MIN_PLAYERS - 1), MAX_BOTS);
  const botNames = pickNames(count, [me], rng);
  const ids: PlayerId[] = ['p1', ...botNames.map((_, i) => `p${i + 2}`)];
  const players = [
    { id: 'p1', profileName: me },
    ...botNames.map((n, i) => ({ id: `p${i + 2}`, profileName: `computer:${n}`, sessionName: n, computer: true })),
  ];
  try {
    const { session } = createSession({
      players,
      hostId: 'p1',
      jokerRuleEnabled: solo.jokers,
      pauseTimeLimitSec: solo.pauseLimit,
    }, rng);
    const seats: Record<PlayerId, BotInfo> = {};
    for (const id of ids.slice(1)) {
      const p = randomPersona('normal', rng);
      seats[id] = { level: p.level, personality: p.personality };
    }
    startShuffle();
    update({
      game: {
        session, stage: 'hand', holder: 'p1', trickLog: [], lastTrick: null,
        bots: { seats, speed: solo.speed, reactions: solo.reactions, me: 'p1' },
      },
      screen: 'game', menuOpen: false, armed: null, popups: [],
    });
  } catch (e) {
    say(e instanceof Error ? e.message : 'Could not start the game.');
  }
}
