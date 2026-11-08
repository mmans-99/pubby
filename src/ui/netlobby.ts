/**
 * Network lobby (Phase 4 slice 1, CODE.md sections 4a and 9i): "Play on
 * several phones" from the main menu. One phone hosts; every other phone
 * joins with two scans (the host's code, then the joining phone's code).
 * Each phone picks its own profile and name. The host sets the seat order,
 * the joker rule and the pause limit, and starts the game.
 *
 * Playing the cards over the network is slice 2. For now Start shows every
 * phone the same "all set" screen, which proves everyone got the same game.
 *
 * Like the connection test, this screen keeps its own element and state, so
 * the camera and the links survive the app's redraws. The lobby itself lives
 * on the host's phone (src/net/lobby.ts); joining phones show what it sends.
 */

import { h } from './dom.ts';
import { icon } from './icons.ts';
import { VERSION } from './version.ts';
import { getState, update } from './store.ts';
import { addProfile, findProfile, saveProfiles } from './storage.ts';
import { makeQr, qrSvg } from '../net/qr.ts';
import { Peer } from '../net/peer.ts';
import { linkKind, lobbyLink } from '../net/signal.ts';
import { canScan, startScanner, type Scanner } from '../net/scan.ts';
import {
  addSeat, cleanName, joinProblem, jokerLine, LOBBY_PROTOCOL, lobbyProblems, moveSeat, NAME_MAX, newLobby,
  readToHost, readToJoiner, removeSeat, renameSeat, seatName, sessionPlayers, setConnected,
  type Lobby, type LobbySeat, type ToJoiner,
} from '../net/lobby.ts';
import { MAX_PLAYERS } from '../rules/cards.ts';
import { createSession } from '../session/session.ts';
import { defaultRng } from '../rules/rng.ts';

type Role = 'host' | 'join';
type Step =
  | 'pick' // host or join
  | 'name' // which profile is this phone
  | 'lobby' // host: the lobby; joiner: what the host sent
  | 'join-scan' | 'join-code' | 'join-wait'
  | 'lost' | 'removed' | 'closed' | 'refused' | 'failed';

/** Host adding one player: show code 1, scan code 2, wait for the link. */
interface Adding {
  peer: Peer;
  id: string;
  code: string;
  stage: 'making' | 'code' | 'scan' | 'connecting' | 'failed';
  failText: string;
}

interface Link {
  peer: Peer;
  lastHeard: number;
  /** Sent its name (hello) and got a seat. */
  seated: boolean;
}

const PAUSE_LIMITS: readonly { label: string; sec: number | null }[] = [
  { label: 'No limit', sec: null },
  { label: '30 seconds', sec: 30 },
  { label: '1 minute', sec: 60 },
  { label: '2 minutes', sec: 120 },
  { label: '5 minutes', sec: 300 },
];

const CONNECT_TIMEOUT_MS = 20000;
const JOIN_WAIT_MS = 120000;
const HELLO_TIMEOUT_MS = 10000;
const PING_EVERY_MS = 2000;
const LOST_AFTER_MS = 20000;

let root: HTMLElement | null = null;
let onBack: () => void = () => undefined;
let role: Role | null = null;
let step: Step = 'pick';
let myProfile = '';

// Host
let lobby: Lobby | null = null;
const links = new Map<string, Link>();
let adding: Adding | null = null;
let nextId = 0;

// Joiner
let peer: Peer | null = null;
let hostHeard = 0;
let myCode = '';
let you = '';
let seen: Lobby | null = null;
/** A host's code from a join link, used once this phone has picked a name. */
let pendingCode: string | null = null;
let endText = '';

// Shared
let scanner: Scanner | null = null;
let video: HTMLVideoElement | null = null;
let scanError = '';
let scanHint = '';
let armed: string | null = null;
let leaveAsk = false;
let handling = false;
let pingTimer: number | undefined;
let connectTimer: number | undefined;
let wakeLock: { release(): Promise<void> } | null = null;
/** The name-for-this-game box. Kept, so redraws don't close the keyboard. */
let nameBox: HTMLInputElement | null = null;
/** A redraw waiting until the name box is left. */
let drawLater = false;

// ---------------------------------------------------------------------------
// Entry points (app.ts)
// ---------------------------------------------------------------------------

