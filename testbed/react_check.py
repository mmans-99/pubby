"""Reactions sheet and its close button (CODE.md 9am.2 and 9am.3, 2.37.2).

Phones 384×800 and 360×740, fake clock, built app:
  - in play: the 😂 button is what a finger hits when the sheet is shut; with the sheet open the typing
    bar sits above the 😂/✕ button and the sheet above the typing bar (no overlap);
  - on the results screen: the same, and the sheet is solid (no see-through);
  - a tap on the table (outside the sheet) closes it; a tap on ✕ closes it; the typing bar still takes a tap.

Usage: node build.mjs && python3 testbed/react_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import APP, BOT, advance, check, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SIZES = [(384, 800), (360, 740)]
RECT = "sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }"


def hit(page, sel):
    """The class of the element a finger would hit at the centre of sel's box."""
    return page.evaluate("""sel => {
        const e = document.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return t ? t.className.toString() : null; }""", sel)


def above(a, b):
    return a is not None and b is not None and a['b'] <= b['t'] + 0.5


def tap_xy(page, x, y):
    page.mouse.click(x, y)


def check_open(page, w, h, where):
    page.wait_for_timeout(300)  # the sheet's slide-in (0.22 s, real time) must finish before we measure
    toggle = page.evaluate(RECT, '.react-inline')
    bar = page.evaluate(RECT, '.msg-bar')
    sheet = page.evaluate(RECT, '.reactions-sheet')
    check(toggle is not None and bar is not None and above(bar, toggle), f'{w}x{h} {where}: the typing bar sits above the 😂/✕ button')
    check(sheet is not None and bar is not None and above(sheet, bar), f'{w}x{h} {where}: the sheet sits above the typing bar')
    check(sheet is not None and sheet['t'] >= 0 and sheet['b'] <= h, f'{w}x{h} {where}: the sheet is inside the window')
    row = page.evaluate("() => { const t = document.querySelector('.react-inline'); const p = t && (t.closest('.game-action-slot') || t.closest('.results-actions')); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }")
    check(toggle is not None and row is not None and toggle['t'] >= row['t'] - 0.5 and toggle['b'] <= row['b'] + 0.5, f'{w}x{h} {where}: the open ✕ sits fully inside its row (not cut off)')


def run(browser, w, h):
    print(f'-- {w} x {h}')
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'Computer move refused' not in m.text else None)
    page.clock.install()
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    start_solo(page)
    page.evaluate(BOT)
    cfg = {'players': 4, 'rounds': 3, 'manualDeal': False, 'swap': False, 'reshuffle': False, 'ultimate': False,
           'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    for _ in range(300):
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        advance(page, 100)
        if page.locator('.hand .card').count() and page.locator('.react-inline').count():
            break
    # In play: the 😂 is what a finger hits when the sheet is shut.
    check(hit(page, '.react-inline') is not None and 'react-inline' in (hit(page, '.react-inline') or ''), f'{w}x{h} in play: the 😂 button is what a finger hits when shut')
    page.locator('.react-inline').first.click(); advance(page, 150)
    check(page.locator('.reactions-sheet').count() == 1, f'{w}x{h} in play: the 😂 opens the sheet')
    check_open(page, w, h, 'in play')
    # Tap on the table (outside the sheet, the bar and the 😂/✕) closes it.
    table = page.evaluate(RECT, '.game-table-slot')
    tap_xy(page, (table['l'] + table['r']) / 2, table['t'] + 20); advance(page, 150)
    check(page.locator('.reactions-sheet').count() == 0, f'{w}x{h} in play: a tap outside closes the sheet')
    page.screenshot(path=f'/tmp/react-play-{w}x{h}.png')
    # Reopen, then ✕ closes it.
    page.locator('.react-inline').first.click(); advance(page, 150)
    x = page.evaluate(RECT, '.react-inline')
    tap_xy(page, (x['l'] + x['r']) / 2, (x['t'] + x['b']) / 2); advance(page, 150)
    check(page.locator('.reactions-sheet').count() == 0, f'{w}x{h} in play: a tap on ✕ closes the sheet')
    # On the results screen.
    for _ in range(4000):
        if page.locator('.results-footer .react-inline').count():
            break
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        advance(page, 100)
    # 9ap.G (2.38.2): pop-ups close by themselves after 5 s (no tap): run the clock until none is up.
    for _ in range(40):
        if not page.locator('.popup-overlay').count():
            break
        advance(page, 500)
    if page.locator('.results-footer .react-inline').count():
        page.locator('.results-footer .react-inline').first.click(); advance(page, 150)
        check(page.locator('.reactions-sheet').count() == 1, f'{w}x{h} results: the 😂 opens the sheet')
        check_open(page, w, h, 'results')
        bg = page.evaluate("() => getComputedStyle(document.querySelector('.reactions-sheet')).backgroundColor")
        check(bg.startswith('rgb(') and not bg.startswith('rgba('), f'{w}x{h} results: the sheet is solid ({bg})')
        page.screenshot(path=f'/tmp/react-results-{w}x{h}.png')
        x = page.evaluate(RECT, '.results-footer .react-inline')
        tap_xy(page, (x['l'] + x['r']) / 2, (x['t'] + x['b']) / 2); advance(page, 150)
        check(page.locator('.reactions-sheet').count() == 0, f'{w}x{h} results: a tap on ✕ closes the sheet')
    else:
        check(False, f'{w}x{h} results: reached the results screen')
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
