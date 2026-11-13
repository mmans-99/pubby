/**
 * RoomCore: all the logic of one room on the relay (CODE.md 9r.3.4). Pure
 * TypeScript: no Cloudflare types, no clock (the caller passes `now`), no I/O.
 * It returns Effects; the Room Durable Object (or the local stand-in relay)
 * carries them out. That is what lets the tests and the stand-in use the same code.
 *
 * Payloads are never read here: a frame's header says where it goes, and the
 * payload is passed on unchanged.
 */
import { FRAME_MAX, frame, readFrame } from '../../../src/net/relayproto.ts';
import { makeToken } from './ids.ts';
import type { ListEntry } from './directory.ts';

/** Seats in a room: the host plus up to 7 others. Copied from MAX_PLAYERS (src/rules/cards.ts), not imported. */
export const SEATS_MAX = 8;
const HOST_LINK_SOCKET_ROLE = 'host';

export interface Limits {
  idleMs: number;        // no message at all for this long: the room closes
  maxAgeMs: number;      // a room closes this long after it was made
  hostGraceMs: number;   // after the host's socket drops, the room waits this long for it
  tokenMs: number;       // a join token must be used this soon
  ipTries: number;       // wrong passcodes per address...
  ipWindowMs: number;    // ...in this window
  roomTries: number;     // wrong passcodes per room...
  roomWindowMs: number;  // ...in this window
  saveEveryMs: number;   // lastActive is saved at most this often while messages flow
}

export const LIMITS: Limits = {
  idleMs: 30 * 60_000,
  maxAgeMs: 12 * 60 * 60_000,
  hostGraceMs: 120_000,
  tokenMs: 120_000,
  ipTries: 5,
  ipWindowMs: 5 * 60_000,
  roomTries: 20,
  roomWindowMs: 10 * 60_000,
  saveEveryMs: 60_000,
};

export interface RoomSettings {
  roomId: string;
  name: string;
  hostName: string;
  version: string;
  passHash: string;
  createdAt: number;
}

export type Effect =
  | { send: string; text: string }                   // send text to the socket with this id
  | { close: string; code: number; reason: string }  // close that socket
  | { list: ListEntry | null }                       // tell the Directory: update this room, or remove it (null)
  | { save: true }                                   // write toJSON() to storage
  | { alarm: number }                                // wake up at this time (ms)
  | { forget: true };                                // delete storage: the room is gone

export type TryError = 'wrong-passcode' | 'started' | 'full' | 'version' | 'too-many-tries' | 'no-room';
export type TryResult =
  | { ok: true; joinToken: string; effects: Effect[] }
  | { ok: false; error: TryError; need?: string; effects: Effect[] };
export type ConnectResult =
  | { ok: true; effects: Effect[] }
  | { ok: false; code: number; reason: string };

interface TokenInfo {
  issuedAt: number;
  linkId: string | null;   // set the first time the token connects; the same id comes back on rejoin
  kicked: boolean;
}

/** What toJSON writes. Maps become arrays of pairs. */
interface Stored {
  settings: RoomSettings;
  hostToken: string;
  seats: number;
  started: boolean;
  tokens: [string, TokenInfo][];
  nextLink: number;
  hostSocket: string | null;
  linkSockets: [string, string][];   // linkId -> socket id
  socketRole: [string, string][];    // socket id -> 'host' or linkId
  lastActive: number;
  lastSaved: number;
  hostGoneAt: number | null;
  gone: boolean;
  wrongIp: [string, number[]][];
  wrongRoom: number[];
}

const recent = (times: number[], now: number, windowMs: number): number[] =>
  times.filter((t) => now - t < windowMs);

export class RoomCore {
  private readonly settings: RoomSettings;
  private readonly hostToken: string;
  private readonly limits: Limits;
  private seats = 1;                       // people in the room, the host included, as the host reports
  private started = false;
  private tokens = new Map<string, TokenInfo>();
  private nextLink = 0;
  private hostSocket: string | null = null;
  private linkSockets = new Map<string, string>();
  private socketRole = new Map<string, string>();
  private lastActive = 0;
  private lastSaved = 0;
  private hostGoneAt: number | null = null;
  private gone = false;
  private wrongIp = new Map<string, number[]>();
  private wrongRoom: number[] = [];

