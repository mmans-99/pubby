"""Voice screenshots and automatic checks (CODE.md 9aq.15 Part C, 3.0.1).

Three phones in an online room (Amy hosts, Ben and Cat join), local relay and fake mic as in
voice_check.py, ?voicedebug on every page. At each of six sizes:
- the lobby, the table during play, the Voice sheet, and the seat card at the left, top and right edges;
- automatic checks: no two bar or rail boxes overlap, the voice badges don't overlap the card-count
  chips, the seat card and the sheet stay inside the window, and the seat card never covers Play;
- the Voice sheet's entrance runs once (animationstart on .sheet counted from before it opens).
Screenshots: testbed/out/shots/voice-<w>x<h>-<scene>.png

Not in this script yet: the 8-person lobby and the Voice sheet with seven others, the seat with all
four marks, and build 1's scenes (9aq.5 item 3). Those are listed as not done in 9aq.6.

Usage: npm run build && python3 testbed/voice_shots.py
"""

import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import online_check as oc  # noqa: E402
import voice_check as vc  # noqa: E402  (the fake mic, the room helpers and the talk-ring wait)
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = vc.ROOT
OUT = ROOT / 'testbed' / 'out' / 'shots'
SIZES = [(390, 844)] if __import__("os").environ.get("ONE") else [(360, 740), (390, 844), (412, 915), (844, 390), (740, 360), (1180, 820)]
if __import__('os').environ.get('SIZES'):  # e.g. SIZES=360x740,390x844 (a subset, for a quick comparison)
    SIZES = [tuple(int(v) for v in x.split('x')) for x in __import__('os').environ['SIZES'].split(',')]
DEBUG = vc.DEBUG
FLOAT_H = 150

OVERLAP_JS = """() => {
  const boxes = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const bar = boxes('.game-bar > *, .rules-btn, .sound-btn, .reactions-toggle');
  const overlaps = [];
  for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) {
    const a = bar[i], c = bar[j];
    if (a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5) overlaps.push(i + '/' + j);
  }
  const badges = boxes('.voice-badge');
  const counts = boxes('.disc-count');
  let badgeOverlaps = 0;
  for (const a of badges) for (const c of counts) {
    if (a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5) badgeOverlaps++;
  }
  const outside = [...bar].filter((r) => r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5).length;
  return { barOverlaps: overlaps.length, badgeOverlaps, outside };
}"""

BOTTOM_JS = """() => {
  // Buttons in the lower 40% of the window (the action row, Start, Play, Waiting for…, Deal again?).
  // The floating corner buttons (rules, sound, reactions) are checked by OVERLAP_JS instead.
  const skip = '.rules-btn, .sound-btn, .reactions-toggle';
  return [...document.querySelectorAll('button')].filter((b) => !b.matches(skip))
    .map((b) => ({ b, r: b.getBoundingClientRect() }))
    .filter(({ b, r }) => r.width > 0 && r.height > 0 && r.top > innerHeight * 0.6 && getComputedStyle(b).visibility !== 'hidden')
    .map(({ b, r }) => ({ text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40),
      right: r.right, left: r.left, scrollW: b.scrollWidth, clientW: b.clientWidth, w: innerWidth }));
}"""


def bottom_check(page, tag, scene, results):
    """9aq.16 item: the bottom action button must stay inside the window and not clip its label."""
    items = page.evaluate(BOTTOM_JS)
    bad = [i for i in items if i['right'] > i['w'] + 0.5 or i['left'] < -0.5 or i['scrollW'] > i['clientW'] + 1]
    labels = [i['text'] for i in items]
    detail = ' | '.join(f"{i['text']} right {i['right']:.0f}/{i['w']}" for i in items)
    print(f'   bottom {tag} {scene}: {detail}', flush=True)
    why = '; '.join(f"{i['text']!r} right {i['right']:.1f} left {i['left']:.1f} scroll {i['scrollW']}/{i['clientW']}" for i in bad)
    if bad:
        print(f'   bottom problems {tag} {scene}: {why}', flush=True)
    results.append((f'{tag} {scene}: bottom buttons inside the window and not clipped {labels}', not bad))
    return items


RECT_JS = "sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; }"


def inside(r):
    return r is not None and r['l'] >= -0.5 and r['t'] >= -0.5 and r['r'] <= r['w'] + 0.5 and r['b'] <= r['h'] + 0.5


def overlap(a, b):
    return a is not None and b is not None and a['l'] < b['r'] and b['l'] < a['r'] and a['t'] < b['b'] and b['t'] < a['b']


