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
import { jokerCount, MAX_PLAYERS, MIN_PLAYERS, type Card, type Suit } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { applyAction, createSession } from '../session/session.ts';
import type { PlayerId, Session, SessionAction } from '../session/types.ts';
import { playerView } from '../session/view.ts';
import { h, type Child } from './dom.ts';
import { renderMarkdown } from './markdown.ts';
import {
  addProfile,
  deleteProfile,
  findProfile,
  loadGame,
  loadProfiles,
  saveGame,
  saveProfiles,
  type GameStage,
  type Profiles,
  type SavedGame,
} from './storage.ts';

const NAME_MAX = 16;
const PAUSE_LIMITS: readonly { label: string; sec: number | null }[] = [
  { label: 'No limit', sec: null },
  { label: '30 seconds', sec: 30 },
  { label: '1 minute', sec: 60 },
  { label: '2 minutes', sec: 120 },
  { label: '5 minutes', sec: 300 },
];

interface SetupSeat {
  profileName: string;
  /** Optional name for this game only. Empty means use the profile name. */
  sessionName: string;
}

interface SetupState {
  seats: SetupSeat[];
  hostIndex: number;
  jokers: boolean;
  pauseLimit: number | null;
}

type Screen = 'home' | 'profiles' | 'setup' | 'game';

interface State {
  screen: Screen;
  profiles: Profiles;
  setup: SetupState;
  game: SavedGame | null;
  rulesOpen: boolean;
  menuOpen: boolean;
  /** Something that needs a second tap to confirm (e.g. "delete:Sam"). */
  armed: string | null;
  message: string | null;
}

const rng = defaultRng();
let root: HTMLElement;
let state: State;

export function startApp(target: HTMLElement): void {
  root = target;
  const game = loadGame();
  state = {
    screen: 'home',
    profiles: loadProfiles(),
    setup: freshSetup(),
    game: game && game.session && game.stage && !game.session.ended ? game : null,
    rulesOpen: false,
    menuOpen: false,
    armed: null,
    message: null,
  };
  render();
}

function freshSetup(): SetupState {
  return { seats: [], hostIndex: 0, jokers: true, pauseLimit: null };
}

/** Change state, save the game if it changed, and redraw. */
function update(change: Partial<State>, redraw = true): void {
  const gameChanged = 'game' in change;
  state = { ...state, ...change };
  if (gameChanged) saveGame(state.game);
  if (redraw) render();
}

function say(message: string): void {
  update({ message });
  window.setTimeout(() => {
    if (state.message === message) update({ message: null });
  }, 2600);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const screen =
    state.screen === 'profiles' ? profilesScreen()
    : state.screen === 'setup' ? setupScreen()
    : state.screen === 'game' && state.game ? gameScreen(state.game)
    : homeScreen();
  const parts: (HTMLElement | null)[] = [
    screen,
    h('button', { class: 'rules-btn', 'aria-label': 'Quick rules', onclick: () => update({ rulesOpen: true }) }, '?'),
    state.rulesOpen ? rulesOverlay() : null,
    state.message ? h('div', { class: 'toast', role: 'status' }, state.message) : null,
  ];
  root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
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
  const g = state.game;
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
        `Profiles (${Object.keys(state.profiles).length})`),
    ),
    h('p', { class: 'muted small center' }, 'Pass-and-play on one phone. Test build: lobby and setup.'),
  );
}

