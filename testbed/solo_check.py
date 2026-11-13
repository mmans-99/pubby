"""Slice B check (CODE.md 9m.9): play against the computer on a phone-sized page. Slice C adds the setup checks.

A person (profile "Sam", the host) plays against 3 Normal computer players, at
Fast speed, in the built app (dist/index.html). testbed/bot.js taps the
person's seat on the real screens; the computer players move by themselves.

Checks:
- the setup screen starts a game with the computer players in the other seats;
- the computer players move on their own (the log grows with nobody tapping);
- "thinking…" shows on a seat while a computer player chooses its move;
- no computer move is refused and no page errors happen;
- the game ends, is saved as "vs computer", and only the vs-computer stats
  change (the normal profile history is untouched);
- pausing stops the computer players, and Resume starts them again;
- closing the page mid-game and Carry on continues with the computer players
  (their memory is rebuilt from the public log).

Usage: npm run build && python3 testbed/solo_check.py
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

checks = []

# Fast mode (CODE.md 9o.1): the page runs on a fake clock, so timers fire only when the
# script advances it. Pass --real-time to watch the game at its normal speed instead.
FAST = '--real-time' not in sys.argv
TICK_MS = 1000
STALL_S = 30  # real seconds without a new log event before a game counts as stuck (9o.2)


def dump_stuck(page, label):
    """Prints what the screen and the saved game say, and saves a screenshot, when a game stops moving."""
    headings = page.locator('h1, h2, h3').all_inner_texts()
    popup = page.locator('.popup-title').all_inner_texts()
    g = stored(page, 'pubby.currentGame') or {}
    sess = g.get('session') or {}
    play = sess.get('play') or {}
    info = {'phase': sess.get('phase'), 'turn': play.get('turn'),
            'pendingFinalTwo': play.get('pendingFinalTwo'), 'vote': sess.get('vote'),
            'takeRequests': sess.get('takeRequests'), 'paused': sess.get('paused')}
    shot = f'/tmp/stuck-{label}.png'
    page.screenshot(path=shot)
    print(f'STUCK at {len(sess.get("log", []))} log events: headings={headings[:4]} popup={popup[:2]} state={info} screenshot={shot}', flush=True)

def check(ok, what):
    checks.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what, flush=True)


def stored(page, key):
    raw = page.evaluate('k => localStorage.getItem(k)', key)
    return json.loads(raw) if raw else None


def log_len(page):
    g = stored(page, 'pubby.currentGame')
    return len(g['session']['log']) if g else -1


def advance(page, ms=TICK_MS):
    """Let the game move on by `ms` (fake clock in fast mode; real sleep otherwise)."""
    if FAST:
        page.clock.run_for(ms)
    else:
        page.wait_for_timeout(ms)  # real time, as before


def new_page(browser):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    if FAST:
        page.clock.install()  # before goto: timers wait until advance() runs them
    page.goto(APP)
    page.wait_for_selector('h1:has-text("Pubby")')
    return ctx, page


def start_solo(page):
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()  # the setup screen is drawn before we look at it
    if page.get_by_label('New profile name').count() and page.get_by_role('button', name='Sam').count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Sam', exact=True).click()
    page.get_by_role('button', name='Fast', exact=True).click()
    page.get_by_role('button', name=re.compile(r'Start game · you and 3 computer players')).click()
    page.wait_for_selector('.round-table')


def play_until_over(page, limit_s=600, watch='.think-dots', label='game', rounds=2):
    """Taps the person's seat (bot.js) and watches the computer players. Returns (over, saw, moves); saw is true if `watch` appeared."""
    page.evaluate(BOT)
    cfg = {'players': 4, 'rounds': rounds, 'manualDeal': False, 'swap': True, 'reshuffle': True,
           'ultimate': False, 'voteYes': True, 'forfeitChance': 0.1, 'jokers': True, 'stayAtEnd': True}
    saw_thinking = False
    start_log = log_len(page)
    t0 = time.time()
    last_len, last_grew = log_len(page), time.time()
    while time.time() - t0 < limit_s:
        if page.locator(watch).count():
            saw_thinking = True
        action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        if FAST:
            advance(page)  # real mode already passes time through the short waits below
        if action == 'GAME OVER':
            return True, saw_thinking, log_len(page) - start_log
        if log_len(page) != last_len:
            last_len, last_grew = log_len(page), time.time()
        elif time.time() - last_grew > STALL_S:
            dump_stuck(page, label)
            return False, saw_thinking, log_len(page) - start_log
        if action in ('wait', 'stuck'):
            page.wait_for_timeout(120)
            continue
        page.wait_for_timeout(40)
    return False, saw_thinking, log_len(page) - start_log


