"""Phase 3 offline check: serves dist/ on localhost, opens Pubby in a
phone-sized headless browser, waits for the service worker, then goes offline
and checks the app still opens, keeps saved data, and picks up a new build.

Usage: npm run build && python3 testbed/offline_check.py
"""
import functools
import http.server
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({detail})' if detail else ''))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(Quiet, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    site = pathlib.Path(tempfile.mkdtemp()) / 'pubby'
    shutil.copytree(ROOT / 'dist', site)
    httpd = serve(site.parent)
    url = f'http://127.0.0.1:{httpd.server_address[1]}/pubby/'  # sub-path, like GitHub Pages
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(url)
        page.wait_for_selector('h1')
        check('app opens online', page.inner_text('h1').strip() == 'Pubby')

        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('navigator.serviceWorker.controller !== null || true')
        state = page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.ready;
            const keys = await caches.keys();
            const cache = await caches.open(keys.find(k => k.startsWith('pubby-')));
            const saved = (await cache.keys()).map(r => new URL(r.url).pathname);
            return { scope: reg.scope, active: !!reg.active, keys, saved };
        }""")
        check('service worker active', state['active'], state['scope'])
        check('scope is the app folder', state['scope'].endswith('/pubby/'))
        check('one pubby cache', len([k for k in state['keys'] if k.startswith('pubby-')]) == 1, ', '.join(state['keys']))
        expected = {'/pubby/', '/pubby/manifest.webmanifest', '/pubby/icons/icon.svg',
                    '/pubby/icons/icon-192.png', '/pubby/icons/icon-512.png', '/pubby/icons/apple-touch-icon.png'}
        check('every app file saved', expected <= set(state['saved']), ', '.join(sorted(state['saved'])))

        manifest = page.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
        check('manifest: name and standalone', manifest['name'] == 'Pubby' and manifest['display'] == 'standalone')
        sizes = {i['sizes'] for i in manifest['icons']}
        check('manifest: 192 and 512 icons, maskable', {'192x192', '512x512'} <= sizes
              and any(i.get('purpose') == 'maskable' for i in manifest['icons']))
        for icon in manifest['icons']:
            ok = page.evaluate(f"fetch({json.dumps(icon['src'])}).then(r => r.ok)")
            check(f"icon loads: {icon['src']}", ok)

        # Save something, like a profile or a game in progress would be.
        page.evaluate("localStorage.setItem('pubby.offlineCheck', JSON.stringify('kept'))")

        # Make sure the page is controlled, then go offline.
        page.reload()
        page.wait_for_selector('h1')
        check('page controlled by service worker', page.evaluate('!!navigator.serviceWorker.controller'))

        httpd.shutdown()
        ctx.set_offline(True)
        for path in ['', '?source=homescreen', '#x']:
            page.goto(url + path)
            page.wait_for_selector('h1', timeout=5000)
            check(f'opens offline: {path or "/"}', page.inner_text('h1').strip() == 'Pubby')
        check('saved data still there offline',
              page.evaluate("JSON.parse(localStorage.getItem('pubby.offlineCheck'))") == 'kept')

        # Play the first screens offline: tap through to new game.
        buttons = page.locator('button').all_inner_texts()
        check('home buttons render offline', any('Play against the computer' in b for b in buttons), ', '.join(buttons[:6]))
        page.goto(url + '?onephone=1')  # the one-phone button is hidden unless asked for
        page.wait_for_selector('h1')
        page.get_by_role('button', name='New game').first.click()
        page.wait_for_timeout(500)
        check('new game screen works offline', not errors, '; '.join(errors))

        browser.close()

    # Update test: a new build is picked up by itself and the old cache goes.
    with sync_playwright() as p:
        site2 = pathlib.Path(tempfile.mkdtemp()) / 'pubby'
        shutil.copytree(ROOT / 'dist', site2)
        httpd = serve(site2.parent)
        u = f'http://127.0.0.1:{httpd.server_address[1]}/pubby/'
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(u)
        page.evaluate('navigator.serviceWorker.ready')
        page.reload()
        title1 = page.title()
        idx = site2 / 'index.html'
        idx.write_text(idx.read_text().replace('<title>Pubby</title>', '<title>Pubby v2</title>'))
        sw = site2 / 'sw.js'
        old = sw.read_text().split('"')[1]
        sw.write_text(sw.read_text().replace(old, 'testupdate02'))
        page.reload()  # served from cache; browser checks sw.js and installs v2
        for _ in range(50):  # up to 10 s for the new version to install and take over
            keys = page.evaluate('caches.keys()')
            if keys == ['pubby-testupdate02']:
                break
            page.wait_for_timeout(200)
        page.reload()
        check('update: old version shown first, new version next open',
              title1 == 'Pubby' and page.title() == 'Pubby v2', f'{title1} -> {page.title()}')
        keys = page.evaluate('caches.keys()')
        check('update: old cache deleted', keys == ['pubby-testupdate02'], ', '.join(keys))
        browser.close()
        httpd.shutdown()

    passed = sum(results)
    print(f'\n{passed} of {len(results)} checks passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