/** The screen element. Always the same element, so the camera keeps running. */
export function netLobbyScreen(back: () => void): HTMLElement {
  onBack = back;
  if (!root) {
    root = h('main', { class: 'screen netlobby' });
    exposeTestHook();
    draw();
  }
  return root;
}

/** Leaving the screen: tell the other phones, close every link, start fresh next time. */
export function stopNetLobby(): void {
  if (!root) return;
  reset();
  root = null;
}

/** Opened from the host's "Add player" link (iPhone Camera app): pick a name, then join. */
export function joinLobbyFromLink(text: string): void {
  reset();
  role = 'join';
  pendingCode = text;
  go('name');
}

/**
 * The back gesture on this screen. True = handled here (stay on the screen);
 * false = go back to the main menu (which closes the lobby).
 */
export function netLobbyBack(): boolean {
  if (leaveAsk) { leaveAsk = false; draw(); return true; }
  if (adding) { cancelAdding(); return true; }
  if (step === 'lobby' && othersConnected()) { leaveAsk = true; draw(); return true; }
  if (step === 'name' && !pendingCode) { reset(); draw(); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Reset and helpers
// ---------------------------------------------------------------------------

function reset(): void {
  stopScan();
  clearInterval(pingTimer);
  clearTimeout(connectTimer);
  pingTimer = undefined;
  if (adding) adding.peer.close();
  adding = null;
  for (const l of links.values()) { l.peer.send({ t: 'closed' } satisfies ToJoiner); closeSoon(l.peer); }
  links.clear();
  if (peer) { peer.send({ t: 'leave' }); closeSoon(peer); }
  peer = null;
  lobby = null;
  seen = null;
  you = '';
  myCode = '';
  role = null;
  myProfile = '';
  pendingCode = null;
  endText = '';
  scanError = '';
  scanHint = '';
  armed = null;
  leaveAsk = false;
  nameBox = null;
  drawLater = false;
  releaseWake();
  step = 'pick';
}

/** Close after a moment, so a last message ("closed", "leave") gets out first. */
function closeSoon(p: Peer): void {
  setTimeout(() => p.close(), 300);
}

function go(next: Step): void {
  if (next !== step) { scanHint = ''; scanError = ''; }
  step = next;
  if (step !== 'join-scan' && !(adding && adding.stage === 'scan')) stopScan();
  draw();
}

function othersConnected(): boolean {
  if (role === 'host') return links.size > 0;
  return !!peer?.isOpen;
}

function pageAddress(): string {
  return location.origin + location.pathname;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A short message that doesn't redraw the screen (so typing isn't cut off). */
function flash(msg: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw(): void {
  if (!root) return;
  if (nameBox && document.activeElement === nameBox) { drawLater = true; return; }
  drawLater = false;
  root.replaceChildren(...body().filter((x): x is HTMLElement => x !== null));
}

type View = (HTMLElement | null)[];

function topBar(title: string): HTMLElement {
  return h('div', { class: 'top-bar' },
    h('button', { class: 'ghost', onclick: backTapped }, '‹ Back'),
    h('h1', null, title),
  );
}

function backTapped(): void {
  if (!netLobbyBack()) onBack();
}

function body(): View {
  if (leaveAsk) return leaveView();
  if (role === 'host' && adding) return addingView(adding);
  switch (step) {
    case 'pick': return pickView();
    case 'name': return nameView();
    case 'lobby': return role === 'host' ? hostLobbyView() : joinLobbyView();
    case 'join-scan': return joinScanView();
    case 'join-code': return joinCodeView();
    case 'join-wait': return [topBar('Join a game'), h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, 'Connected'), h('p', { class: 'muted small' }, 'Getting the game from the host…'))];
    case 'lost': return endView('Connection lost', 'This phone lost the link to the host. Rejoining comes in a later update: for now, the host adds you again.');
    case 'removed': return endView('Removed', 'The host took you out of this game.');
    case 'closed': return endView('Game closed', 'The host closed the game.');
    case 'refused': return endView('Couldn’t join', endText);
    case 'failed': return endView('Couldn’t connect', endText);
  }
}

function pickView(): View {
  return [
    topBar('Several phones'),
    h('p', { class: 'muted' }, 'Everyone plays on their own phone. Same Wi-Fi, or everyone on one phone’s hotspot. No internet needed.'),
    h('div', { class: 'stack' },
      h('button', { class: 'big', onclick: () => { role = 'host'; go('name'); } }, icon('crown'), ' Host a game'),
      h('button', { class: 'big secondary', onclick: () => { role = 'join'; go('name'); } }, icon('phone'), ' Join a game'),
    ),
    !canScan() ? h('p', { class: 'note warn' }, 'This browser can’t use the camera, so it can’t scan. Use another phone as the host.') : null,
  ];
}

function nameView(): View {
  const profiles = Object.keys(getState().profiles).sort((a, b) => a.localeCompare(b));
  const input = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'New name', 'aria-label': 'New name', autocomplete: 'off' });
  const addNew = (): void => {
    const name = cleanName(input.value);
    if (!name) { flash('Type a name first.'); return; }
    const existing = findProfile(getState().profiles, name);
    if (!existing) {
      const p = addProfile(getState().profiles, name);
      if (!saveProfiles(p)) flash('Could not save to this phone.');
      update({ profiles: p }, false);
    }
    chooseProfile(existing ?? name);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNew(); });
  return [
    topBar(role === 'host' ? 'Host a game' : 'Join a game'),
    h('section', { class: 'panel' },
      h('h2', null, 'Who’s on this phone?'),
      profiles.length
        ? h('div', { class: 'chips' }, profiles.map((n) => h('button', { class: 'chip big-chip', onclick: () => chooseProfile(n) }, n)))
        : null,
      h('div', { class: 'row' }, input, h('button', { onclick: addNew }, 'Go')),
    ),
  ];
}

