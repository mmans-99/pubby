/**
 * "Play against the computer" (CODE.md 9m.7): the setup screen and the start of
 * a single-player game. The person is player 1 and host; the computer players
 * sit in the other seats.
 *
 * Slice C: each computer player has its own name (editable) and level (Easy or
 * Normal). The level chips set every seat at once (Mixed picks at random);
 * tapping a seat's level changes only that seat. Hard comes in slice D.
 */

import { botNamesProblem, pickNames } from '../ai/names.ts';
import { mixedLevel, randomPersona, type SetupLevel, type Speed } from '../ai/persona.ts';
import { MAX_PLAYERS, MIN_PLAYERS } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { createSession } from '../session/session.ts';
import type { PlayerId } from '../session/types.ts';
import { h } from './dom.ts';
import { startShuffle } from './game.ts';
import { icon } from './icons.ts';
import { addProfile, findProfile, saveProfiles, type BotInfo } from './storage.ts';
import { getState, say, update, type SetupBot, type SoloSetup } from './store.ts';

const rng = defaultRng();
const NAME_MAX = 16;
const MAX_BOTS = MAX_PLAYERS - 1;
const DEFAULT_BOTS = 3;
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
const LEVEL_LABEL: Record<SetupLevel, string> = { easy: 'Easy', normal: 'Normal' };

/** `n` new computer players with random names (not the person's name) and Normal level. */
function newSeats(n: number, taken: readonly string[]): SetupBot[] {
  return pickNames(n, taken, rng).map((name) => ({ name, level: 'normal' as const }));
}

export function soloSetupFresh(): SoloSetup {
  return { me: null, seats: newSeats(DEFAULT_BOTS, []), speed: 'normal', reactions: true, jokers: true, pauseLimit: null };
}

function setSolo(change: Partial<SoloSetup>): void {
  update({ solo: { ...getState().solo, ...change } });
}

/**
 * Makes `name` the person. A computer player who already has that name gets a
 * new random name, so choosing a profile never leaves an invalid setup behind.
 */
function setMe(name: string): void {
  const solo = getState().solo;
  const clash = (n: string): boolean => n.trim().toLowerCase() === name.trim().toLowerCase();
  const clashing = solo.seats.filter((s) => clash(s.name)).length;
  let seats = solo.seats;
  if (clashing) {
    const keep = solo.seats.filter((s) => !clash(s.name)).map((s) => s.name);
    const fresh = pickNames(clashing, [name, ...keep], rng);
    let k = 0;
    seats = solo.seats.map((s) => (clash(s.name) ? { ...s, name: fresh[k++] as string } : s));
  }
  setSolo({ me: name, seats });
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
  update({ profiles });
  setMe(clean);
}

/** Changes the number of computer players. New seats get new names and Normal level. */
function setBotCount(n: number): void {
  const seats = getState().solo.seats;
  if (n <= seats.length) { setSolo({ seats: seats.slice(0, n) }); return; }
  const taken = [getState().solo.me ?? '', ...seats.map((s) => s.name)];
  setSolo({ seats: [...seats, ...newSeats(n - seats.length, taken)] });
}

function renameSeat(i: number, name: string): void {
  setSolo({ seats: getState().solo.seats.map((s, k) => (k === i ? { ...s, name: name.trim() } : s)) });
}

function setLevels(pick: (i: number) => SetupLevel): void {
  setSolo({ seats: getState().solo.seats.map((s, i) => ({ ...s, level: pick(i) })) });
}

function toggleLevel(i: number): void {
  setSolo({ seats: getState().solo.seats.map((s, k) => (k === i ? { ...s, level: s.level === 'easy' ? 'normal' : 'easy' } : s)) });
}

/** New random names for every computer player (levels kept), avoiding the person's name. */
function newNames(): void {
  const solo = getState().solo;
  const fresh = pickNames(solo.seats.length, [solo.me ?? ''], rng);
  setSolo({ seats: solo.seats.map((s, i) => ({ ...s, name: fresh[i] as string })) });
}

/** Which level chip is lit: the one all seats share, or Mixed when they differ. */
function sharedLevel(seats: readonly SetupBot[]): SetupLevel | 'mixed' {
  const first = seats[0]?.level ?? 'normal';
  return seats.every((s) => s.level === first) ? first : 'mixed';
}

