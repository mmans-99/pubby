/**
 * The room list and the room-creation limit (CODE.md 9r.3.5). Pure TypeScript:
 * no Cloudflare types. The Directory Durable Object wraps this.
 */

export const LIST_MAX = 50;
export const LIST_AGE_MS = 12 * 60 * 60_000;
export const ROOMS_PER_HOUR = 10;
const HOUR_MS = 60 * 60_000;
/** A reserved room id is held this long while its room is being made. */
const RESERVE_MS = 60_000;
const MAX_SEATS = 8;

export interface ListEntry {
  roomId: string;
  name: string;
  hostName: string;
  seats: number;      // people in the room, the host included
  maxSeats: number;   // always 8
  version: string;
  createdAt: number;
}

export class DirectoryCore {
  private entries = new Map<string, ListEntry>();
  private reserved = new Map<string, number>();
  private makes = new Map<string, number[]>();
  private dirty = false;

  /**
   * Holds a room id for a room about to be made. 'too-many-rooms' when this
   * address has made ROOMS_PER_HOUR rooms in the last hour; 'taken' when the id
   * is in use or was reserved a moment ago.
   */
  reserve(roomId: string, ip: string, now: number): 'ok' | 'taken' | 'too-many-rooms' {
    const recent = (this.makes.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
    this.makes.set(ip, recent);
    if (recent.length >= ROOMS_PER_HOUR) return 'too-many-rooms';
    const reservedAt = this.reserved.get(roomId);
    if (this.entries.has(roomId) || (reservedAt !== undefined && now - reservedAt < RESERVE_MS)) return 'taken';
    this.reserved.set(roomId, now);
    recent.push(now);
    return 'ok';
  }

  upsert(entry: ListEntry): void {
    this.entries.set(entry.roomId, entry);
    this.reserved.delete(entry.roomId);
    this.dirty = true;
  }

  remove(roomId: string): void {
    if (this.entries.delete(roomId)) this.dirty = true;
    this.reserved.delete(roomId);
  }

  /** Open rooms only (the room object removes a room once it starts), newest first, at most 50. */
  list(now: number): ListEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.seats < MAX_SEATS && now - e.createdAt < LIST_AGE_MS)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LIST_MAX);
  }

  /** True once after the list changed (upsert or remove); reading it clears the flag. */
  changed(): boolean {
    const was = this.dirty;
    this.dirty = false;
    return was;
  }

  toJSON(): unknown {
    return {
      entries: [...this.entries.entries()],
      reserved: [...this.reserved.entries()],
      makes: [...this.makes.entries()],
    };
  }

  static fromJSON(j: unknown): DirectoryCore {
    const s = j as {
      entries: [string, ListEntry][];
      reserved: [string, number][];
      makes: [string, number[]][];
    };
    const core = new DirectoryCore();
    core.entries = new Map(s.entries);
    core.reserved = new Map(s.reserved);
    core.makes = new Map(s.makes);
    return core;
  }
}