  private constructor(settings: RoomSettings, hostToken: string, limits: Limits) {
    this.settings = settings;
    this.hostToken = hostToken;
    this.limits = limits;
  }

  /** A new room. The host has not connected yet; the room appears in the list at once. */
  static create(s: RoomSettings, hostToken: string, now: number, limits: Limits = LIMITS): { core: RoomCore; effects: Effect[] } {
    const core = new RoomCore(s, hostToken, limits);
    core.lastActive = now;
    core.lastSaved = now;
    return { core, effects: [{ list: core.listEntry() }, { save: true }, { alarm: core.nextAlarm() }] };
  }

  /** Brings a room back after the object wakes up. */
  static fromJSON(j: unknown, limits: Limits = LIMITS): RoomCore {
    const s = j as Stored;
    const core = new RoomCore(s.settings, s.hostToken, limits);
    core.seats = s.seats;
    core.started = s.started;
    core.tokens = new Map(s.tokens);
    core.nextLink = s.nextLink;
    core.hostSocket = s.hostSocket;
    core.linkSockets = new Map(s.linkSockets);
    core.socketRole = new Map(s.socketRole);
    core.lastActive = s.lastActive;
    core.lastSaved = s.lastSaved;
    core.hostGoneAt = s.hostGoneAt;
    core.gone = s.gone;
    core.wrongIp = new Map(s.wrongIp);
    core.wrongRoom = s.wrongRoom;
    return core;
  }

  toJSON(): Stored {
    return {
      settings: this.settings,
      hostToken: this.hostToken,
      seats: this.seats,
      started: this.started,
      tokens: [...this.tokens.entries()],
      nextLink: this.nextLink,
      hostSocket: this.hostSocket,
      linkSockets: [...this.linkSockets.entries()],
      socketRole: [...this.socketRole.entries()],
      lastActive: this.lastActive,
      lastSaved: this.lastSaved,
      hostGoneAt: this.hostGoneAt,
      gone: this.gone,
      wrongIp: [...this.wrongIp.entries()],
      wrongRoom: this.wrongRoom,
    };
  }

  /** A phone asks to join with the passcode. Wrong tries are counted per address and per room. */
  tryPasscode(ip: string, passHash: string, version: string, now: number): TryResult {
    if (this.gone) return { ok: false, error: 'no-room', effects: [] };
    const { ipTries, ipWindowMs, roomTries, roomWindowMs } = this.limits;
    const ipTimes = recent(this.wrongIp.get(ip) ?? [], now, ipWindowMs);
    const roomTimes = recent(this.wrongRoom, now, roomWindowMs);
    if (ipTimes.length >= ipTries || roomTimes.length >= roomTries) {
      return { ok: false, error: 'too-many-tries', effects: [] };
    }
    if (version !== this.settings.version) {
      return { ok: false, error: 'version', need: this.settings.version, effects: [] };
    }
    if (passHash !== this.settings.passHash) {
      ipTimes.push(now);
      roomTimes.push(now);
      this.wrongIp.set(ip, ipTimes);
      this.wrongRoom = roomTimes;
      return { ok: false, error: 'wrong-passcode', effects: [{ save: true }] };
    }
    if (this.started) return { ok: false, error: 'started', effects: [] };
    if (this.seats + this.pendingCount(now) >= SEATS_MAX) return { ok: false, error: 'full', effects: [] };
    const joinToken = makeToken();
    this.tokens.set(joinToken, { issuedAt: now, linkId: null, kicked: false });
    return { ok: true, joinToken, effects: [{ save: true }] };
  }

