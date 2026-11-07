/**
 * The Pubby app (pass-and-play, one phone). Plain TypeScript, no framework.
 *
 * How it works: all UI state lives in `state`. Every change goes through
 * `update()`, which saves what needs saving and redraws the screen with
 * `render()`. Screens are plain functions that return DOM nodes (see dom.ts).
 * The game itself is the session layer: the UI only sends actions to it and
 * shows a player's `playerView`, never the full session.
 *
 * Slice 1 (Phase 2): home, profiles, game setup (lobby), start of the game,
 * a temporary quick deal, and the pass-the-phone screens. Card play comes in
 * slice 2.
 */

import quickRulesMd from '../content/quick-rules.md';
import { jokerCount, MAX_PLAYERS, MIN_PLAYERS } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { createSession } from '../session/session.ts';
import { h } from './dom.ts';
import { afterRender, gameScreen, popupLayer } from './game.ts';
import { renderMarkdown } from './markdown.ts';
import { addProfile, deleteProfile, findProfile, loadGame, loadProfiles, saveProfiles } from './storage.ts';
import { getState, initState, say, update, type SetupSeat, type SetupState, type State } from './store.ts';

const NAME_MAX = 16;
const PAUSE_LIMITS: readonly { label: string; sec: number | null }[] = [
  { label: 'No limit', sec: null },
  { label: '30 seconds', sec: 30 },
  { label: '1 minute', sec: 60 },
  { label: '2 minutes', sec: 120 },
  { label: '5 minutes', sec: 300 },
];

const rng = defaultRng();
let root: HTMLElement;

export function startApp(target: HTMLElement): void {
  root = target;
  const initial: State = {
    screen: 'home',
    profiles: loadProfiles(),
    setup: freshSetup(),
    game: loadGame(),
    rulesOpen: false,
    menuOpen: false,
    armed: null,
    message: null,
    popups: [],
    selected: null,
  };
  initState(initial, render);
  render();
}

function freshSetup(): SetupState {
  return { seats: [], hostIndex: 0, jokers: true, pauseLimit: null };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const st = getState();
  const screen =
    st.screen === 'profiles' ? profilesScreen()
    : st.screen === 'setup' ? setupScreen()
    : st.screen === 'game' && st.game ? gameScreen(st.game)
    : homeScreen();
  const parts: (HTMLElement | null)[] = [
    screen,
    h('button', { class: 'rules-btn', 'aria-label': 'Quick rules', onclick: () => update({ rulesOpen: true }) }, '?'),
    st.screen === 'game' ? popupLayer() : null,
    st.rulesOpen ? rulesOverlay() : null,
    st.message ? h('div', { class: 'toast', role: 'status' }, st.message) : null,
  ];
  root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  afterRender();
}

