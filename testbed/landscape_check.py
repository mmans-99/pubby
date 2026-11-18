"""Landscape rail check (version 2.37, CODE.md 9ak.6).

On a landscape phone (height 500 or less) the top bar is a rail down the left: nothing in the rail
overlaps the felt, the hand and Play sit inside the window, and the sheets and the menu stay inside it.
Screenshots go to /tmp/landscape-*.png for a look.

Usage: npm run build && python3 testbed/landscape_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import APP, BOT, FAST, advance, check, log_len, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SIZES = [(844, 390), (740, 360)]

RECT = "sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; }"


def inside(r, margin=0.5):
    return r is not None and r['l'] >= -margin and r['t'] >= -margin and r['r'] <= r['w'] + margin and r['b'] <= r['h'] + margin


def run(browser, w, h):
    print(f'-- {w} x {h}')
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    if FAST:
        page.clock.install()  # before goto, as solo_check.new_page does
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    start_solo(page)
    page.evaluate(BOT)
    cfg = {'players': 3, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
           'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    before = log_len(page)
    for _ in range(300):
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        advance(page, 100)
        if page.locator('.hand .card').count() > 0 and log_len(page) > before + 2:
            break
    check(page.evaluate("() => document.documentElement.dataset.rail === '1'"), f'{w}x{h}: the rail flag is on')
    bar = page.evaluate(RECT, '.game-bar')
    check(bar is not None and bar['l'] <= 0.5 and bar['r'] <= 56.5, f'{w}x{h}: the top bar is a rail of 56 px down the left')
    table = page.evaluate(RECT, '.game-table-slot')
    check(table is not None and table['l'] >= 63.5, f'{w}x{h}: the table starts right of the rail')
    check(inside(table), f'{w}x{h}: the table is inside the window')
    hand_slot = page.evaluate(RECT, '.game-hand-slot')
    hand = page.evaluate(RECT, '.hand')
    if hand is not None and hand_slot is not None:
        check(inside(hand) and hand['l'] >= hand_slot['l'] - 0.5 and hand['r'] <= hand_slot['r'] + 0.5, f'{w}x{h}: the hand is inside its slot and the window')
    play = page.evaluate(RECT, '.game-action-slot button.big')
    check(play is None or inside(play), f'{w}x{h}: the main action button is inside the window')
    for sel, name in [('.rules-btn', 'quick rules'), ('.sound-btn', 'sound'), ('.reactions-toggle', 'reactions')]:
        r = page.evaluate(RECT, sel)
        check(r is not None and inside(r) and r['r'] <= 56.5, f'{w}x{h}: the {name} button is in the rail')
    page.screenshot(path=f'/tmp/landscape-play-{w}x{h}.png')
    # 9ap.G (2.38.2): a pop-up that covers the screen closes by itself after 5 s (no tap), so run the clock until none is up.
    for _ in range(40):
        if not page.locator('.popup-overlay').count():
            break
        advance(page, 500)
    page.get_by_role('button', name='Menu').click()
    advance(page, 50)
    menu = page.evaluate(RECT, '.menu-layer > .menu')
    check(menu is not None and inside(menu) and menu['l'] >= 63.5, f'{w}x{h}: the menu card opens right of the rail, inside the window')
    page.screenshot(path=f'/tmp/landscape-menu-{w}x{h}.png')
    page.get_by_role('button', name='Close menu').click()
    advance(page, 50)
    check(page.locator('.menu-layer').count() == 0, f'{w}x{h}: the menu closes')
    check(not page.errors, f'{w}x{h}: no page errors ({page.errors[:2]})')
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            run(browser, w, h)
        browser.close()
    report()


if __name__ == '__main__':
    main()
