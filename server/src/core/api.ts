/**
 * Input checks and origin checks for the HTTP API (CODE.md 9r.3.2). Shared by
 * the Cloudflare Worker (server/src/index.ts) and the local stand-in relay
 * (testbed/relay_server.ts), so both refuse the same things. Plain TypeScript.
 */
import { RELAY_PROTOCOL } from '../../../src/net/relayproto.ts';

export const ROOM_NAME_MAX = 20;
export const HOST_NAME_MAX = 16;

export type ApiError = 'protocol' | 'bad-name' | 'bad-passcode' | 'bad-request';
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const fail = (error: ApiError): { ok: false; error: ApiError } => ({ ok: false, error });

function asObject(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Trims, removes control characters, and keeps the text only if it is 1 to max characters. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const length = [...text].length;
  return length >= 1 && length <= max ? text : null;
}

export function validPasscode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

/** The version the app shows, "MAJOR.MINOR" (for example "2.17"). */
export function validVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,3}\.\d{1,3}$/.test(value);
}

export function parseCreate(body: unknown): Parsed<{ name: string; hostName: string; passcode: string; version: string }> {
  const b = asObject(body);
  if (!b) return fail('bad-request');
  if (b.protocol !== RELAY_PROTOCOL) return fail('protocol');
  if (!validVersion(b.version)) return fail('bad-request');
  const name = cleanText(b.name, ROOM_NAME_MAX);
  if (name === null) return fail('bad-name');
  const hostName = cleanText(b.hostName, HOST_NAME_MAX);
  if (hostName === null) return fail('bad-name');
  if (!validPasscode(b.passcode)) return fail('bad-passcode');
  return { ok: true, value: { name, hostName, passcode: b.passcode, version: b.version } };
}

export function parseJoin(body: unknown): Parsed<{ passcode: string; version: string }> {
  const b = asObject(body);
  if (!b) return fail('bad-request');
  if (b.protocol !== RELAY_PROTOCOL) return fail('protocol');
  if (!validVersion(b.version)) return fail('bad-request');
  if (!validPasscode(b.passcode)) return fail('bad-passcode');
  return { ok: true, value: { passcode: b.passcode, version: b.version } };
}

/**
 * 'none': no Origin header (a plain request, such as opening /health in a
 * browser tab; CORS does not apply). 'allowed': the Origin is in the list.
 * 'refused': a browser page from another site.
 */
export function originCheck(origin: string | null, allowed: readonly string[]): 'none' | 'allowed' | 'refused' {
  if (origin === null) return 'none';
  return allowed.includes(origin) ? 'allowed' : 'refused';
}
