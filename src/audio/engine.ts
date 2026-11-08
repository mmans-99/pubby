/**
 * Pubby's sound engine (CODE.md 9g). Every sound is made live with the Web
 * Audio API: no audio files, works offline. The building blocks and
 * instruments come from the sample page the user chose the sounds on
 * (https://claude.ai/artifact/Q54YRtsC8xME6LN7uAHzvZ).
 *
 * One AudioContext, made on the first tap (phones only allow sound after a
 * tap). Music and effects each have their own bus with its own volume, both
 * into a gentle compressor.
 */

import { onSoundChange, soundSettings, type SoundSettings } from './settings.ts';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export let ctx: AudioContext | null = null;
let musicBus: GainNode;
/** Dips the music under big effects (separate from the music volume). */
let duckGain: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;
let reverbIR: AudioBuffer | null = null;
const readyFns: (() => void)[] = [];

/** Called once the context exists (music starts then). */
export function onAudioReady(fn: () => void): void {
  readyFns.push(fn);
}

function make(): void {
  const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
    return;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  const master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp); comp.connect(ctx.destination);
  duckGain = ctx.createGain(); duckGain.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(duckGain);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  applyVolumes(soundSettings(), true);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const fn of readyFns) fn();
}

/** Start (or wake) the sound. Only works inside a tap. */
export function unlockAudio(): void {
  if (!ctx) make();
  if (ctx && ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => {});
}

export function musicLevel(s: SoundSettings): number {
  return s.musicOn ? (s.musicVol / 100) ** 2 * 0.7 : 0;
}
export function sfxLevel(s: SoundSettings): number {
  return s.sfxOn ? (s.sfxVol / 100) ** 2 : 0;
}

function applyVolumes(s: SoundSettings, now = false): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [bus, v] of [[musicBus, musicLevel(s)], [sfxBus, sfxLevel(s)]] as const) {
    bus.gain.cancelScheduledValues(t);
    if (now) bus.gain.setValueAtTime(v, t);
    else { bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.setTargetAtTime(v, t, 0.05); }
  }
}
onSoundChange((s) => applyVolumes(s));

/** Effects are skipped when the effects are off, so nothing is built for nothing. */
export function sfxReady(): boolean {
  const s = soundSettings();
  return ctx !== null && ctx.state === 'running' && s.sfxOn && s.sfxVol > 0;
}

export function sfxOut(): AudioNode { return sfxBus; }

/** Music down to a third from `at` (context time) for `dur` seconds, then back up. */
export function duckMusic(at: number, dur: number): void {
  if (!ctx) return;
  const g = duckGain.gain;
  g.setTargetAtTime(0.35, at, 0.04);
  g.setTargetAtTime(1, at + dur, 0.25);
}
export function musicOut(): AudioNode { return musicBus; }

/** Phone hidden (app switched away, screen off): stop all sound; wake it on return. */
export function setupVisibility(): void {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
  // The first tap anywhere starts the sound (capture, so it runs before the button's own sound).
  const unlock = (): void => unlockAudio();
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('touchend', unlock, true);
}

// ---------------------------------------------------------------------------
// Building blocks (from the sample page). Only call when `ctx` is set.
// ---------------------------------------------------------------------------

const C = (): AudioContext => ctx as AudioContext;
export const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function env(g: GainNode, t: number, a: number, peak: number, dec: number, end = 0.0008): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + dec);
}
export function osc(type: OscillatorType, f: number, t: number, stop: number, out: AudioNode): OscillatorNode {
  const o = C().createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(out); o.start(t); o.stop(stop); return o;
}
export function noise(t: number, dur: number, out: AudioNode, rate = 1): AudioBufferSourceNode {
  const s = C().createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
  s.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur); return s;
}
export function filter(type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
  const b = C().createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}
export function gain(v = 1): GainNode {
  const g = C().createGain(); g.gain.value = v; return g;
}

