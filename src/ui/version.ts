/**
 * The app version. It comes from package.json (build.mjs passes it in as
 * __PUBBY_VERSION__), e.g. "2.29.0". Major changes bump the first number,
 * small changes the second, fixes the third (CODE.md 9e, 9x.1).
 */
declare const __PUBBY_VERSION__: string | undefined;

/** The full version the player sees on the home screen and in quick rules. */
export const VERSION_FULL: string = typeof __PUBBY_VERSION__ === 'string' ? __PUBBY_VERSION__ : 'dev';

/**
 * "MAJOR.MINOR" (for example "2.29"). Online rooms and phones compare this,
 * because the room server accepts only that form (CODE.md 9x.1). A fix
 * (third number) does not stop two phones from playing together.
 */
export const VERSION: string = VERSION_FULL.split('.').slice(0, 2).join('.');
