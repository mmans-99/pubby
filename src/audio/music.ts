/**
 * The Fireside Piano soundtrack (PROJECT.md 12b): soft felt piano, upright
 * bass and brushes, one shared Pubby tune in every track, the fireplace
 * crackle underneath. Ported note for note from the sample page.
 *
 * `setTrack()` is called after every screen draw; it only changes anything
 * when the track should change (short fade out, then the new track).
 */

import { ctx, crackle, feltPiano, musicOut, onAudioReady, softBrush, softKick, upright, gain } from './engine.ts';
import { onSoundChange, soundSettings } from './settings.ts';

export type Track = 'menu' | 'play' | 'ultimate' | 'results';

type Bar = Record<string, unknown>;
interface Song {
  bpm: number;
  swing: number;
  bars: Bar[];
  play(bar: number, e: number, t: number, len: number, out: AudioNode): void;
}

type Mel = readonly (number | null)[];

// The set: same jobs as the sample page's SETS.piano.
const S = {
  lead: (m: number, t: number, d: number, o: AudioNode, v = 1): void => feltPiano(m, t, d, o, v),
  chord: (ns: readonly number[], t: number, d: number, o: AudioNode, v = 1): void => ns.forEach((m) => feltPiano(m, t, d, o, 0.42 * v)),
  low: (m: number, t: number, d: number, o: AudioNode, v = 1): void => feltPiano(m, t, d, o, 0.65 * v),
  bass: (m: number, t: number, d: number, o: AudioNode, v = 1): void => upright(m, t, d, o, v),
};

// The Pubby tune (8 eighths a bar), used in every track.
const THEME: Mel[] = [[67, null, 69, null, 72, null, 74, 76], [74, null, 72, null, 69, null, null, null], [67, null, 69, 72, 76, null, 79, null], [77, 76, 74, null, 72, null, null, null]];
const THEME_MINOR: Mel[] = [[69, null, 72, null, 74, null, 76, 77], [76, null, 74, null, 72, null, null, null], [69, null, 72, 74, 77, null, 81, null], [80, null, 76, null, 74, null, 71, null]];
const held = (bar: Mel, e: number): number => { let n = 1; while (e + n < 8 && bar[e + n] === null) n++; return n; };

interface MenuBar { ch: number[]; root: number; five: number; mel: Mel }
const menuBars: MenuBar[] = [
  { ch: [59, 64, 67, 71], root: 48, five: 55, mel: THEME[0]! }, { ch: [60, 64, 67, 69], root: 45, five: 52, mel: THEME[1]! },
  { ch: [60, 62, 65, 69], root: 50, five: 45, mel: THEME[2]! }, { ch: [59, 62, 65, 67], root: 43, five: 50, mel: THEME[3]! },
  { ch: [57, 60, 64, 67], root: 41, five: 48, mel: [null, null, 72, null, 69, null, 67, null] }, { ch: [59, 62, 67, 71], root: 40, five: 47, mel: [64, null, null, null, 67, null, null, null] },
  { ch: [60, 62, 65, 69], root: 50, five: 45, mel: [65, null, 69, null, 72, null, 74, null] }, { ch: [59, 62, 65, 67], root: 43, five: 50, mel: [71, null, null, null, null, null, null, null] },
];
const playShifts = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7, 0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
const ultBars = [{ root: 45, arp: [57, 60, 64, 60] }, { root: 45, arp: [57, 60, 64, 65] }, { root: 41, arp: [57, 60, 65, 60] }, { root: 40, arp: [56, 59, 64, 59] },
  { root: 45, arp: [57, 60, 64, 60] }, { root: 45, arp: [57, 60, 64, 65] }, { root: 38, arp: [57, 62, 65, 62] }, { root: 40, arp: [56, 59, 62, 64] }];
const resBars = [{ ch: [65, 69, 72], root: 41, five: 48, mel: 0 }, { ch: [62, 65, 69], root: 38, five: 45, mel: 1 }, { ch: [62, 65, 70], root: 43, five: 50, mel: 2 }, { ch: [64, 67, 70], root: 36, five: 43, mel: 3 }];