  /** A socket opened with a token: the host's, or a joining phone's. */
  connect(token: string, socketId: string, now: number): ConnectResult {
    if (this.gone) return { ok: false, code: 4003, reason: 'not-allowed' };

    if (token === this.hostToken) {
      const effects: Effect[] = [];
      if (this.hostSocket !== null && this.hostSocket !== socketId) {
        this.socketRole.delete(this.hostSocket);
        effects.push({ close: this.hostSocket, code: 4000, reason: 'replaced' });
      }
      this.hostSocket = socketId;
      this.socketRole.set(socketId, HOST_LINK_SOCKET_ROLE);
      this.hostGoneAt = null;
      effects.push(
        { send: socketId, text: frame({ c: 'ready', roomId: this.settings.roomId }) },
        { list: this.listEntry() },
        { save: true },
        { alarm: this.nextAlarm() },
      );
      return { ok: true, effects };
    }

    const info = this.tokens.get(token);
    if (!info || info.kicked) return { ok: false, code: 4003, reason: 'not-allowed' };
    if (info.linkId === null && (this.started || now - info.issuedAt >= this.limits.tokenMs)) {
      return { ok: false, code: 4003, reason: 'not-allowed' };
    }
    if (info.linkId === null) {
      this.nextLink += 1;
      info.linkId = `o${this.nextLink}`;
    }
    const linkId = info.linkId;
    const effects: Effect[] = [];
    const old = this.linkSockets.get(linkId);
    if (old !== undefined && old !== socketId) {
      this.socketRole.delete(old);
      effects.push({ close: old, code: 4000, reason: 'replaced' });
    }
    this.linkSockets.set(linkId, socketId);
    this.socketRole.set(socketId, linkId);
    effects.push({ send: socketId, text: frame({ c: 'ready', link: linkId }) });
    if (this.hostSocket !== null) effects.push({ send: this.hostSocket, text: frame({ c: 'joined', link: linkId }) });
    effects.push({ save: true });
    return { ok: true, effects };
  }

  /** A message arrived on a socket. `text` is the whole frame, as received. */
  frame(socketId: string, text: string, now: number): Effect[] {
    if (this.gone) return [];
    const effects: Effect[] = [];
    this.lastActive = now;
    if (now - this.lastSaved >= this.limits.saveEveryMs) {
      this.lastSaved = now;
      effects.push({ save: true });
    }
    if (text.length > FRAME_MAX) return [...effects, { close: socketId, code: 1009, reason: 'too-big' }];
    const role = this.socketRole.get(socketId);
    if (role === undefined) return [...effects, { close: socketId, code: 4002, reason: 'bad-frame' }];
    const parsed = readFrame(text);
    if (!parsed) return [...effects, { close: socketId, code: 4002, reason: 'bad-frame' }];
    const h = parsed.header;

    if (role === HOST_LINK_SOCKET_ROLE) {
      return [...effects, ...this.fromHost(socketId, h, parsed.payload)];
    }
    // A joining phone: only "up" is allowed, and it goes to the host.
    if (h.c !== 'up') return [...effects, { close: socketId, code: 4002, reason: 'bad-frame' }];
    if (this.hostSocket !== null) {
      effects.push({ send: this.hostSocket, text: frame({ c: 'from', from: role }, parsed.payload) });
    }
    return effects;
  }

  /** The socket closed or failed. */
  closed(socketId: string, now: number): Effect[] {
    if (this.gone) return [];
    const role = this.socketRole.get(socketId);
    if (role === undefined) return [];
    this.socketRole.delete(socketId);

    if (role === HOST_LINK_SOCKET_ROLE) {
      if (this.hostSocket !== socketId) return [];
      this.hostSocket = null;
      this.hostGoneAt = now;
      const effects: Effect[] = [];
      for (const sock of this.linkSockets.values()) effects.push({ send: sock, text: frame({ c: 'host-gone' }) });
      effects.push({ list: null }, { save: true }, { alarm: this.nextAlarm() });
      return effects;
    }

    if (this.linkSockets.get(role) !== socketId) return [];
    this.linkSockets.delete(role);
    const effects: Effect[] = [];
    if (this.hostSocket !== null) effects.push({ send: this.hostSocket, text: frame({ c: 'left', link: role }) });
    effects.push({ save: true });
    return effects;
  }

