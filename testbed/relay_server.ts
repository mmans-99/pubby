/**
 * A local stand-in for the Cloudflare relay (CODE.md 9r.7). Node http + the
 * `ws` package, running the SAME RoomCore, DirectoryCore and api.ts checks as
 * the Worker, so browser checks test the real logic. Only the plumbing differs:
 * sockets and timers here instead of Durable Objects.
 *
 *   npx tsx testbed/relay_server.ts --port 8787 [--fast-idle] [--fast-limits] [--verbose]
 *
 * It prints "RELAY_READY <port>" once it is listening (the test uses this with --port 0).
 * Local origins (127.0.0.1 and localhost, any port) are allowed here; the Worker
 * allows only the GitHub Pages origin.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomCore, LIMITS, type Effect, type Limits } from '../server/src/core/room.ts';
import { DirectoryCore, type ListEntry } from '../server/src/core/directory.ts';
import { makeRoomId, makeToken, passcodeHash } from '../server/src/core/ids.ts';
import { originCheck, parseCreate, parseJoin } from '../server/src/core/api.ts';
import { frame, PONG_TEXT, PING_TEXT, RELAY_PROTOCOL } from '../src/net/relayproto.ts';

export interface RelayOptions {
  port: number;
  host?: string;
  fastIdle?: boolean;    // idle 5 s, host grace 3 s: for the expiry checks
  fastLimits?: boolean;  // wrong-passcode windows of 10 s and 20 s: for the try-limit checks
  verbose?: boolean;
}

export interface Relay {
  port: number;
  url: string;
  close(): Promise<void>;
}

const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const GITHUB_ORIGIN = 'https://mmans-99.github.io';
const JOIN_STATUS: Record<string, number> = {
  'wrong-passcode': 403,
  'no-room': 404,
  started: 409,
  full: 409,
  version: 409,
  'too-many-tries': 429,
};

interface RoomState {
  roomId: string;
  core: RoomCore;
  stored: string;                    // the last save, as JSON text
  sockets: Map<string, WebSocket>;   // socket id -> socket
  timer: NodeJS.Timeout | null;
}

export function startRelay(opts: RelayOptions): Promise<Relay> {
  const limits: Limits = {
    ...LIMITS,
    ...(opts.fastIdle ? { idleMs: 5_000, hostGraceMs: 3_000 } : {}),
    ...(opts.fastLimits ? { ipWindowMs: 10_000, roomWindowMs: 20_000 } : {}),
  };
  const rooms = new Map<string, RoomState>();
  const directory = new DirectoryCore();
  const listSockets = new Set<WebSocket>();
  let listTimer: NodeJS.Timeout | null = null;
  const log = (...args: unknown[]) => {
    if (opts.verbose) console.log('[relay]', ...args);
  };

  const allowedOrigin = (origin: string | null): boolean =>
    originCheck(origin, [GITHUB_ORIGIN]) !== 'refused' || LOCAL_ORIGIN.test(origin ?? '');

  // ---- the room list ----
  const listFrame = () => frame({ c: 'rooms' }, JSON.stringify(directory.list(Date.now())));
  function scheduleList(): void {
    if (listTimer !== null) return;
    listTimer = setTimeout(() => {
      listTimer = null;
      const text = listFrame();
      for (const ws of listSockets) if (ws.readyState === WebSocket.OPEN) ws.send(text);
    }, 500);
    listTimer.unref();
  }

  // ---- effects of one room (the same meaning as src/room.ts's run()) ----
  function run(room: RoomState, effects: Effect[]): void {
    for (const e of effects) {
      if ('send' in e) {
        const ws = room.sockets.get(e.send);
        if (ws?.readyState === WebSocket.OPEN) ws.send(e.text);
      } else if ('close' in e) {
        const ws = room.sockets.get(e.close);
        if (ws) ws.close(e.code, e.reason);
      } else if ('list' in e) {
        if (e.list === null) directory.remove(room.roomId);
        else directory.upsert(e.list);
        if (directory.changed()) scheduleList();
      } else if ('save' in e) {
        // Storage is a JSON copy, and the core is rebuilt from it, so the
        // save/load round trip the Durable Object relies on is exercised too.
        room.stored = JSON.stringify(room.core.toJSON());
        room.core = RoomCore.fromJSON(JSON.parse(room.stored), limits);
      } else if ('alarm' in e) {
        if (room.timer) clearTimeout(room.timer);
        room.timer = setTimeout(() => {
          room.timer = null;
          run(room, room.core.alarm(Date.now()));
        }, Math.max(0, e.alarm - Date.now()));
        room.timer.unref();
      } else if ('forget' in e) {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(room.roomId);
        log('forgot', room.roomId);
      }
    }
  }

  // ---- HTTP ----
  function sendJson(res: ServerResponse, status: number, body: unknown, origin: string | null): void {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (origin && allowedOrigin(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers.vary = 'Origin';
    }
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  }

  async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin ?? null;
    if (origin !== null && !allowedOrigin(origin)) return sendJson(res, 403, { error: 'origin' }, null);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }
    const url = new URL(req.url ?? '/', 'http://relay');
    const ip = req.socket.remoteAddress ?? 'unknown';
    log(req.method, url.pathname);

    if (url.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, protocol: RELAY_PROTOCOL }, origin);
    }

    if (url.pathname === '/rooms' && req.method === 'POST') {
      const parsed = parseCreate(await readJson(req));
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error }, origin);
      const now = Date.now();
      let roomId: string | null = null;
      for (let attempt = 0; attempt < 5 && roomId === null; attempt++) {
        const id = makeRoomId();
        const answer = directory.reserve(id, ip, now);
        if (answer === 'too-many-rooms') return sendJson(res, 429, { error: 'too-many-rooms' }, origin);
        if (answer === 'ok') roomId = id;
      }
      if (roomId === null) return sendJson(res, 503, { error: 'busy' }, origin);
      const { name, hostName, passcode, version } = parsed.value;
      const hostToken = makeToken();
      const passHash = await passcodeHash(roomId, passcode);
      const made = RoomCore.create({ roomId, name, hostName, version, passHash, createdAt: now }, hostToken, now, limits);
      const room: RoomState = { roomId, core: made.core, stored: '', sockets: new Map(), timer: null };
      rooms.set(roomId, room);
      run(room, made.effects);
      return sendJson(res, 200, { roomId, hostToken }, origin);
    }

    const join = /^\/rooms\/([a-z0-9]{8})\/join$/.exec(url.pathname);
    if (join && req.method === 'POST') {
      const roomId = join[1] ?? '';
      const parsed = parseJoin(await readJson(req));
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error }, origin);
      const room = rooms.get(roomId);
      if (!room) return sendJson(res, 404, { error: 'no-room' }, origin);
      const passHash = await passcodeHash(roomId, parsed.value.passcode);
      const answer = room.core.tryPasscode(ip, passHash, parsed.value.version, Date.now());
      run(room, answer.effects);
      if (answer.ok) return sendJson(res, 200, { joinToken: answer.joinToken }, origin);
      const body: { error: string; need?: string } = { error: answer.error };
      if (answer.need !== undefined) body.need = answer.need;
      return sendJson(res, JOIN_STATUS[answer.error] ?? 503, body, origin);
    }

    sendJson(res, 404, { error: 'not-found' }, origin);
  }

  // ---- WebSockets ----
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();

  function attachRoomSocket(ws: WebSocket, roomId: string, token: string): void {
    const room = rooms.get(roomId);
    if (!room) return ws.close(4003, 'not-allowed');
    const socketId = makeToken();
    room.sockets.set(socketId, ws);
    const result = room.core.connect(token, socketId, Date.now());
    if (!result.ok) {
      room.sockets.delete(socketId);
      return ws.close(result.code, result.reason);
    }
    run(room, result.effects);
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === PING_TEXT) return void ws.send(PONG_TEXT);
      run(room, room.core.frame(socketId, text, Date.now()));
    });
    const gone = () => {
      if (!room.sockets.delete(socketId)) return;
      run(room, room.core.closed(socketId, Date.now()));
    };
    ws.on('close', gone);
    ws.on('error', gone);
  }

  function attachListSocket(ws: WebSocket): void {
    listSockets.add(ws);
    ws.send(listFrame());
    ws.on('message', (data) => {
      if (data.toString() === PING_TEXT) ws.send(PONG_TEXT);
    });
    ws.on('close', () => listSockets.delete(ws));
    ws.on('error', () => listSockets.delete(ws));
  }

  const server = createServer((req, res) => {
    handleHttp(req, res).catch(() => sendJson(res, 503, { error: 'busy' }, null));
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const origin = req.headers.origin ?? null;
    if (origin !== null && !allowedOrigin(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    const url = new URL(req.url ?? '/', 'http://relay');
    const room = /^\/rooms\/([a-z0-9]{8})\/socket$/.exec(url.pathname);
    const token = url.searchParams.get('token') ?? '';
    if (url.pathname === '/rooms') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws);
        ws.on('close', () => sockets.delete(ws));
        attachListSocket(ws);
      });
    } else if (room) {
      const roomId = room[1] ?? '';
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws);
        ws.on('close', () => sockets.delete(ws));
        attachRoomSocket(ws, roomId, token);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : opts.port;
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            if (listTimer) clearTimeout(listTimer);
            for (const room of rooms.values()) if (room.timer) clearTimeout(room.timer);
            for (const ws of sockets) ws.terminate();
            server.close(() => done());
          }),
      });
    });
  });
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Run as a script: `npx tsx testbed/relay_server.ts --port 8787`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const relay = await startRelay({
    port: Number(argValue('--port') ?? 8787),
    fastIdle: process.argv.includes('--fast-idle'),
    fastLimits: process.argv.includes('--fast-limits'),
    verbose: process.argv.includes('--verbose'),
  });
  console.log(`RELAY_READY ${relay.port}`);
  console.log(`Local relay at ${relay.url} (Ctrl+C to stop)`);
}
