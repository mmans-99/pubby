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
import { setHostSkipping } from '../ai/fastforward.ts';
import { addProfile, findProfile, saveProfiles } from './storage.ts';
import { makeQr, qrSvg } from '../net/qr.ts';
import { Peer } from '../net/peer.ts';
import type { Link } from '../net/link.ts';
import { HostRoom, createRoom, joinRoom, joinSocket, watchRooms, type OnlineLink, type RoomInfo } from '../net/online.ts';
import { AWAY_MS, PASSCODE_RE, ROOM_ID_RE, ROOM_NAME_MAX } from '../net/relayproto.ts';
import { setAwayPlayers } from '../net/away.ts';
import { BOT_NAME_MAX, botNamesProblem, pickNames } from '../ai/names.ts';
import { randomPersona, type Level, type Personality, type Speed } from '../ai/persona.ts';
import type { BotsInfo } from './storage.ts';
import { roomFormView, roomListView, roomPassView } from './online.ts';
import { lobbyLink } from '../net/signal.ts';
import { canScan, startScanner, type Scanner } from '../net/scan.ts';
import {
  addSeat, cleanName, joinProblem, jokerLine, LOBBY_PROTOCOL, lobbyProblems, moveSeat, NAME_MAX, newLobby,
  readToHost, readToJoiner, removeSeat, renameSeat, seatName, sessionPlayers, setConnected, setReady, waitingText,
  setAway, setBack, isAway, addBot, setBotLevel, nextBotId,
  type Lobby, type LobbySeat, type ToHost, type ToJoiner,
} from '../net/lobby.ts';
import { MAX_PLAYERS } from '../rules/cards.ts';
import { createSession } from '../session/session.ts';
import { defaultRng } from '../rules/rng.ts';
import { hostLine } from './netscreens.ts';
import { hostGotAct, hostGotReact, hostGotSay, hostStart, hostSync, inNetGame, joinEnded, joinGotGame, joinGotReact, joinGotSay, joinNope, netChanged, setTransport } from './netplay.ts';

type Role = 'host' | 'join';
type Step =
  | 'mode' // Online or Nearby (first screen)
  | 'pick' // host or join (Nearby, or Online after the mode)
  | 'name' // which profile is this phone
  | 'lobby' // host: the lobby; joiner: what the host sent
  | 'join-scan' | 'join-code' | 'join-wait'
  | 'room-form' | 'room-list' | 'room-pass' | 'room-wait' | 'room-lost' // online rooms
  | 'lost' | 'removed' | 'closed' | 'refused' | 'failed';

/** Host adding one player: show code 1, scan code 2, wait for the link. */
interface Adding {
  peer: Peer;
  id: string;
  code: string;
  stage: 'making' | 'code' | 'scan' | 'connecting' | 'failed';
  failText: string;
}

/** A phone in the host's room. The link is a Peer (Nearby) or an OnlineLink. */
interface HostLink {
  peer: Link;
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
const HELLO_RESEND_MS = 1000;
const PING_EVERY_MS = 2000;
const LOST_AFTER_MS = 20000;

let root: HTMLElement | null = null;
let onBack: () => void = () => undefined;
let role: Role | null = null;
let step: Step = 'mode';
let myProfile = '';
/** Nearby (QR codes) or Online (rooms through the server); chosen on the first screen. */
let mode: 'nearby' | 'online' | null = null;
let modeNote = '';

// Host
let lobby: Lobby | null = null;
const links = new Map<string, HostLink>();
let adding: Adding | null = null;
let nextId = 0;
/** Online: the room this phone hosts. */
let hostRoom: HostRoom | null = null;

// Online rooms (host's form, the room list, the passcode)
let roomId = '';
let roomName = '';
let roomCode = '';
let roomFormError = '';
let rooms: RoomInfo[] = [];
let roomsLoaded = false;
let roomsProblem = '';
let stopRooms: (() => void) | null = null;
let roomPick: { roomId: string; name: string } | null = null;
let roomPass = '';
let roomPassError = '';
let joiningRoom = false;

// Joiner
let peer: Link | null = null;
let hostHeard = 0;
/** CODE.md 9u A2/A3/A5: the host's phone is redialling (host side); this phone's link is away (joining side). */
let hostAway = false;
let joinAway: 'self' | 'host' | null = null;
let hostAwayAt = 0;
let visibilityWatched = false;
let myCode = '';
let you = '';
let seen: Lobby | null = null;
/** Phase 4d: this join has sent "ready" (reset for each new connection). */
let readySent = false;
/** A host's code from a join link, used once this phone has picked a name. */
let pendingCode: string | null = null;
/** A room id from an invite link (#room=…), used once this phone has picked a name. */
let pendingRoom: string | null = null;
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
let helloTimer: number | undefined;
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
  watchVisibility();
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
  mode = 'nearby';
  role = 'join';
  pendingCode = text;
  go('name');
}