function rulesOverlay(): HTMLElement {
  const close = (): void => update({ rulesOpen: false });
  return h('div', { class: 'overlay', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Quick rules' },
      h('div', { class: 'sheet-head' },
        h('h2', null, 'Quick rules'),
        h('button', { class: 'ghost', onclick: close }, 'Close'),
      ),
      h('p', { class: 'muted small' }, 'Only on this phone. The game carries on underneath.'),
      renderMarkdown(quickRulesMd, true),
    ),
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function homeScreen(): HTMLElement {
  const g = getState().game;
  return h('main', { class: 'screen home' },
    h('div', { class: 'logo' },
      h('div', { class: 'logo-cards', 'aria-hidden': 'true' },
        h('span', { class: 'mini-card' }, 'A♠'),
        h('span', { class: 'mini-card red' }, 'K♥'),
        h('span', { class: 'mini-card' }, '🃏'),
      ),
      h('h1', null, 'Pubby'),
      h('p', { class: 'tagline' }, 'Get rid of your cards. Don’t be last.'),
    ),
    h('div', { class: 'stack' },
      g ? h('button', { class: 'big', onclick: () => update({ screen: 'game' }) },
        `Carry on game (round ${g.session.round})`) : null,
      h('button', { class: g ? 'big secondary' : 'big', onclick: startSetup }, 'New game'),
      h('button', { class: 'big secondary', onclick: () => update({ screen: 'profiles', armed: null }) },
        `Profiles (${Object.keys(getState().profiles).length})`),
    ),
    h('p', { class: 'muted small center' }, 'Pass-and-play on one phone. Test build: lobby and setup.'),
  );
}

function startSetup(): void {
  if (getState().game) {
    if (getState().armed !== 'newgame') {
      update({ armed: 'newgame' });
      say('A game is in progress. Tap New game again to end it and start a new one.');
      return;
    }
    update({ game: null }, false);
  }
  update({ screen: 'setup', setup: freshSetup(), armed: null });
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** Check a new profile name. Returns a problem, or null if fine. */
function profileNameProblem(name: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Type a name first.';
  if (clean.length > NAME_MAX) return `Names can be up to ${NAME_MAX} letters.`;
  if (findProfile(getState().profiles, clean)) return `There's already a profile called ${findProfile(getState().profiles, clean)}.`;
  return null;
}

function createProfile(name: string): string | null {
  const problem = profileNameProblem(name);
  if (problem) { say(problem); return null; }
  const profiles = addProfile(getState().profiles, name);
  if (!saveProfiles(profiles)) say('Could not save to this phone. Profiles will be lost when the page closes.');
  update({ profiles }, false);
  return name.trim();
}

function profilesScreen(): HTMLElement {
  const names = Object.keys(getState().profiles).sort((a, b) => a.localeCompare(b));
  const input = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'New profile name', 'aria-label': 'New profile name', autocomplete: 'off' });
  const add = (): void => {
    if (createProfile(input.value)) { update({}); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return h('main', { class: 'screen' },
    topBar('Profiles', () => update({ screen: 'home', armed: null })),
    h('p', { class: 'muted' }, 'Each player has a profile on this phone. It keeps their name and their history across games.'),
    h('div', { class: 'row' }, input, h('button', { onclick: add }, 'Add')),
    names.length === 0
      ? h('p', { class: 'empty' }, 'No profiles yet. Add one above, or add players straight from New game.')
      : h('ul', { class: 'list' }, names.map((n) => {
        const p = getState().profiles[n]!;
        const key = `delete:${n}`;
        const armed = getState().armed === key;
        return h('li', { class: 'list-row' },
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, n),
            h('div', { class: 'muted small' },
              p.gamesPlayed === 1 ? '1 game' : `${p.gamesPlayed} games`, ' · ',
              `${p.roundWins} round wins`, ' · ', `${p.points} points`),
          ),
          h('button', {
            class: armed ? 'danger small-btn' : 'ghost small-btn',
            onclick: () => {
              if (!armed) { update({ armed: key }); return; }
              const profiles = deleteProfile(getState().profiles, n);
              saveProfiles(profiles);
              update({ profiles, armed: null });
            },
          }, armed ? 'Tap to delete' : 'Delete'),
        );
      })),
  );
}

// ---------------------------------------------------------------------------
// Setup (lobby)
// ---------------------------------------------------------------------------

function setSetup(change: Partial<SetupState>, redraw = true): void {
  update({ setup: { ...getState().setup, ...change } }, redraw);
}

function seatName(seat: SetupSeat): string {
  return seat.sessionName.trim() || seat.profileName;
}

/** Problems that stop the game starting. */
function setupProblems(s: SetupState): string[] {
  const out: string[] = [];
  if (s.seats.length < MIN_PLAYERS) out.push(`Add at least ${MIN_PLAYERS} players.`);
  const shown = s.seats.map((x) => seatName(x).toLowerCase());
  const dupAt = shown.findIndex((n, i) => shown.indexOf(n) !== i);
  const dupSeat = s.seats[dupAt];
  if (dupSeat) out.push(`Two players are called ${seatName(dupSeat)}. Give one a different name for this game.`);
  return out;
}

function addSeat(profileName: string): void {
  const s = getState().setup;
  if (s.seats.length >= MAX_PLAYERS) { say(`Pubby is for up to ${MAX_PLAYERS} players.`); return; }
  if (s.seats.some((x) => x.profileName === profileName)) return;
  setSetup({ seats: [...s.seats, { profileName, sessionName: '' }] });
}

function moveSeat(i: number, by: -1 | 1): void {
  const seats = [...getState().setup.seats];
  const j = i + by;
  if (j < 0 || j >= seats.length) return;
  [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  let hostIndex = getState().setup.hostIndex;
  if (hostIndex === i) hostIndex = j;
  else if (hostIndex === j) hostIndex = i;
  setSetup({ seats, hostIndex });
}

function removeSeat(i: number): void {
  const seats = getState().setup.seats.filter((_, k) => k !== i);
  let hostIndex = getState().setup.hostIndex;
  if (hostIndex === i) hostIndex = 0;
  else if (hostIndex > i) hostIndex -= 1;
  setSetup({ seats, hostIndex });
}

function setupScreen(): HTMLElement {
  const s = getState().setup;
  const seated = new Set(s.seats.map((x) => x.profileName));
  const free = Object.keys(getState().profiles).filter((n) => !seated.has(n)).sort((a, b) => a.localeCompare(b));
  const full = s.seats.length >= MAX_PLAYERS;
  const problems = setupProblems(s);

  const newInput = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'New player name', 'aria-label': 'New player name', autocomplete: 'off', disabled: full });
  const addNew = (): void => {
    const name = createProfile(newInput.value);
    if (name) addSeat(name);
  };
  newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNew(); });

  const jokers = jokerCount(Math.max(s.seats.length, MIN_PLAYERS), true);

  return h('main', { class: 'screen' },
    topBar('New game', () => update({ screen: 'home' })),

    h('section', { class: 'panel' },
      h('h2', null, 'Players ', h('span', { class: 'count' }, `${s.seats.length} / ${MAX_PLAYERS}`)),
      s.seats.length === 0
        ? h('p', { class: 'empty' }, 'Nobody yet. Add players below.')
        : h('ol', { class: 'seats' }, s.seats.map((seat, i) => seatRow(seat, i))),
      s.seats.length > 1 ? h('p', { class: 'muted small' }, 'Seats go clockwise from the top. Use the arrows to match where people sit.') : null,
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Add players'),
      free.length
        ? h('div', { class: 'chips' }, free.map((n) =>
          h('button', { class: 'chip', disabled: full, onclick: () => addSeat(n) }, '+ ', n)))
        : null,
      h('div', { class: 'row' }, newInput, h('button', { onclick: addNew, disabled: full }, 'Add')),
      h('p', { class: 'muted small' }, 'A new name is saved as a profile on this phone.'),
    ),

    h('section', { class: 'panel' },
      h('h2', null, 'Host options'),
      h('label', { class: 'toggle' },
        h('input', {
          type: 'checkbox', checked: s.jokers,
          onchange: (e) => setSetup({ jokers: (e.target as HTMLInputElement).checked }),
        }),
        h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
        h('span', { class: 'grow' }, 'Joker rule',
          h('span', { class: 'muted small block' },
            s.jokers ? `${jokers} jokers in the deck with ${s.seats.length >= 6 ? '6 to 8' : '2 to 5'} players.` : 'Off: no jokers this game.')),
      ),
      h('label', { class: 'field' },
        h('span', null, 'Pause time limit'),
        h('select', {
          onchange: (e) => {
            const v = (e.target as HTMLSelectElement).value;
            setSetup({ pauseLimit: v === '' ? null : Number(v) });
          },
        }, PAUSE_LIMITS.map((p) =>
          h('option', { value: p.sec === null ? '' : String(p.sec), selected: p.sec === s.pauseLimit }, p.label))),
      ),
    ),

    problems.length && s.seats.length > 0 ? h('p', { class: 'warn' }, problems.join(' ')) : null,
    h('button', { class: 'big sticky', disabled: problems.length > 0, onclick: startGame },
      s.seats.length >= MIN_PLAYERS ? `Start game · ${s.seats.length} players` : 'Start game'),
  );
}