  /** The wake-up time came. Closes the room if it has really expired; otherwise schedules the next check. */
  alarm(now: number): Effect[] {
    if (this.gone) return [];
    const { idleMs, maxAgeMs, hostGraceMs } = this.limits;
    const expired =
      now - this.lastActive >= idleMs ||
      now - this.settings.createdAt >= maxAgeMs ||
      (this.hostGoneAt !== null && now - this.hostGoneAt >= hostGraceMs);
    return expired ? this.endRoom() : [{ alarm: this.nextAlarm() }];
  }

  /** A frame from the host's socket. Bad frames close the host's socket. */
  private fromHost(hostSock: string, h: Record<string, unknown>, payload: string): Effect[] {
    const bad: Effect[] = [{ close: hostSock, code: 4002, reason: 'bad-frame' }];
    switch (h.c) {
      case 'to': {
        if (typeof h.to !== 'string') return bad;
        const sock = this.linkSockets.get(h.to);
        return sock === undefined ? [] : [{ send: sock, text: frame({ c: 'down' }, payload) }];
      }
      case 'update': {
        const seats = h.seats;
        if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < 1 || seats > SEATS_MAX) return bad;
        if (typeof h.started !== 'boolean') return bad;
        this.seats = seats;
        this.started = h.started;
        return [{ list: this.listEntry() }, { save: true }];
      }
      case 'kick': {
        if (typeof h.link !== 'string') return bad;
        const linkId = h.link;
        const entry = [...this.tokens.values()].find((t) => t.linkId === linkId);
        if (!entry) return [];
        entry.kicked = true;
        const effects: Effect[] = [];
        const sock = this.linkSockets.get(linkId);
        if (sock !== undefined) {
          this.linkSockets.delete(linkId);
          this.socketRole.delete(sock);
          effects.push(
            { send: sock, text: frame({ c: 'kicked' }) },
            { close: sock, code: 4001, reason: 'kicked' },
          );
        }
        effects.push({ save: true });
        return effects;
      }
      case 'close':
        return this.endRoom();
      default:
        return bad;
    }
  }

  /** Ends the room for everyone: "closed" to every phone, every socket closed, removed from the list, storage deleted. */
  private endRoom(): Effect[] {
    const effects: Effect[] = [];
    for (const sock of this.linkSockets.values()) {
      effects.push({ send: sock, text: frame({ c: 'closed' }) });
    }
    for (const sock of this.linkSockets.values()) effects.push({ close: sock, code: 1000, reason: 'closed' });
    if (this.hostSocket !== null) effects.push({ close: this.hostSocket, code: 1000, reason: 'closed' });
    effects.push({ list: null }, { forget: true });
    this.gone = true;
    this.hostSocket = null;
    this.linkSockets.clear();
    this.socketRole.clear();
    return effects;
  }

  /** The entry for the room list: null once the game has started (the room leaves the list). */
  private listEntry(): ListEntry | null {
    if (this.started) return null;
    return {
      roomId: this.settings.roomId,
      name: this.settings.name,
      hostName: this.settings.hostName,
      seats: this.seats,
      maxSeats: SEATS_MAX,
      version: this.settings.version,
      createdAt: this.settings.createdAt,
    };
  }

  /** Join tokens issued recently that no phone has used yet: they hold a seat until they expire. */
  private pendingCount(now: number): number {
    let n = 0;
    for (const t of this.tokens.values()) {
      if (t.linkId === null && !t.kicked && now - t.issuedAt < this.limits.tokenMs) n += 1;
    }
    return n;
  }

  /** The earliest moment the room could expire. Idle time is measured from lastActive, which is saved at least every saveEveryMs. */
  private nextAlarm(): number {
    const { idleMs, maxAgeMs, hostGraceMs } = this.limits;
    const times = [this.lastActive + idleMs, this.settings.createdAt + maxAgeMs];
    if (this.hostGoneAt !== null) times.push(this.hostGoneAt + hostGraceMs);
    return Math.min(...times);
  }
}