def new_sized_page(browser, base, server, errors, label, w, h):
    """As online_check.new_page, at this size (the viewport is the test's)."""
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    page.on('console', lambda m: errors.append(f'{label} console: {m.text}')
            if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.goto(f'{base}?server={server}{DEBUG}')
    page.wait_for_selector('text=Multiplayer')
    return page


def shot(page, w, h, scene):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'voice-{w}x{h}-{scene}.png'
    page.screenshot(path=str(path))
    return path


def open_voice(page):
    """Opens the Voice sheet from the bar button when there is one, else from the menu."""
    bar_btn = page.locator('button.table-voice')
    if bar_btn.count() == 1:
        bar_btn.click()
    else:
        page.get_by_role('button', name='Menu').click()
        time.sleep(0.2)
        page.get_by_role('button', name='Voice', exact=True).click()


def table_mic(page):
    return page.locator('button.table-mic, button.mic-btn').first


def run_size(browser, base, errors, w, h, results):
    tag = f'{w}x{h}'
    proc, server = oc.start_relay()
    pages = []
    try:
        amy = new_sized_page(browser, base, server, errors, 'Amy', w, h)
        others = [(name, new_sized_page(browser, base, server, errors, name, w, h)) for name in ('Ben', 'Cat', 'Dan')]
        ben = dict(others)['Ben']
        pages = [('Amy', amy)] + others
        oc.host_room(amy, 'Amy', vc.ROOM, vc.CODE)
        joined = True
        for name, p in others:
            oc.watch_list(p, name)
            oc.wait_for(lambda p=p: oc.in_list(p, vc.ROOM), 8)
            oc.join_room(p, vc.ROOM, vc.CODE)
            ok = oc.wait_for(lambda p=p: oc.step_of(p) == 'lobby', 20)
            results.append((f'{tag}: {name} joins the room', ok))
            joined = joined and ok
        if not joined:
            for name, p in pages:
                shot(p, w, h, f'join-stuck-{name}')
            print('   steps: ' + ' '.join(f'{n}={oc.step_of(p)!r}' for n, p in pages), flush=True)
            return
        oc.wait_for(lambda: all(p.locator('button.mic-btn').count() == 1 for _, p in pages), 20)

        # Lobby: the controls are inside the window.
        shot(amy, w, h, 'lobby')
        results.append((f'{tag} lobby: the mic button is inside the window',
                        inside(amy.evaluate(RECT_JS, 'button.mic-btn'))))
        bottom_check(amy, tag, 'lobby', results)

        # Ben turns the mic on; the table starts; Amy deals (the deal has to finish before play).
        vc.mic_button(ben).click()
        oc.wait_for(lambda: vc.mic_button(ben).get_attribute('aria-pressed') == 'true', 15)
        for _, p in pages:
            p.locator('body').click(position={'x': 4, 'y': 4})
        amy.get_by_role('button', name='Start game').click()
        oc.wait_for(lambda: all(p.locator('.screen.game').count() == 1 for _, p in pages), 25)
        time.sleep(2)
        shot(amy, w, h, 'dealing')
        results.append((f'{tag} dealing: no two bar or rail boxes overlap ({amy.evaluate(OVERLAP_JS)["barOverlaps"]})',
                        amy.evaluate(OVERLAP_JS)['barOverlaps'] == 0))
        bottom_check(amy, tag, 'dealing', results)
        # 9aq.16 Fix 4: the game starts in Manual deal mode ("Tap a name to deal"). In Auto (the .seg-btn), the
        # dealer first taps who gets the first card ("First card to <name>", game.ts notStarted), and then the
        # cards are dealt by themselves. So: tap Auto, tap the first visible "First card to" seat, then wait for Amy's hand.
        auto = amy.locator('.seg-btn', has_text='Auto')
        if oc.wait_for(lambda: auto.count() == 1, 15) and auto.get_attribute('aria-pressed') != 'true':
            auto.click()
        first = amy.locator('button[data-seat][aria-label^="First card to"]')
        if oc.wait_for(lambda: any(first.nth(i).is_visible() for i in range(first.count())), 15):
            next(first.nth(i) for i in range(first.count()) if first.nth(i).is_visible()).click()
        dealt = oc.wait_for(lambda: amy.locator('.hand .card').count() > 0, 60)
        results.append((f'{tag}: Amy is dealt in (playing)', dealt))
        time.sleep(2)

        # Table: the bar and the badges, in play.
        info = amy.evaluate(OVERLAP_JS)
        shot(amy, w, h, 'table')
        bottom_check(amy, tag, 'table', results)
        results.append((f'{tag} table: no two bar or rail boxes overlap ({info["barOverlaps"]})', info['barOverlaps'] == 0))
        results.append((f'{tag} table: no voice badge covers a card count ({info["badgeOverlaps"]})', info['badgeOverlaps'] == 0))
        results.append((f'{tag} table: nothing in the bar is outside the window', info['outside'] == 0))

        # The Voice sheet. The entrance listener is added before the sheet opens.
        amy.evaluate("""() => {
          window.__sheetAnim = 0;
          document.addEventListener('animationstart', (e) => {
            if (e.target instanceof Element && e.target.matches('.voice-sheet')) window.__sheetAnim++;
          }, true);
        }""")
        open_voice(amy)
        sheet = amy.locator('.voice-sheet')
        oc.wait_for(lambda: sheet.count() == 1, 8)
        time.sleep(1)  # the redraw that comes with opening the sheet
        amy.evaluate("() => { window.__disc = document.querySelector('.seat-disc[data-voice]'); }")
        time.sleep(4)  # 5 s in all with Ben talking (the fake mic); no redraw is asked for here
        disc_kept = amy.evaluate("() => !!(window.__disc && window.__disc.isConnected)")
        shot(amy, w, h, 'voice-sheet')
        results.append((f'{tag} Voice sheet: the seat discs keep their elements while Ben talks', bool(disc_kept)))
        # Then redraws: Ben turns his mic off and on ten times in 5 s, so Amy's phone redraws each time.
        for _ in range(10):
            table_mic(ben).click()  # 9aq.16 Fix 4: on the table the mic is .table-mic (the lobby one is .mic-btn)
            time.sleep(0.45)
        time.sleep(0.5)
        anim = amy.evaluate('() => window.__sheetAnim')
        results.append((f'{tag} Voice sheet: its entrance runs once through 10 redraws (got {anim})', anim == 1))
        results.append((f'{tag} Voice sheet: the overlay is marked seen after the redraws',
                        amy.locator('.overlay.seen').count() >= 1))
        results.append((f'{tag} Voice sheet: the sheet is inside the window',
                        inside(amy.evaluate(RECT_JS, '.voice-sheet'))))
        amy.get_by_role('button', name='Close Voice').click()
        oc.wait_for(lambda: sheet.count() == 0, 8)

        # The seat card: tap the left, top and right seats (4 players), each on screen, never over Play.
        for edge in ('left', 'top', 'right'):
            seat = amy.locator(f'.seat-quiet.edge-{edge}[data-seat]')
            if seat.count() == 0:
                results.append((f'{tag} seat card at the {edge} edge: a seat is there to tap', False))
                continue
            seat.first.click()
            card = amy.locator('.voice-seat-card')
            opened = oc.wait_for(lambda: card.count() == 1, 6)
            results.append((f'{tag} seat card at the {edge} edge: it opens', opened))
            if opened:
                box = amy.evaluate(RECT_JS, '.voice-seat-card')
                play = amy.evaluate(RECT_JS, '.game-action-slot button.big')
                results.append((f'{tag} seat card at the {edge} edge: it is inside the window', inside(box)))
                results.append((f'{tag} seat card at the {edge} edge: it does not cover Play', not overlap(box, play)))
                shot(amy, w, h, f'seat-card-{edge}')
                amy.mouse.click(4, 4)
                results.append((f'{tag} seat card at the {edge} edge: a tap outside closes it',
                                oc.wait_for(lambda: card.count() == 0, 6)))

        results.append((f'{tag}: no page errors', not errors))
    finally:
        for _, p in pages:
            p.context.close()
        oc.stop_relay(proc)


EIGHT = ('Ben', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal')


def run_eight(browser, base, errors, w, h, results):
    """C2: the 8-person lobby, the Voice sheet with seven others, and the table at 8 players."""
    tag = f'{w}x{h} 8 players'
    proc, server = oc.start_relay()
    pages = []
    try:
        amy = new_sized_page(browser, base, server, errors, 'Amy', w, h)
        others = [(n, new_sized_page(browser, base, server, errors, n, w, h)) for n in EIGHT]
        pages = [('Amy', amy)] + others
        oc.host_room(amy, 'Amy', vc.ROOM, vc.CODE)
        joined = True
        for name, p in others:
            oc.watch_list(p, name)
            oc.wait_for(lambda p=p: oc.in_list(p, vc.ROOM), 8)
            oc.join_room(p, vc.ROOM, vc.CODE)
            ok = oc.wait_for(lambda p=p: oc.step_of(p) == 'lobby', 20)
            results.append((f'{tag}: {name} joins the room', ok))
            joined = joined and ok
            if not ok:
                break
        if not joined:
            shot(amy, w, h, 'join-stuck-8')
            print('   steps: ' + ' '.join(f'{n}={oc.step_of(p)!r}' for n, p in pages), flush=True)
            return
        seats = oc.wait_for(lambda: amy.locator('ol.seats li').count() == 8, 15)
        results.append((f'{tag}: the host lobby lists all 8 people', seats))
        shot(amy, w, h, 'lobby-8')
        bottom_check(amy, tag, 'lobby-8', results)

        # The Voice sheet from the lobby, with seven other people in it.
        amy.get_by_role('button', name='Voice', exact=True).click()
        sheet = amy.locator('.voice-sheet')
        oc.wait_for(lambda: sheet.count() == 1, 8)
        time.sleep(1)
        rows = sheet.locator('.voice-row').count()
        results.append((f'{tag} Voice sheet: a row for each of the seven others ({rows})', rows == 7))
        results.append((f'{tag} Voice sheet with seven others: the sheet is inside the window',
                        inside(amy.evaluate(RECT_JS, '.voice-sheet'))))
        shot(amy, w, h, 'voice-sheet-7')
        amy.get_by_role('button', name='Close Voice').click()
        oc.wait_for(lambda: sheet.count() == 0, 8)

        # The table at 8 players: start, Auto, the first seat, the deal.
        amy.get_by_role('button', name='Start game').click()
        oc.wait_for(lambda: all(p.locator('.screen.game').count() == 1 for _, p in pages), 25)
        time.sleep(2)
        shot(amy, w, h, 'dealing-8')
        bottom_check(amy, tag, 'dealing-8', results)
        results.append((f'{tag} dealing: no two bar or rail boxes overlap ({amy.evaluate(OVERLAP_JS)["barOverlaps"]})',
                        amy.evaluate(OVERLAP_JS)['barOverlaps'] == 0))
        auto = amy.locator('.seg-btn', has_text='Auto')
        if oc.wait_for(lambda: auto.count() == 1, 15) and auto.get_attribute('aria-pressed') != 'true':
            auto.click()
        first = amy.locator('button[data-seat][aria-label^="First card to"]')
        if oc.wait_for(lambda: any(first.nth(i).is_visible() for i in range(first.count())), 15):
            next(first.nth(i) for i in range(first.count()) if first.nth(i).is_visible()).click()
        dealt = oc.wait_for(lambda: amy.locator('.hand .card').count() > 0, 90)
        results.append((f'{tag}: Amy is dealt in (playing)', dealt))
        time.sleep(2)
        info = amy.evaluate(OVERLAP_JS)
        shot(amy, w, h, 'table-8')
        bottom_check(amy, tag, 'table-8', results)
        results.append((f'{tag} table: no voice badge covers a card count ({info["badgeOverlaps"]})', info['badgeOverlaps'] == 0))
        results.append((f'{tag}: no page errors', not errors))
    finally:
        for _, p in pages:
            p.context.close()
        oc.stop_relay(proc)


def main():
    httpd = oc.serve(ROOT / 'dist')
    base = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path='/usr/bin/google-chrome',
            args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                  f'--use-file-for-fake-audio-capture={vc.tone_wav()}', '--autoplay-policy=no-user-gesture-required'],
        )
        for w, h in SIZES:
            errors = []
            print(f'-- {w} x {h}', flush=True)
            mark = len(results)
            try:
                run_size(browser, base, errors, w, h, results)
            except Exception as e:  # one size failing must not hide the others
                import traceback
                traceback.print_exc(limit=-3)
                results.append((f'{w}x{h}: the run stopped early ({type(e).__name__})', False))
            if not __import__('os').environ.get('NO8'):
                try:
                    run_eight(browser, base, [], w, h, results)
                except Exception as e:
                    import traceback
                    traceback.print_exc(limit=-3)
                    results.append((f'{w}x{h} 8 players: the run stopped early ({type(e).__name__})', False))
            for name, ok in results[mark:]:
                print(('PASS ' if ok else 'FAIL ') + name, flush=True)
        browser.close()
    httpd.shutdown()
    fails = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(fails)} of {len(results)} checks passed')
    raise SystemExit(0 if not fails else 1)


if __name__ == '__main__':
    main()
