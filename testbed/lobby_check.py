"""Phase 4 slice 1 check: the network lobby on four phone-sized pages.

One page hosts; three join with the two scans. Each page's on-screen QR code
is screenshotted and decoded with OpenCV (like a camera), then fed to the other
page through window.pubbyLobby.scan. Checks: wrong codes are refused with a
message, every phone sees the same seats and settings, names come from each
phone, duplicate names block Start, seat order and options reach every phone,
remove, leave, join by link, Start shows every phone the same list, Back to
the lobby, a phone that goes silent is dropped, the host's back gesture asks
first and closing tells every phone.

Usage: npm run build && python3 testbed/lobby_check.py
"""
import functools
import http.server
import pathlib
import shutil
import tempfile
import threading
import time

import cv2
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({detail})' if detail else ''))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(Quiet, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def read_qr(page):
    png = page.locator('.qr').screenshot()
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    text, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    if not text:
        try:
            res, _ = cv2.wechat_qrcode_WeChatQRCode().detectAndDecode(img)
            text = res[0] if res else ''
        except Exception:
            pass
    return text


def step(page):
    return page.evaluate('window.pubbyLobby ? window.pubbyLobby.step() : null')


def wait_for(fn, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def lobby(page):
    return page.evaluate('window.pubbyLobby.lobby()')


def names(page):
    lb = lobby(page)
    return [s['sessionName'] or s['profileName'] for s in lb['seats']] if lb else []


def open_lobby(page, as_host, name):
    page.get_by_role('button', name='Play on several phones').click()
    page.get_by_role('button', name='Host a game' if as_host else 'Join a game').click()
    page.get_by_placeholder('New name').fill(name)
    page.get_by_role('button', name='Go', exact=True).click()


def add(host, joiner, name=None, link_join=False, url=None, browser=None, errors=None):
    """Host adds a phone. Returns the joining page."""
    host.get_by_role('button', name='Add player').click()
    host.wait_for_selector('.qr')
    code1 = read_qr(host)
    if link_join:
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        joiner = ctx.new_page()
        joiner.on('pageerror', lambda e: errors.append(str(e)))
        joiner.goto(code1)
        joiner.wait_for_selector('h1')
        joiner.get_by_placeholder('New name').fill(name)
        joiner.get_by_role('button', name='Go', exact=True).click()
    elif name:
        open_lobby(joiner, False, name)
        joiner.evaluate(f'window.pubbyLobby.scan({code1!r})')
    else:
        joiner.evaluate(f'window.pubbyLobby.scan({code1!r})')
    wait_for(lambda: step(joiner) == 'join-code', 10)
    code2 = read_qr(joiner)
    host.get_by_role('button', name='Scan their code').click()
    host.evaluate(f'window.pubbyLobby.scan({code2!r})')
    wait_for(lambda: step(joiner) == 'lobby', 20)
    return joiner


def main():
    site = pathlib.Path(tempfile.mkdtemp()) / 'pubby'
    shutil.copytree(ROOT / 'dist', site)
    httpd = serve(site.parent)
    url = f'http://127.0.0.1:{httpd.server_address[1]}/pubby/'
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        pages = []
        for _ in range(3):
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            ctx.grant_permissions(['camera'])
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url)
            pg.wait_for_selector('h1')
            pages.append(pg)
        host, ali, bea = pages

        check('main menu has Play on several phones', host.get_by_role('button', name='Play on several phones').count() == 1)
        check('version 2.1 on the main menu', 'Version 2.1' in host.inner_text('main'))

        open_lobby(host, True, 'Hosty')
        check('host lobby opens with the host seated', step(host) == 'lobby' and names(host) == ['Hosty'])
        check('Start is off with one player', host.get_by_role('button', name='Start game').is_disabled())
        check('the new name was saved as a profile', host.evaluate('Object.keys(JSON.parse(localStorage.getItem("pubby.profiles")))') == ['Hosty'])

        # --- First player: wrong codes first ---
        host.get_by_role('button', name='Add player').click()
        host.wait_for_selector('.qr')
        code1 = read_qr(host)
        check('Add player shows a lobby link QR', '#lobby=PUBBY1~o~' in code1, f'{len(code1)} chars')
        open_lobby(ali, False, 'Ali')
        check('joining phone opens its camera', step(ali) == 'join-scan' and ali.locator('video').count() == 1)
        ali.evaluate('window.pubbyLobby.scan("hello")')
        check('a random QR is refused with a message', wait_for(lambda: ali.locator('.scan-hint').count() == 1, 3) and step(ali) == 'join-scan')
        test_code = code1.replace('#lobby=', '#join=')
        ali.evaluate(f'window.pubbyLobby.scan({test_code!r})')
        check('a connection-test code is refused', wait_for(lambda: 'connection test' in ali.locator('.scan-hint').inner_text(), 3))
        ali.evaluate(f'window.pubbyLobby.scan({code1!r})')
        check('joining phone shows code 2', wait_for(lambda: step(ali) == 'join-code', 10))
        code2 = read_qr(ali)
        check('code 2 scans', code2.startswith('PUBBY1~a~'), f'{len(code2)} chars')
        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyLobby.scan({code1!r})')
        check('host refuses its own code', wait_for(lambda: host.locator('.scan-hint').count() == 1, 3))
        host.evaluate(f'window.pubbyLobby.scan({code2!r})')
        check('Ali joins: lobby on her phone', wait_for(lambda: step(ali) == 'lobby', 20))
        check('host sees Ali', wait_for(lambda: names(host) == ['Hosty', 'Ali'], 5))
        check('Ali sees the same seats', names(ali) == ['Hosty', 'Ali'])
        check('Ali sees "You’re in" and her You tag', 'You’re in' in ali.inner_text('main') and 'You' in ali.inner_text('.seats'))
        check('camera is off on both after joining', wait_for(lambda: host.evaluate('Array.from(document.querySelectorAll("video")).filter(v => v.srcObject).length') == 0
                                                     and ali.evaluate('Array.from(document.querySelectorAll("video")).filter(v => v.srcObject).length') == 0, 3))

        # --- Second player with a clashing name ---
        add(host, bea, name='ali')
        check('Bea joins (as "ali")', wait_for(lambda: len(names(host)) == 3, 5), str(names(host)))
        check('two "Ali"s block Start on the host', 'Two players are called' in host.inner_text('main') and host.get_by_role('button', name='Start game').is_disabled())
        check('and the joining phones see why', wait_for(lambda: 'Two players are called' in bea.inner_text('main'), 3))
        box = bea.get_by_label('Your name for this game')
        box.fill('Bea')
        box.press('Enter')
        check('Bea renames herself on her phone; every phone gets it', wait_for(lambda: names(host) == ['Hosty', 'Ali', 'Bea'] and names(ali) == ['Hosty', 'Ali', 'Bea'], 5), str(names(ali)))
        check('Start is on again', wait_for(lambda: host.get_by_role('button', name='Start game · 3 players').is_enabled(), 3))
        check('profile shown under a game name', 'Profile: ali' in host.inner_text('.seats'))

        # --- Host options and seat order reach every phone ---
        host.get_by_role('button', name='Move Bea up').click()
        check('seat order reaches every phone', wait_for(lambda: names(bea) == ['Hosty', 'Bea', 'Ali'], 5))
        host.locator('.toggle').click()
        check('joker rule off reaches every phone', wait_for(lambda: 'Joker rule off' in ali.inner_text('main'), 5))
        host.locator('select').select_option(label='1 minute')
        check('pause limit reaches every phone', wait_for(lambda: 'Pause limit: 1 minute' in bea.inner_text('main'), 5))
        hbox = host.get_by_label('Your name for this game')
        hbox.fill('Boss')
        hbox.press('Enter')
        check('host’s own game name reaches every phone', wait_for(lambda: names(ali)[0] == 'Boss', 5))

        # --- Third player by link (iPhone Camera app), then removed ---
        cat = add(host, None, name='Cat', link_join=True, url=url, browser=browser, errors=errors)
        check('joining by link: name first, then code 2, then in', step(cat) == 'lobby' and len(names(host)) == 4)
        check('the link is removed from the address bar', '#lobby' not in cat.url, cat.url)
        host.get_by_role('button', name='Remove Cat').click()
        check('remove asks first', 'Remove?' in host.inner_text('.seats') and len(names(host)) == 4)
        host.get_by_role('button', name='Remove Cat').click()
        check('removed phone is told', wait_for(lambda: step(cat) == 'removed', 5))
        check('removed from every phone', wait_for(lambda: names(ali) == ['Boss', 'Bea', 'Ali'], 5))
        cat.context.close()

        # --- Ali leaves, then comes back ---
        ali.get_by_role('button', name='Leave').click()
        check('Leave asks first', 'Leave the game?' in ali.inner_text('main'))
        ali.get_by_role('button', name='Leave', exact=True).click()
        check('Ali back on the main menu', ali.inner_text('main h1') == 'Pubby')
        check('host sees Ali leave', wait_for(lambda: names(host) == ['Boss', 'Bea'], 5), str(names(host)))
        ali.get_by_role('button', name='Play on several phones').click()
        ali.get_by_role('button', name='Join a game').click()
        ali.get_by_role('button', name='Ali', exact=True).click()  # saved profile chip
        add(host, ali)
        check('Ali joins again with her saved profile', wait_for(lambda: names(host) == ['Boss', 'Bea', 'Ali'], 5))

        # --- Start ---
        host.get_by_role('button', name='Start game · 3 players').click()
        check('host shows All set', 'All set · 3 players' in host.inner_text('main'))
        check('every phone shows All set', wait_for(lambda: all('All set · 3 players' in pg.inner_text('main') for pg in (ali, bea)), 5))
        lists = [pg.inner_text('.seats') for pg in (host, ali, bea)]
        check('the same seat order on every phone', all(l.split('\n')[:1] == lists[0].split('\n')[:1] for l in lists)
              and all(names(pg) == ['Boss', 'Bea', 'Ali'] for pg in (host, ali, bea)))
        check('no Add player once started', host.get_by_role('button', name='Add player').count() == 0)
        host.get_by_role('button', name='Back to the lobby').click()
        check('Back to the lobby on every phone', wait_for(lambda: 'Waiting for the host to start' in ali.inner_text('main'), 5))

        # --- A phone that goes silent is dropped ---
        bea.context.close()
        t0 = time.time()
        check('a phone that goes away is dropped from the lobby', wait_for(lambda: names(host) == ['Boss', 'Ali'], 35), f'{time.time() - t0:.0f} s')
        check('and every phone is told', wait_for(lambda: names(ali) == ['Boss', 'Ali'], 5))

        # --- Host back gesture asks; Close tells every phone ---
        host.evaluate('history.back()')
        check('back gesture asks before closing a lobby with players', wait_for(lambda: 'Close the game?' in host.inner_text('main'), 3))
        host.get_by_role('button', name='Stay').click()
        check('Stay keeps the lobby', step(host) == 'lobby' and names(host) == ['Boss', 'Ali'])
        host.get_by_role('button', name='‹ Back').click()
        host.get_by_role('button', name='Close', exact=True).click()
        check('host back on the main menu', host.inner_text('main h1') == 'Pubby')
        check('the other phone is told the game closed', wait_for(lambda: step(ali) == 'closed', 5))
        check('closed screen offers Join again', ali.get_by_role('button', name='Join again').count() == 1)

        # One-phone game still there and fine.
        host.get_by_role('button', name='New game · one phone').click()
        check('one-phone New game still opens', host.inner_text('main h1') == 'New game')

        check('no page errors', not errors, '; '.join(errors))
        browser.close()
    httpd.shutdown()
    print(f'{sum(results)} of {len(results)} checks passed')
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
