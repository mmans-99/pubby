"""Phase 4 slice 1 check: the network lobby on four phone-sized pages.

One page hosts; three join with the two scans. Each page's on-screen QR code
is screenshotted and decoded with OpenCV (like a camera), then fed to the other
page through window.pubbyLobby.scan. Checks: wrong codes are refused with a
message, every phone sees the same seats and settings, names come from each
phone, duplicate names block Start, seat order and options reach every phone,
remove, leave, join by link, Start shows every phone the same list, Back to
the lobby, a phone that goes silent is dropped, the host's back gesture asks
first and closing tells every phone. Since 2.2 (connection test removed) also:
a lobby link tapped while Pubby is open, a real camera scan through Pubby's
own reader (a fake camera playing the host's code), Exit Pubby, and profiles
in a saved game (can't be deleted; a missing one blocks Carry on).

Usage: npm run build && python3 testbed/lobby_check.py
"""
import json
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


def write_camera_video(png, path, w=640, h=480):
    """A short Y4M video of the QR screenshot, a little turned and blurred, like a camera."""
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    side = 300
    img = cv2.resize(img, (side, side), interpolation=cv2.INTER_AREA)
    with open(path, 'wb') as f:
        f.write(f'YUV4MPEG2 W{w} H{h} F10:1 Ip A1:1 C420jpeg\n'.encode())
        for k in range(10):
            frame = np.full((h, w), 170, np.uint8)
            src = np.float32([[0, 0], [side, 0], [side, side], [0, side]])
            jig = 6 * np.sin(k)
            dst = np.float32([[170 + jig, 90], [470, 80 + jig], [480, 400], [160, 390 - jig]])
            m = cv2.getPerspectiveTransform(src, dst)
            frame = cv2.warpPerspective(img, m, (w, h), dst=frame, borderMode=cv2.BORDER_TRANSPARENT)
            frame = cv2.GaussianBlur(frame, (0, 0), 0.8)
            f.write(b'FRAME\n' + frame.tobytes() + bytes([128]) * (w * h // 2))


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


def joinProblem_started(host):
    """After Start the lobby is marked started (no late joining; unit-tested in lobby.test.ts)."""
    lb = host.evaluate('window.pubbyLobby.lobby()')
    return bool(lb and lb['started'])


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
        want = '.'.join(json.loads((ROOT / 'package.json').read_text())['version'].split('.')[:2])
        check(f'version {want} on the main menu', f'Version {want}' in host.inner_text('main'))
        check('no connection test on the main menu (removed in 2.2)', 'Connection test' not in host.inner_text('main'))

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
        check('an old connection-test link is refused', wait_for(lambda: 'isn’t a Pubby connection code' in ali.locator('.scan-hint').inner_text(), 3))
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
        check('‹ Back asks too', wait_for(lambda: 'Close the game?' in host.inner_text('main'), 3))
        host.get_by_role('button', name='Stay').click()

        # --- Start (2.3: the game starts on every phone) ---
        host.get_by_role('button', name='Start game · 2 players').click()
        check('Start puts every phone in the game', wait_for(lambda: all(pg.locator('.screen.game').count() == 1 for pg in (host, ali)), 8))
        seats = [pg.evaluate('window.pubbyNet.session().players.map((x) => x.sessionName)') for pg in (host, ali)]
        check('the same seat order on every phone', seats[0] == seats[1] == ['Boss', 'Ali'], str(seats))
        check('each phone is its own player', [pg.evaluate('window.pubbyNet.info().me') for pg in (host, ali)] == ['p1', 'p2'])
        check('a phone that joins after the start is refused', joinProblem_started(host))
        host.get_by_role('button', name='Menu').click()
        host.get_by_role('button', name='Close the game').click()
        host.get_by_role('button', name='Tap again: close the game on every phone').click()
        check('host back on the main menu', wait_for(lambda: host.inner_text('main h1') == 'Pubby', 5))
        check('the other phone is told the game closed', wait_for(lambda: step(ali) == 'closed', 5))
        check('closed screen offers Join again', ali.get_by_role('button', name='Join again').count() == 1)

        # --- Lobby link tapped while Pubby is already open (iPhone Safari reuses the tab) ---
        host.get_by_role('button', name='Play on several phones').click()
        host.get_by_role('button', name='Host a game').click()
        host.get_by_role('button', name='Hosty', exact=True).click()
        host.get_by_role('button', name='Add player').click()
        host.wait_for_selector('.qr')
        link = read_qr(host)
        ali.goto(url)
        ali.wait_for_selector('h1')
        ali.evaluate(f'location.hash = {link[link.index("#"):]!r}')
        check('lobby link works when Pubby is already open', wait_for(lambda: step(ali) == 'name', 5))
        check('and is removed from the address bar', '#lobby' not in ali.url, ali.url)
        ali.get_by_role('button', name='Ali', exact=True).click()
        wait_for(lambda: step(ali) == 'join-code', 10)
        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyLobby.scan({read_qr(ali)!r})')
        check('that phone joins', wait_for(lambda: step(ali) == 'lobby', 20) and wait_for(lambda: names(host) == ['Hosty', 'Ali'], 5))

        # --- A real camera scan: fake camera plays the host's code, read by Pubby's reader ---
        host.get_by_role('button', name='Add player').click()
        host.wait_for_selector('.qr')
        png = host.locator('.qr').screenshot()
        video = pathlib.Path(tempfile.mkdtemp()) / 'host-code.y4m'
        write_camera_video(png, video)
        cam_browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                              f'--use-file-for-fake-video-capture={video}'])
        cctx = cam_browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        cctx.grant_permissions(['camera'])
        cam = cctx.new_page()
        cam.on('pageerror', lambda e: errors.append(str(e)))
        cam.goto(url)
        open_lobby(cam, False, 'Cam')
        t0 = time.time()
        check('camera + Pubby’s reader reads the host’s code', wait_for(lambda: step(cam) == 'join-code', 20), f'{time.time() - t0:.1f} s')
        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyLobby.scan({read_qr(cam)!r})')
        check('and joins', wait_for(lambda: step(cam) == 'lobby', 20) and wait_for(lambda: len(names(host)) == 3, 5))
        cam_browser.close()
        check('host drops the phone whose browser closed', wait_for(lambda: names(host) == ['Hosty', 'Ali'], 35))
        host.get_by_role('button', name='‹ Back').click()
        host.get_by_role('button', name='Close', exact=True).click()
        wait_for(lambda: step(ali) == 'closed', 5)
        check('camera off after leaving', host.evaluate('Array.from(document.querySelectorAll("video")).filter(v => v.srcObject).length') == 0)

        # --- Exit Pubby button on the main menu ---
        ali.get_by_role('button', name='Main menu').click()
        ali.get_by_role('button', name='Exit Pubby').click()
        check('Exit Pubby asks first', 'Exit Pubby?' in ali.inner_text('body'))
        ali.get_by_role('button', name='Stay').click()
        check('Stay keeps Pubby open', ali.inner_text('main h1') == 'Pubby')
        ali.get_by_role('button', name='Exit Pubby').click()
        ali.get_by_role('button', name='Exit', exact=True).click()
        ali.wait_for_selector('.screen.bye', timeout=3000)
        check('Exit shows how to close it here', 'See you next time' in ali.inner_text('main'))
        ali.get_by_role('button', name='Open Pubby again').click()
        check('Open Pubby again goes to the main menu', ali.inner_text('main h1') == 'Pubby')

        # --- Profiles in a saved game (user 2026-11-08) ---
        host.goto(url + '?onephone=1')  # the one-phone button is hidden unless asked for
        host.wait_for_selector('h1')
        host.get_by_role('button', name='New game · one phone').click()
        check('one-phone New game still opens', host.inner_text('main h1') == 'New game')
        for n in ('Amy', 'Ben'):
            host.get_by_placeholder('New player name').fill(n)
            host.get_by_role('button', name='Add', exact=True).click()
        host.get_by_role('button', name='Start game').click()
        host.goto(url)
        host.wait_for_selector('h1')
        check('saved game offers Carry on', host.get_by_role('button', name='Carry on game').is_enabled())
        host.get_by_role('button', name='Profiles').click()
        host.locator('li', has_text='Amy').get_by_role('button', name='Delete').click()
        check('a profile in the saved game can’t be deleted', 'Amy is in the game in progress' in host.inner_text('body')
              and 'Tap to delete' not in host.inner_text('main'))
        host.locator('li', has_text='Hosty').get_by_role('button', name='Delete').click()
        host.locator('li', has_text='Hosty').get_by_role('button', name='Tap to delete').click()
        check('a profile not in the game still can', 'Hosty' not in host.inner_text('main'))
        # Storage losing a profile another way: Carry on is blocked.
        host.evaluate('''() => { const p = JSON.parse(localStorage.getItem("pubby.profiles")); delete p["Amy"];
                                  localStorage.setItem("pubby.profiles", JSON.stringify(p)); }''')
        host.goto(url)
        host.wait_for_selector('h1')
        check('missing profile: Carry on is off and says why', host.get_by_role('button', name='Carry on game').is_disabled()
              and 'Amy is missing from Profiles' in host.inner_text('main'))
        host.goto(url + '?onephone=1')
        host.wait_for_selector('h1')
        host.get_by_role('button', name='New game · one phone').click()
        host.get_by_role('button', name='New game · one phone').click()
        check('New game twice ends it', host.inner_text('main h1') == 'New game')

        check('no page errors', not errors, '; '.join(errors))
        browser.close()
    httpd.shutdown()
    print(f'{sum(results)} of {len(results)} checks passed')
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
