/**
 * Room ids, tokens and the passcode hash (CODE.md 9r.3.3). Plain TypeScript:
 * it uses only the standard `crypto` and `btoa`, which exist in Cloudflare
 * Workers, in Node 22 and in the browser.
 */

/** No 0 or o, and no 1, l or i, so ids read out loud and typed by hand. */
export const ROOM_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const ROOM_ID_LENGTH = 8;

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** An 8-character room id. Bytes that would bias the letters are thrown away. */
export function makeRoomId(): string {
  const n = ROOM_ID_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < ROOM_ID_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < limit && out.length < ROOM_ID_LENGTH) out += ROOM_ID_ALPHABET.charAt(byte % n);
    }
  }
  return out;
}

/** 16 random bytes as base64url (22 characters). */
export function makeToken(): string {
  let binary = '';
  for (const byte of randomBytes(16)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 of "roomId:passcode" as hex. The server keeps only this, never the passcode. */
export async function passcodeHash(roomId: string, passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`${roomId}:${passcode}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