/** Opened from an invite link (#room=…): pick a name, then the passcode of that room. */
export function joinRoomFromLink(id: string): void {
  reset();
  if (!ROOM_ID_RE.test(id)) return;
  mode = 'online';
  role = 'join';
  pendingRoom = id;
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
  if (step === 'name' && !pendingCode && !pendingRoom) { reset(); draw(); return true; }
  if (step === 'pick') { go('mode'); return true; }
  if (step === 'room-form' || step === 'room-list') { go('pick'); return true; }
  if (step === 'room-pass') { go('room-list'); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Reset and helpers
// ---------------------------------------------------------------------------

function reset(): void {
  hostAway = false;
  joinAway = null;
  stopScan();
  stopList();
  clearInterval(pingTimer);
  clearInterval(helloTimer);
  clearTimeout(connectTimer);
  pingTimer = undefined;
  if (adding) adding.peer.close();
  adding = null;
  for (const l of links.values()) {
    // Online phones are told by the room itself (hostRoom.close below).
    if (!l.peer.keepsAlive) { l.peer.send({ t: 'closed' } satisfies ToJoiner); closeSoon(l.peer); }
  }
  links.clear();
  hostRoom?.close();
  hostRoom = null;
  if (peer) { peer.send({ t: 'leave' }); closeSoon(peer); }
  peer = null;
  lobby = null;
  seen = null;
  you = '';
  myCode = '';
  role = null;
  mode = null;
  modeNote = '';
  myProfile = '';
  pendingCode = null;
  pendingRoom = null;
  roomId = '';
  roomFormError = '';
  roomPick = null;
  roomPass = '';
  roomPassError = '';
  joiningRoom = false;
  endText = '';
  scanError = '';
  scanHint = '';
  armed = null;
  leaveAsk = false;
  nameBox = null;
  drawLater = false;
  releaseWake();
  step = 'mode';
}

/** Close after a moment, so a last message ("closed", "leave") gets out first. */
function closeSoon(p: Link): void {
  setTimeout(() => p.close(), 300);
}

function go(next: Step): void {
  if (next !== step) { scanHint = ''; scanError = ''; }
  step = next;
  if (step !== 'join-scan' && !(adding && adding.stage === 'scan')) stopScan();
  if (step !== 'room-list' && step !== 'room-pass') stopList();
  // The list also runs on the passcode screen, so an invite shows the room’s name when it arrives.
  if ((step === 'room-list' || step === 'room-pass') && !stopRooms) startList();
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
// Network game (slice 2): the game uses these links once the host starts
// ---------------------------------------------------------------------------

setTransport({
  sendTo: (linkId, msg) => links.get(linkId)?.peer.send(msg) ?? false,
  sendHost: (msg) => peer?.send(msg) ?? false,
});

/** The seats as this phone knows them (connected or not), for the game's connection notice. */
export function netSeats(): LobbySeat[] | null {
  return (role === 'host' ? lobby : seen)?.seats ?? null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw(): void {
  if (!root) return;
  syncAway();
  if (nameBox && document.activeElement === nameBox) { drawLater = true; return; }
  drawLater = false;
  // 2.20: keep the scroll place; a rebuild under the finger sent the page up.
  const y = window.scrollY;
  root.replaceChildren(...body().filter((x): x is HTMLElement => x !== null));
  if (window.scrollY !== y) window.scrollTo(0, y);
}

type View = (HTMLElement | null)[];

/** The table's "Away" tags (CODE.md 9u A5). Player ids follow seat order (sessionPlayers: p1, p2…). */
function syncAway(): void {
  const l = role === 'host' ? lobby : seen;
  setAwayPlayers((l?.seats ?? []).flatMap((s, i) => (s.awaySince !== undefined && !s.isHost ? [`p${i + 1}`] : [])));
}

/** A phone tells the host it left the screen (and is back), and the host's phone tells its phones (CODE.md 9u A5). Best effort. */
function watchVisibility(): void {
  if (visibilityWatched) return;
  visibilityWatched = true;
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (role === 'join') {
      if (peer?.isOpen) peer.send(({ t: hidden ? 'away' : 'back' }) satisfies ToHost);
    } else if (role === 'host') {
      for (const l of links.values()) if (l.seated) l.peer.send(({ t: hidden ? 'hostAway' : 'hostBack' }) satisfies ToJoiner);
    }
  });
}

/** The banner while a link is away (CODE.md 9u A3). */
function awayNote(): HTMLElement | null {
  if (joinAway === 'self') return h('p', { class: 'note warn', role: 'status' }, 'Reconnecting… your place is kept.');
  if (joinAway === 'host') return h('p', { class: 'note warn', role: 'status' }, 'The host stepped away. Waiting for them to come back.');
  return null;
}

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
    case 'mode': return modeView();
    case 'pick': return pickView();
    case 'room-form': return roomFormView(topBar('Host a room'), {
      name: roomName, code: roomCode, error: roomFormError, maxName: ROOM_NAME_MAX,
      onName: (v) => { roomName = v; },
      onCode: (v) => { roomCode = v.replace(/\D/g, '').slice(0, 4); },
      onNewCode: () => { roomCode = randomCode(); draw(); },
      onMake: () => { void makeRoom(); },
    });
    case 'room-list': return roomListView(topBar('Join a room'), {
      rooms, loaded: roomsLoaded, problem: roomsProblem, version: VERSION,
      onPick: (r) => { roomPick = { roomId: r.roomId, name: r.name }; roomPass = ''; roomPassError = ''; go('room-pass'); },
    });
    case 'room-pass': return roomPassView(topBar('Join a room'), {
      name: rooms.find((r) => r.roomId === roomPick?.roomId)?.name ?? roomPick?.name ?? '',
      value: roomPass, error: roomPassError,
      onInput: (v) => { roomPass = v.replace(/\D/g, '').slice(0, 4); },
      onJoin: () => { void joinRoomNow(); },
    });
    case 'room-wait': return [topBar(role === 'host' ? 'Host a room' : 'Join a room'), h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, role === 'host' ? 'Making the room…' : 'Joining the room…'), h('p', { class: 'muted small' }, 'A few seconds.'))];
    case 'room-lost': return roomLostView();
    case 'name': return nameView();
    case 'lobby': return role === 'host' ? hostLobbyView() : joinLobbyView();
    case 'join-scan': return joinScanView();
    case 'join-code': return joinCodeView();
    case 'join-wait': return [topBar('Join a game'), h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, 'Connected'), h('p', { class: 'muted small' }, 'Getting the game from the host…'))];
    case 'lost': return endView('Connection lost', 'This phone lost the link to the host. Rejoining a game comes in a later update: for now, the host starts again and adds you.');
    case 'removed': return endView('Removed', 'The host took you out of this game.');
    case 'closed': return endView('Game closed', 'The host closed the game.');
    case 'refused': return endView('Couldn’t join', endText);
    case 'failed': return endView('Couldn’t connect', endText);
  }
}

