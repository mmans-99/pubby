/**
 * Offline support (Phase 3). Registers the service worker (`sw.js`, written by
 * build.mjs next to index.html), which keeps a copy of the app on the phone so
 * it opens with no network. Updates are picked up silently: a new build is
 * downloaded in the background and used the next time Pubby is opened.
 *
 * Does nothing where service workers aren't available (plain file:// pages,
 * old browsers, some embedded previews); the game works the same, just not
 * offline.
 */
export function registerOffline(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const go = (): void => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {
      /* Not fatal: the game still runs online. */
    });
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