function chooseProfile(name: string): void {
  myProfile = name;
  if (role === 'host') {
    lobby = newLobby(name);
    startPings();
    void keepAwake();
    go('lobby');
  } else if (pendingCode) {
    // Read the link's code straight away (no camera): "Reading…" until done.
    const code = pendingCode;
    pendingCode = null;
    step = 'join-scan';
    scanHint = '';
    const reading = onScanned(code);
    draw();
    void reading;
  } else {
    go('join-scan');
  }
}

/** The "Name for this game" box for this phone's own seat. */
function myNameBox(current: string): HTMLInputElement {
  if (!nameBox) {
    const box = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'Name for this game (optional)', 'aria-label': 'Your name for this game', autocomplete: 'off' });
    box.addEventListener('change', () => renameMe(box.value));
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.blur(); });
    box.addEventListener('blur', () => { if (drawLater) setTimeout(draw, 0); });
    nameBox = box;
  }
  if (document.activeElement !== nameBox) nameBox.value = current;
  return nameBox;
}

function renameMe(value: string): void {
  if (role === 'host' && lobby) {
    lobby = renameSeat(lobby, 'host', value);
    broadcast();
    draw();
  } else if (peer) {
    peer.send({ t: 'rename', sessionName: cleanName(value) });
  }
}

function seatTags(seat: LobbySeat, mine: boolean): (HTMLElement | null)[] {
  return [
    seat.isHost ? h('span', { class: 'chip-info gold' }, icon('crown'), ' Host') : null,
    mine ? h('span', { class: 'chip-info' }, 'You') : null,
    seat.connected ? null : h('span', { class: 'chip-info lost' }, 'Lost link'),
  ];
}

function seatSub(seat: LobbySeat): HTMLElement | null {
  return seat.sessionName.trim() && seat.sessionName.trim() !== seat.profileName
    ? h('span', { class: 'muted small block' }, `Profile: ${seat.profileName}`)
    : null;
}

function settingsSummary(l: Lobby): HTMLElement {
  const pause = PAUSE_LIMITS.find((p) => p.sec === l.pauseLimit)?.label ?? `${l.pauseLimit} s`;
  return h('p', { class: 'muted small' }, `${jokerLine(l)} · Pause limit: ${pause}`);
}

// ----- Host -----

