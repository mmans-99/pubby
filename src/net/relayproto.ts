/**
 * The relay's message format (CODE.md 9r.3). Shared by the app and the server,
 * so it is plain TypeScript: no DOM, no network, no Cloudflare types.
 *
 * Every WebSocket message (a "frame") is text: a short JSON header, one newline,
 * then the payload. The payload is the game message the app already builds.
 * The relay reads only the header and passes the payload on without parsing it.
 */

export const RELAY_PROTOCOL = 1;
/** Frames longer than this (in characters) are refused; the socket closes with 1009. */
export const FRAME_MAX = 262_144;
/** Online links split payloads longer than this into parts (see chunk.ts). */
export const ONLINE_CHUNK_CHARS = 200_000;
/** The text "ping" is answered by the relay with "pong" and is never a frame. */
export const PING_TEXT = 'ping';
export const PONG_TEXT = 'pong';
export const PING_EVERY_MS = 25_000;
/** Nothing heard for this long (not even a pong) means the connection is lost. */
export const LOST_AFTER_MS = 60_000;

/** Host's phone -> relay. */
export type HostOut =
  | { c: 'to'; to: string }                          // payload goes to that link
  | { c: 'update'; seats: number; started: boolean } // for the room list; no payload
  | { c: 'kick'; link: string }                      // the host removed that player
  | { c: 'close' };                                  // the host closed the game

/** Relay -> host's phone. */
export type HostIn =
  | { c: 'ready'; roomId: string }                   // socket accepted
  | { c: 'joined'; link: string }                    // a phone connected (link id like "o3")
  | { c: 'from'; from: string }                      // payload came from that link
  | { c: 'left'; link: string };                     // that phone's socket closed

/** Joining phone -> relay. */
export type JoinOut = { c: 'up' };                   // payload goes to the host

/** Relay -> joining phone. */
export type JoinIn =
  | { c: 'ready'; link: string }
  | { c: 'down' }                                    // payload came from the host
  | { c: 'host-gone' }                               // the host's socket closed
  | { c: 'closed' }                                  // the host closed the game, or the room expired
  | { c: 'kicked' };

/** Builds one frame: the header as JSON, a newline, then the payload. */
export function frame(header: object, payload = ''): string {
  return JSON.stringify(header) + '\n' + payload;
}

/**
 * Reads a frame. Returns null when the text is not a frame: no newline, a
 * header that is not a JSON object, a header without a string "c", or text
 * longer than FRAME_MAX. Only the first newline splits header from payload.
 */
export function readFrame(text: string): { header: Record<string, unknown>; payload: string } | null {
  if (text.length > FRAME_MAX) return null;
  const at = text.indexOf('\n');
  if (at < 0) return null;
  let header: unknown;
  try {
    header = JSON.parse(text.slice(0, at));
  } catch {
    return null;
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) return null;
  const h = header as Record<string, unknown>;
  if (typeof h.c !== 'string') return null;
  return { header: h, payload: text.slice(at + 1) };
}
