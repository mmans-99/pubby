/**
 * Online play, app side (CODE.md 9r.5.3, PROJECT.md 12d). The phones talk
 * through the room server: the host's phone and each joining phone keep one
 * WebSocket to it, and the server passes the game messages between them. The
 * game itself (lobby, moves, votes) is the same as Nearby play; only the
 * Link underneath is different (link.ts).
 *
 * Nothing here reads a game message. A frame's header is the relay's, and the
 * payload is the game message as text (relayproto.ts).
 */

import { VERSION } from '../ui/version.ts';
import { encodeParts, Rejoin } from './chunk.ts';
import type { Link } from './link.ts';
import {
  AWAY_MS, FRAME_MAX, LOST_AFTER_MS, ONLINE_CHUNK_CHARS, PASSCODE_RE, PING_EVERY_MS, PING_TEXT, PONG_TEXT,
  RELAY_PROTOCOL, ROOM_ID_RE, frame, readFrame, type RoomInfo,
} from './relayproto.ts';
import { roomServer, wsUrl } from './server.ts';

export type { RoomInfo };

/** A message the app shows as it is (CODE.md 9r.6). */
export class OnlineError extends Error {}

const REQUEST_TIMEOUT_MS = 10_000;
const REACH = 'Couldn’t reach the Pubby server. Check your internet, or play Nearby.';
const BUSY = 'Online play is busy right now. Try again later, or play Nearby.';
const LIST_LOST = 'The room list isn’t updating. Check your internet.';
/** The text for each error code the server can send (CODE.md 9r.6). */
const ERRORS: Record<string, string> = {
  'too-many-rooms': 'Too many rooms made from this connection. Try again in an hour.',
  'wrong-passcode': 'Wrong passcode.',
  'too-many-tries': 'Too many wrong tries. Wait a few minutes.',
  'no-room': 'That room has closed.',
  started: 'That game has already started.',
  full: 'That room is full.',
  'bad-name': 'Type a room name, up to 20 characters.',
  'bad-passcode': 'The passcode is 4 digits.',
  protocol: 'Update Pubby to play online: close it and open it again.',
};
/** Room for the frame header (`{"c":"to","to":"o1"}` and the newline), kept below FRAME_MAX. */
const HEADER_ROOM = 100;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The text for a failed answer from the server. */
function problem(status: number, body: unknown): OnlineError {
  const code = isObj(body) && typeof body['error'] === 'string' ? body['error'] : '';
  if (code === 'version') {
    const need = isObj(body) && typeof body['need'] === 'string' ? body['need'] : '?';
    return new OnlineError(`This room needs Pubby ${need}. You have ${VERSION}. Close Pubby and open it again to update.`);
  }
  if (status === 503 || code === 'busy') return new OnlineError(BUSY);
  if (ERRORS[code]) return new OnlineError(ERRORS[code]);
  return new OnlineError(`Online play didn’t work (error ${status}). Try again.`);
}

async function post(path: string, body: object): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(roomServer() + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new OnlineError(REACH);
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw problem(res.status, json);
  return json;
}

/** Makes a room. The host gets the room id and the host token (never shown). */
export async function createRoom(o: { name: string; passcode: string; hostName: string }): Promise<{ roomId: string; hostToken: string }> {
  const body = await post('/rooms', { name: o.name, passcode: o.passcode, hostName: o.hostName, version: VERSION, protocol: RELAY_PROTOCOL });
  if (!isObj(body) || typeof body['roomId'] !== 'string' || typeof body['hostToken'] !== 'string') throw new OnlineError(BUSY);
  return { roomId: body['roomId'], hostToken: body['hostToken'] };
}

/** Checks the passcode and gets a seat token for the room. */
export async function joinRoom(roomId: string, passcode: string): Promise<{ joinToken: string }> {
  if (!ROOM_ID_RE.test(roomId)) throw new OnlineError('That room has closed.');
  if (!PASSCODE_RE.test(passcode)) throw new OnlineError('The passcode is 4 digits.');
  const body = await post(`/rooms/${roomId}/join`, { passcode, version: VERSION, protocol: RELAY_PROTOCOL });
  if (!isObj(body) || typeof body['joinToken'] !== 'string') throw new OnlineError(BUSY);
  return { joinToken: body['joinToken'] };
}

const isRoom = (x: unknown): x is RoomInfo =>
  isObj(x) && typeof x['roomId'] === 'string' && typeof x['name'] === 'string' && typeof x['hostName'] === 'string'
  && typeof x['seats'] === 'number' && typeof x['version'] === 'string';

function parseRooms(payload: string): RoomInfo[] {
  let v: unknown;
  try { v = JSON.parse(payload); } catch { return []; }
  return Array.isArray(v) ? v.filter(isRoom) : [];
}

