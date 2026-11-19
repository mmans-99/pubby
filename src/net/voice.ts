/**
 * Voice chat for online rooms (CODE.md 9aq.9, Part G, 3.0.0). This file is the
 * pure logic: who makes the offer, who is talking, when to retry, and the mesh
 * that holds one link per other person. It has no browser APIs, so the tests
 * run with fake links. The WebRTC links are in voicertc.ts.
 *
 * Voice is online rooms only. Nearby games never use this file.
 */
import type { VoiceData } from './lobby.ts';

/** A talking player's level must be above this (0 to 1) for TALK_ON_MS to count as talking. */
export const TALK_LEVEL = 0.02;
export const TALK_ON_MS = 150;
/** A talking player stops this long after the level drops. */
export const TALK_OFF_MS = 400;
/** A failed connection is retried once after this long, with an ICE restart. */
export const RETRY_MS = 3000;
/** The relay logins from /turn are kept this long, then asked for again (9aq.9 item 1). */
export const ICE_MAX_AGE_MS = 2.5 * 60 * 60_000;
/**
 * 9aq.16 Fix 1: a link that has not reached "connected" this long after it opened
 * counts as failed once (the same single retry as a real failure).
 */
export const STUCK_MS = 10_000;
/**
 * 9aq.16 Fix 1: signals from someone not yet in the seat order are kept, at most this many
 * per person (the newest), and passed to their link when it opens.
 */
export const EARLY_MAX = 50;

/**
 * In each pair the player earlier in the seat order makes the offer, so two offers never cross.
 * False when either player is not in the order.
 */
export function offersTo(me: string, other: string, order: readonly string[]): boolean {
  const a = order.indexOf(me);
  const b = order.indexOf(other);
  return a !== -1 && b !== -1 && a < b;
}

/** True while the relay logins are young enough to use. */
export function iceFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < ICE_MAX_AGE_MS;
}

/** Turns a stream of levels into "talking" yes or no, with the on and off delays. */
export class TalkDetector {
  private loudSince: number | null = null;
  private lastLoud = Number.NEGATIVE_INFINITY;
  private on = false;

  constructor(
    private readonly level = TALK_LEVEL,
    private readonly onMs = TALK_ON_MS,
    private readonly offMs = TALK_OFF_MS,
  ) {}

  update(level: number, now: number): boolean {
    if (level > this.level) {
      this.lastLoud = now;
      if (this.loudSince === null) this.loudSince = now;
      if (!this.on && now - this.loudSince >= this.onMs) this.on = true;
    } else {
      this.loudSince = null;
      if (this.on && now - this.lastLoud >= this.offMs) this.on = false;
    }
    return this.on;
  }

  get talking(): boolean {
    return this.on;
  }
}

export type LinkState = 'connected' | 'failed' | 'other';

/** One connection to one other person. The browser version is in voicertc.ts; tests use a fake. */
export interface VoiceLink {
  /** A signal from the other person (an offer, an answer or one ICE candidate). */
  signal(d: VoiceData): void;
  /** The mic track to send, or null for silence. The track is opaque to this file. */
  setTrack(track: unknown | null): void;
  /** Hearing: true mutes the other person's sound on this phone. */
  setMuted(muted: boolean): void;
  /** Starts again after a failure (ICE restart). Only the offering side sends a new offer. */
  restart(): void;
  /** The other person's level, 0 to 1. 0 when nothing is playing. */
  level(): number;
  close(): void;
  /** 9aq.15 B1: a read-only snapshot for `?voicedebug` only. Optional, so tests need not write it. */
  debug?(): Record<string, unknown>;
}

export interface VoiceDeps {
  /** This phone's seat id. */
  me: string;
  /** Makes the link to `peer`. `offer` says whether this phone makes the first offer. */
  makeLink(
    peer: string,
    offer: boolean,
    out: (d: VoiceData) => void,
    state: (s: LinkState) => void,
  ): VoiceLink;
  /** Passes one signal to `to`, through the host. */
  send(to: string, d: VoiceData): void;
  /** Gets the mic. Rejects when the person refuses it. */
  acquireMic(): Promise<unknown>;
  /** Stops a mic track, so the phone's mic light goes off. */
  releaseMic(track: unknown): void;
  /** Runs `f` after `ms`. */
  later(f: () => void, ms: number): void;
}

