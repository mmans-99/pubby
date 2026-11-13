/**
 * The Directory Durable Object (CODE.md 9r.3.5, 9r.3.6): one object that holds
 * the room list. Sockets tagged "list" get the whole list whenever it changes.
 * The 500 ms wait before sending is an alarm, not a timer, so the object can sleep.
 */
import { DurableObject } from 'cloudflare:workers';
import { DirectoryCore, type ListEntry } from './core/directory.ts';
import { frame } from '../../src/net/relayproto.ts';
import type { Env } from './env.ts';

const BROADCAST_DELAY_MS = 500;

export class Directory extends DurableObject<Env> {
  private core: DirectoryCore = new DirectoryCore();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<unknown>('directory');
      if (stored !== undefined) this.core = DirectoryCore.fromJSON(stored);
    });
  }

  /** Holds a room id for a new room. */
  async reserve(roomId: string, ip: string): Promise<'ok' | 'taken' | 'too-many-rooms'> {
    const answer = this.core.reserve(roomId, ip, Date.now());
    if (answer === 'ok') await this.save();
    return answer;
  }

  async upsert(entry: ListEntry): Promise<void> {
    this.core.upsert(entry);
    await this.changed();
  }

  async remove(roomId: string): Promise<void> {
    this.core.remove(roomId);
    await this.changed();
  }

  /** The list socket: gets the whole list now, and again after each change. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], ['list']);
    pair[1].send(this.listFrame());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(): Promise<void> {
    // The list socket only receives; pings are answered by the runtime.
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  /** The debounce: send the list to every list socket. */
  override async alarm(): Promise<void> {
    const text = this.listFrame();
    for (const ws of this.ctx.getWebSockets('list')) {
      try {
        ws.send(text);
      } catch {
        // The socket went away; the runtime will tell us.
      }
    }
  }

  private async changed(): Promise<void> {
    if (this.core.changed()) {
      await this.ctx.storage.setAlarm(Date.now() + BROADCAST_DELAY_MS);
    }
    await this.save();
  }

  private listFrame(): string {
    return frame({ c: 'rooms' }, JSON.stringify(this.core.list(Date.now())));
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('directory', this.core.toJSON());
  }
}