function hostLobbyView(): View {
  const l = lobby!;
  if (l.started) return startedView(l, 'host');
  const problems = lobbyProblems(l);
  const waiting = [...links.values()].filter((x) => !x.seated).length;
  const full = l.seats.length >= MAX_PLAYERS;
  const me = l.seats.find((s) => s.isHost)!;
  return [
    topBar('Host a game'),
    h('section', { class: 'panel' },
      h('h2', null, 'Players ', h('span', { class: 'count' }, `${l.seats.length} / ${MAX_PLAYERS}`)),
      h('ol', { class: 'seats' }, l.seats.map((seat, i) => hostSeatRow(seat, i, l.seats.length))),
      waiting ? h('p', { class: 'muted small' }, 'A phone is connecting…') : null,
      l.seats.length > 1 ? h('p', { class: 'muted small' }, 'Seats go clockwise. Use the arrows to match where people sit.') : null,
    ),
    h('button', { class: 'big secondary', disabled: full, onclick: () => { void startAdding(); } },
      icon('phone'), full ? ` Full (${MAX_PLAYERS} players)` : ' Add player'),
    h('section', { class: 'panel' },
      h('h2', null, 'Your name for this game'),
      myNameBox(me.sessionName),
    ),
    h('section', { class: 'panel' },
      h('h2', null, 'Host options'),
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: l.jokers, onchange: (e) => setOption({ jokers: (e.target as HTMLInputElement).checked }) }),
        h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
        h('span', { class: 'grow' }, 'Joker rule', h('span', { class: 'muted small block' }, jokerLine(l))),
      ),
      h('label', { class: 'field' },
        h('span', null, 'Pause time limit'),
        h('select', {
          onchange: (e) => { const v = (e.target as HTMLSelectElement).value; setOption({ pauseLimit: v === '' ? null : Number(v) }); },
        }, PAUSE_LIMITS.map((p) => h('option', { value: p.sec === null ? '' : String(p.sec), selected: p.sec === l.pauseLimit }, p.label))),
      ),
    ),
    problems.length && l.seats.length > 1 ? h('p', { class: 'warn' }, problems.join(' ')) : null,
    h('button', { class: 'big sticky', disabled: problems.length > 0 || waiting > 0, onclick: startGame },
      problems.length ? 'Start game' : `Start game · ${l.seats.length} players`),
  ];
}

function hostSeatRow(seat: LobbySeat, i: number, n: number): HTMLElement {
  const key = `remove:${seat.id}`;
  return h('li', { class: 'seat' },
    h('div', { class: 'seat-top' },
      h('span', { class: 'seat-no' }, String(i + 1)),
      h('span', { class: 'grow name' }, seatName(seat), seatSub(seat)),
      ...seatTags(seat, seat.isHost),
    ),
    h('div', { class: 'seat-bottom' },
      h('span', { class: 'grow' }),
      h('button', { class: 'icon', 'aria-label': `Move ${seatName(seat)} up`, disabled: i === 0, onclick: () => { lobby = moveSeat(lobby!, seat.id, -1); broadcast(); draw(); } }, '▲'),
      h('button', { class: 'icon', 'aria-label': `Move ${seatName(seat)} down`, disabled: i === n - 1, onclick: () => { lobby = moveSeat(lobby!, seat.id, 1); broadcast(); draw(); } }, '▼'),
      seat.isHost ? null : h('button', {
        class: armed === key ? 'danger small-btn' : 'icon',
        'aria-label': `Remove ${seatName(seat)}`,
        onclick: () => {
          if (armed !== key) { armed = key; draw(); return; }
          armed = null;
          kick(seat.id);
        },
      }, armed === key ? 'Remove?' : '✕'),
    ),
  );
}

function setOption(change: Partial<Pick<Lobby, 'jokers' | 'pauseLimit'>>): void {
  lobby = { ...lobby!, ...change };
  broadcast();
  draw();
}

function kick(id: string): void {
  const link = links.get(id);
  const name = lobby?.seats.find((s) => s.id === id);
  if (link) { link.peer.send({ t: 'removed' } satisfies ToJoiner); closeSoon(link.peer); links.delete(id); }
  lobby = removeSeat(lobby!, id);
  if (name) flash(`${seatName(name)} removed`);
  broadcast();
  draw();
}

function broadcast(): void {
  if (!lobby) return;
  for (const [id, l] of links) {
    if (l.seated) l.peer.send({ t: 'lobby', you: id, lobby } satisfies ToJoiner);
  }
}

