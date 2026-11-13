/**
 * Sending long messages in parts (CODE.md 9r.5.2). Used by Nearby links
 * (peer.ts, 16,000 characters a part) and online links (online.ts, 200,000).
 * Pure: no DOM, no WebRTC, so it can be unit-tested.
 *
 * A part is a JSON object {"~part": id, i, n, d}: the part number i of n, and
 * d, the piece of text. The parts of one message share an id. Parts of a
 * message always arrive in order (both link types are ordered), so Rejoin
 * only has to check the numbers and start over when they don't add up.
 */

/** Nearby links: longer messages are sent in parts of this size (a whole game can be bigger than some phones allow in one data-channel message, about 64 KB on older Safari). */
export const CHUNK_CHARS = 16000;

/**
 * Turns a message into the texts to send. A short message is sent as its JSON
 * text on its own; a longer one becomes parts of at most `max` characters each.
 */
export function encodeParts(msg: unknown, max: number, id: number): string[] {
  const text = JSON.stringify(msg);
  if (text.length <= max) return [text];
  const n = Math.ceil(text.length / max);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(JSON.stringify({ '~part': id, i, n, d: text.slice(i * max, (i + 1) * max) }));
  }
  return out;
}

/** Puts parts back together. take() returns the whole message, or null while parts are still coming. */
export class Rejoin {
  private parts: { id: number; n: number; got: string[] } | null = null;

  take(raw: unknown): unknown {
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
}