function modeView(): View {
  return [
    topBar('Several phones'),
    h('p', { class: 'muted' }, 'Everyone plays on their own phone. Online works anywhere there is internet. Nearby needs no internet: the same Wi-Fi, or one phone’s hotspot.'),
    h('div', { class: 'stack' },
      h('button', { class: 'big', onclick: () => chooseMode('online') }, icon('share'), ' Online', h('span', { class: 'muted small block' }, 'Anywhere, needs internet')),
      h('button', { class: 'big secondary', onclick: () => chooseMode('nearby') }, icon('phone'), ' Nearby', h('span', { class: 'muted small block' }, 'Same room, scan QR codes. No internet.')),
    ),
    modeNote ? h('p', { class: 'note warn' }, modeNote) : null,
  ];
}

function chooseMode(m: 'nearby' | 'online'): void {
  if (m === 'online' && navigator.onLine === false) {
    modeNote = 'You’re offline. Play Nearby, or connect to the internet.';
    draw();
    return;
  }
  modeNote = '';
  mode = m;
  go('pick');
}

function pickView(): View {
  if (mode === 'online') {
    return [
      topBar('Online'),
      h('p', { class: 'muted' }, 'Host a room and share the invite, or join a room from the list. Each room has a 4-digit passcode.'),
      h('div', { class: 'stack' },
        h('button', { class: 'big', onclick: () => { role = 'host'; go('name'); } }, icon('crown'), ' Host a room'),
        h('button', { class: 'big secondary', onclick: () => { role = 'join'; go('name'); } }, icon('phone'), ' Join a room'),
      ),
    ];
  }
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
    topBar(mode === 'online' ? (role === 'host' ? 'Host a room' : 'Join a room') : (role === 'host' ? 'Host a game' : 'Join a game')),
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
  if (mode === 'online' && role === 'host') {
    roomName = `${name}’s table`.slice(0, ROOM_NAME_MAX);
    roomCode = randomCode();
    roomFormError = '';
    go('room-form');
  } else if (mode === 'online') {
    if (pendingRoom) {
      roomPick = { roomId: pendingRoom, name: '' };
      pendingRoom = null;
      roomPass = '';
      roomPassError = '';
      go('room-pass');
    } else {
      go('room-list');
    }
  } else if (role === 'host') {
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
    // CODE.md 9u A5: an away seat is kept for 10 minutes, with the time left.
    seat.awaySince !== undefined ? h('span', { class: 'chip-info' }, `Away ${awayLeft(seat.awaySince)}`)
      : seat.connected ? null : h('span', { class: 'chip-info lost' }, 'Lost link'),
    // CODE.md 9u C2: a computer player shows its level (no controls on other phones).
    seat.bot ? h('span', { class: 'chip-info' }, icon('bot'), ` ${BOT_LEVEL_LABEL[seat.bot.level]}`) : null,
  ];
}

const BOT_LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const BOT_LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' },
];
const BOT_SPEEDS: readonly { value: Speed; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' },
];