function startSetup(): void {
  if (state.game) {
    if (state.armed !== 'newgame') {
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
  if (findProfile(state.profiles, clean)) return `There's already a profile called ${findProfile(state.profiles, clean)}.`;
  return null;
}

function createProfile(name: string): string | null {
  const problem = profileNameProblem(name);
  if (problem) { say(problem); return null; }
  const profiles = addProfile(state.profiles, name);
  if (!saveProfiles(profiles)) say('Could not save to this phone. Profiles will be lost when the page closes.');
  state = { ...state, profiles };
  return name.trim();
}

function profilesScreen(): HTMLElement {
  const names = Object.keys(state.profiles).sort((a, b) => a.localeCompare(b));
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
        const p = state.profiles[n]!;
        const key = `delete:${n}`;
        const armed = state.armed === key;
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
              const profiles = deleteProfile(state.profiles, n);
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
  update({ setup: { ...state.setup, ...change } }, redraw);
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
  const s = state.setup;
  if (s.seats.length >= MAX_PLAYERS) { say(`Pubby is for up to ${MAX_PLAYERS} players.`); return; }
  if (s.seats.some((x) => x.profileName === profileName)) return;
  setSetup({ seats: [...s.seats, { profileName, sessionName: '' }] });
}

function moveSeat(i: number, by: -1 | 1): void {
  const seats = [...state.setup.seats];
  const j = i + by;
  if (j < 0 || j >= seats.length) return;
  [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  let hostIndex = state.setup.hostIndex;
  if (hostIndex === i) hostIndex = j;
  else if (hostIndex === j) hostIndex = i;
  setSetup({ seats, hostIndex });
}

function removeSeat(i: number): void {
  const seats = state.setup.seats.filter((_, k) => k !== i);
  let hostIndex = state.setup.hostIndex;
  if (hostIndex === i) hostIndex = 0;
  else if (hostIndex > i) hostIndex -= 1;
  setSetup({ seats, hostIndex });
}

function setupScreen(): HTMLElement {
  const s = state.setup;
  const seated = new Set(s.seats.map((x) => x.profileName));
  const free = Object.keys(state.profiles).filter((n) => !seated.has(n)).sort((a, b) => a.localeCompare(b));
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
  const s = state.setup;
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
  const s = state.setup;
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
    update({ game: { session, stage: 'start', holder: session.hostId }, screen: 'game', menuOpen: false, armed: null });
  } catch (e) {
    say(e instanceof Error ? e.message : 'Could not start the game.');
  }
}

// ---------------------------------------------------------------------------
// Game (slice 1: start, quick deal, pass the phone)
// ---------------------------------------------------------------------------

function nameOf(s: Session, id: PlayerId): string {
  return s.players.find((p) => p.id === id)?.sessionName ?? id;
}

function nextClockwise(s: Session, id: PlayerId): PlayerId {
  const i = s.order.indexOf(id);
  return s.order[(i + 1) % s.order.length]!;
}

function send(g: SavedGame, actions: readonly SessionAction[], after: { stage: GameStage; holder: PlayerId }): void {
  try {
    let session = g.session;
    for (const a of actions) session = applyAction(session, a, rng).session;
    update({ game: { session, ...after } });
  } catch (e) {
    say(e instanceof Error ? e.message : 'Not allowed.');
  }
}

function gameScreen(g: SavedGame): HTMLElement {
  const body =
    g.stage === 'start' ? startStage(g)
    : g.stage === 'hand' ? handStage(g)
    : handoffStage(g);
  return h('main', { class: 'screen game' },
    h('div', { class: 'game-bar' },
      h('button', { class: 'ghost', onclick: () => update({ menuOpen: !state.menuOpen, armed: null }) }, '☰ Menu'),
      h('span', { class: 'muted' }, `Round ${g.session.round}`),
    ),
    state.menuOpen ? gameMenu() : null,
    body,
  );
}

function gameMenu(): HTMLElement {
  const armed = state.armed === 'endgame';
  return h('div', { class: 'panel menu' },
    h('button', { class: 'secondary', onclick: () => update({ screen: 'home', menuOpen: false }) }, 'Home (game is kept)'),
    h('button', {
      class: armed ? 'danger' : 'secondary',
      onclick: () => {
        if (!armed) { update({ armed: 'endgame' }); return; }
        update({ game: null, screen: 'home', menuOpen: false, armed: null });
      },
    }, armed ? 'Tap again to end the game' : 'End this game'),
  );
}

function startStage(g: SavedGame): HTMLElement {
  const s = g.session;
  const dealer = s.dealer;
  const dealt = s.phase !== 'dealing';
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, s.jokerRuleEnabled ? `🃏 ${s.jokerTotal} jokers this game` : 'No jokers this game'),
      h('div', { class: 'small' }, `${s.order.length} players · Host: ${nameOf(s, s.hostId)}`),
    ),
    h('section', { class: 'panel' },
      h('h2', null, 'Seats (clockwise)'),
      h('ol', { class: 'seat-list' }, s.order.map((id) =>
        h('li', null, nameOf(s, id),
          id === s.hostId ? h('span', { class: 'tag' }, 'Host') : null,
          id === dealer ? h('span', { class: 'tag gold' }, 'Deals') : null))),
    ),
    dealt
      ? h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'handoff', holder: s.hostId } }) }, 'Look at hands')
      : h('section', { class: 'panel' },
        h('h2', null, `${nameOf(s, dealer)} deals`),
        h('p', { class: 'muted' }, 'Tap who gets the first card. Cards go clockwise from them.'),
        h('p', { class: 'note' }, 'Quick deal for this test build. The real dealing screen, with the animation and manual dealing, comes in the next build.'),
        h('div', { class: 'chips' }, s.order.map((id) =>
          h('button', {
            class: 'chip big-chip',
            onclick: () => send(g, [
              { type: 'autoDealStart', by: dealer, firstSeat: id },
              { type: 'autoDealAll', by: dealer },
            ], { stage: 'handoff', holder: s.hostId }),
          }, nameOf(s, id)))),
      ),
  );
}

