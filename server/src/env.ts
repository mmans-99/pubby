import type { Room } from './room.ts';
import type { Directory } from './directory.ts';

/** Bindings from wrangler.toml. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  DIRECTORY: DurableObjectNamespace<Directory>;
  /** Comma-separated list of Origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS: string;
  /** 9aq.8: Cloudflare TURN key id and API token (Worker secrets). Optional: without them /turn gives STUN only. */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/** The one Directory object that holds the room list. */
export const DIRECTORY_NAME = 'main';