const SONGS: Record<Track, Song> = {
  menu: {
    bpm: 66, swing: 0.6, bars: menuBars as unknown as Bar[],
    play(bar, e, t, len, out) {
      const b = menuBars[bar]!;
      if (e === 0) { S.bass(b.root, t, len * 3.5, out, 0.9); S.chord(b.ch, t, len * 6, out, 0.9); }
      if (e === 4) S.bass(b.five, t, len * 3.5, out, 0.7);
      if (e === 5) S.chord(b.ch.slice(1), t, len * 2.5, out, 0.55);
      if (e === 2 || e === 6) softBrush(t, out, 0.7);
      const m = b.mel[e]; if (m) S.lead(m, t, len * held(b.mel, e) * 1.1, out, 0.85);
    },
  },
  play: {
    bpm: 112, swing: 0.62, bars: playShifts.map((x) => ({ shift: x })),
    play(bar, e, t, len, out) {
      const sh = playShifts[bar]!; const r = 36 + sh; const second = bar >= 12;
      const walk = [0, 4, 7, 9, 10, 9, 7, 4];
      S.low(r + walk[e]! + 12, t, len * 1.05, out, 0.75); // boogie left hand
      if (e % 2 === 0) S.bass(r + walk[e]!, t, len * 1.6, out, 0.6);
      if (e % 2 === 1) softBrush(t, out, 0.6);
      if (!second) {
        if ((e === 0 || e === 3) && !(bar === 11 && e === 3)) S.chord([67 + sh, 70 + sh, 72 + sh].map((m) => (sh === 7 ? m - 12 : m)), t, len * 1.4, out, 0.8);
      } else {
        const q = THEME[(bar - 12) % 4]!; const m = q[e];
        if (m && bar !== 23) S.lead(m + (sh === 5 ? 5 : sh === 7 ? -5 : 0), t, len * held(q, e), out, 0.8);
        if (bar === 23) { const turn = [79, 78, 77, 76, 75, 74, 72, null][e]; if (turn) S.lead(turn - 12, t, len, out, 0.7); }
      }
    },
  },
  ultimate: {
    bpm: 108, swing: 0.5, bars: ultBars,
    play(bar, e, t, len, out) {
      const b = ultBars[bar]!;
      S.low(b.arp[e % 4]! + 12, t, len * 0.9, out, 0.6);
      if (e === 0) S.bass(b.root, t, len * 7.5, out, 0.9);
      if (e === 0 || e === 4) { softKick(t, out, 0.9); softKick(t + len * 0.5, out, 0.5); } // heartbeat
      if (bar >= 4) softBrush(t, out, e % 2 ? 0.5 : 0.8);
      const q = THEME_MINOR[bar % 4]!; const m = q[e];
      if (m && bar >= 4) S.lead(m - (bar >= 6 ? 0 : 12) + 12, t, len * held(q, e), out, 0.8);
    },
  },
  results: {
    bpm: 104, swing: 0.6, bars: resBars,
    play(bar, e, t, len, out) {
      const b = resBars[bar]!;
      if (e % 2 === 0) S.bass(e % 4 === 0 ? b.root : b.five, t, len * 1.5, out, 0.85);
      if (e % 2 === 1 && e !== 7) S.chord(b.ch, t, len * 0.7, out, 0.7);
      if (e % 4 === 2) softBrush(t, out, 1);
      if (e === 0) softKick(t, out, 0.6);
      const q = THEME[b.mel]!; const m = q[e]; if (m) S.lead(m + 5, t, len * held(q, e) * 0.9, out, 0.9);
    },
  },
};

interface Playing { name: Track; bus: GainNode; step: number; next: number; timer: number }
let playing: Playing | null = null;
/** The track the screen wants (null = silence), even before the sound has started. */
let wanted: Track | null = null;

function start(name: Track): void {
  if (!ctx) return;
  const c = ctx;
  const song = SONGS[name];
  const bus = gain(1); bus.connect(musicOut());
  const state: Playing = { name, bus, step: 0, next: c.currentTime + 0.08, timer: 0 };
  const beat = 60 / song.bpm;
  const tick = (): void => {
    // Phone asleep or app hidden: don't pile up notes, pick up from now.
    if (c.state !== 'running') { state.next = c.currentTime + 0.08; return; }
    if (state.next < c.currentTime - 0.5) state.next = c.currentTime + 0.05;
    while (state.next < c.currentTime + 0.2) {
      const eighth = state.step % 8;
      const bar = Math.floor(state.step / 8) % song.bars.length;
      song.play(bar, eighth, state.next, beat / 2, bus);
      if (Math.random() < 0.18) crackle(state.next, bus); // fireplace crackle (kept, 2026-11-08)
      // Swing: the on-beat eighth is longer than the off-beat one.
      state.next += beat * (eighth % 2 === 0 ? song.swing : 1 - song.swing);
      state.step++;
    }
  };
  tick();
  state.timer = window.setInterval(tick, 40);
  playing = state;
}

function stop(): void {
  if (!playing || !ctx) { playing = null; return; }
  window.clearInterval(playing.timer);
  const g = playing.bus.gain; const t = ctx.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.4);
  const old = playing.bus; window.setTimeout(() => old.disconnect(), 600);
  playing = null;
}

function musicAudible(): boolean {
  const s = soundSettings();
  return s.musicOn && s.musicVol > 0;
}

function sync(): void {
  const want = musicAudible() ? wanted : null;
  if ((playing?.name ?? null) === want) return;
  stop();
  if (want) start(want);
}

/** The track for the screen now on show (null = no music). */
export function setTrack(name: Track | null): void {
  wanted = name;
  sync();
}

/** For the automated checks: which track is playing. */
export function currentTrack(): Track | null {
  return playing?.name ?? null;
}

onAudioReady(sync);
onSoundChange(sync);