function startGame(): void {
  const l = lobby!;
  if (lobbyProblems(l).length) return;
  try {
    // Check the session layer accepts these players (the real deal is slice 2).
    const { players, hostId } = sessionPlayers(l);
    createSession({ players, hostId, jokerRuleEnabled: l.jokers, pauseTimeLimitSec: l.pauseLimit }, defaultRng());
  } catch (e) {
    flash(errText(e));
    return;
  }
  lobby = { ...l, started: true };
  // Phones still connecting don't get in (no late joining).
  for (const [id, link] of links) {
    if (!link.seated) { link.peer.send({ t: 'refused', why: 'The game has already started.' } satisfies ToJoiner); closeSoon(link.peer); links.delete(id); }
  }
  broadcast();
  draw();
}

function backToLobby(): void {
  // Phones that dropped after the start leave their seat.
  let l = { ...lobby!, started: false };
  for (const s of l.seats) if (!s.connected) l = removeSeat(l, s.id);
  lobby = l;
  broadcast();
  draw();
}

// ----- Host: adding a player -----

async function startAdding(): Promise<void> {
  if (adding || !lobby || lobby.started) return;
  if (lobby.seats.length + [...links.values()].filter((x) => !x.seated).length >= MAX_PLAYERS) return;
  const id = `c${++nextId}`;
  const p = new Peer('host');
  const a: Adding = { peer: p, id, code: '', stage: 'making', failText: '' };
  adding = a;
  draw();
  // The joining phone sends its name as soon as its side opens, which can
  // arrive before this side's own "open" event: either one moves the link in.
  const promote = (): void => {
    if (adding !== a) return;
    clearTimeout(connectTimer);
    stopScan();
    adding = null;
    const link: Link = { peer: p, lastHeard: performance.now(), seated: false };
    links.set(id, link);
    p.onClose = () => linkLost(id);
    setTimeout(() => {
      if (links.get(id) === link && !link.seated) { links.delete(id); p.close(); flash('That phone didn’t send its name. Add it again.'); draw(); }
    }, HELLO_TIMEOUT_MS);
    draw();
  };
  p.onOpen = promote;
  p.onMessage = (m) => { promote(); hostGot(id, m); };
  p.onClose = () => {
    if (adding === a && a.stage === 'connecting') addFailed('The phones scanned each other but couldn’t link up.');
  };
  try {
    await warmCamera();
    a.code = await p.makeOffer();
    if (adding !== a) return;
    a.stage = 'code';
  } catch (e) {
    if (adding !== a) return;
    a.stage = 'failed';
    a.failText = `This phone couldn’t make a code. ${errText(e)}`;
  }
  draw();
}

function cancelAdding(): void {
  if (!adding) return;
  adding.peer.close();
  adding = null;
  clearTimeout(connectTimer);
  stopScan();
  draw();
}

function addFailed(text: string): void {
  if (!adding) return;
  stopScan();
  clearTimeout(connectTimer);
  adding.peer.close();
  adding.stage = 'failed';
  adding.failText = text;
  draw();
}

function addingView(a: Adding): View {
  const head = topBar('Add player');
  if (a.stage === 'making') return [head, h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, 'Making a code…'))];
  if (a.stage === 'connecting') return [head, h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, 'Connecting…'), h('p', { class: 'muted small' }, 'A few seconds.'))];
  if (a.stage === 'failed') {
    return [
      head,
      h('div', { class: 'panel center' }, h('p', { class: 'net-big bad' }, 'Couldn’t connect'), h('p', null, a.failText)),
      h('p', { class: 'muted small' }, 'Same Wi-Fi or hotspot? Guest Wi-Fi often blocks phones talking to each other.'),
      h('button', { class: 'big', onclick: () => { a.peer.close(); adding = null; void startAdding(); } }, 'Try again'),
      h('button', { class: 'big secondary', onclick: cancelAdding }, 'Cancel'),
    ];
  }
  if (a.stage === 'scan') {
    return [
      head,
      h('p', { class: 'net-big center' }, 'Scan their phone'),
      ...scanBox(),
      h('button', { class: 'big secondary', onclick: () => { stopScan(); a.stage = 'code'; draw(); } }, 'Show my code again'),
    ];
  }
  const content = lobbyLink(pageAddress(), a.code);
  const qr = h('div', { class: 'qr', 'data-code': content });
  qr.innerHTML = qrSvg(makeQr(content, 'M'));
  return [
    head,
    h('ol', { class: 'net-steps' },
      h('li', null, 'On their phone: Play on several phones › Join a game, then scan this.'),
      h('li', null, 'Then tap “Scan their code” here.'),
    ),
    qr,
    h('button', { class: 'big', onclick: () => { a.stage = 'scan'; draw(); } }, 'Scan their code'),
    h('button', { class: 'big secondary', onclick: cancelAdding }, 'Cancel'),
  ];
}