def setup_c(page, level_chip, rename=None, reactions=True):
    """Setup screen for slice C: profile Sam, Fast speed, a level chip, optional names and reactions off."""
    page.get_by_role('button', name='Play against the computer').click()
    page.get_by_role('heading', name='Computer players').wait_for()
    if page.get_by_role('button', name='Sam', exact=True).count() == 0:
        page.get_by_label('New profile name').fill('Sam')
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Sam', exact=True).wait_for()
    page.get_by_role('button', name='Sam', exact=True).click()
    page.get_by_role('button', name='Fast', exact=True).click()
    page.get_by_role('button', name=level_chip, exact=True).click()
    for seat, name in (rename or {}).items():
        field = page.get_by_label(f'Name of computer player {seat}')
        field.fill(name)
        field.press('Tab')  # the name is kept when the field loses focus
    if not reactions:
        page.get_by_text('Reactions from the computer players').click()  # the label switches the box off


def slice_c_checks(browser):
    """Slice C (CODE.md 9m.9): levels, names and reactions on the setup screen and at the table."""
    # Validation first: a computer player named like the person can't start a game.
    ctx, page = new_page(browser)
    setup_c(page, 'All Normal', rename={1: 'Sam'})
    check(page.get_by_text("Two players can't both be called Sam").count() > 0, 'setup says a clashing name is not allowed')
    check(page.get_by_role('button', name='Fix the names first').is_disabled(), 'Start is off while a name clashes')
    page.get_by_label('Name of computer player 1').fill('Wren')
    page.get_by_label('Name of computer player 1').press('Tab')
    check(page.get_by_role('button', name=re.compile('Start game')).is_enabled(), 'Start is back once the names are fixed')
    ctx.close()

    # Game 1: All Easy, one computer player renamed, reactions on. Names and levels reach the table.
    ctx, page = new_page(browser)
    setup_c(page, 'All Easy', rename={1: 'Wren'}, reactions=True)
    page.get_by_role('button', name=re.compile('Start game')).click()
    page.wait_for_selector('.round-table')
    game = stored(page, 'pubby.currentGame') or {}
    levels = [b['level'] for b in (game.get('bots') or {}).get('seats', {}).values()]
    check(levels and all(lv == 'easy' for lv in levels), 'All Easy saves Easy for every computer player')
    check(any(pl.get('sessionName') == 'Wren' for pl in game.get('session', {}).get('players', [])), 'the renamed computer player is saved with its new name')
    check(page.locator('.seat-name', has_text='Wren').count() > 0, 'the new name shows at the table')
    check(page.locator('.seat-bot').count() >= 3, 'computer players have a computer icon at the table')
    over, saw_reaction, moves = play_until_over(page, watch='.float-react', label='all-easy', rounds=1)
    check(over, f'All Easy game played to the end ({moves} log events)')
    check(saw_reaction, 'reactions float from computer seats with reactions on')
    check(not [e for e in page.errors if 'refused' in e or 'could not decide' in e], 'no refused moves in the All Easy game')
    ctx.close()

    # Game 2: Mixed levels, reactions off. Levels are saved; no reaction appears; the game still finishes.
    ctx, page = new_page(browser)
    setup_c(page, 'Mixed', reactions=False)
    page.get_by_role('button', name=re.compile('Start game')).click()
    page.wait_for_selector('.round-table')
    game = stored(page, 'pubby.currentGame') or {}
    levels = [b['level'] for b in (game.get('bots') or {}).get('seats', {}).values()]
    check(len(levels) == 3 and all(lv in ('easy', 'normal', 'hard') for lv in levels), f'Mixed saves Easy, Normal or Hard for each computer player ({levels})')
    check((game.get('bots') or {}).get('reactions') is False, 'the reactions switch is saved as off')
    over, saw_reaction, moves = play_until_over(page, watch='.float-react', label='mixed-reactions-off', rounds=1)
    check(over, f'Mixed game with reactions off played to the end ({moves} log events)')
    check(not saw_reaction, 'no reactions appear when the reactions switch is off')
    ctx.close()