interface SocketHandlers {
  onOpen(): void;
  onText(text: string): void;
  /** The socket is gone, and not on purpose. `code` is the close code the server sent, if any. */
  onLost(why: string, code?: number): void;
}

/** Waits before each new try to reconnect after a drop (CODE.md 9u A2, A3). Then every REDIAL_EVERY_MS. */
const REDIAL_DELAYS_MS = [0, 2_000, 5_000, 10_000];
const REDIAL_EVERY_MS = 15_000;

/** The close code the room sends when it is gone for good (CODE.md 9r). */
const ROOM_GONE = 4003;

/**
 * One WebSocket with the keep-alive of CODE.md 9r.1 and 9r.5.3: a ping text
 * every 25 s (the server answers pong without waking up), and silence for 60 s
 * means lost. When the phone comes back to the screen after being in the
 * background, it pings at once.
 */
class RoomSocket {
  private ws: WebSocket | null = null;
  private heard = Date.now();
  private timer: number | undefined;
  private stopped = false;

  constructor(private readonly url: string, private readonly h: SocketHandlers) {}

  open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.heard = Date.now();
    ws.addEventListener('open', () => { if (this.ws === ws) this.h.onOpen(); });
    ws.addEventListener('message', (e: MessageEvent) => {
      if (this.ws !== ws) return;
      this.heard = Date.now();
      if (typeof e.data === 'string' && e.data !== PONG_TEXT) this.h.onText(e.data);
    });
    // A WebSocket that fails always closes after the error, and the close carries the code.
    ws.addEventListener('close', (e: CloseEvent) => this.lost('lost', e.code));
    this.timer = window.setInterval(() => this.beat(), PING_EVERY_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Sends text as it is. False if the socket isn't open. */
  send(text: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(text); return true; } catch { return false; }
  }

  /** Closes on purpose: no more callbacks. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* already closed */ }
  }

  private lost(why: string, code?: number): void {
    if (this.stopped) return;
    this.stop();
    this.h.onLost(why, code);
  }

  private beat(): void {
    // While the phone is in the background its timers may be frozen: judge nothing then.
    if (this.stopped || !this.ws || document.visibilityState === 'hidden') return;
    if (Date.now() - this.heard > LOST_AFTER_MS) { this.lost('lost'); return; }
    this.send(PING_TEXT);
  }

  private onVisible = (): void => {
    if (this.stopped || document.visibilityState !== 'visible') return;
    // The gap was sleep, not silence: start the silence count from now.
    this.heard = Date.now();
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) { this.lost('lost'); return; }
    this.send(PING_TEXT);
    // Give the pong a few seconds, then check the silence as usual.
    window.setTimeout(() => this.beat(), 5_000);
  };
}

/** The room list (the Join screen). The server pushes a new list when it changes; the app never asks. */
export function watchRooms(onList: (rooms: RoomInfo[]) => void, onProblem: (text: string) => void): () => void {
  let stopped = false;
  let sock: RoomSocket | null = null;
  let tries = 0;
  let again: number | undefined;
  const connect = (): void => {
    if (stopped) return;
    sock = new RoomSocket(wsUrl('/rooms'), {
      onOpen: () => { tries = 0; onProblem(''); },
      onText: (text) => {
        const f = readFrame(text);
        if (f?.header['c'] === 'rooms') onList(parseRooms(f.payload));
      },
      onLost: () => {
        sock = null;
        tries++;
        if (tries >= 2) onProblem(LIST_LOST);
        again = window.setTimeout(connect, tries === 1 ? 3_000 : tries === 2 ? 10_000 : 30_000);
      },
    });
    sock.open();
  };
  connect();
  return () => {
    stopped = true;
    window.clearTimeout(again);
    sock?.stop();
  };
}

/**
 * A message the link carries: whole, or in parts (chunk.ts). The parts are
 * sized so that every frame stays under FRAME_MAX, even when the text has
 * many quote marks (which take an escape each).
 */
function partsFor(msg: unknown, id: number): string[] {
  for (let max = ONLINE_CHUNK_CHARS; max >= 1000; max = Math.floor(max / 2)) {
    const parts = encodeParts(msg, max, id);
    if (parts.every((p) => p.length + HEADER_ROOM <= FRAME_MAX)) return parts;
  }
  throw new OnlineError('That message is too big to send.');
}

