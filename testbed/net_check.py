"""Phase 4 slice 0 check: the Connection test screen on two phone-sized pages.

Each page's on-screen QR code is screenshotted and decoded with OpenCV (like a
camera would), then fed to the other page through window.pubbyNetTest.scan.
Checks: both pages connect over WebRTC, pings get replies, 😂 arrives, wrong
codes are refused with a message, Disconnect shows "Connection lost" on the
other phone, and leaving the screen with Back closes the link.

Headless Chromium has no built-in QR reader (BarcodeDetector), so it takes the
iPhone path (Camera app steps, then the join link). The camera scan itself is
only checked on real phones.

Usage: npm run build && python3 testbed/net_check.py
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


def read_qr(page):
    """Screenshot the QR on screen and decode it, like a camera."""
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
    return page.evaluate('window.pubbyNetTest.step()')


def wait_step(page, want, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if step(page) == want:
            return True
        time.sleep(0.2)
    return False


def main():
    site = pathlib.Path(tempfile.mkdtemp()) / 'pubby'
    shutil.copytree(ROOT / 'dist', site)
    httpd = serve(site.parent)
    url = f'http://127.0.0.1:{httpd.server_address[1]}/pubby/'
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        pages = []
        for _ in range(2):
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            ctx.grant_permissions(['camera'])
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url)
            pg.wait_for_selector('h1')
            pages.append(pg)
        host, join = pages

        for pg in pages:
            pg.get_by_role('button', name='Connection test (two phones)').click()
        check('home button opens the connection test', host.inner_text('main h1') == 'Connection test')

        host.get_by_role('button', name='This phone is the host').click()
        host.wait_for_selector('.qr')
        code1 = read_qr(host)
        check('host shows code 1 as a join link and it scans', '#join=PUBBY1~o~' in code1, f'{len(code1)} chars')
        check('code 1 holds what the host made', code1.endswith(host.evaluate('window.pubbyNetTest.code()')))

        join.get_by_role('button', name='This phone is joining').click()
        # Headless Chromium has no QR reader, like an iPhone: Camera-app steps, no camera.
        check('phone with no QR reader gets the Camera app steps', 'Join with the Camera app' in join.inner_text('main'))
        check('and no camera is started', join.locator('video').count() == 0)

        join.evaluate('window.pubbyNetTest.scan("hello")')
        time.sleep(0.3)
        check('a random QR code is refused with a message', step(join) == 'join-scan')

        join.evaluate(f'window.pubbyNetTest.scan({code1!r})')
        check('joining phone shows code 2', wait_step(join, 'join-code', 10))
        code2 = read_qr(join)
        check('code 2 scans', code2.startswith('PUBBY1~a~'), f'{len(code2)} chars')

        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyNetTest.scan({code1!r})')
        time.sleep(0.3)
        check('host refuses its own kind of code', step(host) == 'host-scan')
        hint = host.locator('.scan-hint').inner_text() if host.locator('.scan-hint').count() else ''
        check('host sees why', 'joining phone' in hint, hint)

        host.evaluate(f'window.pubbyNetTest.scan({code2!r})')
        check('host connects', wait_step(host, 'connected', 20))
        check('joining phone connects', wait_step(join, 'connected', 20))

        time.sleep(4)
        hs = host.evaluate('window.pubbyNetTest.stats()')
        js = join.evaluate('window.pubbyNetTest.stats()')
        check('host pings get replies', hs['got'] >= 2 and hs['lost'] == 0, str(hs))
        check('joining phone pings get replies', js['got'] >= 2 and js['lost'] == 0, str(js))
        check('link path shown', bool(hs['path']) and 'This phone' in host.inner_text('main'), str(hs['path']))
        check('round trip shown in ms', ' ms' in host.inner_text('main'))

        host.get_by_role('button', name='Send 😂').click()
        time.sleep(0.5)
        check('😂 arrives on the other phone', join.evaluate('window.pubbyNetTest.stats().laughsIn') == 1)

        host.get_by_role('button', name='Disconnect').click()
        check('host goes back to the start', wait_step(host, 'pick', 5))
        check('other phone shows Connection lost', wait_step(join, 'lost', 15))
        check('lost screen says how long it lasted', 'The link lasted' in join.inner_text('main'))

        # Second round, then leave with Back: the link closes on both.
        join.get_by_role('button', name='Start again').click()
        host.get_by_role('button', name='This phone is the host').click()
        host.wait_for_selector('.qr')
        join.get_by_role('button', name='This phone is joining').click()
        join.evaluate(f'window.pubbyNetTest.scan({read_qr(host)!r})')
        wait_step(join, 'join-code', 10)
        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyNetTest.scan({read_qr(join)!r})')
        check('connects a second time', wait_step(host, 'connected', 20) and wait_step(join, 'connected', 20))
        host.get_by_role('button', name='‹ Back').click()
        check('Back goes home', host.inner_text('main h1') == 'Pubby')
        check('leaving the screen closes the link', wait_step(join, 'lost', 15))

        # iPhone path: the Camera app opens the join link in the browser.
        host.get_by_role('button', name='Connection test (two phones)').click()
        host.get_by_role('button', name='This phone is the host').click()
        host.wait_for_selector('.qr')
        link = read_qr(host)
        ctx3 = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        phone3 = ctx3.new_page()
        phone3.on('pageerror', lambda e: errors.append(str(e)))
        phone3.goto(link)
        check('opening the join link goes straight to joining', wait_step(phone3, 'join-code', 10))
        check('the link is removed from the address bar', '#join' not in phone3.url, phone3.url)
        host.get_by_role('button', name='Scan their code').click()
        host.evaluate(f'window.pubbyNetTest.scan({read_qr(phone3)!r})')
        check('phone that joined by link connects', wait_step(host, 'connected', 20) and wait_step(phone3, 'connected', 20))
        phone3.get_by_role('button', name='Disconnect').click()
        check('host sees it leave', wait_step(host, 'lost', 15))
        host.get_by_role('button', name='‹ Back').click()
        cams = host.evaluate('Array.from(document.querySelectorAll("video")).filter(v => v.srcObject).length')
        check('camera is off after leaving', cams == 0)

        check('no page errors', not errors, '; '.join(errors))
        browser.close()
    httpd.shutdown()
    print(f'{sum(results)} of {len(results)} checks passed')
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