/**
 * The voice mesh of one phone: a link to every other person who is in the call.
 * The caller says who is in the call (`setPeers`, after the seats change) and feeds
 * levels in (`tick`, every 100 ms).
 */
export class VoiceMesh {
  private order: string[] = [];
  private links = new Map<string, VoiceLink>();
  private detectors = new Map<string, TalkDetector>();
  /** 9aq.15 B1: the level read on the last tick, per person (debug snapshot only). */
  private lastLevel = new Map<string, number>();
  private muted = new Set<string>();
  private retried = new Set<string>();
  /** 9aq.16 Fix 1: links that have reached "connected" since they opened. */
  private connected = new Set<string>();
  /** 9aq.16 Fix 1: signals that came before the seat order knew the sender (H6), per person. */
  private early = new Map<string, VoiceData[]>();
  private track: unknown | null = null;
  private micSeq = 0;
  /** This phone's mic is on. */
  micOn = false;
  /** The person refused the mic (or the browser refused it). */
  micBlocked = false;

  constructor(private readonly deps: VoiceDeps) {}

  /** The people in the call, in seat order. Links to people no longer here are closed, and new ones are opened. */
  setPeers(order: readonly string[], peers: readonly string[]): void {
    this.order = [...order];
    for (const p of [...this.links.keys()]) if (!peers.includes(p)) this.drop(p);
    for (const p of peers) {
      if (p === this.deps.me || this.links.has(p)) continue;
      this.open(p, offersTo(this.deps.me, p, this.order));
      this.flushEarly(p);
    }
  }

  /**
   * A signal from `from`, passed on by the host. Opens the link if the other side started first.
   * 9aq.16 Fix 1: a signal from someone not in the seat order yet is kept (see EARLY_MAX),
   * not dropped, so an offer that beats the seat order is not lost.
   */
  onSignal(from: string, d: VoiceData): void {
    if (from === this.deps.me) return;
    if (!this.links.has(from)) {
      if (!this.order.includes(from)) {
        this.keepEarly(from, d);
        return;
      }
      this.open(from, offersTo(this.deps.me, from, this.order));
    }
    this.links.get(from)?.signal(d);
  }

  /** The mic on or off. On asks the person (once); off stops the track everywhere. */
  async setMic(on: boolean): Promise<void> {
    const seq = ++this.micSeq;
    if (!on) {
      this.micOn = false;
      this.stopTrack();
      return;
    }
    if (this.micOn) return;
    let track: unknown;
    try {
      track = await this.deps.acquireMic();
    } catch {
      if (seq === this.micSeq) {
        this.micBlocked = true;
        this.micOn = false;
      }
      return;
    }
    // The person turned it off while the browser was asking: give the track back.
    if (seq !== this.micSeq) {
      this.deps.releaseMic(track);
      return;
    }
    this.micBlocked = false;
    this.micOn = true;
    this.track = track;
    for (const l of this.links.values()) l.setTrack(track);
  }

  /** Mutes what this phone hears from `id`. Remembered by the caller, not here. */
  setMuted(id: string, muted: boolean): void {
    if (muted) this.muted.add(id);
    else this.muted.delete(id);
    this.links.get(id)?.setMuted(muted);
  }

  isMuted(id: string): boolean {
    return this.muted.has(id);
  }

  /**
   * Runs the talk detectors from the current levels. Returns true when someone's
   * talking state changed, so the caller updates the rings (no redraw is needed).
   */
  tick(now: number): boolean {
    let changed = false;
    for (const [id, link] of this.links) {
      let det = this.detectors.get(id);
      if (det === undefined) {
        det = new TalkDetector();
        this.detectors.set(id, det);
      }
      const before = det.talking;
      const level = link.level();
      this.lastLevel.set(id, level);
      if (det.update(level, now) !== before) changed = true;
    }
    return changed;
  }

