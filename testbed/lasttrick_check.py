"""Last trick and Ultimate Badboy checks (CODE.md 9ah.1 and 9ah.3, 2.34.6).

Single player at Fast speed in the built app (dist/index.html); testbed/bot.js taps the person's seat.

Last trick (9ah.1), with 3 computer players and with 1 (a 2-player game: final two from the first trick):
  - at the round end the last trick's cards are on the felt with "Tap to see the results";
  - 10 s later (fake clock) it is still there;
  - after a tap the round-over pop-up shows, then the results screen.
Ultimate Badboy (9ah.3):
  - a saved game where the person holds all four aces at the reshuffle window is loaded ("Carry on"):
    the pop-up shows once, and not again on the next draws; a game where a computer player holds
    them shows nothing.
Screenshots go to /tmp/lasttrick/.

Usage: node build.mjs && python3 testbed/lasttrick_check.py
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
OUT = pathlib.Path('/tmp/lasttrick')
OUT.mkdir(exist_ok=True)
for old in OUT.glob('*.png'):
    old.unlink()

checks = []


def check(ok, what):
    checks.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what, flush=True)


def new_page(browser, w=390, h=844):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.clock.install()
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    return ctx, page


def start_solo(page, bots):
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()
    if page.get_by_role('button', name='Sam', exact=True).count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Sam', exact=True).click()
    page.get_by_role('button', name='Fast', exact=True).click()
    for _ in range(3 - bots):
        page.get_by_label('One fewer computer player').click()
    page.get_by_role('button', name=re.compile(r'Start game · you and')).click()
    page.wait_for_selector('.round-table')


def last_trick_game(browser, bots, attempt=1):
    """A round can end with no trick on the felt (a forfeit after the pick-up choice); then play another game."""
    tag = f'{bots + 1}p'
    ctx, page = new_page(browser)
    start_solo(page, bots)
    page.evaluate(BOT)
    page.evaluate("() => { window.__holdFinal = true; }")
    cfg = {'players': bots + 1, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False, 'ultimate': False,
           'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    t0 = time.time()
    seen = False
    while time.time() - t0 < 240:
        if page.locator('.final-trick').count() and not page.locator('.popup-overlay').count():
            seen = True
            cards = page.locator('.round-table .trick-play').count()
            hint = page.get_by_text('Tap to see the results').count()
            page.screenshot(path=str(OUT / f'{tag}-last-trick.png'))
            check(cards > 0 and hint == 1, f'{tag}: the last trick ({cards} cards) is on the felt with "Tap to see the results"')
            page.clock.run_for(10000)
            still = page.locator('.final-trick').count() == 1 and page.locator('.round-table .trick-play').count() == cards
            check(still, f'{tag}: 10 s later it is still there')
            check(not page.locator('.results, .popup-overlay').count() or not page.get_by_text('Round over').count(),
                  f'{tag}: no round-over pop-up before the tap')
            page.locator('.final-trick').click()
            saw_pop = False
            for _ in range(40):
                page.clock.run_for(200)
                if page.locator('.popup-overlay').count() and page.get_by_text(re.compile('Round over|wins the round')).count():
                    saw_pop = True
                    page.screenshot(path=str(OUT / f'{tag}-round-over.png'))
                    break
            check(saw_pop, f'{tag}: after the tap the cards move, then the round-over pop-up')
            for _ in range(60):
                page.clock.run_for(500)
                if page.get_by_role('button', name=re.compile("I'm ready|Next round|End the game")).count():
                    break
            ok = page.get_by_role('button', name=re.compile("I'm ready|Next round|End the game")).count() > 0
            page.screenshot(path=str(OUT / f'{tag}-results.png'))
            check(ok, f'{tag}: then the results screen')
            break
        action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        page.clock.run_for(600)
        if action == 'GAME OVER':
            break
        page.wait_for_timeout(5)
    if not seen and attempt < 4:
        g = json.loads(page.evaluate("localStorage.getItem('pubby.currentGame')") or '{}')
        log = [e['event']['type'] for e in g.get('session', {}).get('log', [])]
        print(f'  {tag}: round ended with no trick on the felt ({"forfeited" in log and "forfeit" or action}); playing another game')
        ctx.close()
        return last_trick_game(browser, bots, attempt + 1)
    check(seen, f'{tag}: reached the round end')
    check(not page.errors, f'{tag}: no page errors {page.errors[:2]}')
    ctx.close()


def four_aces_game(browser, mine=True):
    """Start a game, stop at the reshuffle window, give four aces to the person (or a computer player), reload."""
    tag = 'badboy-me' if mine else 'badboy-computer'
    ctx, page = new_page(browser)
    start_solo(page, 3)
    page.evaluate(BOT)
    cfg = {'players': 4, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False, 'ultimate': False,
           'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
    for _ in range(400):
        g = json.loads(page.evaluate("localStorage.getItem('pubby.currentGame')") or '{}')
        if g.get('session', {}).get('phase') == 'reshuffle':
            break
        page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        page.clock.run_for(300)
    g = json.loads(page.evaluate("localStorage.getItem('pubby.currentGame')"))
    s = g['session']
    me = g['bots']['me']
    who = me if mine else next(p for p in s['order'] if p != me)
    # Swap the aces into `who`'s hand, giving `who`'s cards back to the players who held the aces.
    hands = s['hands']
    for suit in ('spades', 'hearts', 'diamonds', 'clubs'):
        ace = f'{suit}-14'
        holder = next((p for p, h in hands.items() if any(c['id'] == ace for c in h)), None)
        if holder is None or holder == who:
            continue  # in a hidden deck (not with 4 players) or already there
        give = next(c for c in hands[who] if not (c.get('rank') == 14))
        hands[holder] = [c for c in hands[holder] if c['id'] != ace] + [give]
        hands[who] = [c for c in hands[who] if c['id'] != give['id']] + [{'kind': 'standard', 'id': ace, 'suit': suit, 'rank': 14}]
    page.evaluate("v => localStorage.setItem('pubby.currentGame', v)", json.dumps(g))
    page.reload()
    page.wait_for_selector('h1:has-text("Pubby")')
    page.get_by_role('button', name=re.compile('Carry on')).click()
    shows = 0
    for _ in range(12):
        page.clock.run_for(100)
        if page.locator('.popup.badboy').count():
            shows += 1
            page.screenshot(path=str(OUT / f'{tag}.png'))
            break
    if mine:
        check(shows == 1, 'four aces: "Ultimate Badboy!!" shows on the person\'s screen')
        page.locator('.popup-overlay').click()  # 9ap.G (2.38.2): a tap does not close it
        page.clock.run_for(300)
        check(page.locator('.popup.badboy').count() == 1, 'a tap does not close it (9ap.G)')
        page.clock.run_for(5000)
        check(page.locator('.popup.badboy').count() == 0, 'it closes by itself after 5 s')
        again = 0
        for _ in range(10):
            page.clock.run_for(300)
            again += page.locator('.popup.badboy').count()
        check(again == 0, 'it does not show again on the next draws')
    else:
        page.screenshot(path=str(OUT / f'{tag}.png'))
        check(shows == 0, 'four aces with a computer player: nothing shows')
    check(not page.errors, f'{tag}: no page errors {page.errors[:2]}')
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        if '--two' not in sys.argv:
            last_trick_game(browser, 3)
        last_trick_game(browser, 1)
        four_aces_game(browser, True)
        four_aces_game(browser, False)
        browser.close()
    bad = [w for ok, w in checks if not ok]
    print(f'\n{len(checks) - len(bad)} of {len(checks)} checks pass. Screenshots in {OUT}/')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