export function kick(t: number, out: AudioNode, v = 1): void {
  const g = gain(0); g.connect(out); env(g, t, 0.002, 0.7 * v, 0.25);
  const o = osc('sine', 130, t, t + 0.3, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
}
export function snare(t: number, out: AudioNode, v = 1): void {
  const g = gain(0); const hp = filter('highpass', 1500); g.connect(out); hp.connect(g);
  env(g, t, 0.002, 0.35 * v, 0.16); noise(t, 0.2, hp);
  const tg = gain(0); tg.connect(out); env(tg, t, 0.002, 0.15 * v, 0.08); osc('triangle', 190, t, t + 0.1, tg);
}
export function brush(t: number, out: AudioNode, v = 1, len = 0.14): void {
  const g = gain(0); const bp = filter('bandpass', 4200, 0.6); bp.connect(g); g.connect(out);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  noise(t, len + 0.02, bp);
}
export function brass(m: number, t: number, dur: number, out: AudioNode, v = 1): void {
  const g = gain(0); const lp = filter('lowpass', 600, 2); g.connect(out); lp.connect(g);
  lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2600 * v, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.03);
  g.gain.setValueAtTime(0.22 * v, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.12);
  osc('sawtooth', hz(m), t, t + dur + 0.15, lp); osc('sawtooth', hz(m) * 1.004, t, t + dur + 0.15, lp);
}
export function bell(m: number, t: number, dur: number, out: AudioNode, v = 1): void {
  const f = hz(m);
  for (const [r, a] of [[1, 0.25], [2.76, 0.08], [5.4, 0.04]] as const) {
    const g = gain(0); g.connect(out); env(g, t, 0.002, a * v, dur * (r === 1 ? 1 : 0.4)); osc('sine', f * r, t, t + dur + 0.1, g);
  }
}
export function reverb(seconds: number, out: AudioNode, wet: number): ConvolverNode {
  const c = C();
  if (!reverbIR) {
    const len = Math.floor(c.sampleRate * 1.6); reverbIR = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = reverbIR.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
  }
  const cv = c.createConvolver(); cv.buffer = reverbIR; const w = gain(wet); cv.connect(w); w.connect(out);
  window.setTimeout(() => { cv.disconnect(); w.disconnect(); }, (seconds + 2) * 1000);
  return cv;
}
export function drive(amount: number): WaveShaperNode {
  const ws = C().createWaveShaper(); const n = 1024; const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * amount); }
  ws.curve = c; return ws;
}

// Fireside Piano instruments.
export function feltPiano(m: number, t: number, dur: number, out: AudioNode, v = 1): void {
  const f = hz(m); const g = gain(0); const lp = filter('lowpass', 1100 + v * 700, 0.5); g.connect(lp); lp.connect(out);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.07 * v, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0006, t + dur + 0.4);
  osc('triangle', f * 1.0012, t, t + dur + 0.45, g); osc('triangle', f * 0.9988, t, t + dur + 0.45, g);
  const s = gain(0.5); s.connect(g); osc('sine', f * 2, t, t + dur * 0.5, s);
}
export function upright(m: number, t: number, dur: number, out: AudioNode, v = 1): void {
  const g = gain(0); const lp = filter('lowpass', 420, 0.7); g.connect(lp); lp.connect(out);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.15 * v, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0006, t + dur + 0.1);
  osc('sine', hz(m), t, t + dur + 0.15, g); const tr = gain(0.5); tr.connect(g); osc('triangle', hz(m), t, t + dur + 0.15, tr);
}
export function softKick(t: number, out: AudioNode, v = 1): void {
  const g = gain(0); g.connect(out); env(g, t, 0.004, 0.35 * v, 0.22);
  const o = osc('sine', 85, t, t + 0.3, g); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
}
export function softBrush(t: number, out: AudioNode, v = 1): void { brush(t, out, 0.55 * v, 0.16); }
export function crackle(t: number, out: AudioNode): void {
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const tt = t + Math.random() * 0.2; const g = gain(0); const hp = filter('bandpass', 1500 + Math.random() * 3000, 2);
    hp.connect(g); g.connect(out); env(g, tt, 0.001, 0.05 + Math.random() * 0.08, 0.008 + Math.random() * 0.02); noise(tt, 0.04, hp);
  }
}