/** "4:12": the time left before an away seat is removed (the host's clock time, shown on this phone). */
function awayLeft(since: number): string {
  const s = Math.max(0, Math.ceil((AWAY_MS - (Date.now() - since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function seatSub(seat: LobbySeat): HTMLElement | null {
  return seat.sessionName.trim() && seat.sessionName.trim() !== seat.profileName
    ? h('span', { class: 'muted small block' }, `Profile: ${seat.profileName}`)
    : null;
}

function settingsSummary(l: Lobby): HTMLElement {
  const pause = PAUSE_LIMITS.find((p) => p.sec === l.pauseLimit)?.label ?? `${l.pauseLimit} s`;
  const bots = l.seats.some((s) => s.bot)
    ? ` · Computer speed: ${BOT_SPEEDS.find((o) => o.value === (l.botSpeed ?? 'normal'))?.label ?? 'Normal'} · Computer reactions ${l.botReactions === false ? 'off' : 'on'}`
    : '';
  return h('p', { class: 'muted small' }, `${jokerLine(l)} · Pause limit: ${pause}${bots}`);
}

// ----- Host -----

function hostLobbyView(): View {
  const l = lobby!;
  if (l.started) return startedView(l, 'host');
  const problems = lobbyProblems(l);
  const waiting = [...links.values()].filter((x) => !x.seated).length;
  const missing = waitingText(l);
  const full = l.seats.length >= MAX_PLAYERS;
  const me = l.seats.find((s) => s.isHost)!;
  const online = mode === 'online';
  return [
    topBar(online ? 'Host a room' : 'Host a game'),
    online ? roomCard() : null,
    hostAway ? h('p', { class: 'note warn', role: 'status' }, 'Reconnecting… your room is kept.') : null,
    h('section', { class: 'panel' },
      h('h2', null, 'Players ', h('span', { class: 'count' }, `${l.seats.length} / ${MAX_PLAYERS}`)),
      h('ol', { class: 'seats' }, l.seats.map((seat, i) => (seat.bot ? botSeatRow(seat, i, l.seats.length) : hostSeatRow(seat, i, l.seats.length)))),
      waiting ? h('p', { class: 'muted small' }, 'A phone is connecting…') : null,
      missing ? h('p', { class: 'warn' }, missing) : null,
      online && !full ? h('p', { class: 'muted small' }, `Waiting for players… ${l.seats.length} of ${MAX_PLAYERS}`) : null,
      l.seats.length > 1 ? h('p', { class: 'muted small' }, 'Seats go clockwise. Use the arrows to match where people sit.') : null,
    ),
    online
      ? h('button', { class: 'big secondary', onclick: shareInvite }, icon('share'), ' Share invite')
      : h('button', { class: 'big secondary', disabled: full, onclick: () => { void startAdding(); } },
          icon('phone'), full ? ` Full (${MAX_PLAYERS} players)` : ' Add player'),
    // CODE.md 9u C2: a computer player can be added before Start (up to 8 seats), on any host screen.
    !l.started ? h('button', { class: 'big secondary', disabled: full, onclick: addComputer }, icon('bot'), full ? ' Table is full' : ' Add computer player') : null,
    h('section', { class: 'panel' },
      h('h2', null, 'Your name for this game'),
      myNameBox(me.sessionName),
    ),
    l.seats.some((s) => s.bot) ? botOptionsPanel(l) : null,
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
    h('button', { class: 'big sticky', disabled: problems.length > 0 || waiting > 0 || missing !== null || hostAway, onclick: startGame },
      problems.length ? 'Start game' : missing ? missing : `Start game · ${l.seats.length} players`),
  ];
}

/** The room’s name and passcode, at the top of the lobby (online). */
function roomCard(): HTMLElement {
  return h('section', { class: 'panel room-card' },
    h('p', { class: 'room-title' }, roomName),
    h('p', { class: 'muted small' }, 'Passcode'),
    h('p', { class: 'room-code', 'aria-label': `Passcode ${roomCode.split('').join(' ')}` }, roomCode),
  );
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

/** CODE.md 9u C2: the host adds a Normal computer player at the end, with a new name. No dialog. */
function addComputer(): void {
  const l = lobby;
  if (!l || l.started || l.seats.length >= MAX_PLAYERS) return;
  const [name] = pickNames(1, l.seats.map(seatName), defaultRng());
  lobby = addBot(l, nextBotId(l), name ?? 'Computer', 'normal');
  broadcast();
  draw();
}

/** Removing a computer player doesn't ask first (CODE.md 9u C2). */
function removeComputer(id: string): void {
  lobby = removeSeat(lobby!, id);
  broadcast();
  draw();
}

/** A computer player's new name: different from every other seat, up to BOT_NAME_MAX letters. */
function renameComputer(id: string, value: string): void {
  const l = lobby!;
  const name = cleanName(value);
  const problem = botNamesProblem([...l.seats.filter((s) => s.id !== id).map(seatName), name], null);
  if (problem) { flash(problem); draw(); return; }
  lobby = renameSeat(l, id, name);
  broadcast();
  draw();
}

/** A computer player's row: its name, the three levels, move and remove. */
function botSeatRow(seat: LobbySeat, i: number, n: number): HTMLElement {
  const name = seatName(seat);
  const level = seat.bot?.level ?? 'normal';
  return h('li', { class: 'seat bot-seat' },
    h('div', { class: 'seat-top' },
      h('span', { class: 'seat-no' }, String(i + 1)),
      icon('bot'),
      h('input', {
        type: 'text', class: 'bot-name', maxlength: BOT_NAME_MAX, value: name, autocomplete: 'off',
        'aria-label': `Name of computer player ${name}`,
        onchange: (e: Event) => renameComputer(seat.id, (e.target as HTMLInputElement).value),
      }),
      h('button', { class: 'icon', 'aria-label': `Move ${name} up`, disabled: i === 0, onclick: () => { lobby = moveSeat(lobby!, seat.id, -1); broadcast(); draw(); } }, '▲'),
      h('button', { class: 'icon', 'aria-label': `Move ${name} down`, disabled: i === n - 1, onclick: () => { lobby = moveSeat(lobby!, seat.id, 1); broadcast(); draw(); } }, '▼'),
      h('button', { class: 'icon', 'aria-label': `Remove ${name}`, onclick: () => removeComputer(seat.id) }, '✕'),
    ),
    h('div', { class: 'seg', role: 'group', 'aria-label': `Level of ${name}` }, BOT_LEVELS.map((o) =>
      h('button', {
        class: level === o.value ? 'seg-btn on' : 'seg-btn',
        'aria-pressed': level === o.value ? 'true' : 'false',
        onclick: () => { lobby = setBotLevel(lobby!, seat.id, o.value); broadcast(); draw(); },
      }, o.label))),
  );
}

/** Speed and reactions for the computer players (shown only when one is seated). */
function botOptionsPanel(l: Lobby): HTMLElement {
  const speed = l.botSpeed ?? 'normal';
  return h('section', { class: 'panel' },
    h('h2', null, 'Computer players'),
    h('p', { class: 'muted small' }, 'Computer speed'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Computer speed' }, BOT_SPEEDS.map((o) =>
      h('button', {
        class: speed === o.value ? 'seg-btn on' : 'seg-btn',
        'aria-pressed': speed === o.value ? 'true' : 'false',
        onclick: () => setBotOption({ botSpeed: o.value }),
      }, o.label))),
    h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: l.botReactions !== false, onchange: (e) => setBotOption({ botReactions: (e.target as HTMLInputElement).checked }) }),
      h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
      h('span', { class: 'grow' }, 'Reactions from the computer players')),
  );
}

function setBotOption(change: Partial<Pick<Lobby, 'botSpeed' | 'botReactions'>>): void {
  lobby = { ...lobby!, ...change };
  broadcast();
  draw();
}

/** CODE.md 9u C3: the computer players of a game, with a personality each. They live on this phone only. */
function botsForGame(l: Lobby): BotsInfo | undefined {
  const seats: Record<string, { level: Level; personality: Personality }> = {};
  l.seats.forEach((s, i) => {
    if (s.bot) seats[`p${i + 1}`] = { level: s.bot.level, personality: randomPersona(s.bot.level, defaultRng()).personality };
  });
  if (Object.keys(seats).length === 0) return undefined;
  return { seats, speed: l.botSpeed ?? 'normal', reactions: l.botReactions !== false };
}

function setOption(change: Partial<Pick<Lobby, 'jokers' | 'pauseLimit'>>): void {
  lobby = { ...lobby!, ...change };
  broadcast();
  draw();
}

function kick(id: string): void {
  const link = links.get(id);
  const name = lobby?.seats.find((s) => s.id === id);
  if (link) { link.peer.send({ t: 'removed' } satisfies ToJoiner); dropLink(id, link); }
  lobby = removeSeat(lobby!, id);
  if (name) flash(`${seatName(name)} removed`);
  broadcast();
  draw();
}

function broadcast(): void {
  if (!lobby) return;
  // 2.4: the other phones see when the host is adding a player.
  const out: Lobby = { ...lobby, adding: adding !== null };
  for (const [id, l] of links) {
    if (l.seated) l.peer.send({ t: 'lobby', you: id, lobby: out } satisfies ToJoiner);
  }
  // Online: the room list shows the seats and whether the game has started.
  hostRoom?.update(lobby.seats.length, lobby.started);
}

function startGame(): void {
  const l = lobby!;
  if (lobbyProblems(l).length || hostAway) return;
  // Phase 4d: nobody starts while a player is still missing from the table.
  if (waitingText(l) !== null) return;
  const { players, hostId, linkIds } = sessionPlayers(l);
  let session;
  try {
    session = createSession({ players, hostId, jokerRuleEnabled: l.jokers, pauseTimeLimitSec: l.pauseLimit, waitForAll: true }, defaultRng()).session;
  } catch (e) {
    flash(errText(e));
    return;
  }
  lobby = { ...l, started: true };
  // Phones still connecting don't get in (no late joining).
  for (const [id, link] of links) {
    if (!link.seated) { link.peer.send({ t: 'refused', why: 'The game has already started.' } satisfies ToJoiner); dropLink(id, link); }
  }
  broadcast();
  draw();
  // Every phone goes into the game (netplay.ts); the links stay open here.
  hostStart(session, linkIds, hostId, botsForGame(l));
}

// ----- Host: adding a player -----

async function startAdding(): Promise<void> {
  if (adding || !lobby || lobby.started || mode === 'online') return;
  if (lobby.seats.length + [...links.values()].filter((x) => !x.seated).length >= MAX_PLAYERS) return;
  const id = `c${++nextId}`;
  const p = new Peer('host');
  const a: Adding = { peer: p, id, code: '', stage: 'making', failText: '' };
  adding = a;
  broadcast();
  draw();
  // The joining phone sends its name as soon as its side opens, which can
  // arrive before this side's own "open" event: either one moves the link in.
  const promote = (): void => {
    if (adding !== a) return;
    clearTimeout(connectTimer);
    stopScan();
    adding = null;
    broadcast();
    addLink(id, p);
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

/** A phone is in the room (Nearby or online): it gets a link entry and a short time to say hello. */
function addLink(id: string, p: Link): HostLink {
  const link: HostLink = { peer: p, lastHeard: performance.now(), seated: false };
  links.set(id, link);
  p.onClose = () => linkLost(id);
  setTimeout(() => {
    if (links.get(id) === link && !link.seated) {
      dropLink(id, link);
      flash(mode === 'online' ? 'That phone didn’t send its name.' : 'That phone didn’t send its name. Add it again.');
      draw();
    }
  }, HELLO_TIMEOUT_MS);
  return link;
}

/** Takes a phone out of the room. Its last message goes first (closeSoon); online, the room drops its socket too. */
function dropLink(id: string, link: HostLink): void {
  links.delete(id);
  if (link.peer.keepsAlive) hostRoom?.kick(id);
  closeSoon(link.peer);
}

/** Online: the room says a phone has come in. From here it is handled like a Nearby phone. */
function addOnlineLink(p: OnlineLink): void {
  if (!lobby) return;
  const seat = lobby.seats.find((s) => s.id === p.id);
  if (seat && !seat.isHost) {
    // CODE.md 9u A2/A5: a seated phone's socket is back. It keeps its seat and does not say hello again.
    links.set(p.id, { peer: p, lastHeard: performance.now(), seated: true });
    p.onClose = () => linkLost(p.id);
    p.onMessage = (m) => hostGot(p.id, m);
    lobby = setBack(lobby, p.id);
    broadcast();
    draw();
    netChanged();
    if (lobby.started) hostSync(p.id);
    return;
  }
  if (lobby.started) { hostRoom?.kick(p.id); return; }
  links.delete(p.id);
  addLink(p.id, p);
  p.onMessage = (m) => hostGot(p.id, m);
}

/** Online: opens the host's room socket and passes its events on to the lobby. */
function startHostRoom(id: string, token: string): void {
  const hr = new HostRoom(id, token);
  hostRoom = hr;
  hr.onReady = () => { if (hostRoom === hr && lobby) hr.update(lobby.seats.length, lobby.started); };
  hr.onJoined = (link) => { if (hostRoom === hr) addOnlineLink(link); };
  // CODE.md 9u A2: the room's socket dropped; the lobby waits, and the room redials.
  hr.onAway = () => { if (hostRoom === hr) { hostAway = true; draw(); } };
  hr.onBack = () => { if (hostRoom === hr) { hostAway = false; broadcast(); draw(); netChanged(); } };
  hr.onLost = () => {
    if (hostRoom !== hr) return;
    hostRoom = null;
    hostAway = false;
    for (const linkId of [...links.keys()]) forgetLink(linkId);
    if (lobby && !lobby.started) go('room-lost');
    else { draw(); netChanged(); }
  };
}

/** Online: makes the room (room name and passcode from the form), then shows the lobby. */
async function makeRoom(): Promise<void> {
  const name = cleanRoomName(roomName);
  if (!name) { roomFormError = `Type a room name, up to ${ROOM_NAME_MAX} characters.`; draw(); return; }
  if (!PASSCODE_RE.test(roomCode)) { roomFormError = 'The passcode is 4 digits.'; draw(); return; }
  roomName = name;
  roomFormError = '';
  go('room-wait');
  try {
    const made = await createRoom({ name, passcode: roomCode, hostName: myProfile });
    if (step !== 'room-wait') return;
    roomId = made.roomId;
    lobby = newLobby(myProfile);
    startPings();
    void keepAwake();
    startHostRoom(made.roomId, made.hostToken);
    go('lobby');
  } catch (e) {
    if (step !== 'room-wait') return;
    roomFormError = errText(e);
    go('room-form');
  }
}

/** Room names: the same cleaning as the server (no control characters, trimmed, up to 20). */
function cleanRoomName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, ROOM_NAME_MAX);
}

/** A passcode suggestion: 4 random digits. */
function randomCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000 + (a[0]! % 9000));
}