function seatRow(seat: SetupSeat, i: number): HTMLElement {
  const s = getState().setup;
  const isHost = s.hostIndex === i;
  const nameInput = h('input', {
    type: 'text', maxlength: NAME_MAX, value: seat.sessionName,
    placeholder: 'Game name (optional)', 'aria-label': `Name for this game for ${seat.profileName}`, autocomplete: 'off',
  });
  // Typing doesn't redraw (so the keyboard stays open); leaving the box does.
  nameInput.addEventListener('input', () => {
    const seats = s.seats.map((x, k) => (k === i ? { ...x, sessionName: nameInput.value } : x));
    setSetup({ seats }, false);
  });
  nameInput.addEventListener('change', () => render());
  return h('li', { class: 'seat' },
    h('div', { class: 'seat-top' },
      h('span', { class: 'seat-no' }, String(i + 1)),
      h('span', { class: 'grow name' }, seat.profileName),
      h('button', {
        class: isHost ? 'host-btn on' : 'host-btn', 'aria-pressed': isHost ? 'true' : 'false',
        onclick: () => setSetup({ hostIndex: i }),
      }, isHost ? '★ Host' : 'Make host'),
    ),
    h('div', { class: 'seat-bottom' },
      nameInput,
      h('button', { class: 'icon', 'aria-label': 'Move up', disabled: i === 0, onclick: () => moveSeat(i, -1) }, '▲'),
      h('button', { class: 'icon', 'aria-label': 'Move down', disabled: i === s.seats.length - 1, onclick: () => moveSeat(i, 1) }, '▼'),
      h('button', { class: 'icon', 'aria-label': `Remove ${seat.profileName}`, onclick: () => removeSeat(i) }, '✕'),
    ),
  );
}

function startGame(): void {
  const s = getState().setup;
  if (setupProblems(s).length) return;
  const players = s.seats.map((seat, i) => ({
    id: `p${i + 1}`,
    profileName: seat.profileName,
    sessionName: seat.sessionName.trim() || undefined,
  }));
  try {
    const { session } = createSession({
      players,
      hostId: players[s.hostIndex]!.id,
      jokerRuleEnabled: s.jokers,
      pauseTimeLimitSec: s.pauseLimit,
    }, rng);
    update({ game: { session, stage: 'table', holder: session.hostId, trickLog: [], lastTrick: null }, screen: 'game', menuOpen: false, armed: null, popups: [] });
  } catch (e) {
    say(e instanceof Error ? e.message : 'Could not start the game.');
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function topBar(title: string, back: () => void): HTMLElement {
  return h('div', { class: 'top-bar' },
    h('button', { class: 'ghost', onclick: back }, '‹ Back'),
    h('h1', null, title),
  );
}
