/**
 * Connection test (Phase 4 slice 0, CODE.md section 4a): can two phones link
 * up over WebRTC with the two QR scans, with no internet? Pings both ways,
 * shows the round-trip time, lost messages and which addresses are used, and
 * sends 😂 across. This screen keeps its own state and its own element, so
 * the camera and the link survive the app's re-renders.
 */

import { h } from './dom.ts';
import { makeQr, qrSvg } from '../net/qr.ts';
import { Peer, type PathInfo } from '../net/peer.ts';
import { joinLink } from '../net/signal.ts';
import { canScan, readerKind, startScanner, type Scanner } from '../net/scan.ts';

type View = (HTMLElement | null)[];

type Step = 'pick' | 'host-code' | 'host-scan' | 'join-scan' | 'join-code' | 'connecting' | 'connected' | 'lost' | 'failed';

const CONNECT_TIMEOUT_MS = 20000;
const PING_EVERY_MS = 1000;
const LOST_AFTER_MS = 3000;

interface Stats {
  sent: number;
  got: number;
  lost: number;
  rtts: number[];
  pending: Map<number, number>;
  lastHeard: number;
  laughsIn: number;
  laughsOut: number;
}

let root: HTMLElement | null = null;
let onBack: () => void = () => undefined;
let step: Step = 'pick';
let peer: Peer | null = null;
let code = '';
let scanner: Scanner | null = null;
let video: HTMLVideoElement | null = null;
let scanError = '';
/** Why the last scanned code was refused (wrong kind, not a Pubby code). */
let scanHint = '';
let failMessage = '';
let busy = false;
let stats: Stats = freshStats();
let path: PathInfo | null = null;
let connectedAt = 0;
let lostAfterSec = 0;
let pingTimer: number | undefined;
let connectTimer: number | undefined;
let pingId = 0;
let wakeLock: { release(): Promise<void> } | null = null;
let addresses: string[] = [];

function freshStats(): Stats {
  return { sent: 0, got: 0, lost: 0, rtts: [], pending: new Map(), lastHeard: 0, laughsIn: 0, laughsOut: 0 };
}

/** The screen element. Always the same element, so the camera keeps running. */
export function netTestScreen(back: () => void): HTMLElement {
  onBack = back;
  if (!root) {
    root = h('main', { class: 'screen nettest' });
    exposeTestHook();
    draw();
  }
  return root;
}

/** Leaving the screen: stop the camera, close the link, start fresh next time. */
export function stopNetTest(): void {
  if (!root) return;
  reset();
  root = null;
}

function reset(): void {
  stopScan();
  stopTimers();
  peer?.close();
  peer = null;
  code = '';
  scanError = '';
  scanHint = '';
  failMessage = '';
  busy = false;
  stats = freshStats();
  path = null;
  addresses = [];
  releaseWake();
  step = 'pick';
}