/** The invite: the room's link and passcode (WhatsApp or any app, or copied). */
function shareInvite(): void {
  const text = `Join my Pubby game "${roomName}": ${pageAddress()}#room=${roomId}  Passcode: ${roomCode}`;
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  if (nav.share) { nav.share({ text }).catch(() => undefined); return; }
  navigator.clipboard?.writeText(text).then(
    () => flash('Invite copied'),
    () => flash('Couldn’t copy the invite. Write the link and passcode down.'),
  );
}

// ----- Online: the joiner's rooms -----

/** The room list socket runs while the list (or its passcode screen) is on screen. */
function startList(): void {
  stopList();
  rooms = [];
  roomsLoaded = false;
  roomsProblem = '';
  stopRooms = watchRooms(
    (list) => { rooms = list; roomsLoaded = true; if (step === 'room-list' || step === 'room-pass') draw(); },
    (text) => { roomsProblem = text; if (step === 'room-list') draw(); },
  );
}

function stopList(): void {
  stopRooms?.();
  stopRooms = null;
}

/** Joins the picked room with the typed passcode, then connects like any joining phone. */
async function joinRoomNow(): Promise<void> {
  const pick = roomPick;
  if (!pick || joiningRoom) return;
  if (!PASSCODE_RE.test(roomPass)) { roomPassError = 'The passcode is 4 digits.'; draw(); return; }
  joiningRoom = true;
  roomPassError = '';
  try {
    const { joinToken } = await joinRoom(pick.roomId, roomPass);
    if (step !== 'room-pass') return;
    const p = joinSocket(pick.roomId, joinToken);
    peer = p;
    wireJoin(p);
    // CODE.md 9u A3: a drop keeps this seat; the banner says what is happening.
    p.onAway = (kind) => { if (peer === p) { joinAway = kind; draw(); } };
    p.onBack = () => {
      if (peer !== p) return;
      joinAway = null;
      // In a game, ask for the whole game again, so this screen catches up.
      if (inNetGame()) peer.send({ t: 'sync' } satisfies ToHost);
      draw();
    };
    go('room-wait');
    clearTimeout(connectTimer);
    connectTimer = window.setTimeout(() => {
      if (peer === p && step === 'room-wait') joinFail('The room didn’t answer in time. Try again.');
    }, CONNECT_TIMEOUT_MS);
  } catch (e) {
    if (step === 'room-pass') { roomPassError = errText(e); draw(); }
  } finally {
    joiningRoom = false;
  }
}

