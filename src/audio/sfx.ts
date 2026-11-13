/**
 * Pubby's sound effects (PROJECT.md 12b), ported from the sample page.
 * Chosen 2026-11-08: SLAP! = Huge, Paused = Click, Resumed = click up,
 * take-cards request = Knock knock, every other effect as on the sample page.
 *
 * `playFor()` turns session events into effects (called from game.ts `send`).
 */

import { bell, brass, ctx, drive, duckMusic, env, filter, gain, hz, kick, noise, osc, reverb, sfxOut, sfxReady, snare } from './engine.ts';
import type { SessionEvent } from '../session/types.ts';
import { instantSkipping, skipping } from '../ai/fastforward.ts';

export type Sfx =
  | 'tap' | 'shuffle' | 'deal' | 'play' | 'slap' | 'pickUp' | 'trickDone' | 'joker' | 'gotAway' | 'lastPlace'
  | 'roundWinner' | 'ultimateWinner' | 'coward' | 'voteResult' | 'tapReady' | 'tapGo' | 'reaction' | 'yourTurn'
  | 'notAllowed' | 'knock' | 'paused' | 'resumed' | 'laugh';

const T = (): number => (ctx as AudioContext).currentTime + 0.01;

/**
 * How long each effect lasts (seconds), and which are "big". Only one big
 * effect plays at a time: the next waits its turn. Small effects are skipped
 * while a big one is playing, so nothing piles up (user, 2026-11-08 08:22).
 */
const DUR: Record<Sfx, number> = {
  tap: 0.06, deal: 0.1, play: 0.12, trickDone: 0.3, reaction: 0.35, notAllowed: 0.2, yourTurn: 0.6,
  shuffle: 0.85, slap: 0.95, pickUp: 0.8, joker: 0.65, gotAway: 0.9, lastPlace: 2.1, roundWinner: 0.95,
  ultimateWinner: 2.0, coward: 1.6, voteResult: 1.3, tapReady: 1.15, tapGo: 0.5, knock: 0.3, paused: 0.15, resumed: 0.15, laugh: 0.85,
};
const BIG = new Set<Sfx>(['laugh', 'shuffle', 'slap', 'pickUp', 'joker', 'gotAway', 'lastPlace', 'roundWinner', 'ultimateWinner', 'coward', 'voteResult', 'tapReady', 'knock']);
/** The music dips under these. */
const DUCK = new Set<Sfx>(['laugh', 'slap', 'gotAway', 'lastPlace', 'roundWinner', 'ultimateWinner', 'coward', 'voteResult']);
/** Never wait or get skipped: their timing matters (Reaction Tap GO, pause clicks). */
const NOW = new Set<Sfx>(['tapGo', 'paused', 'resumed']);
/** Effects queued further ahead than this are dropped. */
const MAX_WAIT = 4;
let busyUntil = 0;