/** One phone's link through the room. Sending and receiving use the same rules as Peer. */
export class OnlineLink implements Link {
  readonly kind = 'online' as const;
  /** The server tells us when a phone is lost, so the lobby sends no app pings over it. */
  readonly keepsAlive = true;
  /** Set by the room's socket events. */
  isOpen = false;
  onOpen: () => void = () => undefined;
  onMessage: (msg: unknown) => void = () => undefined;
  onClose: (why: string) => void = () => undefined;
  /** The link dropped but may come back: this phone's socket ('self') or the host's ('host'). CODE.md 9u A3. */
  onAway: (kind: 'self' | 'host') => void = () => undefined;
  /** The link is back after an away. */
  onBack: () => void = () => undefined;
  private rejoin = new Rejoin();
  private sendId = 0;

  /**
   * id: the link id on the host's side ("o1", "o2"…), or "host" on a joining phone.
   * out: sends one payload text as a frame (to the phone, or to the host).
   * shut: closes the socket behind this link (a joining phone's own socket).
   */
  constructor(
    readonly id: string,
    private readonly out: (payload: string) => boolean,
    private readonly shut: () => void,
  ) {}

  send(msg: unknown): boolean {
    if (!this.isOpen) return false;
    try {
      for (const p of partsFor(msg, ++this.sendId)) {
        if (!this.out(p)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** On purpose: no onClose. */
  close(): void {
    this.isOpen = false;
    this.onClose = () => undefined;
    this.shut();
  }

  /** A payload from the other side: parsed, put back together if it came in parts, handed on. */
  receive(payload: string): void {
    let raw: unknown;
    try { raw = JSON.parse(payload); } catch { return; }
    const msg = this.rejoin.take(raw);
    if (msg === null) return;
    try {
      this.onMessage(msg);
    } catch (err) {
      // A handler error must not break the link; show it for the checks.
      console.error(err);
    }
  }
}

/**
 * The host's phone: one socket to the room; each joining phone appears as an OnlineLink.
 * A drop of the host's socket does not end the room (CODE.md 9u A2): the links are kept,
 * the lobby shows "Reconnecting…", and the host redials with the same host token until the
 * room answers again. The room is given up only when the server says it is gone, or after
 * the 10 minutes of AWAY_MS.
 */
export class HostRoom {
  onReady: () => void = () => undefined;
  /** A new phone, or the same link id coming back. */
  onJoined: (link: OnlineLink) => void = () => undefined;
  /** The host's socket dropped; the room is kept and the host is redialling. */
  onAway: () => void = () => undefined;
  /** The host's socket is back. */
  onBack: () => void = () => undefined;
  /** The room is gone for good (the server said so, or the host was away for 10 minutes). */
  onLost: (why: string) => void = () => undefined;
  private sock: RoomSocket | null = null;
  private readonly url: string;
  private readonly links = new Map<string, OnlineLink>();
  /** The last list size sent to the server, so repeats aren't sent. */
  private sent = '';
  private away = false;
  private firstLossAt = 0;
  private redials = 0;
  private redialTimer: number | undefined;
  private ended = false;

  constructor(roomId: string, hostToken: string) {
    this.url = wsUrl(`/rooms/${roomId}/socket?token=${encodeURIComponent(hostToken)}`);
    this.connect();
  }

  private connect(): void {
    const sock = new RoomSocket(this.url, {
      onOpen: () => undefined,
      onText: (text) => this.got(text),
      onLost: (why, code) => this.lostSocket(why, code),
    });
    this.sock = sock;
    sock.open();
  }

  private lostSocket(why: string, code?: number): void {
    if (this.ended) return;
    const overdue = this.firstLossAt !== 0 && Date.now() - this.firstLossAt >= AWAY_MS;
    if (code === ROOM_GONE || overdue) { this.giveUp(why); return; }
    if (this.firstLossAt === 0) this.firstLossAt = Date.now();
    this.away = true;
    // Keep the phones (their seats and game); they are not linked until the host is back.
    for (const l of this.links.values()) l.isOpen = false;
    this.onAway();
    this.scheduleRedial();
  }

  private scheduleRedial(): void {
    const delay = this.redials < REDIAL_DELAYS_MS.length ? REDIAL_DELAYS_MS[this.redials]! : REDIAL_EVERY_MS;
    this.redials += 1;
    window.clearTimeout(this.redialTimer);
    this.redialTimer = window.setTimeout(() => this.connect(), delay);
  }

  private giveUp(why: string): void {
    this.ended = true;
    window.clearTimeout(this.redialTimer);
    for (const l of this.links.values()) l.isOpen = false;
    this.links.clear();
    this.onLost(why);
  }

  /** Seats (people in the room, the host included) and whether the game has started: the room list uses them. */
  update(seats: number, started: boolean): void {
    const key = `${seats}:${started}`;
    if (key === this.sent) return;
    if (this.sock?.send(frame({ c: 'update', seats, started }))) this.sent = key;
  }

  /** Removes one phone from the room. */
  kick(linkId: string): void {
    this.sock?.send(frame({ c: 'kick', link: linkId }));
  }

  /** Closes the room for everyone. */
  close(): void {
    this.ended = true;
    window.clearTimeout(this.redialTimer);
    this.sock?.send(frame({ c: 'close' }));
    this.sock?.stop();
  }

  private got(text: string): void {
    const f = readFrame(text);
    if (!f) return;
    const h = f.header;
    if (h['c'] === 'ready') {
      this.sent = '';
      this.firstLossAt = 0;
      this.redials = 0;
      if (this.away) {
        // Back after a drop: the server re-links every phone with "joined" next.
        this.away = false;
        this.onBack();
      } else {
        this.onReady();
      }
    } else if (h['c'] === 'joined' && typeof h['link'] === 'string') {
      const id = h['link'];
      let link = this.links.get(id);
      if (!link) {
        link = new OnlineLink(id, (p) => this.sock?.send(frame({ c: 'to', to: id }, p)) ?? false, () => undefined);
        this.links.set(id, link);
      }
      link.isOpen = true;
      this.onJoined(link);
      link.onOpen();
    } else if (h['c'] === 'from' && typeof h['from'] === 'string') {
      this.links.get(h['from'])?.receive(f.payload);
    } else if (h['c'] === 'left' && typeof h['link'] === 'string') {
      const link = this.links.get(h['link']);
      if (link) { link.isOpen = false; link.onClose('left'); }
    }
  }
}

/**
 * The joining phone's link to the host. A drop of this phone's socket keeps the
 * seat: it redials with the same join token (CODE.md 9u A3). When the host's
 * socket is away, the room says so ("host-gone") and this phone waits for "host-back"
 * for up to 10 minutes.
 */
export function joinSocket(roomId: string, joinToken: string): OnlineLink {
  const url = wsUrl(`/rooms/${roomId}/socket?token=${encodeURIComponent(joinToken)}`);
  let sock: RoomSocket | null = null;
  let ended = false;
  let away = false;          // this phone's own socket is down
  let firstLossAt = 0;
  let redials = 0;
  let redialTimer: number | undefined;
  let hostAway = false;      // the host's socket is away (the room said so)
  let hostTimer: number | undefined;

  const end = (): void => {
    ended = true;
    window.clearTimeout(redialTimer);
    window.clearTimeout(hostTimer);
    sock?.stop();
  };
  const link = new OnlineLink('host', (p) => sock?.send(frame({ c: 'up' }, p)) ?? false, end);
  const giveUp = (why: string): void => {
    end();
    link.isOpen = false;
    link.onClose(why);
  };
  const scheduleRedial = (): void => {
    const delay = redials < REDIAL_DELAYS_MS.length ? REDIAL_DELAYS_MS[redials]! : REDIAL_EVERY_MS;
    redials += 1;
    window.clearTimeout(redialTimer);
    redialTimer = window.setTimeout(() => make(), delay);
  };
  const make = (): void => {
    if (ended) return;
    const s = new RoomSocket(url, {
      onOpen: () => undefined,
      onText: (text) => {
        const f = readFrame(text);
        if (!f) return;
        const c = f.header['c'];
        if (c === 'ready') {
          const back = away;
          away = false;
          firstLossAt = 0;
          redials = 0;
          link.isOpen = true;
          if (back) link.onBack(); else link.onOpen();
        } else if (c === 'down') {
          link.receive(f.payload);
        } else if (c === 'host-gone') {
          if (hostAway) return;
          hostAway = true;
          link.isOpen = false;
          link.onAway('host');
          // The room is kept for 10 minutes; after that, this phone gives up.
          window.clearTimeout(hostTimer);
          hostTimer = window.setTimeout(() => giveUp('host-gone'), AWAY_MS);
        } else if (c === 'host-back') {
          if (!hostAway) return;
          hostAway = false;
          window.clearTimeout(hostTimer);
          link.isOpen = true;
          link.onBack();
        } else if (c === 'closed') {
          link.onMessage({ t: 'closed' });
          link.close();
        } else if (c === 'kicked') {
          link.onMessage({ t: 'removed' });
          link.close();
        }
      },
      onLost: (why, code) => {
        if (ended) return;
        const overdue = firstLossAt !== 0 && Date.now() - firstLossAt >= AWAY_MS;
        if (code === ROOM_GONE || overdue) { giveUp(why); return; }
        if (firstLossAt === 0) firstLossAt = Date.now();
        away = true;
        link.isOpen = false;
        link.onAway('self');
        scheduleRedial();
      },
    });
    sock = s;
    s.open();
  };
  make();
  return link;
}
