"""Back gesture check (v1.1): opens Pubby on a localhost server in a
phone-sized headless browser, as if opened from another page, and presses
back on each screen. Usage: npm run build && python3 testbed/back_check.py
"""
import functools, http.server, pathlib, sys, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({detail})' if detail else ''))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{srv.server_address[1]}/'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('about:blank')            # the page before Pubby
    pg.goto(base + '?onephone=1')  # the one-phone button is hidden unless asked for
    pg.wait_for_selector('h1')
    hist = ctx.new_cdp_session(pg)

    def entries():
        h = hist.send('Page.getNavigationHistory')
        return len(h['entries']), h['currentIndex']

    check('no history entries added before the first tap', entries() == (2, 1), str(entries()))
    pg.locator('h1').click()
    check('first tap adds two guards', entries() == (4, 3), str(entries()))

    def back():
        try:
            pg.evaluate('history.back()')
        except Exception:
            pass  # the page left (exit)
        pg.wait_for_timeout(400)

    def tap(text):
        pg.locator('button', has_text=text).first.click()
        pg.wait_for_timeout(200)

    def on_home():
        return pg.url.startswith(base) and pg.locator('h1', has_text='Pubby').count() > 0

    tap('Profiles')
    back()
    check('profiles -> back -> main menu', on_home() and pg.locator('.exit-sheet').count() == 0)

    tap('Past games')
    back()
    check('past games -> back -> main menu', on_home())

    tap('New game')
    back()
    check('new game setup -> back -> main menu', on_home())

    pg.locator('button.rules-btn').click()
    pg.wait_for_timeout(200)
    back()
    check('quick rules open -> back closes it, stays on menu',
          on_home() and pg.locator('.sheet[aria-label="Quick rules"]').count() == 0)

    tap('Profiles')
    back()
    back()  # two quick backs, no tap in between
    check('two quick backs from profiles: menu, then "Exit Pubby?"',
          on_home() and pg.locator('.exit-sheet').count() == 1)
    tap('Stay')
    pg.locator('h1').click()
    back()
    check('main menu -> back -> "Exit Pubby?"', pg.locator('.exit-sheet').count() == 1)
    check('exit question drops the guards (next back leaves)', entries()[1] == 1, str(entries()))
    tap('Stay')
    check('Stay closes the question and puts two guards back',
          on_home() and pg.locator('.exit-sheet').count() == 0 and entries()[1] == 3, str(entries()))

    back()
    check('asks again after Stay', pg.locator('.exit-sheet').count() == 1)
    back()
    check('second back gesture exits Pubby', pg.url == 'about:blank', pg.url)

    # Back during a game does nothing: start a 2-player game from setup.
    pg.goto(base + '?onephone=1')  # the one-phone button is hidden unless asked for
    pg.wait_for_selector('h1')
    tap('New game')
    for n in ['Amy', 'Ben']:
        pg.fill('input[placeholder="New player name"]', n)
        pg.locator('button', has_text='Add').last.click()
        pg.wait_for_timeout(150)
    pg.locator('button', has_text='Start game').click()
    pg.wait_for_timeout(500)
    in_game = pg.locator('.home').count() == 0 and pg.locator('h2', has_text='Add players').count() == 0
    if in_game:
        before = pg.content()
        back()
        back()
        check('in a game -> back (twice) does nothing', pg.url.startswith(base) and pg.locator('.home').count() == 0
              and pg.locator('.exit-sheet').count() == 0)
    else:
        check('in a game -> back does nothing (could not start a game in this check)', False,
              pg.locator('button').all_inner_texts()[:8].__str__())

    check('no page errors', not errors, '; '.join(errors))
    b.close()

print(f'\n{sum(results)} of {len(results)} checks passed')
sys.exit(0 if all(results) else 1)