// ----- Host: messages from joining phones -----

function hostGot(id: string, raw: unknown): void {
  const link = links.get(id);
  if (!link || !lobby) return;
  link.lastHeard = performance.now();
  const m = readToHost(raw);
  if (!m) return;
  if (m.t === 'ping') return;
  if (m.t === 'hello') {
    if (link.seated) return;
    const problem = joinProblem(lobby, m, VERSION);
    if (problem) {
      link.peer.send({ t: 'refused', why: problem } satisfies ToJoiner);
      closeSoon(link.peer);
      links.delete(id);
      flash('A phone couldn’t join.');
      draw();
      return;
    }
    link.seated = true;
    lobby = addSeat(lobby, id, m.profileName, m.sessionName);
    const seat = lobby.seats.find((s) => s.id === id)!;
    flash(`${seatName(seat)} joined`);
    broadcast();
    draw();
  } else if (m.t === 'rename') {
    if (!link.seated) return;
    lobby = renameSeat(lobby, id, m.sessionName);
    broadcast();
    draw();
  } else if (m.t === 'leave') {
    const seat = lobby.seats.find((s) => s.id === id);
    links.delete(id);
    closeSoon(link.peer);
    if (lobby.started) lobby = setConnected(lobby, id, false);
    else lobby = removeSeat(lobby, id);
    if (seat) flash(`${seatName(seat)} left`);
    broadcast();
    draw();
  }
}

function linkLost(id: string): void {
  const link = links.get(id);
  if (!link || !lobby) return;
  links.delete(id);
  link.peer.close();
  const seat = lobby.seats.find((s) => s.id === id);
  if (lobby.started) lobby = setConnected(lobby, id, false);
  else lobby = removeSeat(lobby, id);
  if (seat) flash(`${seatName(seat)} lost connection`);
  broadcast();
  draw();
}

// ----- Joiner -----

function joinScanView(): View {
  if (handling && !scanner) return [topBar('Join a game'), h('p', { class: 'net-big center' }, 'Reading the host’s code…')];
  return [
    topBar('Join a game'),
    h('p', { class: 'net-big center' }, 'Scan the host’s code'),
    h('p', { class: 'muted small center' }, 'Host: Add player shows it.'),
    ...scanBox(),
  ];
}

function joinCodeView(): View {
  const qr = h('div', { class: 'qr', 'data-code': myCode });
  qr.innerHTML = qrSvg(makeQr(myCode, 'M'));
  return [
    topBar('Join a game'),
    h('p', { class: 'net-big center' }, 'Now the host scans this'),
    qr,
    h('p', { class: 'muted small center' }, 'Turn the brightness up if it won’t scan.'),
    h('button', { class: 'big secondary', onclick: () => { peer?.close(); peer = null; go('join-scan'); } }, 'Scan again'),
  ];
}

function joinLobbyView(): View {
  const l = seen!;
  if (l.started) return startedView(l, 'join');
  const me = l.seats.find((s) => s.id === you);
  const problems = lobbyProblems(l).filter((p) => !p.startsWith('Add at least'));
  return [
    topBar('Join a game'),
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big ok' }, icon('check'), ' You’re in'),
      h('p', { class: 'muted small' }, 'Waiting for the host to start.'),
    ),
    h('section', { class: 'panel' },
      h('h2', null, 'Players ', h('span', { class: 'count' }, `${l.seats.length} / ${MAX_PLAYERS}`)),
      h('ol', { class: 'seats' }, l.seats.map((seat, i) =>
        h('li', { class: 'seat' },
          h('div', { class: 'seat-top' },
            h('span', { class: 'seat-no' }, String(i + 1)),
            h('span', { class: 'grow name' }, seatName(seat), seatSub(seat)),
            ...seatTags(seat, seat.id === you),
          ),
        ))),
      settingsSummary(l),
    ),
    h('section', { class: 'panel' },
      h('h2', null, 'Your name for this game'),
      myNameBox(me?.sessionName ?? ''),
    ),
    problems.length ? h('p', { class: 'warn' }, problems.join(' ')) : null,
    h('button', { class: 'big secondary', onclick: () => { leaveAsk = true; draw(); } }, 'Leave'),
  ];
}

