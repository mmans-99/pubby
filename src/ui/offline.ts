/**
 * Offline support (Phase 3). Registers the service worker (`sw.js`, written by
 * build.mjs next to index.html), which keeps a copy of the app on the phone so
 * it opens with no network. Updates are picked up silently: a new build is
 * downloaded in the background and used the next time Pubby is opened.
 *
 * CODE.md 9x.1 (2.29): on every open Pubby asks for a new build straight away,
 * and when a new build takes over a Pubby that is already running, a button
 * says "Pubby updated. Tap to reload." A game in progress is kept (it is saved).
 *
 * Does nothing where service workers aren't available (plain file:// pages,
 * old browsers, some embedded previews); the game works the same, just not
 * offline.
 */
export function registerOffline(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const sw = navigator.serviceWorker;
  const go = (): void => {
    // A controller already exists only when this page was opened by an earlier build.
    const wasControlled = !!sw.controller;
    sw.register('sw.js', { scope: './' })
      .then((reg) => {
        // Look for a new build now, not only after a full close and reopen (9x.1 rule 3).
        void reg.update().catch(() => { /* Not fatal. */ });
      })
      .catch(() => {
        /* Not fatal: the game still runs online. */
      });
    if (wasControlled) sw.addEventListener('controllerchange', showUpdated, { once: true });
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

/** The "updated" notice (CODE.md 9x.1 rule 2): one tap reloads Pubby with the new build. */
function showUpdated(): void {
  if (document.querySelector('.update-toast')) return;
  const button = document.createElement('button');
  button.className = 'toast update-toast';
  button.setAttribute('role', 'status');
  button.textContent = 'Pubby updated. Tap to reload.';
  button.addEventListener('click', () => window.location.reload());
  document.body.appendChild(button);
}