function roomLostView(): View {
  return [
    topBar('Host a room'),
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big bad' }, 'Room closed'),
      h('p', null, 'This phone lost the connection to the room. Make a new room to play again.'),
    ),
    h('button', { class: 'big', onclick: () => { const name = myProfile; reset(); mode = 'online'; role = 'host'; chooseProfile(name); } }, 'Make a new room'),
    h('button', { class: 'big secondary', onclick: () => onBack() }, 'Main menu'),
  ];
}

function cancelAdding(): void {
  if (!adding) return;
  adding.peer.close();
  adding = null;
  clearTimeout(connectTimer);
  stopScan();
  broadcast();
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
      h('li', null, 'On their phone: Multiplayer › Join a game, then scan this.'),
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
  // CODE.md 9u A5: a seated phone left the screen, or is back. Its seat is kept either way.
  if (m.t === 'away' || m.t === 'back') {
    if (!link.seated) return;
    lobby = m.t === 'away' ? setAway(lobby, id, Date.now()) : setBack(lobby, id);
    broadcast();
    draw();
    netChanged();
    return;
  }
  if (m.t === 'act' || m.t === 'sync' || m.t === 'react' || m.t === 'say') {
    if (!link.seated || !lobby.started) return;
    if (m.t === 'act') hostGotAct(id, m.actions);
    else if (m.t === 'react') hostGotReact(id, m.r);
    else if (m.t === 'say') hostGotSay(id, m.text); // 9ad.5 (2.34)
    else hostSync(id);
    return;
  }
  if (m.t === 'ready') {
    // Phase 4d: a joining phone reached the table screen. Ignored once started.
    if (!link.seated || lobby.started) return;
    // A repeat is ignored: answering it would send the lobby back, and that
    // would prompt another "ready" from the phone.
    if (lobby.seats.find((s) => s.id === id)?.ready) return;
    lobby = setReady(lobby, id, true);
    broadcast();
    draw();
    return;
  }
  if (m.t === 'hello') {
    if (link.seated) return;
    const problem = joinProblem(lobby, m, VERSION);
    if (problem) {
      link.peer.send({ t: 'refused', why: problem } satisfies ToJoiner);
      dropLink(id, link);
      flash('A phone couldn’t join.');
      draw();
      return;
    }
    link.seated = true;
    // CODE.md 9u C1: a person's name is theirs; a computer player with the same name gets a new one.
    const personName = cleanName(m.sessionName) || cleanName(m.profileName);
    const clash = lobby.seats.find((s) => s.bot && seatName(s).toLowerCase() === personName.toLowerCase());
    if (clash) {
      const [fresh] = pickNames(1, [...lobby.seats.map(seatName), personName], defaultRng());
      if (fresh) lobby = renameSeat(lobby, clash.id, fresh);
    }
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
    netChanged();
  }
}