function startedView(l: Lobby, as: Role): View {
  const meId = as === 'host' ? 'host' : you;
  return [
    topBar(as === 'host' ? 'Host a game' : 'Join a game'),
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big ok' }, icon('check'), ` All set · ${l.seats.length} players`),
      h('p', { class: 'muted small' }, 'Every phone shows this same list.'),
    ),
    h('section', { class: 'panel' },
      h('ol', { class: 'seats' }, l.seats.map((seat, i) =>
        h('li', { class: 'seat' },
          h('div', { class: 'seat-top' },
            h('span', { class: 'seat-no' }, String(i + 1)),
            h('span', { class: 'grow name' }, seatName(seat)),
            ...seatTags(seat, seat.id === meId),
          ),
        ))),
      settingsSummary(l),
    ),
    h('p', { class: 'note' }, 'Test build: dealing to every phone comes in the next update.'),
    as === 'host'
      ? h('button', { class: 'big secondary', onclick: backToLobby }, 'Back to the lobby')
      : null,
    h('button', { class: 'big secondary', onclick: () => { if (othersConnected()) { leaveAsk = true; draw(); } else onBack(); } }, as === 'host' ? 'Close the game' : 'Leave'),
  ];
}

function newJoinPeer(): Peer {
  const p = new Peer('join');
  p.onOpen = () => {
    if (peer !== p) return;
    clearTimeout(connectTimer);
    hostHeard = performance.now();
    p.send({ t: 'hello', protocol: LOBBY_PROTOCOL, version: VERSION, profileName: myProfile, sessionName: '' });
    startPings();
    void keepAwake();
    go('join-wait');
  };
  p.onMessage = (raw) => { if (peer === p) joinGot(raw); };
  p.onClose = () => {
    if (peer !== p) return;
    if (step === 'lobby' || step === 'join-wait') lost();
    else if (step === 'join-code') joinFail('The phones scanned each other but couldn’t link up.');
  };
  return p;
}

function joinGot(raw: unknown): void {
  hostHeard = performance.now();
  const m = readToJoiner(raw);
  if (!m || m.t === 'ping') return;
  if (m.t === 'lobby') {
    seen = m.lobby;
    you = m.you;
    if (step !== 'lobby') go('lobby'); else draw();
  } else if (m.t === 'refused') {
    endText = m.why;
    endJoin('refused');
  } else if (m.t === 'removed') {
    endJoin('removed');
  } else if (m.t === 'closed') {
    endJoin('closed');
  }
}

function endJoin(next: Step): void {
  clearInterval(pingTimer);
  pingTimer = undefined;
  const p = peer;
  peer = null;
  p?.close();
  releaseWake();
  leaveAsk = false;
  go(next);
}

function lost(): void {
  endJoin('lost');
}

function joinFail(text: string): void {
  endText = text;
  endJoin('failed');
}

function endView(title: string, text: string): View {
  return [
    topBar('Join a game'),
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big bad' }, title),
      text ? h('p', null, text) : null,
    ),
    h('button', { class: 'big', onclick: () => { const name = myProfile; reset(); role = 'join'; if (name) chooseProfile(name); else go('name'); } }, 'Join again'),
    h('button', { class: 'big secondary', onclick: () => onBack() }, 'Main menu'),
  ];
}

