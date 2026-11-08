/**
 * One WebRTC data-channel link between the host's phone and one other phone,
 * set up with the two QR codes (CODE.md section 4a). No STUN or TURN server:
 * only local addresses, so it works on Wi-Fi or a hotspot with no internet.
 *
 * Host:    const p = new Peer('host'); code = await p.makeOffer(); ...scan... await p.acceptAnswer(text)
 * Joiner:  const p = new Peer('join'); code = await p.answerOffer(text)
 * Both:    p.onOpen / p.onMessage / p.onClose, p.send(obj)
 */

import { codeToDescription, CodeError, packSdp, parseCandidate, unpackCode } from './signal.ts';

export type Role = 'host' | 'join';

export interface PathInfo {
  /** This phone's address used for the link (or a hidden ".local" name). */
  local: string;
  remote: string;
  /** "host" = direct local address; "prflx" = learned during the checks. */
  localType: string;
  remoteType: string;
  protocol: string;
}

const GATHER_TIMEOUT_MS = 4000;
/**
 * Messages longer than this are sent in parts (slice 2: a whole game can be
 * bigger than some phones allow in one data-channel message, about 64 KB on
 * older Safari). The channel is ordered, so the parts arrive in order.
 */
export const CHUNK_CHARS = 16000;

export class Peer {
  readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private closedOnce = false;
  private sendId = 0;
  private parts: { id: number; n: number; got: string[] } | null = null;
  onOpen: () => void = () => undefined;
  onMessage: (msg: unknown) => void = () => undefined;
  onClose: (why: string) => void = () => undefined;
  onState: (state: RTCPeerConnectionState) => void = () => undefined;

  constructor(readonly role: Role) {
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.addEventListener('connectionstatechange', () => {
      const s = this.pc.connectionState;
      this.onState(s);
      if (s === 'failed') this.fireClose('failed');
      if (s === 'closed') this.fireClose('closed');
    });
    if (role === 'host') {
      this.attach(this.pc.createDataChannel('pubby', { ordered: true }));
    } else {
      this.pc.addEventListener('datachannel', (e) => this.attach(e.channel));
    }
  }

  /** Host: make the code for QR code 1. */
  async makeOffer(): Promise<string> {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.gathered();
    return packSdp(this.pc.localDescription!.sdp, 'offer');
  }

  /** Host: read QR code 2 (the joining phone's answer). */
  async acceptAnswer(code: string): Promise<void> {
    const p = unpackCode(code);
    if (p.kind !== 'answer') throw new CodeError('That’s a host code. Scan the code on the joining phone.');
    await this.pc.setRemoteDescription(codeToDescription(p));
  }

  /** Joiner: read QR code 1 and make the code for QR code 2. */
  async answerOffer(code: string): Promise<string> {
    const p = unpackCode(code);
    if (p.kind !== 'offer') throw new CodeError('That’s a joining phone’s code. Scan the host’s code.');
    await this.pc.setRemoteDescription(codeToDescription(p));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.gathered();
    return packSdp(this.pc.localDescription!.sdp, 'answer');
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  send(msg: unknown): boolean {
    if (!this.isOpen) return false;
    try {
      const text = JSON.stringify(msg);
      if (text.length <= CHUNK_CHARS) {
        this.channel!.send(text);
        return true;
      }
      const id = ++this.sendId;
      const n = Math.ceil(text.length / CHUNK_CHARS);
      for (let i = 0; i < n; i++) {
        this.channel!.send(JSON.stringify({ '~part': id, i, n, d: text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) }));
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Puts a message sent in parts back together; null while parts are still coming. */
  private whole(raw: unknown): unknown {
    if (typeof raw !== 'object' || raw === null || !('~part' in raw)) return raw;
    const m = raw as { '~part': unknown; i: unknown; n: unknown; d: unknown };
    if (typeof m['~part'] !== 'number' || typeof m.i !== 'number' || typeof m.n !== 'number' || typeof m.d !== 'string') return null;
    if (m.i === 0 || !this.parts || this.parts.id !== m['~part']) this.parts = { id: m['~part'], n: m.n, got: [] };
    if (m.i !== this.parts.got.length) { this.parts = null; return null; }
    this.parts.got.push(m.d);
    if (this.parts.got.length < this.parts.n) return null;
    const text = this.parts.got.join('');
    this.parts = null;
    return JSON.parse(text);
  }

  close(): void {
    this.closedOnce = true; // closing on purpose: no onClose
    this.channel?.close();
    this.pc.close();
  }

  /** The addresses this phone offered (for the diagnostics panel). */
  localAddresses(): string[] {
    const sdp = this.pc.localDescription?.sdp ?? '';
    const out: string[] = [];
    for (const l of sdp.split(/\r?\n/)) {
      if (!l.startsWith('a=candidate:')) continue;
      const c = parseCandidate(l.slice(2));
      if (c && c.protocol === 'udp' && !out.includes(c.addr)) out.push(c.addr);
    }
    return out;
  }

  /** Which addresses the link actually uses, once connected. */
  async path(): Promise<PathInfo | null> {
    const stats = await this.pc.getStats();
    let pair: Record<string, unknown> | null = null;
    stats.forEach((r: Record<string, unknown>) => {
      if (r['type'] === 'transport' && typeof r['selectedCandidatePairId'] === 'string') {
        pair = stats.get(r['selectedCandidatePairId']) as Record<string, unknown>;
      }
    });
    if (!pair) {
      stats.forEach((r: Record<string, unknown>) => {
        if (!pair && r['type'] === 'candidate-pair' && r['state'] === 'succeeded' && r['nominated']) pair = r;
      });
    }
    if (!pair) return null;
    const p = pair as Record<string, unknown>;
    const l = stats.get(p['localCandidateId'] as string) as Record<string, unknown> | undefined;
    const r = stats.get(p['remoteCandidateId'] as string) as Record<string, unknown> | undefined;
    const addr = (c: Record<string, unknown> | undefined): string => String(c?.['address'] ?? c?.['ip'] ?? '?');
    return {
      local: addr(l),
      remote: addr(r),
      localType: String(l?.['candidateType'] ?? '?'),
      remoteType: String(r?.['candidateType'] ?? '?'),
      protocol: String(l?.['protocol'] ?? '?'),
    };
  }

  private attach(ch: RTCDataChannel): void {
    this.channel = ch;
    ch.addEventListener('open', () => this.onOpen());
    ch.addEventListener('close', () => this.fireClose('closed'));
    ch.addEventListener('message', (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      let msg: unknown;
      try {
        msg = this.whole(JSON.parse(e.data));
      } catch {
        return; // Not ours; ignore.
      }
      if (msg === null) return;
      try {
        this.onMessage(msg);
      } catch (err) {
        // A handler error must not break the link; show it for the checks.
        console.error(err);
      }
    });
  }

  private fireClose(why: string): void {
    if (this.closedOnce) return;
    this.closedOnce = true;
    this.onClose(why);
  }

  private gathered(): Promise<void> {
    const pc = this.pc;
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const done = (): void => {
        if (pc.iceGatheringState !== 'complete') return;
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      };
      pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, GATHER_TIMEOUT_MS);
    });
  }
}
