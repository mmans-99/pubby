import type { Room } from './room.ts';
import type { Directory } from './directory.ts';

/** Bindings from wrangler.toml. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  DIRECTORY: DurableObjectNamespace<Directory>;
  /** Comma-separated list of Origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS: string;
}

/** The one Directory object that holds the room list. */
export const DIRECTORY_NAME = 'main';