function leaveView(): View {
  const host = role === 'host';
  return [
    topBar(host ? 'Host a game' : 'Join a game'),
    h('div', { class: 'panel center' },
      h('h2', null, host ? 'Close the game?' : 'Leave the game?'),
      h('p', { class: 'muted small' }, host ? 'Every phone leaves the lobby.' : 'The host can add you again.'),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'big secondary grow', onclick: () => { leaveAsk = false; draw(); } }, 'Stay'),
      h('button', { class: 'big grow', onclick: () => { leaveAsk = false; onBack(); } }, host ? 'Close' : 'Leave'),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Scanning (host scans code 2, joiner scans code 1)
// ---------------------------------------------------------------------------

function scanBox(): HTMLElement[] {
  if (!video) video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  if (!scanner && !scanError) {
    scanner = startScanner(video, (text) => { void onScanned(text); }, (msg) => { scanError = msg; stopScan(); draw(); });
  }
  return [
    h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame', 'aria-hidden': 'true' })),
    ...(scanHint ? [h('p', { class: 'note warn scan-hint' }, scanHint)] : []),
    scanError ? h('p', { class: 'note warn' }, scanError) : h('p', { class: 'muted small center' }, 'Hold the code inside the box.'),
    ...(scanError ? [h('button', { class: 'big', onclick: () => { scanError = ''; draw(); } }, 'Try the camera again')] : []),
  ];
}

async function onScanned(text: string): Promise<void> {
  if (handling) return;
  const hostScanning = role === 'host' && adding?.stage === 'scan';
  if (!hostScanning && !(role === 'join' && step === 'join-scan')) return;
  handling = true;
  try {
    if (hostScanning) {
      const a = adding!;
      await a.peer.acceptAnswer(text);
      stopScan();
      a.stage = 'connecting';
      draw();
      clearTimeout(connectTimer);
      connectTimer = window.setTimeout(() => {
        if (adding === a && a.stage === 'connecting') addFailed('The phones scanned each other but couldn’t link up.');
      }, CONNECT_TIMEOUT_MS);
    } else {
      if (linkKind(text) === 'join') throw new Error('That’s a connection test code. Scan the code from the host’s Add player.');
      const p = newJoinPeer();
      peer = p;
      try {
        myCode = await p.answerOffer(text);
      } catch (e) {
        p.close();
        if (peer === p) peer = null;
        throw e;
      }
      stopScan();
      go('join-code');
      clearTimeout(connectTimer);
      connectTimer = window.setTimeout(() => {
        if (peer === p && step === 'join-code') joinFail('The host didn’t connect in time.');
      }, JOIN_WAIT_MS);
    }
  } catch (e) {
    scanHint = errText(e);
    draw();
  } finally {
    handling = false;
  }
}

function stopScan(): void {
  scanner?.stop();
  scanner = null;
}

async function warmCamera(): Promise<void> {
  // With the camera allowed, Chrome puts the real local address in the code
  // (not a hidden name), which other phones find more easily (section 4a).
  if (!canScan()) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    s.getTracks().forEach((t) => t.stop());
  } catch {
    // Refused: the code still works.
  }
}

// ---------------------------------------------------------------------------
// Keep-alive: pings both ways; a phone silent for 20 seconds is gone
// ---------------------------------------------------------------------------

function startPings(): void {
  clearInterval(pingTimer);
  pingTimer = window.setInterval(() => {
    const now = performance.now();
    if (role === 'host') {
      for (const [id, l] of links) {
        if (now - l.lastHeard > LOST_AFTER_MS) linkLost(id);
        else l.peer.send({ t: 'ping' } satisfies ToJoiner);
      }
    } else if (peer?.isOpen) {
      if (now - hostHeard > LOST_AFTER_MS) lost();
      else peer.send({ t: 'ping' });
    }
  }, PING_EVERY_MS);
}

async function keepAwake(): Promise<void> {
  const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
  if (!wl || wakeLock) return;
  try { wakeLock = await wl.request('screen'); } catch { /* not allowed; fine */ }
}

function releaseWake(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && root && (lobby || peer)) { wakeLock = null; void keepAwake(); }
});

// ---------------------------------------------------------------------------
// Automated test hook (testbed/lobby_check.py): feed a scanned code without a camera
// ---------------------------------------------------------------------------

function exposeTestHook(): void {
  (window as unknown as Record<string, unknown>)['pubbyLobby'] = {
    scan: (text: string) => onScanned(text),
    step: () => step,
    role: () => role,
    adding: () => adding?.stage ?? null,
    lobby: () => (role === 'host' ? lobby : seen),
    you: () => (role === 'host' ? 'host' : you),
  };
}