/** A phone's link dropped. CODE.md 9u A5: the phone is away, not gone; its seat is kept for AWAY_MS. */
function linkLost(id: string): void {
  const link = links.get(id);
  if (!link || !lobby) return;
  const seat = lobby.seats.find((s) => s.id === id);
  if (!seat || seat.isHost) { forgetLink(id); return; }  // never got a seat: nothing to keep
  if (isAway(lobby, id)) return;
  lobby = setAway(lobby, id, Date.now());
  flash(`${seatName(seat)} is away`);
  broadcast();
  draw();
  netChanged();
}

/** The phone is gone for good: after its away time, or when the room ends. Removed in the lobby; set to not connected in a game. */
function forgetLink(id: string): void {
  const link = links.get(id);
  links.delete(id);
  link?.peer.close();
  if (!lobby) return;
  const seat = lobby.seats.find((s) => s.id === id);
  if (lobby.started) lobby = setConnected(lobby, id, false);
  else lobby = removeSeat(lobby, id);
  if (seat) flash(`${seatName(seat)} lost connection`);
  broadcast();
  draw();
  netChanged();
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

/** 2.4: what the host is doing, for the other phones. */
function hostDoing(l: Lobby): string {
  const host = l.seats.find((x) => x.isHost);
  const name = host ? seatName(host) : 'The host';
  return l.adding ? `${name} is adding a player…` : `${name} is setting up the game`;
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
    ),
    hostLine(hostDoing(l)),
    awayNote(),
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
      waitingText(l) ? h('p', { class: 'warn' }, waitingText(l)) : null,
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
      h('p', { class: 'muted small' }, 'Starting the game…'),
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
    h('button', { class: 'big secondary', onclick: () => { if (othersConnected()) { leaveAsk = true; draw(); } else onBack(); } }, as === 'host' ? 'Close the game' : 'Leave'),
  ];
}

