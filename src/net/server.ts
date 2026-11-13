/**
 * The room server's address (CODE.md 9r.5.1). build.mjs sets it from the
 * Cloudflare Worker's name. On a localhost page only, a ?server=http://127.0.0.1:<port>
 * query parameter points the app at the local stand-in for the browser checks.
 * On GitHub Pages the parameter is ignored, so no link can send a player's
 * phone to another server.
 */

/** Set by build.mjs (define). */
declare const __PUBBY_SERVER__: string | undefined;

const DEFAULT_SERVER = 'https://pubby-rooms.mmans99.workers.dev';
const LOCAL = /^(127\.0\.0\.1|localhost)$/;

export function roomServer(): string {
  const built = typeof __PUBBY_SERVER__ === 'string' ? __PUBBY_SERVER__ : DEFAULT_SERVER;
  if (typeof location !== 'undefined' && LOCAL.test(location.hostname)) {
    const q = new URLSearchParams(location.search).get('server');
    if (q && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) return q;
  }
  return built;
}

/** A WebSocket address on the room server, e.g. wsUrl('/rooms'). https becomes wss. */
export function wsUrl(path: string): string {
  const u = new URL(path, roomServer());
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  return u.toString();
}
