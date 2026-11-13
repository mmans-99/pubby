/**
 * The Room Durable Object (CODE.md 9r.3.6). A thin wrapper: it feeds sockets and
 * requests to RoomCore and carries out the Effects it returns. Keep the logic in
 * core/room.ts, where the tests are.
 */
import { DurableObject } from 'cloudflare:workers';
import { RoomCore, type Effect, type RoomSettings } from './core/room.ts';
import { makeToken } from './core/ids.ts';
import { DIRECTORY_NAME, type Env } from './env.ts';

/** What the Worker needs from a passcode try (the rest of the core answer stays inside). */
export type JoinAnswer =
  | { ok: true; joinToken: string }
  | { ok: false; error: string; need?: string };

export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private roomId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // "ping" is answered by the runtime, so an idle room can sleep.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<unknown>('room');
      if (stored !== undefined) {
        this.core = RoomCore.fromJSON(stored);
        this.roomId = (stored as { settings: RoomSettings }).settings.roomId;
      }
    });
  }

  /** Called by the Worker when a new room is made. */
  async createRoom(settings: RoomSettings, hostToken: string): Promise<void> {
    const { core, effects } = RoomCore.create(settings, hostToken, Date.now());
    this.core = core;
    this.roomId = settings.roomId;
    await this.run(effects);
  }

  /** Called by the Worker when someone types the passcode. */
  async tryPasscode(ip: string, passHash: string, version: string): Promise<JoinAnswer> {
    if (!this.core) return { ok: false, error: 'no-room' };
    const r = this.core.tryPasscode(ip, passHash, version, Date.now());
    await this.run(r.effects);
    if (r.ok) return { ok: true, joinToken: r.joinToken };
    return r.need === undefined ? { ok: false, error: r.error } : { ok: false, error: r.error, need: r.need };
  }

  /** A WebSocket upgrade: the host's socket or a joining phone's, decided by the token in the URL. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 426 });
    }
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const socketId = makeToken();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [socketId]);
    server.serializeAttachment({ socketId });
    const result = this.core
      ? this.core.connect(token, socketId, Date.now())
      : { ok: false as const, code: 4003, reason: 'not-allowed' };
    if (!result.ok) {
      server.close(result.code, result.reason);
      return new Response(null, { status: 101, webSocket: client });
    }
    await this.run(result.effects);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || !this.core) return;
    const att = ws.deserializeAttachment() as { socketId: string } | null;
    if (!att) return;
    await this.run(this.core.frame(att.socketId, message, Date.now()));
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
    await this.socketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.socketGone(ws);
  }

  /** The wake-up time came: expiry checks. */
  override async alarm(): Promise<void> {
    if (!this.core) return;
    await this.run(this.core.alarm(Date.now()));
  }

  private async socketGone(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as { socketId: string } | null;
    if (!att || !this.core) return;
    await this.run(this.core.closed(att.socketId, Date.now()));
  }

  /** Carries out the effects in order. Only the message text and the socket id are ever used. */
  private async run(effects: Effect[]): Promise<void> {
    for (const e of effects) {
      if ('send' in e) {
        try {
          this.ctx.getWebSockets(e.send)[0]?.send(e.text);
        } catch {
          // The socket went away; its close event will tidy up.
        }
      } else if ('close' in e) {
        for (const ws of this.ctx.getWebSockets(e.close)) {
          try {
            ws.close(e.code, e.reason);
          } catch {
            // Already closed.
          }
        }
      } else if ('list' in e) {
        const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName(DIRECTORY_NAME));
        if (e.list === null) {
          if (this.roomId !== null) await dir.remove(this.roomId);
        } else {
          await dir.upsert(e.list);
        }
      } else if ('save' in e) {
        if (this.core) await this.ctx.storage.put('room', this.core.toJSON());
      } else if ('alarm' in e) {
        await this.ctx.storage.setAlarm(e.alarm);
      } else if ('forget' in e) {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
        this.core = null;
      }
    }
  }
}
