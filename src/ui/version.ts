/**
 * The app version shown to players, e.g. "1.0". It comes from package.json
 * (build.mjs passes it in as __PUBBY_VERSION__). Major changes bump the first
 * number (1.4 -> 2.0); small changes bump the second (1.0 -> 1.1). See CODE.md 9e.
 */
declare const __PUBBY_VERSION__: string | undefined;

export const VERSION: string = typeof __PUBBY_VERSION__ === 'string' ? __PUBBY_VERSION__ : 'dev';
