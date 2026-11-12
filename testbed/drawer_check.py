"""Reactions drawer and menu check (version 2.10).

- The drawer keeps how far it was scrolled while the game redraws (the computer
  players' moves redraw the screen), so it does not jump back to the 😂.
- The home menu has no "New game · one phone" button (kept in the code, hidden).

Usage: npm run build && python3 testbed/drawer_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import BOT, check, log_len, new_page, report, start_solo  # noqa: E402
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

        page.get_by_role('button', name='Open reactions').click()
        drawer = page.locator('.reactions-drawer')
        drawer.wait_for()
        scrollable = drawer.evaluate('d => d.scrollWidth > d.clientWidth')
        check(scrollable, 'the reactions drawer scrolls sideways (more phrases than fit)')
        drawer.evaluate('d => { d.scrollLeft = 200; }')
        # bot.js taps the person's own seat (as solo_check does); the computer players play on their own.
        page.evaluate(BOT)
        cfg = {'players': 4, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
               'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
        before = log_len(page)
        for _ in range(40):
            page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            page.wait_for_timeout(100)
            if log_len(page) > before + 15:
                break
        check(log_len(page) > before, 'the game moved on while the drawer was open')
        check(page.locator('.reactions-drawer').count() == 1, 'the drawer is still open after the moves')
        left = page.locator('.reactions-drawer').evaluate('d => d.scrollLeft')
        check(left >= 150, f'the drawer stays scrolled after a redraw (scrollLeft {left:.0f}, was 200)')
        ctx.close()
        browser.close()
    report()


if __name__ == '__main__':
    main()