function go(next: Step): void {
  if (next !== step) scanHint = '';
  step = next;
  draw();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw(): void {
  if (!root) return;
  root.replaceChildren(
    h('div', { class: 'top-bar' },
      h('button', { class: 'ghost', onclick: () => onBack() }, '‹ Back'),
      h('h1', null, 'Connection test'),
    ),
    ...body().filter((x): x is HTMLElement => x !== null),
  );
}

function body(): View {
  switch (step) {
    case 'pick': return pickView();
    case 'host-code': return codeView('host');
    case 'join-code': return codeView('join');
    case 'host-scan': return scanView('host');
    case 'join-scan': return scanView('join');
    case 'connecting': return [h('div', { class: 'panel center' }, h('p', { class: 'net-big' }, 'Connecting…'), h('p', { class: 'muted small' }, 'This takes a few seconds.'))];
    case 'connected': return connectedView();
    case 'lost': return lostView();
    case 'failed': return failedView();
  }
}

function pickView(): View {
  const reader = canScan();
  return [
    h('p', null, 'Checks that two phones can play together with no internet. You need two phones on the same Wi-Fi, or one phone joined to the other’s hotspot.'),
    h('div', { class: 'panel' },
      h('h2', null, 'This phone'),
      h('p', null, reader
        ? `✓ Can scan codes in Pubby (${readerKind() === 'built-in' ? 'browser’s reader' : 'Pubby’s reader'}), so it can host or join`
        : '✗ Can’t use the camera here. It can join with the Camera app link; the other phone must be the host.'),
      h('p', null, 'RTCPeerConnection' in window ? '✓ Can make direct links' : '✗ Can’t make direct links'),
    ),
    h('div', { class: 'stack' },
      h('button', { class: 'big', disabled: busy, onclick: () => { void startHost(); } }, 'This phone is the host'),
      h('button', { class: 'big secondary', disabled: busy, onclick: startJoin }, 'This phone is joining'),
    ),
    h('ol', { class: 'net-steps muted small' },
      h('li', null, 'Host: tap “This phone is the host”. A QR code appears.'),
      h('li', null, 'Other phone: tap “This phone is joining” and scan the host’s code. Its own code appears.'),
      h('li', null, 'Host: tap “Scan their code” and scan the other phone.'),
    ),
  ];
}

function codeView(role: 'host' | 'join'): View {
  // The host's code is a link, so an iPhone Camera app can open Pubby joining.
  const content = role === 'host' ? joinLink(pageAddress(), code) : code;
  const qr = h('div', { class: 'qr', 'data-code': content });
  qr.innerHTML = qrSvg(makeQr(content, 'M'));
  return [
    h('p', { class: 'net-big center' }, role === 'host' ? 'Code 1: let the other phone scan this' : 'Code 2: let the host scan this'),
    qr,
    role === 'host'
      ? h('p', { class: 'muted small center' }, 'Scan it in Pubby on the other phone (“This phone is joining”). Its Camera app works too: tap the Pubby link that appears.')
      : null,
    h('p', { class: 'muted small center' }, `Turn the screen brightness up if it won’t scan. (${content.length} characters)`),
    role === 'host'
      ? h('button', { class: 'big', onclick: () => go('host-scan') }, 'Scan their code')
      : h('p', { class: 'center' }, 'Waiting for the host to scan…'),
    h('button', { class: 'big secondary', onclick: () => { reset(); draw(); } }, 'Start again'),
  ];
}

function scanView(role: 'host' | 'join'): View {
  if (linkPending) return [h('p', { class: 'net-big center' }, 'Reading the host’s code…')];
  if (role === 'join' && !canScan()) {
    return [
      h('p', { class: 'net-big center' }, 'Join with the Camera app'),
      h('ol', { class: 'net-steps' },
        h('li', null, 'Open the iPhone’s Camera app (swipe left on the lock screen, or tap the Camera icon).'),
        h('li', null, 'Point it at the host’s QR code. A yellow “pubby” link appears near the code.'),
        h('li', null, 'Tap the link. Pubby opens in Safari, already joining, and shows this phone’s code.'),
        h('li', null, 'Let the host scan that code.'),
      ),
      h('p', { class: 'muted small' }, 'Pubby must have been opened once in Safari with internet, so the link also works with no internet.'),
      h('button', { class: 'big secondary', onclick: () => { reset(); draw(); } }, 'Back to the start'),
    ];
  }
  if (!video) video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  if (!scanner && !scanError) {
    scanner = startScanner(video, (text) => { void onScanned(text); }, (msg) => { scanError = msg; stopScan(); draw(); });
  }
  return [
    h('p', { class: 'net-big center' }, role === 'host' ? 'Scan the code on the other phone' : 'Scan the code on the host’s phone'),
    h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame', 'aria-hidden': 'true' })),
    scanHint ? h('p', { class: 'note warn scan-hint' }, scanHint) : null,
    scanError ? h('p', { class: 'note warn' }, scanError) : h('p', { class: 'muted small center' }, 'Hold the code inside the box.'),
    scanError ? h('button', { class: 'big', onclick: () => { scanError = ''; draw(); } }, 'Try the camera again') : null,
    role === 'host'
      ? h('button', { class: 'big secondary', onclick: () => { stopScan(); scanError = ''; go('host-code'); } }, 'Show my code again')
      : h('button', { class: 'big secondary', onclick: () => { reset(); draw(); } }, 'Start again'),
  ];
}

function connectedView(): View {
  const r = stats.rtts;
  const last = r.length ? r[r.length - 1]! : null;
  const avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  const worst = r.length ? Math.max(...r) : null;
  const silent = stats.lastHeard ? (performance.now() - stats.lastHeard) / 1000 : 0;
  const secs = Math.floor((Date.now() - connectedAt) / 1000);
  return [
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big ok' }, '✓ Connected'),
      h('p', { class: 'muted small' }, `${peer?.role === 'host' ? 'This phone is the host' : 'This phone joined'} · ${fmtTime(secs)}`),
      silent > 3 ? h('p', { class: 'note warn' }, `No reply for ${Math.floor(silent)} seconds…`) : null,
    ),
    h('div', { class: 'panel' },
      h('h2', null, 'Speed'),
      h('p', null, `Round trip: ${ms(last)} (average ${ms(avg)}, worst ${ms(worst)})`),
      h('p', null, `Messages: ${stats.sent} sent, ${stats.got} replies, ${stats.lost} lost`),
      h('p', { class: 'muted small' }, 'Under 100 ms is great for Pubby. A few lost messages when a phone sleeps are normal.'),
    ),
    h('div', { class: 'panel' },
      h('h2', null, 'Link'),
      path
        ? h('p', null, `This phone ${addrLabel(path.local)} ↔ other phone ${addrLabel(path.remote)}`)
        : h('p', { class: 'muted' }, 'Checking…'),
      path ? h('p', { class: 'muted small' }, `Types: ${path.localType} / ${path.remoteType}, ${path.protocol}`) : null,
    ),
    h('div', { class: 'panel center' },
      h('button', { class: 'big', onclick: sendLaugh }, 'Send 😂'),
      h('p', { class: 'muted small' }, `Sent ${stats.laughsOut} · got ${stats.laughsIn}`),
    ),
    h('button', { class: 'big secondary', onclick: () => { reset(); draw(); } }, 'Disconnect'),
  ];
}

