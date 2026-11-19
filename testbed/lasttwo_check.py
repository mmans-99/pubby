"""Last two bottom row check (CODE.md 9al.6, 2.37.1).

When the last two players are in play, the bottom row holds Forfeit (left), the main button (right) and
the 😂 button (far left). On a phone: Forfeit and Play sit on one line inside the window, Play is at
least 140 px wide and at most 56 px tall, the 😂 button overlaps neither, and the hand sits above the row.

Single player at Fast speed in the built app (dist/index.html); testbed/bot.js taps the person's seat.
The bot plays until the last two are in play (the Forfeit button appears on the action row).
The round's hand is whatever the deal gives, so this checks the row's layout, not a particular hand size.
Screenshots go to /tmp/lasttwo-*.png.

Usage: node build.mjs && python3 testbed/lasttwo_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import APP, BOT, FAST, advance, check, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SIZES = [(360, 740), (390, 844)]

RECT = "sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; }"


def inside(r, margin=0.5):
    return r is not None and r['l'] >= -margin and r['t'] >= -margin and r['r'] <= r['w'] + margin and r['b'] <= r['h'] + margin


def overlap(a, b):
    return a is not None and b is not None and a['l'] < b['r'] and b['l'] < a['r'] and a['t'] < b['b'] and b['t'] < a['b']


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
    cfg = {'players': 2, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
           'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    found = False
    for _ in range(2000):
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        advance(page, 150)
        if page.locator('.action-row .forfeit-btn').count() and page.locator('.action-row > button.grow').count():
            found = True
            break
    check(found, f'{w}x{h}: reached the last two (Forfeit on the bottom row)')
    if found:
        # 9aq.2 (2.39): on one phone a pop-up closes on a tap anywhere (the vote alert keeps its own 5 s), so tap
        # each one away, and run the clock for the rest, until none is up.
        for _ in range(80):
            if not page.locator('.popup-overlay').count():
                break
            if page.locator('.popup-overlay[data-skip]').count() and not page.locator('.popup-overlay button', has_text='Vote now').count():
                page.locator('.popup-overlay[data-skip]').first.click()
            advance(page, 500)
        forfeit = page.evaluate(RECT, '.action-row .forfeit-btn')
        play = page.evaluate(RECT, '.action-row > button.grow')
        react = page.evaluate(RECT, '.game-action-slot .react-inline')
        hand = page.evaluate(RECT, '.game-hand-slot')
        row = page.evaluate(RECT, '.action-row')
        page.screenshot(path=f'/tmp/lasttwo-{w}x{h}.png')
        check(inside(forfeit) and inside(play), f'{w}x{h}: Forfeit and Play are inside the window')
        check(play['r'] - play['l'] >= 140, f'{w}x{h}: Play is at least 140 px wide ({play["r"] - play["l"]:.0f})')
        check(play['b'] - play['t'] <= 56, f'{w}x{h}: Play is one line tall ({play["b"] - play["t"]:.0f} px)')
        check(abs(forfeit['t'] - play['t']) < 2 and forfeit['r'] <= play['l'] + 0.5, f'{w}x{h}: Forfeit sits left of Play on the same line')
        check(react is not None and not overlap(react, forfeit) and not overlap(react, play), f'{w}x{h}: 😂 overlaps neither button')
        check(hand is not None and row is not None and hand['b'] <= row['t'] + 0.5, f'{w}x{h}: the hand sits above the bottom row')
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
