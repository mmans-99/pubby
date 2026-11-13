/**
 * The Worker (CODE.md 9r.3.6): the HTTP API of 9r.3.2 and the routing to the
 * Room and Directory objects. Input and origin checks live in core/api.ts.
 * Nothing here logs message contents; errors log only the room id and a message.
 */
import { DIRECTORY_NAME, type Env } from './env.ts';
import { makeRoomId, makeToken, passcodeHash } from './core/ids.ts';
import { originCheck, parseCreate, parseJoin } from './core/api.ts';
import { RELAY_PROTOCOL } from '../../src/net/relayproto.ts';

export { Room } from './room.ts';
export { Directory } from './directory.ts';

const ROOM_ID = /^\/rooms\/([23456789abcdefghjkmnpqrstuvwxyz]{8})(\/join|\/socket)?$/;
const JOIN_STATUS: Record<string, number> = {
  'wrong-passcode': 403,
  'no-room': 404,
  started: 409,
  full: 409,
  version: 409,
  'too-many-tries': 429,
};

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const check = originCheck(origin, allowed);
  if (check === 'refused') return json({ error: 'origin' }, 403, {});
  const cors: Record<string, string> = check === 'allowed' && origin !== null
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : {};

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName(DIRECTORY_NAME));

  if (path === '/health' && request.method === 'GET') {
    return json({ ok: true, protocol: RELAY_PROTOCOL }, 200, cors);
  }

  if (path === '/rooms' && request.method === 'GET') {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'bad-request' }, 400, cors);
    return directory().fetch(request);
  }

  if (path === '/rooms' && request.method === 'POST') {
    const parsed = parseCreate(await readBody(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
    const dir = directory();
    let roomId: string | null = null;
    for (let attempt = 0; attempt < 5 && roomId === null; attempt++) {
      const id = makeRoomId();
      const answer = await dir.reserve(id, ip);
      if (answer === 'too-many-rooms') return json({ error: 'too-many-rooms' }, 429, cors);
      if (answer === 'ok') roomId = id;
    }
    if (roomId === null) return json({ error: 'busy' }, 503, cors);
    const { name, hostName, passcode, version } = parsed.value;
    const passHash = await passcodeHash(roomId, passcode);
    const hostToken = makeToken();
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    await room.createRoom(
      { roomId, name, hostName, version, passHash, createdAt: Date.now() },
      hostToken,
    );
    return json({ roomId, hostToken }, 200, cors);
  }

  const match = ROOM_ID.exec(path);
  if (match) {
    const roomId = match[1] ?? '';
    const what = match[2];
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomId));

    if (what === '/join' && request.method === 'POST') {
      const parsed = parseJoin(await readBody(request));
      if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
      const passHash = await passcodeHash(roomId, parsed.value.passcode);
      const answer = await room.tryPasscode(ip, passHash, parsed.value.version);
      if (answer.ok) return json({ joinToken: answer.joinToken }, 200, cors);
      const body: { error: string; need?: string } = { error: answer.error };
      if (answer.need !== undefined) body.need = answer.need;
      return json(body, JOIN_STATUS[answer.error] ?? 503, cors);
    }

    if (what === '/socket' && request.method === 'GET') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'bad-request' }, 400, cors);
      return room.fetch(request);
    }
  }

  return json({ error: 'not-found' }, 404, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      // Log the kind of error only: never message text, never a passcode.
      console.error('request failed', err instanceof Error ? err.name : 'unknown');
      return json({ error: 'busy' }, 503, {});
    }
  },
} satisfies ExportedHandler<Env>;