function lostView(): View {
  return [
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big bad' }, 'Connection lost'),
      h('p', null, `The link lasted ${fmtTime(lostAfterSec)}.`),
      h('p', { class: 'muted small' }, `${stats.sent} sent, ${stats.got} replies, ${stats.lost} lost. Average round trip ${ms(stats.rtts.length ? stats.rtts.reduce((a, b) => a + b, 0) / stats.rtts.length : null)}.`),
    ),
    h('p', { class: 'muted small' }, 'Usually a phone locked its screen, switched apps or left the Wi-Fi. Rejoining will come in a later step; for now, start again.'),
    h('button', { class: 'big', onclick: () => { reset(); draw(); } }, 'Start again'),
  ];
}

function failedView(): View {
  return [
    h('div', { class: 'panel center' },
      h('p', { class: 'net-big bad' }, 'Couldn’t connect'),
      h('p', null, failMessage),
    ),
    h('div', { class: 'panel' },
      h('h2', null, 'Things to try'),
      h('ul', { class: 'net-steps' },
        h('li', null, 'Both phones on the same Wi-Fi, or one phone on the other’s hotspot.'),
        h('li', null, 'Guest and public Wi-Fi often stop phones talking to each other. Try a hotspot.'),
        h('li', null, 'Turn off any VPN app.'),
        h('li', null, 'Scan quickly: the codes are only good while this screen is open.'),
      ),
      addresses.length ? h('p', { class: 'muted small' }, `This phone’s addresses: ${addresses.map(addrLabel).join(', ')}`) : null,
    ),
    h('button', { class: 'big', onclick: () => { reset(); draw(); } }, 'Start again'),
  ];
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function startHost(): Promise<void> {
  reset();
  busy = true;
  draw();
  try {
    // Allow the camera first: it's needed to scan the other phone anyway, and
    // with it allowed, Chrome shares this phone's real local address in the
    // code instead of a hidden name, which other phones find more easily.
    await warmCamera();
    peer = newPeer('host');
    code = await peer.makeOffer();
    addresses = peer.localAddresses();
    busy = false;
    go('host-code');
  } catch (e) {
    fail(`This phone couldn’t make a code. ${errText(e)}`);
  }
}

function startJoin(): void {
  reset();
  go('join-scan');
}

async function warmCamera(): Promise<void> {
  if (!canScan()) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    s.getTracks().forEach((t) => t.stop());
  } catch {
    // Refused: the code still works; the scan step asks again.
  }
}

/** Opened from a host's join link (iPhone Camera app): join with that code. */
export function joinFromLink(text: string): void {
  reset();
  step = 'join-scan';
  linkPending = true;
  draw();
  void onScanned(text).finally(() => { linkPending = false; if (step === 'join-scan') draw(); });
}

/** True while a code from a join link is being read (no camera needed). */
let linkPending = false;

let handling = false;
async function onScanned(text: string): Promise<void> {
  if (handling || (step !== 'host-scan' && step !== 'join-scan')) return;
  handling = true;
  try {
    if (step === 'host-scan') {
      await peer!.acceptAnswer(text);
      stopScan();
      go('connecting');
      startConnectTimer();
    } else {
      peer = newPeer('join');
      try {
        code = await peer.answerOffer(text);
      } catch (e) {
        peer.close();
        peer = null;
        throw e;
      }
      addresses = peer.localAddresses();
      stopScan();
      go('join-code');
      startConnectTimer(true);
    }
  } catch (e) {
    // Wrong or damaged code: say so and keep the camera going.
    scanError = '';
    showScanHint(errText(e));
  } finally {
    handling = false;
  }
}

