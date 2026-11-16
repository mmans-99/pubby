"""Tablet layout check (CODE.md 9ag.3, 2.34.5): the game screen on iPads (landscape first) and phones.

Single player against 3 computer players at Fast speed in the built app (dist/index.html);
testbed/bot.js taps the person's seat. For each window size it looks at:
  (a) the deal screen (Manual / Auto / Deal),
  (b) the person's turn, with the most cards in hand seen in a short game (13 at the start),
  (c) the final-two choice, if it is reached.
and checks with bounding boxes:
  - every hand card is inside the window and inside the hand slot (the top may stick up by the lift);
  - no hand card overlaps the action column's buttons or the 😂 button;
  - the deal buttons and the Play button are inside the window and not covered;
  - on a tablet, every side fan of card backs is inside the table slot (phones: half off the edge, as before);
  - no page errors.
Screenshots go to /tmp/tablet/.

Usage: node build.mjs && python3 testbed/tablet_check.py [--quick]
"""
import json
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'dist' / 'index.html').as_uri()
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
OUT = pathlib.Path('/tmp/tablet')
OUT.mkdir(exist_ok=True)
for old in OUT.glob('*.png'):
    old.unlink()

SIZES = [
    (1180, 820), (1024, 768), (1366, 1024), (1194, 834),  # iPad landscape
    (820, 1180), (1024, 1366),                              # iPad portrait
    (390, 844), (844, 390),                                 # phones
]
if '--quick' in sys.argv:
    SIZES = [(1180, 820), (390, 844)]
LIFT = 14  # the raised card's lift (styles.css .card.selected: 10 px) plus a little rounding

checks = []


def check(ok, what):
    checks.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what, flush=True)


GEOM = r"""
({ lift, tablet }) => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const vis = (el) => el && el.getClientRects().length > 0;
  const W = innerWidth, H = innerHeight, eps = 1.5;
  const inside = (a, b, top = 0) => a.l >= b.l - eps && a.r <= b.r + eps && a.t >= b.t - top - eps && a.b <= b.b + eps;
  const hit = (a, b) => a.l < b.r - eps && a.r > b.l + eps && a.t < b.b - eps && a.b > b.t + eps;
  const out = { problems: [], cards: 0 };
  const win = { l: 0, t: 0, r: W, b: H };
  const slot = document.querySelector('.game-hand-slot');
  const cards = [...document.querySelectorAll('.game-hand-slot .hand .card')];
  out.cards = cards.length;
  const toggle = document.querySelector('.reactions-toggle');
  const actionBtns = [...document.querySelectorAll('.game-action-slot button')].filter(vis);
  for (const c of cards) {
    // Rotated cards: the bounding box is a little bigger than the card; allow a few px.
    const b = r(c), pad = 4;
    const shrunk = { l: b.l + pad, t: b.t + pad, r: b.r - pad, b: b.b - pad };
    if (!inside(shrunk, win)) { out.problems.push(`card outside the window ${JSON.stringify(b)}`); break; }
    // Sideways a tilted end card may reach into the screen's 8 px padding (fitFan's SIDE).
    const sl = slot && r(slot);
    if (sl && !inside(shrunk, { l: sl.l - 8, t: sl.t, r: sl.r + 8, b: sl.b }, lift)) { out.problems.push(`card outside the hand slot ${JSON.stringify(b)} slot ${JSON.stringify(r(slot))}`); break; }
    for (const a of actionBtns) if (hit(shrunk, r(a))) { out.problems.push(`card over the button "${a.textContent.trim()}"`); break; }
    if (toggle && hit(shrunk, r(toggle))) { out.problems.push('card under the 😂 button'); break; }
  }
  const want = [...document.querySelectorAll('.game-action-slot button, .deal-bar button')].filter(vis);
  for (const b of want) {
    const bb = r(b);
    if (!inside(bb, win)) { out.problems.push(`button cut off: "${b.textContent.trim()}" ${JSON.stringify(bb)}`); continue; }
    const at = document.elementFromPoint((bb.l + bb.r) / 2, (bb.t + bb.b) / 2);
    if (!(at === b || b.contains(at))) out.problems.push(`button covered: "${b.textContent.trim()}" by ${at && at.className}`);
    if (bb.h > 90) out.problems.push(`button stretched: "${b.textContent.trim()}" ${Math.round(bb.h)} px tall`);
  }
  const tslot = document.querySelector('.game-table-slot');
  // Phones keep the old look (fans half off the felt's edge, by design); tablets keep them inside.
  if (tablet) for (const f of document.querySelectorAll('.edge-fan .edge-back')) {
    if (tslot && !inside(r(f), r(tslot))) { out.problems.push(`side fan cut by the table edge ${JSON.stringify(r(f))}`); break; }
  }
  if (toggle && vis(toggle) && !inside(r(toggle), win)) out.problems.push('😂 button off screen');
  return out;
}
"""