const FX: Record<Sfx, () => void> = {
  tap() { const out = sfxOut(); const t = T(); const g = gain(0); g.connect(out); env(g, t, 0.001, 0.25, 0.04); osc('sine', 1600, t, t + 0.06, g).frequency.exponentialRampToValueAtTime(900, t + 0.04); },
  shuffle() {
    const out = sfxOut(); const t0 = T();
    for (let i = 0; i < 16; i++) { const t = t0 + i * 0.045 + Math.random() * 0.01; const g = gain(0); const bp = filter('bandpass', 2500 + Math.random() * 1500, 0.9); bp.connect(g); g.connect(out); env(g, t, 0.002, 0.28, 0.035); noise(t, 0.05, bp); }
    const t = t0 + 16 * 0.045 + 0.05; const g = gain(0); const bp = filter('bandpass', 1200, 0.7); bp.connect(g); g.connect(out); env(g, t, 0.003, 0.5, 0.09); noise(t, 0.12, bp);
  },
  deal() {
    const out = sfxOut(); const t = T(); const g = gain(0); const bp = filter('bandpass', 3800, 1.2); bp.connect(g); g.connect(out);
    bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.08); env(g, t, 0.004, 0.4, 0.08); noise(t, 0.1, bp);
  },
  play() {
    const out = sfxOut(); const t = T(); const g = gain(0); const bp = filter('bandpass', 1800, 0.8); bp.connect(g); g.connect(out); env(g, t, 0.002, 0.5, 0.05); noise(t, 0.07, bp);
    const tg = gain(0); tg.connect(out); env(tg, t, 0.002, 0.35, 0.07); osc('sine', 180, t, t + 0.1, tg).frequency.exponentialRampToValueAtTime(90, t + 0.07);
  },
  // SLAP! Huge: Big plus a cartoon "POW", brass hit and rattle.
  slap() {
    const out = sfxOut(); const t = T(); const room = reverb(2, out, 0.45);
    const wg = gain(0); const wbp = filter('bandpass', 500, 2); wbp.connect(wg); wg.connect(out);
    wbp.frequency.setValueAtTime(350, t); wbp.frequency.exponentialRampToValueAtTime(4200, t + 0.15);
    wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.5, t + 0.14); wg.gain.exponentialRampToValueAtTime(0.001, t + 0.17); noise(t, 0.18, wbp);
    const h = t + 0.16;
    const crack = gain(0); const chp = filter('highpass', 600); const d1 = drive(6); chp.connect(d1); d1.connect(crack); crack.connect(out); crack.connect(room);
    env(crack, h, 0.001, 1.2, 0.2); noise(h, 0.25, chp, 0.75);
    const body = gain(0); const d2 = drive(4); d2.connect(body); body.connect(out); body.connect(room); env(body, h, 0.002, 1.0, 0.45);
    const o = osc('sine', 220, h, h + 0.5, d2); o.frequency.exponentialRampToValueAtTime(32, h + 0.42);
    const pow = gain(0); const plp = filter('lowpass', 2500); plp.connect(pow); pow.connect(out); env(pow, h, 0.002, 0.3, 0.25);
    const po = osc('square', 700, h, h + 0.3, plp); po.frequency.exponentialRampToValueAtTime(90, h + 0.25);
    for (const [m, v] of [[55, 0.5], [58, 0.5], [62, 0.5]] as const) brass(m, h + 0.02, 0.18, room, v);
    for (let i = 0; i < 6; i++) snare(h + 0.05 + i * 0.03, out, 0.35 - i * 0.05);
  },
  pickUp() {
    const out = sfxOut(); const t0 = T();
    for (let i = 0; i < 7; i++) { const t = t0 + i * 0.05; const g = gain(0); const bp = filter('bandpass', 1500 + i * 250, 1); bp.connect(g); g.connect(out); env(g, t, 0.003, 0.3, 0.06); noise(t, 0.08, bp); }
    const t = t0 + 0.4; const g = gain(0); g.connect(out); env(g, t, 0.01, 0.2, 0.35); const o = osc('triangle', 300, t, t + 0.4, g); o.frequency.exponentialRampToValueAtTime(140, t + 0.35);
  },
  trickDone() {
    const out = sfxOut(); const t = T(); const g = gain(0); const bp = filter('bandpass', 2000, 0.6); bp.connect(g); g.connect(out);
    bp.frequency.setValueAtTime(1200, t); bp.frequency.exponentialRampToValueAtTime(4500, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); noise(t, 0.3, bp);
  },
  joker() {
    const out = sfxOut(); const c = ctx as AudioContext; const t = T(); const g = gain(0); g.connect(out); env(g, t, 0.005, 0.35, 0.55);
    const o = osc('sine', 220, t, t + 0.6, g); o.frequency.exponentialRampToValueAtTime(660, t + 0.12); o.frequency.exponentialRampToValueAtTime(330, t + 0.5);
    const v = c.createOscillator(); v.frequency.setValueAtTime(18, t); v.frequency.linearRampToValueAtTime(6, t + 0.5); const vg = gain(60); v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + 0.6);
    [0, 4, 7, 12, 7, 4].forEach((d, i) => bell(96 + d, t + 0.05 + i * 0.07, 0.3, out, 0.5)); // jester bells
  },
  gotAway() {
    const out = sfxOut(); const t = T(); [72, 76, 79, 84, 88].forEach((m, i) => bell(m, t + i * 0.07, 0.6, out, 0.9));
    const g = gain(0); const hp = filter('highpass', 6000); hp.connect(g); g.connect(out); env(g, t + 0.3, 0.05, 0.08, 0.5); noise(t + 0.3, 0.6, hp);
  },
  // Last place: sad trombone.
  lastPlace() {
    const out = sfxOut(); const c = ctx as AudioContext; const t = T(); const notes = [[63, 0.32], [62, 0.32], [61, 0.32], [60, 1.1]] as const;
    let at = t;
    notes.forEach(([m, d], i) => {
      const g = gain(0); const lp = filter('lowpass', 500, 4); lp.connect(g); g.connect(out);
      lp.frequency.setValueAtTime(400, at); lp.frequency.linearRampToValueAtTime(1400, at + d * 0.5); lp.frequency.linearRampToValueAtTime(500, at + d);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.04); g.gain.setValueAtTime(0.28, at + d - 0.06); g.gain.exponentialRampToValueAtTime(0.001, at + d);
      const o = osc('sawtooth', hz(m - 12), at, at + d + 0.05, lp);
      if (i === 3) { const v = c.createOscillator(); v.frequency.value = 6; const vg = gain(0); vg.gain.setValueAtTime(0, at); vg.gain.linearRampToValueAtTime(5, at + 0.5); v.connect(vg); vg.connect(o.frequency); v.start(at); v.stop(at + d); }
      at += d;
    });
  },
  roundWinner() {
    const out = sfxOut(); const t = T(); let at = t;
    for (const [m, d] of [[60, 0.12], [64, 0.12], [67, 0.12], [72, 0.6]] as const) { brass(m, at, d, out, 0.9); brass(m - 12, at, d, out, 0.5); at += d; }
    snare(t + 0.36, out, 0.6); kick(t + 0.36, out, 0.8);
  },
  ultimateWinner() {
    const out = sfxOut(); const t = T(); let at = t;
    for (const [m, d] of [[67, 0.14], [67, 0.14], [67, 0.14], [72, 0.5], [71, 0.14], [72, 0.9]] as const) { brass(m, at, d, out, 1); brass(m - 7, at, d, out, 0.6); at += d; }
    for (let i = 0; i < 10; i++) snare(t + i * 0.05, out, 0.25 + i * 0.05);
    kick(t + 1.06, out); [84, 88, 91, 96].forEach((m, i) => bell(m, t + 1.1 + i * 0.06, 1, out, 0.5));
  },
  coward() {
    const out = sfxOut(); const t = T();
    ([[55, 0.2], [55, 0.2], [51, 1.0]] as const).forEach(([m, d], i) => {
      const at = t + i * 0.28; brass(m - 12, at, d, out, 0.9); brass(m, at, d, out, 0.6);
      if (i === 2) { for (let k = 0; k < 14; k++) snare(at + k * 0.06, out, 0.25); kick(at, out); }
    });
  },
  voteResult() {
    const out = sfxOut(); const t = T(); for (let i = 0; i < 22; i++) snare(t + i * 0.035, out, 0.15 + i * 0.025);
    const d = t + 22 * 0.035; kick(d, out); bell(84, d, 1.2, out, 1); bell(91, d, 1.2, out, 0.6);
  },
  // Reaction Tap "ready… GO", split in two: the three ready beeps when the
  // player starts, the GO tone when the pad turns green (the wait is random).
  tapReady() {
    const out = sfxOut(); const t = T();
    for (const s of [0, 0.5, 1]) { const g = gain(0); g.connect(out); env(g, t + s, 0.003, 0.25, 0.12); osc('square', 880, t + s, t + s + 0.15, g); }
  },
  tapGo() {
    const out = sfxOut(); const t = T();
    const g = gain(0); const lp = filter('lowpass', 4000); lp.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.setValueAtTime(0.3, t + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc('square', 1760, t, t + 0.5, lp); osc('square', 1764, t, t + 0.5, lp);
  },
  reaction() {
    const out = sfxOut(); const t = T(); const g = gain(0); g.connect(out); env(g, t, 0.002, 0.3, 0.07); osc('sine', 500, t, t + 0.09, g).frequency.exponentialRampToValueAtTime(1300, t + 0.06);
    [0.1, 0.18, 0.26].forEach((s, i) => { const gg = gain(0); gg.connect(out); env(gg, t + s, 0.002, 0.16, 0.05); osc('triangle', 1400 - i * 150, t + s, t + s + 0.07, gg).frequency.exponentialRampToValueAtTime(1000 - i * 150, t + s + 0.05); });
  },
  yourTurn() { const out = sfxOut(); const t = T(); bell(84, t, 0.5, out, 0.6); bell(88, t + 0.12, 0.7, out, 0.6); },
  notAllowed() { const out = sfxOut(); const t = T(); for (const s of [0, 0.11]) { const g = gain(0); const lp = filter('lowpass', 900); lp.connect(g); g.connect(out); env(g, t + s, 0.003, 0.25, 0.08); osc('square', 150, t + s, t + s + 0.1, lp); } },
  // Take-cards request: Knock knock.
  knock() {
    const out = sfxOut(); const t = T();
    for (const s of [0, 0.13]) {
      const g = gain(0); const bp = filter('bandpass', 380, 3); bp.connect(g); g.connect(out); env(g, t + s, 0.001, 0.9, 0.07); noise(t + s, 0.09, bp);
      const tg = gain(0); tg.connect(out); env(tg, t + s, 0.001, 0.3, 0.06); osc('sine', 140, t + s, t + s + 0.08, tg);
    }
  },
  // Paused: Click (one soft click down). Resumed: the matching click up.
  paused() { const out = sfxOut(); const t = T(); const g = gain(0); g.connect(out); env(g, t, 0.002, 0.35, 0.09); osc('sine', 660, t, t + 0.12, g).frequency.exponentialRampToValueAtTime(330, t + 0.08); },
  // HAHAHA! (final two: the higher last card has to pick up or forfeit). Four cartoon "ha"s, falling.
  laugh() {
    const out = sfxOut(); const t0 = T();
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.17; const f = 330 - i * 28;
      const g = gain(0); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.setValueAtTime(0.45, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      for (const [fc, q, a] of [[750, 4, 1], [1250, 5, 0.6], [2500, 6, 0.25]] as const) {
        const bp = filter('bandpass', fc, q); const ga = gain(a); bp.connect(ga); ga.connect(g);
        const o = osc('sawtooth', f, t, t + 0.15, bp); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.13);
      }
      const h = gain(0); const hp = filter('highpass', 3000); hp.connect(h); h.connect(out); env(h, t, 0.005, 0.12, 0.04); noise(t, 0.06, hp);
    }
  },
  resumed() { const out = sfxOut(); const t = T(); const g = gain(0); g.connect(out); env(g, t, 0.002, 0.35, 0.09); osc('sine', 330, t, t + 0.12, g).frequency.exponentialRampToValueAtTime(660, t + 0.08); },
};

