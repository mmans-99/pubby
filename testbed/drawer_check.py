"""Reactions drawer and menu check (version 2.10).

- The reactions sheet lists every phrase in a grid and keeps how far it was scrolled
  while the game redraws (the computer players' moves redraw the screen).
- The home menu has no "New game · one phone" button (kept in the code, hidden).

Usage: npm run build && python3 testbed/drawer_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import BOT, advance, check, log_len, new_page, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = new_page(browser)
        check(page.get_by_role('button', name='New game · one phone').count() == 0,
              'the home menu has no "New game · one phone" button')
        check(page.get_by_role('button', name='Play against the computer').count() == 1,
              'the home menu still has "Play against the computer"')
        start_solo(page)

        phrases = sum(1 for line in (pathlib.Path(__file__).resolve().parent.parent / 'src' / 'content' / 'catch-phrases.md').read_text().splitlines() if line.startswith('- '))
        page.get_by_role('button', name='Open reactions').click()
        sheet = page.locator('.reactions-sheet')
        sheet.wait_for()
        check(page.locator('.phrase-chip').count() == phrases + 1, f'the sheet lists every phrase and the laugh ({phrases} + 1)')
        check(sheet.evaluate('d => d.scrollHeight > d.clientHeight'), 'the sheet scrolls up and down (more phrases than fit)')
        check(sheet.evaluate('d => d.scrollWidth <= d.clientWidth'), 'the sheet does not scroll sideways')
        # CODE.md 9u Part B4 (2.24): the sheet is see-through, so the game shows behind it.
        import re
        rgba = sheet.evaluate("d => getComputedStyle(d).backgroundColor")
        alpha = float(re.findall(r'[\d.]+', rgba)[-1]) if rgba.startswith('rgba') else 1.0
        check(alpha <= 0.35, f'the reactions sheet is see-through (background alpha {alpha})')
        sheet.evaluate('d => { d.scrollTop = 150; }')
        # bot.js taps the person's own seat (as solo_check does); the computer players play on their own.
        page.evaluate(BOT)
        cfg = {'players': 4, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
               'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
        before = log_len(page)
        for _ in range(40):
            page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            advance(page, 100)  # the fake clock (solo_check.py, 9o.1) only moves when advanced
            if log_len(page) > before + 15:
                break
        check(log_len(page) > before, 'the game moved on while the sheet was open')
        check(page.locator('.reactions-sheet').count() == 1, 'the sheet is still open after the moves')
        top = page.locator('.reactions-sheet').evaluate('d => d.scrollTop')
        check(top >= 100, f'the sheet stays scrolled after a redraw (scrollTop {top:.0f}, was 150)')
        ctx.close()
        browser.close()
    report()


if __name__ == '__main__':
    main()
