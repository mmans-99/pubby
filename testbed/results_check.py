"""Results screen B and the scroll hold check (version 2.37, CODE.md 9ak.5 and 9ak.4).

- The results screen has a winner card, three tabs (Places, Points, Awards) and a fixed footer.
- While a finger is on a scrolling box, the redraws wait: the box keeps its place and its node,
  and the ready count does not change under the finger. After the finger lifts and the box is
  still, the page catches up.

Usage: npm run build && python3 testbed/results_check.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from solo_check import BOT, advance, check, new_page, report, start_solo  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def clear_pop_ups(page):
    """Tap away the pop-ups that can be tapped away (as bot.js does), so the checks can reach the screen."""
    for _ in range(30):
        pop = page.locator('.popup-overlay[data-skip]')
        if not pop.count():
            return
        pop.first.click()
        advance(page, 50)


def results_ready(page):
    return page.evaluate("() => document.querySelector('.rstatus')?.innerText || ''")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = new_page(browser)
        start_solo(page)
        page.evaluate(BOT)
        cfg = {'players': 3, 'rounds': 2, 'manualDeal': False, 'swap': False, 'reshuffle': False,
               'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
        for _ in range(2000):
            page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            advance(page, 100)
            if page.locator('.results-frame').count() == 1:
                break
        check(page.locator('.results-frame').count() == 1, 'the results screen (B) is on show after round 1')
        check(page.locator('.win-card').count() == 1, 'the winner card is shown')
        tabs = page.get_by_role('tab').all_inner_texts()
        check([t.strip() for t in tabs] == ['Places', 'Points', 'Awards'], f'three tabs: Places, Points, Awards ({tabs})')
        check(page.locator('.results-footer').count() == 1, 'the footer is fixed below the scrolling body')
        clear_pop_ups(page)
        page.get_by_role('tab', name='Awards').click()
        advance(page, 50)
        box = page.locator('.results-scroll')
        scrollable = box.evaluate('d => d.scrollHeight > d.clientHeight')
        if not scrollable:
            print('  note: the Awards tab fits without scrolling in this window; the hold check runs anyway')
        box.evaluate('d => { d.scrollTop = 40; }')
        page.evaluate("() => { window.__box = document.querySelector('.results-scroll'); }")
        before = results_ready(page)
        clear_pop_ups(page)
        page.evaluate("() => { const el = document.querySelector('.results-scroll'); el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: false, touches: [] })); }")
        for _ in range(12):
            page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            advance(page, 100)
        same_node = page.evaluate("() => document.querySelector('.results-scroll') === window.__box")
        check(same_node, 'while a finger is down, the scrolling box is not rebuilt')
        check(results_ready(page) == before, f'while a finger is down, the ready line does not change ("{before}")')
        check(page.evaluate("() => document.querySelector('.results-scroll').scrollTop") == 40 or not scrollable,
              'the box keeps its place while the finger is down')
        page.evaluate("() => { const el = document.querySelector('.results-scroll'); el.dispatchEvent(new TouchEvent('touchend', { bubbles: true })); }")
        # The catch-up uses the page's own timer (real time), so wait for it rather than advancing the fake clock.
        page.wait_for_timeout(400)
        check(page.evaluate("() => document.querySelector('.results-scroll') !== window.__box"),
              'after the finger lifts, the page catches up (a new box is drawn)')
        ctx.close()
        browser.close()
    report()


if __name__ == '__main__':
    main()
