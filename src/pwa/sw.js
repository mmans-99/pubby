// Pubby service worker: keeps a copy of the app on the phone so it opens with
// no network. build.mjs fills in VERSION (a hash of the built files), so every
// new build is a new cache and the phone picks up the update by itself.
//
// Strategy: cache first, then refresh in the background. Opening the app never
// waits for the network. A new version is downloaded while you play and is
// used the next time the app is opened. Old caches are deleted on activate.
// Saved games and profiles live in localStorage, not here, so updates never
// touch them.
const VERSION = '__VERSION__';
const CACHE = `pubby-${VERSION}`;
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pubby-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page loads (including start_url with query strings) get the cached app page.
  const isPage = req.mode === 'navigate';
  const key = isPage ? './' : req;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: isPage });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok && !isPage) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      const res = await fresh;
      return res || new Response('Pubby is offline and this file was not saved.', { status: 503 });
    }),
  );
});