function handoffStage(g: SavedGame): HTMLElement {
  const s = g.session;
  const who = nameOf(s, g.holder);
  return h('div', { class: 'handoff' },
    h('div', { class: 'handoff-icon', 'aria-hidden': 'true' }, '📱'),
    h('p', { class: 'muted' }, 'Pass the phone to'),
    h('h1', { class: 'handoff-name' }, who),
    h('p', { class: 'muted small' }, 'Everyone else, look away.'),
    h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'hand' } }) }, `I'm ${who}, show my cards`),
    h('button', { class: 'ghost', onclick: () => update({ game: { ...g, stage: 'start' } }) }, 'Back to the seats'),
  );
}

const SUIT_ORDER: readonly Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
const SUIT_SYMBOL: Record<Suit, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function sortHand(cards: readonly Card[]): Card[] {
  const key = (c: Card): number => (c.kind === 'joker' ? -1 : SUIT_ORDER.indexOf(c.suit) * 100 + c.rank);
  return [...cards].sort((a, b) => key(a) - key(b));
}

function cardEl(c: Card): HTMLElement {
  if (c.kind === 'joker') {
    return h('div', { class: 'card joker', 'aria-label': 'Joker' }, h('span', { class: 'rank' }, '🃏'), h('span', { class: 'suit small' }, 'Joker'));
  }
  const red = c.suit === 'hearts' || c.suit === 'diamonds';
  const rank = RANK_LABEL[c.rank] ?? String(c.rank);
  return h('div', { class: red ? 'card red' : 'card', 'aria-label': `${rank} of ${c.suit}` },
    h('span', { class: 'rank' }, rank),
    h('span', { class: 'suit' }, SUIT_SYMBOL[c.suit]));
}

function handStage(g: SavedGame): HTMLElement {
  const s = g.session;
  const view = playerView(s, g.holder);
  const hand = sortHand(view.myHand);
  const next = nextClockwise(s, g.holder);
  const others: Child[] = view.players.filter((p) => p.id !== view.me).map((p) =>
    h('li', null, h('span', { class: 'grow' }, p.sessionName, p.isHost ? h('span', { class: 'tag' }, 'Host') : null), h('span', { class: 'muted' }, `${p.cardCount} cards`)));
  return h('div', { class: 'stack' },
    h('div', { class: 'hand-head' },
      h('h2', null, `${nameOf(s, view.me)}'s cards`),
      h('span', { class: 'count' }, `${hand.length}`),
    ),
    hand.length
      ? h('div', { class: 'hand' }, hand.map((c, i) => {
        const el = cardEl(c);
        el.style.setProperty('--i', String(i));
        return el;
      }))
      : h('p', { class: 'empty' }, 'No cards yet. The dealer hasn’t dealt.'),
    h('section', { class: 'panel' },
      h('h2', null, 'Everyone else'),
      h('ul', { class: 'counts' }, others),
    ),
    h('p', { class: 'note' }, 'Playing cards comes in the next build. For now, hide your cards and pass the phone on.'),
    h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'handoff', holder: next } }) },
      `Hide my cards · pass to ${nameOf(s, next)}`),
  );
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