function newJoinPeer(): Peer {
  const p = new Peer('join');
  wireJoin(p);
  return p;
}

/** The joining phone’s handlers for its link to the host (Nearby or online). */
function wireJoin(p: Link): void {
  p.onOpen = () => {
    if (peer !== p) return;
    clearTimeout(connectTimer);
    hostHeard = performance.now();
    readySent = false;
    // Send the name, and again every second until the host answers: a
    // message sent the moment the link opens was sometimes lost in testing
    // (2 runs in 8). The host ignores repeats once the phone has a seat.
    const hello = (): void => {
      if (peer !== p || step !== 'join-wait') { clearInterval(helloTimer); return; }
      p.send({ t: 'hello', protocol: LOBBY_PROTOCOL, version: VERSION, profileName: myProfile, sessionName: '' });
    };
    clearInterval(helloTimer);
    helloTimer = window.setInterval(hello, HELLO_RESEND_MS);
    startPings();
    void keepAwake();
    go('join-wait');
    hello();
  };
  p.onMessage = (raw) => { if (peer === p) joinGot(raw); };
  p.onClose = () => {
    if (peer !== p) return;
    if (step === 'lobby' || step === 'join-wait') lost();
    else if (step === 'join-code') joinFail('The phones scanned each other but couldn’t link up.');
    else if (step === 'room-wait') joinFail('The room didn’t answer. Check your internet, then try again.');
  };
}

function joinGot(raw: unknown): void {
  hostHeard = performance.now();
  const m = readToJoiner(raw);
  if (!m || m.t === 'ping') return;
  if (m.t === 'game') {
    joinGotGame(m);
  } else if (m.t === 'react') {
    joinGotReact(m.from, m.r);
  } else if (m.t === 'say') {
    joinGotSay(m.from, m.text); // 9ad.5 (2.34)
  } else if (m.t === 'nope') {
    joinNope(m.why);
  } else if (m.t === 'lobby') {
    seen = m.lobby;
    you = m.you;
    if (step !== 'lobby') go('lobby'); else draw();
    // Phase 4d: this phone is now at the table. Sent once per join: the host
    // sends the lobby again on every change, so it must not be sent per lobby.
    if (!readySent && !seen.started) {
      readySent = true;
      peer?.send({ t: 'ready' } satisfies ToHost);
    }
    netChanged();
  } else if (m.t === 'hostAway') {
    // CODE.md 9u A5 (Nearby): the host's phone left the screen; this phone waits up to 10 minutes.
    joinAway = 'host';
    hostAwayAt = performance.now();
    draw();
  } else if (m.t === 'hostBack') {
    if (joinAway === 'host') joinAway = null;
    draw();
  } else if (m.t === 'skipping') {
    // 2.27 (CODE.md 9v.5): the host's phone is skipping to the end of the round; this phone shows one line.
    setHostSkipping(m.on);
    update({});
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
  joinAway = null;
  const p = peer;
  peer = null;
  p?.close();
  releaseWake();
  leaveAsk = false;
  go(next);
  // In a game: show what happened (a finished game stays on screen).
  if (inNetGame()) joinEnded();
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
    h('button', { class: 'big', onclick: () => { const name = myProfile; const m = mode; reset(); mode = m; role = 'join'; if (name) chooseProfile(name); else go('name'); } }, 'Join again'),
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
      // CODE.md 9u A5: an away seat is kept for AWAY_MS, then it goes for good.
      for (const seat of lobby?.seats ?? []) {
        if (seat.awaySince !== undefined && Date.now() - seat.awaySince >= AWAY_MS) forgetLink(seat.id);
      }
      for (const [id, l] of links) {
        if (l.peer.keepsAlive) continue; // online: the room tells us when a phone is lost
        if (lobby && isAway(lobby, id)) continue; // an away phone is judged only by AWAY_MS
        if (now - l.lastHeard > LOST_AFTER_MS) linkLost(id);
        else l.peer.send({ t: 'ping' } satisfies ToJoiner);
      }
      if (lobby?.seats.some((s) => s.awaySince !== undefined)) draw(); // keeps the countdown on the seat
    } else if (peer?.isOpen && !peer.keepsAlive) {
      if (joinAway === 'host') { if (now - hostAwayAt > AWAY_MS) lost(); }  // the host is away: no pings judged for 10 minutes
      else if (now - hostHeard > LOST_AFTER_MS) lost();
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
    mode: () => mode,
    room: () => roomId,
    adding: () => adding?.stage ?? null,
    lobby: () => (role === 'host' ? lobby : seen),
    you: () => (role === 'host' ? 'host' : you),
  };
}
