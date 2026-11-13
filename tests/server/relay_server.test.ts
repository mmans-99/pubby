/**
 * End to end through the local stand-in relay (testbed/relay_server.ts), started
 * as a child process on a random port: the HTTP API, the room list socket,
 * the host and joining sockets, the frames both ways, and closing a room.
 * Uses Node 22's built-in WebSocket client.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frame } from '../../src/net/relayproto.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let child: ChildProcess;
let base = '';
let wsBase = '';

before(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'testbed/relay_server.ts', '--port', '0'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise<string>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`relay did not start: ${out}`)), 20_000);
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
      const m = /RELAY_READY (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('exit', (code) => reject(new Error(`relay exited ${code}: ${out}`)));
  });
  wsBase = base.replace('http://', 'ws://');
});

after(() => {
  child.kill();
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function openSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error(`socket failed: ${url}`)), { once: true });
  });
}

/** Collects messages on a socket and waits for the first one that matches. */
function inbox(ws: WebSocket) {
  const got: string[] = [];
  const waiting: { match: (t: string) => boolean; resolve: (t: string) => void }[] = [];
  ws.addEventListener('message', (ev) => {
    const text = String(ev.data);
    const i = waiting.findIndex((w) => w.match(text));
    if (i >= 0) waiting.splice(i, 1)[0]?.resolve(text);
    else got.push(text);
  });
  return {
    next(match: (t: string) => boolean = () => true, ms = 4000): Promise<string> {
      const at = got.findIndex(match);
      if (at >= 0) return Promise.resolve(got.splice(at, 1)[0] ?? '');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), ms);
        waiting.push({ match, resolve: (t) => { clearTimeout(timer); resolve(t); } });
      });
    },
  };
}

function closeCode(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.addEventListener('close', (ev) => resolve(ev.code), { once: true }));
}

test('health answers with the protocol number', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, protocol: 1 });
});

test('a room made over HTTP is listed, joins with the passcode, relays both ways, and closes', async () => {
  const list = inbox(await openSocket(`${wsBase}/rooms`));
  await list.next((t) => t.startsWith('{"c":"rooms"}'));

  const made = await post('/rooms', { protocol: 1, name: 'Cat table', passcode: '4821', hostName: 'Cat', version: '2.17' });
  assert.equal(made.status, 200);
  const roomId = String(made.body.roomId);
  const hostToken = String(made.body.hostToken);
  assert.match(roomId, /^[a-z0-9]{8}$/);
  const listed = await list.next((t) => t.includes(roomId));
  assert.match(listed, /"seats":1/);

  const hostSocket = await openSocket(`${wsBase}/rooms/${roomId}/socket?token=${hostToken}`);
  const host = inbox(hostSocket);
  await host.next((t) => t.startsWith('{"c":"ready"'));
  hostSocket.send('ping');
  await host.next((t) => t === 'pong');

  const wrong = await post(`/rooms/${roomId}/join`, { protocol: 1, passcode: '0000', version: '2.17' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, 'wrong-passcode');

  const joined = await post(`/rooms/${roomId}/join`, { protocol: 1, passcode: '4821', version: '2.17' });
  assert.equal(joined.status, 200);
  const joinSocket = await openSocket(`${wsBase}/rooms/${roomId}/socket?token=${joined.body.joinToken}`);
  const joiner = inbox(joinSocket);
  await joiner.next((t) => t.startsWith('{"c":"ready","link":"o1"'));
  await host.next((t) => t.startsWith('{"c":"joined","link":"o1"'));

  hostSocket.send(frame({ c: 'to', to: 'o1' }, 'line one\nline two'));
  await joiner.next((t) => t === frame({ c: 'down' }, 'line one\nline two'));
  joinSocket.send(frame({ c: 'up' }, 'hi there'));
  await host.next((t) => t === frame({ c: 'from', from: 'o1' }, 'hi there'));

  hostSocket.send(frame({ c: 'close' }));
  await joiner.next((t) => t.startsWith('{"c":"closed"'));
  await list.next((t) => t.startsWith('{"c":"rooms"}') && !t.includes(roomId));

  const after = await post(`/rooms/${roomId}/join`, { protocol: 1, passcode: '4821', version: '2.17' });
  assert.equal(after.status, 404);
  assert.equal(after.body.error, 'no-room');
});

test('a socket with a token the room does not know is closed 4003', async () => {
  const made = await post('/rooms', { protocol: 1, name: 'Dog table', passcode: '1111', hostName: 'Dog', version: '2.17' });
  const ws = await openSocket(`${wsBase}/rooms/${made.body.roomId}/socket?token=not-a-token`);
  assert.equal(await closeCode(ws), 4003);
});

test('bad input and bad versions are refused with the message the app shows', async () => {
  const badName = await post('/rooms', { protocol: 1, name: '', passcode: '1111', hostName: 'Dog', version: '2.17' });
  assert.equal(badName.status, 400);
  assert.equal(badName.body.error, 'bad-name');

  const old = await post('/rooms', { protocol: 0, name: 'Dog', passcode: '1111', hostName: 'Dog', version: '2.17' });
  assert.equal(old.body.error, 'protocol');

  const made = await post('/rooms', { protocol: 1, name: 'Dog table', passcode: '1111', hostName: 'Dog', version: '2.17' });
  const version = await post(`/rooms/${made.body.roomId}/join`, { protocol: 1, passcode: '1111', version: '2.16' });
  assert.equal(version.status, 409);
  assert.equal(version.body.need, '2.17');
});

test('a browser page from another site is refused; a local page is allowed', async () => {
  const other = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.status, 403);
  const local = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(local.status, 200);
});
