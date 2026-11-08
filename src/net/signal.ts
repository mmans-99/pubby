/**
 * Short connection codes for the QR handshake (CODE.md section 4a).
 *
 * A WebRTC offer or answer (SDP) is over 1,000 characters. Only a few fields
 * matter for a data channel on a local network: the ICE user name and
 * password, the DTLS fingerprint, and the phone's local addresses. This file
 * packs those into a short text code and rebuilds a full SDP from it.
 *
 *   PUBBY1~o~<ufrag>~<pwd>~<fingerprint, base64url>~<addr:port>,<addr:port>
 *
 * "o" is an offer (host's code), "a" an answer (joining phone's code).
 */

export type CodeKind = 'offer' | 'answer';

export interface Packed {
  kind: CodeKind;
  ufrag: string;
  pwd: string;
  /** SHA-256 fingerprint as 32 bytes. */
  fingerprint: Uint8Array;
  /** UDP host candidates: IPv4, IPv6 or a hidden ".local" name, with a port. */
  candidates: { addr: string; port: number }[];
}

const PREFIX = 'PUBBY1';
const MAX_CANDIDATES = 4;

export class CodeError extends Error {}

/** Pack an SDP into the short code. */
export function packSdp(sdp: string, kind: CodeKind): string {
  const p = parseSdp(sdp, kind);
  const cands = p.candidates.map((c) => `${c.addr}:${c.port}`).join(',');
  return [PREFIX, kind === 'offer' ? 'o' : 'a', p.ufrag, p.pwd, toB64(p.fingerprint), cands].join('~');
}

/**
 * The host's QR code is a link, so an iPhone's Camera app can open Pubby
 * already joining: <Pubby address>#join=<code>.
 */
export function joinLink(base: string, code: string): string {
  return `${base}#join=${code}`;
}

/**
 * The network lobby's "Add player" code is a link too, with its own marker:
 * <Pubby address>#lobby=<code>. It opens the lobby's join screen, while
 * #join= opens the connection test, so a code from one isn't used in the other.
 */
export function lobbyLink(base: string, code: string): string {
  return `${base}#lobby=${code}`;
}

/** Which screen a scanned link belongs to: the connection test, the lobby, or a bare code. */
export function linkKind(text: string): 'join' | 'lobby' | null {
  const t = text.trim();
  if (t.includes('#lobby=')) return 'lobby';
  if (t.includes('#join=')) return 'join';
  return null;
}

/** The code inside a join or lobby link (or the text itself if it's a bare code). */
export function codeFromText(text: string): string {
  const t = text.trim();
  const marks = ['#join=', '#lobby='];
  for (const m of marks) {
    const i = t.indexOf(m);
    if (i === -1) continue;
    const raw = t.slice(i + m.length);
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return t;
}

/** Read a short code or join link. Throws CodeError if it isn't a Pubby code. */
export function unpackCode(text: string): Packed {
  const parts = codeFromText(text).split('~');
  if (parts.length !== 6 || parts[0] !== PREFIX) throw new CodeError('That isn’t a Pubby connection code.');
  const [, k, ufrag, pwd, fp, cands] = parts as [string, string, string, string, string, string];
  if (k !== 'o' && k !== 'a') throw new CodeError('That isn’t a Pubby connection code.');
  const fingerprint = fromB64(fp);
  if (fingerprint.length !== 32 || !ufrag || !pwd) throw new CodeError('That code is damaged. Scan it again.');
  const candidates = cands ? cands.split(',').map((c) => {
    const i = c.lastIndexOf(':');
    return { addr: c.slice(0, i), port: Number(c.slice(i + 1)) };
  }).filter((c) => c.addr && Number.isInteger(c.port) && c.port > 0 && c.port < 65536) : [];
  return { kind: k === 'o' ? 'offer' : 'answer', ufrag, pwd, fingerprint, candidates };
}

/** Rebuild a full SDP that the browser accepts from a short code. */
export function codeToDescription(p: Packed): RTCSessionDescriptionInit {
  const fp = Array.from(p.fingerprint, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const lines = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...p.candidates.map((c, i) => `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${c.addr} ${c.port} typ host generation 0`),
    'a=end-of-candidates',
    `a=ice-ufrag:${p.ufrag}`,
    `a=ice-pwd:${p.pwd}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${p.kind === 'offer' ? 'actpass' : 'active'}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  return { type: p.kind, sdp: lines.join('\r\n') + '\r\n' };
}

/** Pull the fields we need out of the browser's SDP. */
export function parseSdp(sdp: string, kind: CodeKind): Packed {
  const lines = sdp.split(/\r?\n/);
  const val = (prefix: string): string => {
    const l = lines.find((x) => x.startsWith(prefix));
    if (!l) throw new CodeError(`Connection info is missing ${prefix}`);
    return l.slice(prefix.length).trim();
  };
  const ufrag = val('a=ice-ufrag:');
  const pwd = val('a=ice-pwd:');
  const fpLine = val('a=fingerprint:');
  const [algo, hex] = fpLine.split(' ');
  if (algo?.toLowerCase() !== 'sha-256' || !hex) throw new CodeError('Unexpected fingerprint type');
  const fingerprint = new Uint8Array(hex.split(':').map((x) => parseInt(x, 16)));

  const seen = new Set<string>();
  const candidates: { addr: string; port: number }[] = [];
  for (const l of lines) {
    if (!l.startsWith('a=candidate:')) continue;
    const c = parseCandidate(l.slice(2));
    if (!c || c.protocol !== 'udp' || c.component !== 1 || c.type !== 'host') continue;
    const key = `${c.addr}:${c.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ addr: c.addr, port: c.port });
  }
  // IPv4 first (what home Wi-Fi and hotspots use), then hidden names, then IPv6.
  const rank = (a: string): number => (/^\d+\.\d+\.\d+\.\d+$/.test(a) ? 0 : a.endsWith('.local') ? 1 : 2);
  candidates.sort((a, b) => rank(a.addr) - rank(b.addr));
  return { kind, ufrag, pwd, fingerprint, candidates: candidates.slice(0, MAX_CANDIDATES) };
}

export interface CandidateInfo { component: number; protocol: string; addr: string; port: number; type: string }

/** "candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host ..." */
export function parseCandidate(c: string): CandidateInfo | null {
  const parts = c.replace(/^candidate:/, '').split(' ');
  if (parts.length < 8 || parts[6] !== 'typ') return null;
  return {
    component: Number(parts[1]),
    protocol: parts[2]!.toLowerCase(),
    addr: parts[4]!,
    port: Number(parts[5]),
    type: parts[7]!,
  };
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    throw new CodeError('That code is damaged. Scan it again.');
  }
}
