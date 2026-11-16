"""Stop fast forward and ☰ with a real finger tap (CODE.md 9am.1 and 9am.3, 2.37.2).

Headless clicks used to land between animations and passed; a finger hit the full-screen animation
layer and failed. This check presses with CDP touch events (touchStart, 120 ms, touchEnd), as a finger does.
Single player, 4 players, real time (no fake clock), built app (dist/index.html).
  - once the person is out, Fast forward is tapped and the banner shows;
  - Stop fast forward, tapped the same way, stops it at once (banner and button gone within 400 ms);
  - during Fast forward, ☰ opens the menu with a touch, and it closes with a touch.

Usage: node build.mjs && python3 testbed/ffstop_check.py
"""
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import APP, BOT, check, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def touch(page, cdp, locator, hold_ms=120):
    """A finger: press, hold for hold_ms, lift, at the centre of the first match."""
    box = locator.first.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    page.wait_for_timeout(hold_ms)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def new_game(browser, cfg, limit_s=200):
    """A fresh game (fresh storage) in a new context; returns (ctx, page) once the person is out, else None."""
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'Computer move refused' not in m.text else None)
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    start_solo(page)
    page.evaluate(BOT)
    ff = page.locator('.hand-actions button:has-text("Fast forward")')
    t0 = time.time()
    while time.time() - t0 < limit_s:
        if ff.count():
            return ctx, page
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        page.wait_for_timeout(40)
    ctx.close()
    return None


cfg = {'players': 4, 'rounds': 6, 'manualDeal': False, 'swap': False, 'reshuffle': False, 'ultimate': False,
       'voteYes': True, 'forfeitChance': 1.0, 'jokers': True, 'stayAtEnd': False}


def run(browser):
    # The person must reach the last two (or a round with no cards left); a deal decides how soon. Up to three games.
    found = None
    for _ in range(3):
        found = new_game(browser, cfg)
        if found:
            break
    out = found is not None
    if out:
        ctx, page = found
        ff = page.locator('.hand-actions button:has-text("Fast forward")')
    check(out, 'the person is out of the round (Fast forward is offered)')
    if out:
        cdp = ctx.new_cdp_session(page)
        touch(page, cdp, ff)
        page.wait_for_timeout(300)
        check(page.locator('.fast-banner').count() > 0, 'a finger tap on Fast forward turns it on (banner shows)')
        stop = page.locator('.game-action-slot button:has-text("Stop fast forward")')
        check(stop.count() > 0, 'the bottom button reads "Stop fast forward"')
        if stop.count():
            touch(page, cdp, stop)
            page.wait_for_timeout(400)
            check(page.locator('.fast-banner').count() == 0, 'a finger tap on Stop fast forward stops it within 400 ms')
            check(page.locator('.game-action-slot button:has-text("Stop fast forward")').count() == 0, 'the button goes back to Fast forward / Skip')
        # ☰ while Fast forward is on: a finger opens the menu and closes it.
        ff2 = page.locator('.hand-actions button:has-text("Fast forward")')
        if ff2.count():
            touch(page, cdp, ff2)
            page.wait_for_timeout(200)
        menu = page.locator('.menu-btn')
        touch(page, cdp, menu)
        page.wait_for_timeout(300)
        check(page.locator('.menu-layer').count() > 0, '☰ opens the menu with a finger while the computer players play')
        page.screenshot(path='/tmp/ffstop-menu.png')
        touch(page, cdp, page.locator('.menu-btn'))
        page.wait_for_timeout(300)
        check(page.locator('.menu-layer').count() == 0, 'a finger tap on ☰ closes the menu')
    if out:
        check(not page.errors, f'no page errors ({page.errors[:2]})')
        ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        run(browser)
        browser.close()
    report()


if __name__ == '__main__':
    main()
