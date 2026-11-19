/**
 * Voice on the table and in the Voice sheet (CODE.md 9aq.11 and 9aq.12, 3.0.0).
 * Used by the game screen (top bar, seats, menu, seat card) and by the lobby's
 * Voice sheet. Online rooms only: every function here is empty when voice is not running.
 */
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { update } from './store.ts';
import { sheetSeen } from './sheetseen.ts';
import { allVoicePlayers, setVoiceSheetOpen, voiceMicBlocked, voiceMicOn, voiceMute, voicePlayer, voiceRunning, voiceSheetIsOpen, voiceTalking, type VoicePlayer } from './voiceglue.ts';
import { voiceSheetView, type VoiceSheetRow } from './voicesheet.ts';
import { isMutedName, loadVoice, muteAll, saveVoice, setMutedName, unmuteAll } from './voicestore.ts';
import { setVoiceVolume } from '../net/voicertc.ts';

/** The mic button's action, registered by the lobby (it sends the mic state to the host). */
let micAction: () => void = () => undefined;
export function setMicAction(f: () => void): void {
  micAction = f;
}

/** The player whose seat card is open (9aq.11 item 4). */
let cardFor: string | null = null;

/** Seat taps open the seat card for another person (not you, not a computer player). */
export function seatTapsVoice(playerId: string, me: string | undefined): boolean {
  if (!voiceRunning() || playerId === me) return false;
  const p = voicePlayer(playerId);
  return p !== undefined && !p.bot;
}

export function openSeatCard(playerId: string): void {
  cardFor = playerId;
  update({});
}

/** The seat's disc: the ring target (data-voice) and the badge (muted gold, mic off grey). */
export function discVoice(playerId: string, side: 'at-left' | 'at-right'): { attrs: Record<string, string>; badge: HTMLElement | null } {
  const p = voicePlayer(playerId);
  if (!voiceRunning() || p === undefined || p.bot) return { attrs: {}, badge: null };
  const muted = isMutedName(loadVoice(), p.name);
  const cls = `voice-badge ${side}`;
  const badge = muted
    ? h('span', { class: `${cls} gold`, 'aria-hidden': 'true' }, icon('speakeroff'))
    : !p.micOn ? h('span', { class: `${cls} grey`, 'aria-hidden': 'true' }, icon('micoff')) : null;
  return { attrs: { 'data-voice': p.seat }, badge };
}

/** Mute or unmute one person by name (the table's seat card and the sheet). */
function setHearing(p: VoicePlayer, hear: boolean): void {
  saveVoice(setMutedName(loadVoice(), p.name, !hear));
  voiceMute(p.seat, !hear);
  update({});
}

/** 9aq.11 item 4: the small card over the table for one seat. A tap outside it closes it. */
export function seatCardLayer(): HTMLElement | null {
  if (cardFor === null || !voiceRunning()) return null;
  const p = voicePlayer(cardFor);
  if (p === undefined || p.bot) {
    cardFor = null;
    return null;
  }
  const muted = isMutedName(loadVoice(), p.name);
  const close = () => { cardFor = null; update({}); };
  return h('div', { class: 'voice-seat-layer', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'panel voice-seat-card', role: 'dialog', 'aria-label': `${p.name}` },
      h('p', { class: 'voice-seat-name' }, p.name,
        h('span', { class: 'muted small block' }, muted ? 'Muted by you' : p.micOn ? 'Mic on' : 'Mic off')),
      h('button', { class: muted ? 'big secondary' : 'big', onclick: () => setHearing(p, muted) }, muted ? `Unmute ${p.name}` : `Mute ${p.name}`),
    ),
  );
}

/** The mic button in the table's top bar (9aq.11 item 1), or nothing when voice is off. */
export function tableMicButton(): HTMLElement | null {
  if (!voiceRunning()) return null;
  const on = voiceMicOn();
  const blocked = voiceMicBlocked();
  return h('button', {
    class: `icon-btn table-mic${on ? ' on' : ''}${blocked ? ' blocked' : ''}`,
    'aria-label': on ? 'Mic on. Tap to turn it off.' : blocked ? 'Mic blocked. Allow it in your browser.' : 'Mic off. Tap to turn it on.',
    'aria-pressed': on ? 'true' : 'false',
    onclick: () => micAction(),
  }, icon(on ? 'mic' : 'micoff'), blocked ? h('span', { class: 'red-dot', 'aria-hidden': 'true' }) : null);
}

/** The Voice button in the top bar: only when the bar has room (wide phones, not while dealing). Always in the menu. */
export function tableVoiceButton(roomy: boolean): HTMLElement | null {
  if (!voiceRunning() || !roomy) return null;
  return h('button', {
    class: 'icon-btn table-voice',
    'aria-label': 'Voice',
    onclick: () => { setVoiceSheetOpen(true); update({ menuOpen: false }); },
  }, icon('speaker'));
}

/** "Voice" in the game menu (netMenu, gameMenu). */
export function voiceMenuItem(): HTMLElement | null {
  if (!voiceRunning()) return null;
  return h('button', { class: 'secondary', onclick: () => { setVoiceSheetOpen(true); update({ menuOpen: false }); } }, icon('speaker'), ' Voice');
}

/**
 * The Voice sheet (9aq.12), on top of the screen. `me` is this phone's seat id, `redraw`
 * redraws the screen it sits on. Rows come from the players, so the lobby and the table agree.
 */
export function voiceSheetOverlay(me: string, redraw: () => void): HTMLElement | null {
  if (!voiceRunning() || !voiceSheetIsOpen()) return null;
  const saved = loadVoice();
  const others = allVoicePlayers().filter((p) => p.seat !== me && !p.bot);
  const rows: VoiceSheetRow[] = others.map((p) => ({
    id: p.seat,
    name: p.name,
    connected: true,
    talking: voiceTalking(p.seat),
    muted: isMutedName(saved, p.name),
    micOn: p.micOn,
  }));
  const wasOpen = sheetSeen('voice', true); // a redraw never replays the slide-up (9aq.12 item 1)
  const close = () => { setVoiceSheetOpen(false); sheetSeen('voice', false); redraw(); };
  const sheet = voiceSheetView({
    micOn: voiceMicOn(),
    micBlocked: voiceMicBlocked(),
    rows,
    volume: saved.volume,
    onClose: close,
    onMic: () => micAction(),
    onMuteAll: () => { saveVoice(muteAll(loadVoice(), others.map((p) => p.name))); for (const p of others) voiceMute(p.seat, true); redraw(); },
    onUnmuteAll: () => { saveVoice(unmuteAll(loadVoice())); for (const p of others) voiceMute(p.seat, false); redraw(); },
    onHear: (seat, hear) => {
      const p = others.find((x) => x.seat === seat);
      if (p) saveVoice(setMutedName(loadVoice(), p.name, !hear));
      voiceMute(seat, !hear);
      redraw();
    },
    onVolume: (v) => { saveVoice({ ...loadVoice(), volume: v }); setVoiceVolume(v / 100); },
  });
  return h('div', { class: wasOpen ? 'overlay seen' : 'overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } }, sheet);
}