def stored(page, key):
    raw = page.evaluate('k => localStorage.getItem(k)', key)
    return json.loads(raw) if raw else None


def start_solo(page):
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()
    if page.get_by_role('button', name='Sam', exact=True).count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Sam', exact=True).click()
    page.get_by_role('button', name='Fast', exact=True).click()
    page.get_by_role('button', name=re.compile(r'Start game · you and 3 computer players')).click()
    page.wait_for_selector('.round-table')


def look(page, tag, what):
    page.wait_for_timeout(60)
    g = page.evaluate(GEOM, {'lift': LIFT, 'tablet': min(page.viewport_size['width'], page.viewport_size['height']) >= 700})
    page.screenshot(path=str(OUT / f'{tag}-{what}.png'))
    check(not g['problems'], f'{tag} {what} ({g["cards"]} cards): ' + ('ok' if not g['problems'] else '; '.join(g['problems'][:3])))
    return g


def run_size(browser, w, h):
    tag = f'{w}x{h}'
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 700 or h < 500, has_touch=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install()
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    start_solo(page)
    page.clock.run_for(500)
    # (a) The deal screen, if the person deals (wait for Manual / Auto).
    for _ in range(40):
        if page.locator('.deal-bar button').count():
            break
        page.clock.run_for(500)
    if page.locator('.deal-bar button').count():
        look(page, tag, 'deal')
        auto = page.locator('.deal-bar button', has_text='Auto')
        if auto.count():
            auto.first.click()
            page.clock.run_for(16)
            page.evaluate("() => { const b = document.querySelector('.round-table button[data-seat]'); if (b) b.click(); }")
            for _ in range(10):
                if page.locator('.deal-bar button', has_text='Deal all').count():
                    break
                page.clock.run_for(16)
            if page.locator('.deal-bar button', has_text='Deal all').count():
                look(page, tag, 'deal-auto')
    page.evaluate(BOT)
    cfg = {'players': 4, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False, 'ultimate': False,
           'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    most, seen_turn, seen_choice = 0, False, False
    t0 = time.time()
    while time.time() - t0 < 120:
        play_btn = page.locator('.game-action-slot button', has_text=re.compile('^(Pick a card|Play )'))
        if play_btn.count() and not page.locator('.popup-overlay, .anim-block').count():
            n = page.locator('.game-hand-slot .hand .card').count()
            if n > most or not seen_turn:
                most = max(most, n)
                seen_turn = True
                # Select a card so the lift is checked too.
                page.evaluate("() => { const c = document.querySelector('.game-hand-slot .hand .card.playable'); if (c) c.click(); }")
                look(page, tag, f'turn-{n}')
        if not seen_choice and page.locator('text=Pick up the waste pile').count():
            seen_choice = True
            look(page, tag, 'final-two-choice')
        action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        page.clock.run_for(800)
        if action == 'GAME OVER':
            break
        page.wait_for_timeout(5)
    check(seen_turn and most >= 13, f'{tag}: saw the person\'s turn with {most} cards (13 or more)')
    check(not errors, f'{tag}: no page errors {errors[:2]}')
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for w, h in SIZES:
            run_size(browser, w, h)
        browser.close()
    bad = [w for ok, w in checks if not ok]
    print(f'\n{len(checks) - len(bad)} of {len(checks)} checks pass. Screenshots in {OUT}/')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