function showScanHint(msg: string): void {
  scanHint = msg;
  draw();
}

function newPeer(role: 'host' | 'join'): Peer {
  const p = new Peer(role);
  p.onOpen = () => {
    if (peer !== p) return;
    clearTimeout(connectTimer);
    connectedAt = Date.now();
    stats = freshStats();
    stats.lastHeard = performance.now();
    void keepAwake();
    startPings();
    go('connected');
    void p.path().then((x) => { path = x; draw(); });
  };
  p.onMessage = (m) => { if (peer === p) onMessage(m); };
  p.onClose = (why) => {
    if (peer !== p) return;
    if (step === 'connected') {
      lostAfterSec = Math.floor((Date.now() - connectedAt) / 1000);
      stopTimers();
      releaseWake();
      go('lost');
    } else if (why === 'failed') {
      fail('The phones found each other’s codes but couldn’t link up.');
    }
  };
  return p;
}

function startConnectTimer(joiner = false): void {
  clearTimeout(connectTimer);
  // The joiner waits for the host to scan, which can take a while.
  connectTimer = window.setTimeout(() => {
    if (step === 'connecting' || step === 'join-code') {
      fail(joiner ? 'The host didn’t connect in time.' : 'The phones scanned each other but couldn’t link up.');
    }
  }, joiner ? CONNECT_TIMEOUT_MS * 6 : CONNECT_TIMEOUT_MS);
}

function fail(msg: string): void {
  stopScan();
  stopTimers();
  failMessage = msg;
  busy = false;
  if (peer) addresses = peer.localAddresses();
  peer?.close();
  peer = null;
  go('failed');
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type Msg = { t: 'ping'; id: number; at: number } | { t: 'pong'; id: number; at: number } | { t: 'laugh' };

function onMessage(raw: unknown): void {
  const m = raw as Msg;
  stats.lastHeard = performance.now();
  if (m.t === 'ping') {
    peer?.send({ t: 'pong', id: m.id, at: m.at });
  } else if (m.t === 'pong') {
    if (!stats.pending.has(m.id)) return; // already counted as lost
    stats.pending.delete(m.id);
    stats.got++;
    stats.rtts.push(Math.max(0, performance.now() - m.at));
    if (stats.rtts.length > 500) stats.rtts.shift();
  } else if (m.t === 'laugh') {
    stats.laughsIn++;
    floatLaugh();
    draw();
  }
}

function startPings(): void {
  stopTimers();
  pingTimer = window.setInterval(() => {
    const now = performance.now();
    for (const [id, at] of stats.pending) {
      if (now - at > LOST_AFTER_MS) { stats.pending.delete(id); stats.lost++; }
    }
    const id = ++pingId;
    if (peer?.send({ t: 'ping', id, at: now })) {
      stats.pending.set(id, now);
      stats.sent++;
    }
    if (step === 'connected') draw();
  }, PING_EVERY_MS);
}

function sendLaugh(): void {
  if (peer?.send({ t: 'laugh' })) stats.laughsOut++;
  draw();
}

function floatLaugh(): void {
  if (!root) return;
  const el = h('div', { class: 'net-laugh', 'aria-hidden': 'true' }, '😂');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function stopTimers(): void {
  clearInterval(pingTimer);
  clearTimeout(connectTimer);
  pingTimer = undefined;
}

function stopScan(): void {
  scanner?.stop();
  scanner = null;
}

// ---------------------------------------------------------------------------
// Screen kept awake while connected (where the phone allows it)
// ---------------------------------------------------------------------------

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
  // The phone drops the wake lock when the page is hidden; take it back.
  if (document.visibilityState === 'visible' && step === 'connected') { wakeLock = null; void keepAwake(); }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ms(v: number | null): string {
  return v === null ? '–' : `${Math.round(v)} ms`;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}

function pageAddress(): string {
  return location.origin + location.pathname;
}

function addrLabel(a: string): string {
  return a.endsWith('.local') ? 'hidden name (.local)' : a;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** For the automated test (testbed/net_check.py): feed a scanned code without a camera. */
function exposeTestHook(): void {
  (window as unknown as Record<string, unknown>)['pubbyNetTest'] = {
    scan: (text: string) => onScanned(text),
    code: () => code,
    step: () => step,
    stats: () => ({ sent: stats.sent, got: stats.got, lost: stats.lost, laughsIn: stats.laughsIn, path }),
  };
}