def slice_d_checks(browser):
    """Slice D (CODE.md 9m.9): the Hard level on the setup screen and at the table."""
    # Game 1: All Hard. Every computer player saves Hard, the game finishes, no refused moves.
    ctx, page = new_page(browser)
    setup_c(page, 'All Hard', reactions=True)
    page.get_by_role('button', name=re.compile('Start game')).click()
    page.wait_for_selector('.round-table')
    game = stored(page, 'pubby.currentGame') or {}
    levels = [b['level'] for b in (game.get('bots') or {}).get('seats', {}).values()]
    check(len(levels) == 3 and all(lv == 'hard' for lv in levels), f'All Hard saves Hard for every computer player ({levels})')
    over, _saw, moves = play_until_over(page, watch='.float-react', label='all-hard', rounds=1)
    check(over, f'All Hard game played to the end ({moves} log events)')
    check(not [e for e in page.errors if 'refused' in e or 'could not decide' in e], 'no refused moves in the All Hard game')
    check(not page.errors, 'no page errors in the All Hard game')
    ctx.close()

    # Game 2: Mixed (one game only, CODE.md 9o.3). It saves only Easy, Normal or Hard and the game finishes.
    # That Mixed can give Hard is checked in tests/ai/names.test.ts.
    ctx, page = new_page(browser)
    setup_c(page, 'Mixed', reactions=False)
    page.get_by_role('button', name=re.compile('Start game')).click()
    page.wait_for_selector('.round-table')
    game = stored(page, 'pubby.currentGame') or {}
    levels = [b['level'] for b in (game.get('bots') or {}).get('seats', {}).values()]
    check(all(lv in ('easy', 'normal', 'hard') for lv in levels), f'Mixed game saves only Easy, Normal or Hard ({levels})')
    over, _saw, moves = play_until_over(page, watch='.float-react', label='mixed', rounds=1)
    check(over, f'Mixed game played to the end ({moves} log events)')
    ctx.close()


def report():
    failed = [w for ok, w in checks if not ok]
    print(f'\n{len(checks) - len(failed)} of {len(checks)} checks pass')
    if failed:
        print('FAILED:', '; '.join(failed))
        sys.exit(1)