/** For the automated checks: every effect played, newest last. */
export const sfxLog: Sfx[] = [];
/** For the automated checks: every effect played at least once since the last clear. */
export const sfxSeen = new Set<Sfx>();

function fire(name: Sfx): void {
  // 2.32.2: no sound while Fast forward or Skip to end of round runs (the table moves too fast to match it).
  if (skipping() || instantSkipping()) return;
  if (!sfxReady()) return;
  try {
    if (DUCK.has(name)) duckMusic((ctx as AudioContext).currentTime, DUR[name]);
    FX[name]();
  } catch { /* a sound must never break the game */ }
}

/**
 * Play an effect (after `delayMs`). Big effects queue one after another;
 * small ones are skipped while a big one plays. Does nothing while effects are off.
 */
export function sfx(name: Sfx, delayMs = 0): void {
  const run = (): void => {
    sfxLog.push(name);
    sfxSeen.add(name);
    if (sfxLog.length > 200) sfxLog.splice(0, 100);
    if (!sfxReady()) return;
    const now = (ctx as AudioContext).currentTime;
    if (NOW.has(name)) { fire(name); return; }
    if (!BIG.has(name)) {
      if (now < busyUntil - 0.05) return;
      fire(name);
      return;
    }
    const start = Math.max(now, busyUntil);
    if (start - now > MAX_WAIT) return;
    busyUntil = start + DUR[name];
    if (start - now < 0.02) fire(name);
    else window.setTimeout(() => fire(name), (start - now) * 1000);
  };
  if (delayMs > 0) window.setTimeout(run, delayMs); else run();
}