export function soloScreen(): HTMLElement {
  const st = getState();
  const solo = st.solo;
  const names = Object.keys(st.profiles).sort((a, b) => a.localeCompare(b));
  const input = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'New profile name', 'aria-label': 'New profile name', autocomplete: 'off' });
  const add = (): void => addPerson(input.value);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const count = solo.seats.length;
  const problem = botNamesProblem(solo.seats.map((s) => s.name), solo.me);
  const lit = sharedLevel(solo.seats);
  const levelChip = (label: string, value: SetupLevel | 'mixed', pick: () => void): HTMLElement =>
    h('button', {
      class: lit === value ? 'quick on' : 'quick',
      'aria-pressed': lit === value ? 'true' : 'false',
      onclick: pick,
    }, label);

  return h('main', { class: 'screen' },
    topBar('Play vs computer', () => update({ screen: 'home', armed: null })),

    h('section', { class: 'panel' },
      h('h2', null, 'You'),
      names.length
        ? h('div', { class: 'chips center-chips' }, names.map((n) => h('button', {
          class: solo.me === n ? 'quick on' : 'quick',
          'aria-pressed': solo.me === n ? 'true' : 'false',
          onclick: () => setMe(n),
        }, n)))
        : h('p', { class: 'muted small' }, 'No profiles yet. Add yours below.'),
      h('div', { class: 'row' }, input, h('button', { onclick: add }, 'Add')),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Computer players'),
      h('div', { class: 'row center-row' },
        h('button', {
          class: 'icon', 'aria-label': 'One fewer computer player', disabled: count <= 1,
          onclick: () => setBotCount(count - 1),
        }, '−'),
        h('span', { class: 'grow center', 'aria-live': 'polite' },
          icon('bot'), ` ${count} ${count === 1 ? 'computer player' : 'computer players'}`),
        h('button', {
          class: 'icon', 'aria-label': 'One more computer player', disabled: count >= MAX_BOTS,
          onclick: () => setBotCount(count + 1),
        }, '+'),
      ),
      h('div', { class: 'bot-list' }, solo.seats.map((s, i) => h('div', { class: 'bot-row' },
        icon('bot'),
        h('input', {
          type: 'text', maxlength: NAME_MAX, value: s.name, autocomplete: 'off',
          'aria-label': `Name of computer player ${i + 1}`,
          onchange: (e: Event) => renameSeat(i, (e.target as HTMLInputElement).value),
        }),
        h('button', {
          class: 'quick',
          'aria-label': `${s.name} plays at ${LEVEL_LABEL[s.level]} level; tap to change`,
          onclick: () => toggleLevel(i),
        }, LEVEL_LABEL[s.level]),
      ))),
      problem ? h('p', { class: 'note warn small', role: 'alert' }, problem) : null,
      h('div', { class: 'row' }, h('button', { onclick: newNames }, 'New names')),
      h('p', { class: 'muted small' }, 'Names must be different from each other and from yours. Tap a level to change just that player.'),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Level'),
      h('div', { class: 'chips center-chips' },
        levelChip('All Easy', 'easy', () => setLevels(() => 'easy')),
        levelChip('All Normal', 'normal', () => setLevels(() => 'normal')),
        levelChip('Mixed', 'mixed', () => setLevels(() => mixedLevel(rng))),
      ),
      h('p', { class: 'muted small' }, 'Hard comes in a later update.'),
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

    h('button', { class: 'big sticky', disabled: !solo.me || problem !== null, onclick: startSoloGame },
      !solo.me
        ? 'Choose your profile first'
        : problem
          ? 'Fix the names first'
          : `Start game · you and ${count} computer ${count === 1 ? 'player' : 'players'}`),
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
  const problem = botNamesProblem(solo.seats.map((s) => s.name), me);
  if (problem) { say(problem); return; }
  const count = Math.min(Math.max(solo.seats.length, MIN_PLAYERS - 1), MAX_BOTS);
  const bots = solo.seats.slice(0, count);
  const ids: PlayerId[] = ['p1', ...bots.map((_, i) => `p${i + 2}`)];
  const players = [
    { id: 'p1', profileName: me },
    ...bots.map((b, i) => ({ id: `p${i + 2}`, profileName: `computer:${b.name}`, sessionName: b.name, computer: true })),
  ];
  try {
    const { session } = createSession({
      players,
      hostId: 'p1',
      jokerRuleEnabled: solo.jokers,
      pauseTimeLimitSec: solo.pauseLimit,
    }, rng);
    const seats: Record<PlayerId, BotInfo> = {};
    bots.forEach((b, i) => {
      const id = ids[i + 1] as PlayerId;
      const p = randomPersona(b.level, rng);
      seats[id] = { level: p.level, personality: p.personality };
    });
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