def main():
    failures = 0
    if '--slice-d' in sys.argv:  # only the slice D checks
        with sync_playwright() as p:
            browser = p.chromium.launch()
            slice_d_checks(browser)
            browser.close()
        report()
        return
    if '--slice-c' in sys.argv:  # only the slice C checks (the slice B ones take several minutes)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            slice_c_checks(browser)
            browser.close()
        report()
        return
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = new_page(browser)
        start_solo(page)

        game = stored(page, 'pubby.currentGame')
        players = game['session']['players'] if game else []
        check(len(players) == 4 and players[0]['id'] == 'p1' and not players[0].get('computer'),
              'game starts with the person as p1 and 3 computer players')
        check(all(pl.get('computer') for pl in players[1:]), 'the other seats are computer players')
        check(game and game.get('bots', {}).get('me') == 'p1', 'the saved game knows which seat is the person')

        over, saw_thinking, moves = play_until_over(page, label='solo-game-1')
        check(saw_thinking, '"thinking…" showed on a computer player\'s seat')
        check(over, f'game played to the end ({moves} log events after the start)')
        if over:
            check(page.get_by_text('Final standings').count() > 0, 'game over screen shows final standings')
        session = (stored(page, 'pubby.currentGame') or {}).get('session')
        records_now = stored(page, 'pubby.gameRecords') or []
        bot_ids = {pl['id'] for pl in players[1:]}
        # Computer players played cards and made the other moves on their own (the log is public).
        played_by_bots = sum(1 for e in (session or {}).get('log', []) if e.get('event', {}).get('type') == 'cardPlayed' and e['event'].get('player') in bot_ids)
        check(played_by_bots > 0 or over, f'computer players played cards on their own ({played_by_bots} cards)')

        refused = [e for e in page.errors if 'refused' in e or 'could not decide' in e]
        check(not refused, 'no computer move refused or failed to decide')
        check(not page.errors, f'no page errors ({len(page.errors)} seen: {page.errors[:2]})')

        records = stored(page, 'pubby.gameRecords') or []
        check(len(records) == 1 and records[0].get('vsComputer') is True, 'game record saved, marked "vs computer"')
        normal = stored(page, 'pubby.profiles') or {}
        vs = stored(page, 'pubby.profiles.vsComputer') or {}
        check(normal.get('Sam', {}).get('gamesPlayed') == 0, 'normal profile history untouched by the computer game')
        check(vs.get('Sam', {}).get('gamesPlayed') == 1, 'Sam\'s vs-computer stats got the game')
        check(not any(k.startswith('computer:') for k in list(normal) + list(vs)), 'computer players have no profile')
        ctx.close()

        # Second game: pause, check the computer players stop, resume, then close and Carry on.
        ctx, page = new_page(browser)
        start_solo(page)
        page.evaluate(BOT)
        cfg = {'players': 4, 'rounds': 2, 'manualDeal': False, 'swap': False, 'reshuffle': False,
               'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True, 'stayAtEnd': True}
        for _ in range(60):
            page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            advance(page, 100)
            if log_len(page) > 40:
                break
        page.get_by_role('button', name='Pause', exact=True).click()
        page.wait_for_selector('.pause-overlay', timeout=5000)
        frozen_at = log_len(page)
        advance(page, 4000)
        check(log_len(page) == frozen_at, 'pausing stops the computer players')
        page.get_by_role('button', name=re.compile('Resume')).click()
        advance(page, 9000)
        check(log_len(page) > frozen_at, 'Resume starts the computer players again')

        advance(page, 500)
        before_close = log_len(page)
        page.reload()
        page.wait_for_selector('h1:has-text("Pubby")')
        check(page.get_by_role('button', name=re.compile('Carry on game')).count() == 1, 'closing mid-game keeps the game (Carry on)')
        page.get_by_role('button', name=re.compile('Carry on game')).click()
        page.wait_for_selector('.round-table')
        page.evaluate(BOT)
        # Carry on: the computer players' memory is rebuilt, so they keep playing.
        resumed_from = log_len(page)
        moved = False
        for _ in range(200):
            action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            advance(page, 60)
            if log_len(page) > resumed_from + 5:
                moved = True
                break
            if action == 'GAME OVER':
                break
        check(moved and before_close >= resumed_from, 'after Carry on the computer players keep playing')
        check(not [e for e in page.errors if 'refused' in e or 'could not decide' in e], 'no refused moves after Carry on')
        ctx.close()
        slice_c_checks(browser)
        browser.close()

    report()


if __name__ == '__main__':
    main()
