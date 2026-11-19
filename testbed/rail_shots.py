"""Rail screenshots and overlap check (CODE.md 9aq.15 A1 and A2, 3.0.1).

One solo game on a landscape phone, at 740 x 360 and 844 x 390. At each phase the game reaches
(deal, target, take, playing, results, game over) it saves a screenshot and checks:
- no two rail boxes overlap (the bar's buttons, the quick rules, sound and 😂 buttons);
- the top group ends above the floating buttons (window height minus 150 px);
- nothing is outside the window.
A phase the game never reaches is listed, not failed.

Usage: python3 testbed/rail_shots.py <tag>      (tag names the screenshots, e.g. before or after)
Screenshots: testbed/out/shots/rail-<tag>-<w>x<h>-<phase>.png
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import APP, BOT, FAST, advance, check, log_len, report  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
import re  # noqa: E402


def start_solo(page):
    """As solo_check.start_solo, but the profile is matched by its first word (the button can carry more text)."""
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()
    if page.get_by_label('New profile name').count() and page.get_by_role('button', name=re.compile(r'^Sam\b')).count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name=re.compile(r'^Sam\b')).first.wait_for()
    page.get_by_role('button', name=re.compile(r'^Sam\b')).first.click()
    page.get_by_role('button', name='Fast', exact=True).click()
    page.get_by_role('button', name=re.compile(r'Start game · you and 3 computer players')).click()
    page.wait_for_selector('.round-table')

TAG = next((a for a in sys.argv[1:] if not a.startswith('--')), 'run')
SIZES = [(740, 360), (844, 390)]
OUT = pathlib.Path(__file__).resolve().parent / 'out' / 'shots'
FLOAT_H = 150  # the floating buttons' top, from the bottom (9aq.15 A2)

PHASES_JS = """() => {
  const bar = document.querySelector('.game-bar');
  const has = (s) => !!(bar && bar.querySelector(s));
  const round = document.querySelector('.round-chip');
  const out = [];
  if (has('.chip-info')) out.push('deal');
  if (has('.target-btn') || has('.target-chip')) out.push('target');
  if (has('button[aria-label*="take someone"]')) out.push('take');
  if (document.querySelector('.hand .card')) out.push('playing');
  if (document.querySelector('.results-frame')) out.push('results');
  if (round && round.textContent.includes('Game over')) out.push('gameover');
  return out;
}"""

OVERLAP_JS = """() => {
  const sel = '.game-bar > *, .rules-btn, .sound-btn, .reactions-toggle';
  const boxes = [...document.querySelectorAll(sel)].map((e) => {
    const r = e.getBoundingClientRect();
    const cls = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '';
    const label = (e.getAttribute('aria-label') || cls || e.tagName).toString().slice(0, 36);
    return { name: label, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }).filter((b) => b.w > 0 && b.h > 0);
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) overlaps.push(`${a.name} / ${c.name}`);
  }
  const barBottoms = [...document.querySelectorAll('.game-bar > *')].map((e) => e.getBoundingClientRect().bottom);
  const topBottom = barBottoms.length ? Math.max(...barBottoms) : 0;
  const outside = boxes.filter((b) => b.l < -0.5 || b.t < -0.5 || b.r > innerWidth + 0.5 || b.b > innerHeight + 0.5).map((b) => b.name);
  return { overlaps, topBottom, outside, count: boxes.length, buttons: boxes.map((b) => b.name) };
}"""

RECT_JS = "sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; }"


def inside(r):
    return r is not None and r['l'] >= -0.5 and r['t'] >= -0.5 and r['r'] <= r['w'] + 0.5 and r['b'] <= r['h'] + 0.5


def run(browser, w, h):
    print(f'-- {w} x {h} ({TAG})', flush=True)
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    if FAST:
        page.clock.install()
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    start_solo(page)
    page.evaluate(BOT)
    cfg = {'players': 3, 'rounds': 1, 'manualDeal': True, 'swap': False, 'reshuffle': False,
           'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    OUT.mkdir(parents=True, exist_ok=True)
    seen = set()
    before = log_len(page)
    for _ in range(3000):
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        advance(page, 100)
        for phase in page.evaluate(PHASES_JS):
            if phase in seen:
                continue
            seen.add(phase)
            advance(page, 300)  # let the phase's own motion finish
            info = page.evaluate(OVERLAP_JS)
            shot = OUT / f'rail-{TAG}-{w}x{h}-{phase}.png'
            page.screenshot(path=str(shot))
            check(not info['overlaps'], f'{w}x{h} {phase}: no two rail boxes overlap {info["overlaps"][:3]}')
            check(info['topBottom'] <= h - FLOAT_H + 0.5, f'{w}x{h} {phase}: the top group ends above the floating buttons (bottom {info["topBottom"]:.0f}, limit {h - FLOAT_H})')
            check(not info['outside'], f'{w}x{h} {phase}: nothing is outside the window {info["outside"][:3]}')
            print(f'   {phase}: {info["count"]} rail boxes -> {info["buttons"]}', flush=True)
            # 9aq.15 A2: the menu opens right of the rail, inside the window, and carries the shelf of what did not fit.
            # The results screen has its own overlay over the bar, so the menu is checked in the game phases only.
            if phase != 'results':
                page.get_by_role('button', name='Menu').click()
                advance(page, 300)
                menu = page.evaluate(RECT_JS, '.menu-layer > .menu')
                shelf = page.evaluate("() => [...document.querySelectorAll('.menu-shelf > *')].map(e => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30))")
                page.screenshot(path=str(OUT / f'rail-{TAG}-{w}x{h}-{phase}-menu.png'))
                check(menu is not None and inside(menu) and menu['l'] >= 63.5, f'{w}x{h} {phase}: the menu opens right of the rail, inside the window')
                print(f'   {phase} menu: shelf {shelf}', flush=True)
                page.get_by_role('button', name='Close menu').click()
                advance(page, 300)
        if 'gameover' in seen or log_len(page) > before + 2000:
            break
    missing = [p for p in ('deal', 'target', 'take', 'playing', 'results', 'gameover') if p not in seen]
    print(f'   reached: {sorted(seen)}; not reached in this run: {missing}', flush=True)
    check(not page.errors, f'{w}x{h}: no page errors ({page.errors[:2]})')
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for w, h in SIZES:
            run(browser, w, h)
        browser.close()
    report()


if __name__ == '__main__':
    main()