  /** 9aq.15 B1: the level read on the last tick (0 when there is no link). */
  levelOf(id: string): number {
    return this.lastLevel.get(id) ?? 0;
  }

  /** 9aq.15 B1: for `?voicedebug`: each link's state, read only. Never used by the app's logic. */
  debugPeers(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, link] of this.links) {
      out[id] = {
        level: this.levelOf(id),
        talking: this.isTalking(id),
        muted: this.muted.has(id),
        link: link.debug?.() ?? null,
      };
    }
    return out;
  }

  /** Talking, to this phone: a muted person never shows as talking. */
  isTalking(id: string): boolean {
    return (this.detectors.get(id)?.talking ?? false) && !this.muted.has(id);
  }

  /** Anyone this phone hears is talking (drives the music dip, 9aq.9 item 7). */
  anyoneTalking(): boolean {
    for (const id of this.links.keys()) if (this.isTalking(id)) return true;
    return false;
  }

  /** Connected people (for the Voice sheet and the table). */
  peers(): string[] {
    return [...this.links.keys()];
  }

  /** Closes every link and the mic. Called when the room closes or this phone leaves it. */
  close(): void {
    for (const p of [...this.links.keys()]) this.drop(p);
    this.early.clear();
    this.stopTrack();
    this.micOn = false;
    this.micBlocked = false;
  }

  /** 9aq.16 Fix 1, debug only: how many early signals are kept per person. */
  earlyCounts(): Record<string, number> {
    return Object.fromEntries([...this.early].map(([id, list]) => [id, list.length]));
  }

  private keepEarly(from: string, d: VoiceData): void {
    const list = this.early.get(from) ?? [];
    list.push(d);
    if (list.length > EARLY_MAX) list.splice(0, list.length - EARLY_MAX);
    this.early.set(from, list);
  }

  /** Passes the kept signals for `peer` to its link, in the order they came, then forgets them. */
  private flushEarly(peer: string): void {
    const kept = this.early.get(peer);
    if (kept === undefined) return;
    this.early.delete(peer);
    const link = this.links.get(peer);
    if (link === undefined) return;
    for (const d of kept) link.signal(d);
  }

  private open(peer: string, offer: boolean): void {
    const link = this.deps.makeLink(
      peer,
      offer,
      (d) => this.deps.send(peer, d),
      (s) => this.linkState(peer, s),
    );
    this.links.set(peer, link);
    this.connected.delete(peer);
    link.setMuted(this.muted.has(peer));
    if (this.track !== null) link.setTrack(this.track);
    // 9aq.16 Fix 1: a link that never reaches "connected" is treated as failed once.
    // `new` is never `failed`, so without this the one retry above would never run.
    this.deps.later(() => {
      if (this.links.get(peer) !== link || this.connected.has(peer)) return;
      this.linkState(peer, 'failed');
    }, STUCK_MS);
  }

  private drop(peer: string): void {
    this.links.get(peer)?.close();
    this.links.delete(peer);
    this.detectors.delete(peer);
    this.lastLevel.delete(peer);
    this.retried.delete(peer);
    this.connected.delete(peer);
    this.early.delete(peer);
  }

  private linkState(peer: string, s: LinkState): void {
    if (s === 'connected') {
      this.connected.add(peer);
      this.retried.delete(peer);
      return;
    }
    if (s !== 'failed' || this.retried.has(peer)) return;
    // Once only: the second failure leaves the seat with no talk ring (9aq.9 item 3).
    this.retried.add(peer);
    this.deps.later(() => this.links.get(peer)?.restart(), RETRY_MS);
  }

  private stopTrack(): void {
    if (this.track !== null) this.deps.releaseMic(this.track);
    this.track = null;
    for (const l of this.links.values()) l.setTrack(null);
  }
}
