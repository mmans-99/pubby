/**
 * Glue between the lobby or table screens and the voice mesh (CODE.md 9aq.9,
 * 3.0.0). One mesh per phone in an online room. The screens say who is in the
 * call and pass signals and mic changes in; this file runs the 100 ms level loop
 * that sets the talk rings and the music dip. Nearby games never call it.
 */
import { ICE_MAX_AGE_MS, VoiceMesh, iceFresh } from '../net/voice.ts';
import { acquireMicTrack, makeRtcLink, releaseMicTrack, setVoiceIce } from '../net/voicertc.ts';
import type { VoiceData } from '../net/lobby.ts';
import { ctx, setVoiceDuck } from '../audio/engine.ts';

let mesh: VoiceMesh | null = null;
/** 9aq.15 B1: debug counters, read only by `?voicedebug`. Not used by the app's logic. */
const vsigSent = new Map<string, number>();
const vsigRecv = new Map<string, number>();
const vsigDropped = new Map<string, number>();
const levelHist = new Map<string, { t: number; v: number }[]>();
let me = '';
let sendTo: (to: string, d: VoiceData) => void = () => undefined;
let iceAt = Number.NEGATIVE_INFINITY;
let iceReady = false;
let order: string[] = [];
let peers: string[] = [];
let tickTimer: number | undefined;
let fetchIce: () => Promise<RTCIceServer[] | null> = async () => null;
let refetching = false;

/** A player at the table, as the voice screens need them: their seat id, name, mic and whether a computer player. */
export interface VoicePlayer { seat: string; name: string; micOn: boolean; bot: boolean }
let players = new Map<string, VoicePlayer>();
/** 9aq.12 (3.0.0): the Voice sheet is open on this phone (lobby or table). */
let sheetOpen = false;

/** Set from the lobby's seats: player ids (p1, p2…) in seat order, as the game names them. */
export function setVoicePlayers(list: [string, VoicePlayer][]): void {
  players = new Map(list);
}

export function voicePlayer(playerId: string): VoicePlayer | undefined {
  return players.get(playerId);
}

/** Every player, in seat order. */
export function allVoicePlayers(): VoicePlayer[] {
  return [...players.values()];
}

export function voiceSheetIsOpen(): boolean {
  return sheetOpen;
}

export function setVoiceSheetOpen(open: boolean): void {
  sheetOpen = open;
}

/** Starts voice for this phone's seat. Idempotent for the same seat. */
export function voiceStart(
  myId: string,
  send: (to: string, d: VoiceData) => void,
  ice: () => Promise<RTCIceServer[] | null>,
): void {
  if (mesh !== null && me === myId) {
    sendTo = countedSend(send);
    fetchIce = ice;
    return;
  }
  voiceStop();
  me = myId;
  sendTo = countedSend(send);
  fetchIce = ice;
  mesh = new VoiceMesh({
    me: myId,
    makeLink: makeRtcLink,
    send: (to, d) => sendTo(to, d),
    acquireMic: acquireMicTrack,
    releaseMic: releaseMicTrack,
    later: (f, ms) => { window.setTimeout(f, ms); },
  });
  tickTimer = window.setInterval(tick, 100);
  void refreshIce();
}