export const ALL_SFX = Object.keys(FX) as Sfx[];

/** For the automated checks: run every effect once, return any that throw. */
export function tryAllSfx(): string[] {
  const bad: string[] = [];
  if (!sfxReady()) return ['sound not running'];
  for (const n of ALL_SFX) { try { FX[n](); } catch (e) { bad.push(`${n}: ${String(e)}`); } }
  return bad;
}

/** The sound of the card that was just played (straight away). */
export function cardSound(events: readonly SessionEvent[]): void {
  if (events.some((e) => e.type === 'jokerPlayed')) sfx('joker');
  else if (events.some((e) => e.type === 'cardPlayed')) sfx('play');
}

/**
 * Everything else that just happened, in order, one after another. Called
 * straight away, or when the end-of-trick animation has finished. The slap,
 * the pick-up of the trick and the trick-done swish are played by the trick
 * animation (game.ts); `withTrick` plays them here when there is none.
 */
export function eventSounds(events: readonly SessionEvent[], withTrick: boolean): void {
  const has = (t: SessionEvent['type']): boolean => events.some((e) => e.type === t);
  if (withTrick) {
    if (has('slapped')) { sfx('slap'); sfx('pickUp'); } else if (has('trickResolved')) sfx('trickDone');
  }
  if (has('wastePilePickedUp') || has('cardsTaken')) sfx('pickUp');
  const end = events.find((e) => e.type === 'roundEnded');
  const loserPlace = end && end.type === 'roundEnded' ? end.finishingOrder.length : 0;
  for (const e of events) {
    if (e.type === 'playerOut' && e.place !== loserPlace) sfx(e.place === 1 ? 'roundWinner' : 'gotAway');
  }
  if (end) sfx('lastPlace');
  if (events.some((e) => e.type === 'ultimateLabels' && e.winner)) sfx('ultimateWinner');
  if (has('drawCoward')) sfx('coward');
  else if (has('voteResolved')) sfx('voteResult');
  if (has('finalTwoChoice')) sfx('laugh');
  if (has('takeRequested')) sfx('knock');
  if (has('paused')) sfx('paused');
  if (has('resumed')) sfx('resumed');
}
