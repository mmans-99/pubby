/**
 * Glue between the lobby or table screens and the voice mesh (CODE.md 9aq.9,
 * 3.0.0). One mesh per phone in an online room. The screens say who is in the
 * call and pass signals and mic changes in; this file runs the 100 ms level loop
 * that sets the talk rings and the music dip. Nearby games never call it.
 */
import { ICE_MAX_AGE_MS, VoiceMesh, iceFresh } from '../net/voice.ts';
import { acquireMicTrack, makeRtcLink, releaseMicTrack, setVoiceIce } from '../net/voicertc.ts';
import type { VoiceData } from '../net/lobby.ts';
import { setVoiceDuck } from '../audio/engine.ts';

let mesh: VoiceMesh | null = null;
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
    sendTo = send;
    fetchIce = ice;
    return;
  }
  voiceStop();
  me = myId;
  sendTo = send;
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
  mesh.tick(performance.now());
  // Rings are set on the elements directly, so no redraw is needed (9aq.9 item 6).
  for (const el of document.querySelectorAll<HTMLElement>('[data-voice]')) {
    const id = el.dataset['voice'] ?? '';
    el.classList.toggle('talking', mesh.isTalking(id));
  }
  setVoiceDuck(mesh.anyoneTalking());
  if (!iceFresh(iceAt, performance.now())) void refreshIce();
}
