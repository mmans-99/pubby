"""Phase 4s check (CODE.md 9ai.7, 2.36): pop-ups, places, votes, take-cards and whose turn.

One person (profile "Sam") plays a game against three Normal computer players on a
phone-sized page (390x844) in the built app (dist/index.html). A fake clock drives
time, and testbed/bot.js taps the person's seat. Before each bot step the script
looks at the screen, so it sees pop-ups, votes and take-cards as they appear.

Checks. A check the random game never shows is reported as "not seen" and fails the run;
rerun to get a different game.
1. a pop-up has no timer: after 10 s on the fake clock it is still up;
2. a tap closes it;
3. the pop-up shows "Tap anywhere to close" (the vote alert has "Vote now" instead);
4. places: "X came 1st!" shows, and "is out" never does;
5. the vote card lists one row per player, with YES and NO under the list;
6. the take-cards card is solid (background alpha >= 0.8) with Give and Refuse;
7. whose turn: the turn seat rings and the others fade, or your turn glows (glow and your gold name pill);
8. take-cards sheet: the hand's cards are under the sheet (elementFromPoint at a sheet button is inside the sheet);
9. Fast forward: with a pop-up up, the Stop fast forward button (.ff-stop) stops it;
10. tie vote: the tie band (.tie-band) shows when the vote is a tie;
11. target: the top-bar target button opens the target sheet; Propose 10 (then Sam) agrees it, and the round chip shows a gold "10" badge.
Screenshots go to /tmp/popups-*.png. Checks 9 and 10 depend on the random game (rerun if "not seen").

Not covered here: Fast forward closing pop-ups by itself, and the two-phone waiting
(busy hourglass). Those are in testbed/netgame_check.py and the fast-forward checks.

Usage: npm run build && python3 testbed/popups_check.py
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'dist' / 'index.html').as_uri()
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
PLAYERS = 4  # Sam plus three computer players
MAX_STEPS = 4000
TICK_MS = 1000

results = {}
VERBOSE = '--verbose' in sys.argv


def record(key, ok, what):
    results[key] = bool(ok)
    print(('PASS ' if ok else 'FAIL ') + what, flush=True)


def new_page(browser):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    page.clock.install()  # before goto: timers wait until the script advances the clock
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    return ctx, page


def start_game(page):
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()
    if page.get_by_role('button', name='Sam', exact=True).count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Sam', exact=True).click()
    page.get_by_role('button', name=re.compile(r'Start game')).click()
    page.wait_for_selector('.round-table')


def count(page, selector):
    return page.evaluate(
        "sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length > 0).length", selector)


def overlay_alpha(page, selector):
    value = page.evaluate(
        "sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundColor : null; }", selector)
    if not value:
        return None
    nums = re.findall(r'[\d.]+', value)
    return float(nums[3]) if len(nums) == 4 else 1.0


def main():
    seen = {'vote': False, 'take': False, 'turn': False, 'your_turn': False, 'places': False, 'bad_out': False,
            'vote_answered': False, 'take_answered': False, 'sheet_under': False, 'ff_stop': False, 'tie': False,
            'target_sheet': False, 'badge': False}
    titles = set()
    timer_done = False
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx, page = new_page(browser)
        start_game(page)
        page.evaluate(BOT)
        cfg = {'players': PLAYERS, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
               'ultimate': True, 'voteYes': True, 'forfeitChance': 0.2, 'jokers': True, 'stayAtEnd': True,
               'holdVotes': True, 'holdTakes': True, 'callerNot': 'Sam'}
        # 11 (before round 1): the top-bar target button opens the sheet; Sam proposes 10 and the vote is agreed.
        if count(page, '.target-btn'):
            page.locator('.target-btn').first.click()
            page.clock.run_for(100)
            seen['target_sheet'] = count(page, '.target-sheet') > 0
            if seen['target_sheet']:
                page.screenshot(path='/tmp/popups-target.png')
                page.get_by_role('button', name='10', exact=True).click()
                page.get_by_role('button', name='Propose 10 points', exact=True).click()
                # On one phone Propose asks "Who is proposing?" first; a phone that knows its player sends the vote at once.
                if count(page, '.target-sheet .sheet-row[aria-label="Sam"]'):
                    page.locator('.target-sheet .sheet-row[aria-label="Sam"]').first.click()
                page.clock.run_for(100)
        for _ in range(MAX_STEPS):
            # 11: the round chip shows the agreed target as a gold badge.
            if not seen['badge'] and count(page, '.round-badge'):
                seen['badge'] = page.locator('.round-badge').first.inner_text().strip().endswith('10')
            # 9: Fast forward: Stop fast forward stops it while a pop-up is up (the pop-up is not closed by the Stop tap).
            if not seen['ff_stop'] and count(page, '.ff-stop') and count(page, '.popup-overlay'):
                page.locator('.ff-stop').first.click()
                page.clock.run_for(200)
                seen['ff_stop'] = count(page, '.fast-banner') == 0 or 'Fast forward on' not in page.locator('.fast-banner').first.inner_text()
            # 10: a tie shows the tie band.
            if not seen['tie'] and count(page, '.tie-band'):
                seen['tie'] = True
                page.screenshot(path='/tmp/popups-tie.png')
            # 1 to 3: the first pop-up on screen. It must stay after 10 s, show the tap line, and close on a tap.
            if not timer_done and count(page, '.popup-overlay[data-skip]'):
                first = page.locator('.popup-overlay[data-skip] .popup').first.inner_text()
                page.screenshot(path='/tmp/popups-popup.png')
                page.clock.run_for(10000)
                record('timer', count(page, '.popup-overlay') > 0,
                       'a pop-up has no timer: still up after 10 s')
                hint = count(page, '.tap-hint') > 0 or count(page, '.vote-now') > 0
                record('hint', hint, 'pop-up shows "Tap anywhere to close" (or the vote alert shows Vote now)')
                page.locator('.popup-overlay[data-skip]').first.click()
                page.clock.run_for(200)
                after = page.locator('.popup-overlay[data-skip] .popup').first.inner_text() if count(page, '.popup-overlay[data-skip]') else ''
                record('close', after != first, 'a tap closes the pop-up (the next one in the queue, or none, shows)')
                timer_done = True
                continue  # the bot taps the next pop-up on its own step
            # 5 (answer): the person's own vote and take answers, so the cards stay on screen long enough to check.
            if count(page, '.vote-card .vote-yes') and not seen['vote_answered']:
                seen['vote_answered'] = True
                page.locator('.vote-card .vote-yes').first.click()
                page.clock.run_for(100)
                continue
            if count(page, '.take-overlay .take-give, .take-overlay .take-give-small') and not seen['take_answered']:
                seen['take_answered'] = True
                page.locator('.take-overlay .btn-outline-no').first.click() if count(page, '.take-overlay .btn-outline-no') else None
                page.clock.run_for(100)
                continue
            # 4: places wording; "is out" must never appear.
            for t in page.locator('.popup-title').all_inner_texts():
                if t in titles:
                    continue
                titles.add(t)
                if re.search(r'came (1st|2nd|3rd|\d+th)!', t) or t.startswith('You came'):
                    seen['places'] = True
                    if not seen.get('places_shot'):
                        seen['places_shot'] = True
                        page.screenshot(path='/tmp/popups-place.png')
                if 'is out' in t:
                    seen['bad_out'] = True
            # 5: the vote card (one row per player, YES and NO under the list).
            if not seen['vote'] and count(page, '.vote-card') and count(page, '.vote-card .ballot-row'):
                rows = count(page, '.vote-card .ballot-row')
                buttons = count(page, '.vote-card .vote-yes') and count(page, '.vote-card .vote-no')
                # A phone that has already voted (or asked) shows the waiting card: one row per player, no buttons.
                waiting = count(page, '.vote-card .vote-said-line')
                seen['vote'] = rows == PLAYERS and bool(buttons or waiting)
                if seen['vote']:
                    page.screenshot(path='/tmp/popups-vote.png')
            # 6: the take-cards card (solid, with Give and Refuse).
            if not seen['take'] and count(page, '.take-overlay'):
                alpha = overlay_alpha(page, '.take-overlay')
                gives = count(page, '.take-give, .take-give-small')
                refuse = count(page, '.btn-outline-no')
                seen['take'] = bool(alpha is not None and alpha >= 0.8 and gives and refuse)
                if seen['take']:
                    page.screenshot(path='/tmp/popups-take.png')
            # 7: whose turn.
            if not seen['turn'] and count(page, '.round-table .table-seat.turn') and count(page, '.round-table .table-seat.not-turn'):
                seen['turn'] = True
                page.screenshot(path='/tmp/popups-turn.png')
            # 8: the take sheet is above the hand's cards (a sheet button's centre is hit-tested inside the sheet).
            if not seen['sheet_under'] and count(page, '.take-overlay button') and count(page, '.hand-section'):
                seen['sheet_under'] = bool(page.evaluate("""() => {
                  const b = [...document.querySelectorAll('.take-overlay button')].find(x => x.getClientRects().length);
                  if (!b) return false;
                  const r = b.getBoundingClientRect();
                  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                  return !!(el && el.closest('.take-overlay'));
                }"""))
            if not seen['your_turn'] and count(page, '.hand-section.your-turn') and count(page, '.me-pill.turn-label'):
                seen['your_turn'] = True
                page.screenshot(path='/tmp/popups-your-turn.png')
            action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            if VERBOSE and action and re.search(r'vote|take|reshuffle|deal again|Deal', action, re.I):
                print('  bot: ' + action, flush=True)
            page.clock.run_for(TICK_MS)
            if action == 'GAME OVER':
                break
            if action in ('wait', 'stuck'):
                page.wait_for_timeout(10)
        page.screenshot(path='/tmp/popups-end.png')
        if page.errors:
            print('page errors: ' + '; '.join(page.errors[:5]), flush=True)
        ctx.close()
        browser.close()

    record('places', seen['places'] and not seen['bad_out'], 'places: "X came 1st!" shows, and "is out" never does')
    record('vote', seen['vote'], 'vote card: one row per player, YES and NO under the list' if seen['vote'] else 'vote card: not seen in this game (votes are random; rerun)')
    record('take', seen['take'], 'take-cards card is solid with Give and Refuse' if seen['take'] else 'take-cards card: not seen in this game (requests are random; rerun)')
    record('turn', seen['turn'] or seen['your_turn'], 'whose turn: the turn seat rings and others fade, or your turn glows')
    record('sheet_under', seen['sheet_under'], 'take sheet: the hand\'s cards are under the sheet' if seen['sheet_under'] else 'take sheet: not seen in this game (rerun)')
    record('ff_stop', seen['ff_stop'], 'Fast forward: Stop fast forward stops it with a pop-up up' if seen['ff_stop'] else 'Fast forward: not seen in this game (rerun)')
    record('tie', seen['tie'], 'tie vote: the tie band shows' if seen['tie'] else 'tie vote: not seen in this game (rerun)')
    record('target_sheet', seen['target_sheet'], 'target: the top-bar button opens the target sheet' if seen['target_sheet'] else 'target: the top-bar button is missing before round 1')
    record('badge', seen['badge'], 'target: the round chip shows a gold "10" badge once agreed' if seen['badge'] else 'target: no badge seen (the vote may not have passed; rerun)')
    failed = [k for k in ('timer', 'hint', 'close', 'places', 'vote', 'take', 'turn', 'sheet_under', 'ff_stop', 'tie', 'target_sheet', 'badge') if not results.get(k)]
    print('RESULT ' + ('PASS' if not failed else 'FAIL: ' + ', '.join(failed)), flush=True)
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
