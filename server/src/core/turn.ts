/**
 * TURN relay logins for voice chat (CODE.md 9aq.8, Part F). Pure TypeScript: no
 * Cloudflare bindings and no clock. The Worker passes the time, the monthly
 * count and a `fetch` function, so the tests can run the whole rule.
 *
 * A credential lets one phone reach a relay for up to 3 hours. The monthly cap
 * keeps the free 1,000 GB a month from being passed (3000 credentials).
 */

/** How long a relay login lasts, in seconds (3 hours). */
export const TURN_TTL_S = 10800;
/** Credentials handed out per calendar month (UTC) before the relay is turned off for the month. */
export const TURN_MONTHLY_LIMIT = 3000;
/** The STUN server used when no relay login is given (Cloudflare's, free, no login). */
export const STUN_ONLY = [{ urls: 'stun:stun.cloudflare.com:3478' }];

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnAnswer {
  iceServers: IceServer[];
  relay: boolean;
}

/** "2026-11" for a time in UTC. The monthly count is kept under this key. */
export function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Browsers block TURN on port 53, so those URLs are dropped. Accepts one server or a list. */
export function dropPort53(servers: unknown): IceServer[] {
  const list = Array.isArray(servers) ? servers : [servers];
  const out: IceServer[] = [];
  for (const s of list) {
    if (typeof s !== 'object' || s === null) continue;
    const raw = (s as { urls?: unknown }).urls;
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(
      (u): u is string => typeof u === 'string' && !/:53(\?|$)/.test(u),
    );
    if (urls.length === 0) continue;
    const kept: IceServer = { urls: urls.length === 1 ? urls[0] as string : urls };
    const user = (s as { username?: unknown }).username;
    const cred = (s as { credential?: unknown }).credential;
    if (typeof user === 'string') kept.username = user;
    if (typeof cred === 'string') kept.credential = cred;
    out.push(kept);
  }
  return out;
}

/** The fetch the Worker passes in: the same shape as the global one. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Asks Cloudflare for a relay login. Any failure gives STUN only, so voice still
 * works where phones can reach each other directly. Tokens are never logged.
 */
export async function relayLogin(
  keyId: string,
  apiToken: string,
  fetchFn: FetchLike,
): Promise<TurnAnswer> {
  try {
    const res = await fetchFn(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL_S }),
      },
    );
    if (!res.ok) return stunOnly();
    const body = await res.json() as { iceServers?: unknown };
    const iceServers = dropPort53(body.iceServers);
    if (iceServers.length === 0) return stunOnly();
    return { iceServers, relay: true };
  } catch {
    return stunOnly();
  }
}

export function stunOnly(): TurnAnswer {
  return { iceServers: STUN_ONLY.map((s) => ({ ...s })), relay: false };
}

/**
 * 9aq.8: the whole rule for one /turn request. STUN only without the secrets, or
 * once this month's credits are used up (`takeCredit` is false). Otherwise a
 * relay login, or STUN if Cloudflare's call fails.
 */
export async function turnAnswer(
  keyId: string | undefined,
  apiToken: string | undefined,
  takeCredit: () => Promise<boolean>,
  fetchFn: FetchLike,
): Promise<TurnAnswer> {
  if (!keyId || !apiToken) return stunOnly();
  if (!(await takeCredit())) return stunOnly();
  return relayLogin(keyId, apiToken, fetchFn);
}