function countedSend(send: (to: string, d: VoiceData) => void): (to: string, d: VoiceData) => void {
  return (to, d) => {
    vsigSent.set(to, (vsigSent.get(to) ?? 0) + 1);
    send(to, d);
  };
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** 9aq.15 B1: the host (or the sending screen) counts a signal it did not pass on, by reason. */
export function voiceNoteDrop(reason: string): void {
  bump(vsigDropped, reason);
}

/** Closes every link and the mic, and stops the level loop. The room closed or this phone left. */
export function voiceStop(): void {
  if (tickTimer !== undefined) window.clearInterval(tickTimer);
  tickTimer = undefined;
  mesh?.close();
  mesh = null;
  me = '';
  order = [];
  peers = [];
  iceReady = false;
  iceAt = Number.NEGATIVE_INFINITY; // the relay logins are kept for this room only
  players = new Map();
  sheetOpen = false;
  setVoiceDuck(false);
}

export function voiceRunning(): boolean {
  return mesh !== null;
}

/** The mic and the blocked state, for the buttons. */
export function voiceMicOn(): boolean {
  return mesh?.micOn ?? false;
}

export function voiceMicBlocked(): boolean {
  return mesh?.micBlocked ?? false;
}

export function voiceMuted(id: string): boolean {
  return mesh?.isMuted(id) ?? false;
}

/** Talking, for a seat id (a muted player never shows as talking). */
export function voiceTalking(id: string): boolean {
  return mesh?.isTalking(id) ?? false;
}

/** The people in the call: the seat ids in seat order, and who is connected now. */
export function voiceSetPeers(seatOrder: readonly string[], connected: readonly string[]): void {
  order = [...seatOrder];
  peers = [...connected];
  applyPeers();
}

/** A signal from `from`, passed on by the host (or from the host itself). */
export function voiceSignal(from: string, d: VoiceData): void {
  bump(vsigRecv, from);
  mesh?.onSignal(from, d);
}

/** Mic on or off. Resolves once the browser has answered. */
export async function voiceMic(on: boolean): Promise<void> {
  await mesh?.setMic(on);
}

/** Mute or unmute what this phone hears from one person. */
export function voiceMute(id: string, muted: boolean): void {
  mesh?.setMuted(id, muted);
}

function applyPeers(): void {
  if (!mesh || !iceReady) return;
  mesh.setPeers(order, peers);
}

/** A failed relay-login request is tried again after this long (STUN works meanwhile). */
const ICE_RETRY_MS = 30_000;

/** 9aq.9 item 1: the relay logins are fetched when the room is entered, and again after 2.5 hours. */
async function refreshIce(): Promise<void> {
  if (refetching) return;
  if (iceFresh(iceAt, performance.now())) {
    iceReady = true;
    applyPeers();
    return;
  }
  refetching = true;
  const servers = await fetchIce();
  refetching = false;
  if (servers !== null && servers.length > 0) {
    setVoiceIce(servers);
    iceAt = performance.now();
  } else {
    // No answer: STUN only (the default), and try again in 30 s.
    iceAt = performance.now() - ICE_MAX_AGE_MS + ICE_RETRY_MS;
  }
  iceReady = true;
  applyPeers();
}

function tick(): void {
  if (!mesh) return;
  const now = performance.now();
  mesh.tick(now);
  // Rings are set on the elements directly, so no redraw is needed (9aq.9 item 6).
  for (const el of document.querySelectorAll<HTMLElement>('[data-voice]')) {
    const id = el.dataset['voice'] ?? '';
    el.classList.toggle('talking', mesh.isTalking(id));
  }
  setVoiceDuck(mesh.anyoneTalking());
  if (!iceFresh(iceAt, now)) void refreshIce();
  if (debugOn) recordHistory(now);
}

/** 9aq.15 B1: whether `?voicedebug` is on. Off for players, so none of the debug reads run for them. */
const debugOn = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('voicedebug');

/** Keeps two seconds of levels per person, so the snapshot can give the highest level recently. */
function recordHistory(now: number): void {
  if (!mesh) return;
  for (const id of mesh.peers()) {
    const h = levelHist.get(id) ?? [];
    h.push({ t: now, v: mesh.levelOf(id) });
    while (h.length > 0 && now - (h[0]?.t ?? now) > 2000) h.shift();
    levelHist.set(id, h);
  }
}

/** 9aq.15 B1: a read-only snapshot for `?voicedebug`. Nothing in the app calls it. */
export function voiceDebugSnapshot(): Record<string, unknown> {
  const now = performance.now();
  const peers = mesh ? mesh.debugPeers() : {};
  for (const id of Object.keys(peers)) {
    const h = levelHist.get(id) ?? [];
    const max2s = h.filter((x) => now - x.t <= 2000).reduce((m, x) => Math.max(m, x.v), 0);
    (peers[id] as Record<string, unknown>)['maxLevel2s'] = Math.round(max2s * 10000) / 10000;
  }
  return {
    me,
    audioContext: ctx === null ? 'none' : ctx.state,
    talking: mesh?.anyoneTalking() ?? false,
    peers,
    vsigSent: Object.fromEntries(vsigSent),
    vsigRecv: Object.fromEntries(vsigRecv),
    vsigDropped: Object.fromEntries(vsigDropped),
    at: Math.round(now),
  };
}

if (debugOn && typeof window !== 'undefined') {
  (window as unknown as { __pubbyVoice?: { snapshot: () => Record<string, unknown> } }).__pubbyVoice = {
    snapshot: voiceDebugSnapshot,
  };
}
