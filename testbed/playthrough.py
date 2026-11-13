"""Automated playthroughs of the built Pubby app (dist/index.html) in a
phone-sized headless browser. Plays full games at 2, 3, 5 and 8 players
through the real screens (testbed/bot.js), then checks that every finished
game was saved: Past games, profile totals, and the CSV share fallback.

Usage: npm run build && python3 testbed/playthrough.py
"""
import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'dist' / 'index.html').as_uri() + '?onephone=1'  # one-phone button (hidden from the menu)
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
NAMES = ['Amy', 'Ben', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal']

# One game per player count. Different settings so each game covers different screens.
GAMES = [
    {'players': 2, 'rounds': 2, 'manualDeal': True, 'swap': True, 'reshuffle': True, 'ultimate': False, 'voteYes': True, 'forfeitChance': 0.3, 'jokers': True},
    {'players': 3, 'rounds': 2, 'manualDeal': False, 'swap': True, 'reshuffle': True, 'ultimate': True, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True},
    {'players': 5, 'rounds': 2, 'manualDeal': True, 'swap': False, 'reshuffle': False, 'ultimate': True, 'voteYes': False, 'forfeitChance': 0.2, 'jokers': False},
    {'players': 8, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': True, 'ultimate': True, 'voteYes': True, 'forfeitChance': 0.1, 'jokers': True},
]

checks = []

# Fast mode (CODE.md 9o.1): the page runs on a fake clock that advances once per bot step.
# Pass --real-time to play at the normal speed instead.
FAST = '--real-time' not in sys.argv
TICK_MS = 1000
STALL_S = 30  # real seconds without a new log event before a game counts as stuck (9o.2)


def check(ok, what):
    checks.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what)


def setup_game(page, n, jokers):
    page.get_by_role('button', name='New game').click()
    for name in NAMES[:n]:
        chip = page.get_by_role('button', name=f'+ {name}')
        if chip.count():
            chip.click()
        else:
            page.get_by_label('New player name').fill(name)
            page.get_by_role('button', name='Add', exact=True).click()
    if not jokers:
        page.locator('label.toggle').click()
    page.get_by_role('button', name=f'Start game · {n} players').click()


def log_len(page):
    raw = page.evaluate("localStorage.getItem('pubby.currentGame')")
    return len(json.loads(raw)['session']['log']) if raw else -1


def play_game(page, cfg, errors):
    page.evaluate(BOT)
    counts = {}
    stuck_since = None
    t0 = time.time()
    last_len, last_grew, steps_seen = -2, time.time(), 0
    while time.time() - t0 < 900:
        action = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        if FAST:
            page.clock.run_for(TICK_MS)
        # 9o.2: a game whose log stops growing for 30 real seconds is stuck; say what the screen shows.
        steps_seen += 1
        if steps_seen % 20 == 0:
            now_len = log_len(page)
            if now_len != last_len:
                last_len, last_grew = now_len, time.time()
            elif time.time() - last_grew > STALL_S:
                print(page.inner_text('body')[:1500])
                check(False, f"{cfg['players']} players: game stalled at {now_len} log events ({action})")
                raise SystemExit(1)
        key = action.split(' ')[0]
        counts[key] = counts.get(key, 0) + 1
        steps = sum(counts.values())
        if steps % 250 == 0:
            print(f"    step {steps} ({time.time() - t0:.0f}s): {action}", flush=True)
        if action == 'GAME OVER':
            break
        if action in ('wait', 'stuck'):
            stuck_since = stuck_since or time.time()
            if action == 'stuck' and time.time() - stuck_since > 6:
                print(page.inner_text('body')[:1500])
                check(False, f"{cfg['players']} players: bot stuck")
                raise SystemExit(1)
            page.wait_for_timeout(120)
            continue
        stuck_since = None
        page.wait_for_timeout(15)
    else:
        check(False, f"{cfg['players']} players: game did not finish in time")
    bot = page.evaluate('window.pubbyBot.state')
    return counts, bot


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        page = ctx.new_page()
        if FAST:
            page.clock.install()  # before goto: timers wait until the bot advances the clock
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(APP)

        only = [int(a) for a in sys.argv[1:]]
        played = 0
        for i, cfg in enumerate(GAMES):
            if only and cfg['players'] not in only:
                continue
            n = cfg['players']
            played += 1
            setup_game(page, n, cfg['jokers'])
            counts, bot = play_game(page, cfg, errors)
            if bot is None:
                continue
            print(f'  {n} players: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items())))
            check(not bot['problems'], f'{n} players: no problems ({bot["problems"][:3]})')
            check(counts.get('GAME', 0) == 1, f'{n} players: game played to the end')
            check(counts.get('play', 0) > 0, f'{n} players: cards were played')
            if cfg['manualDeal']:
                check(bot['manualDeals'] > 0, f'{n} players: manual deal used and stayed even')
            if cfg['swap'] and n <= 3:
                check(counts.get('keep', 0) + bot['swaps'] > 0, f'{n} players: hidden swap screen reached')
            if cfg['reshuffle']:
                check(counts.get('reshuffle', 0) == 1, f'{n} players: reshuffle vote called')
            if cfg['ultimate']:
                check(counts.get('ultimate', 0) == 1, f'{n} players: Ultimate Round vote called')
            csv = bot['csv'][-1] if bot['csv'] else ''
            check(csv.startswith('Pubby game record') and f'Players,{n}' in csv, f'{n} players: game stats CSV shown via share fallback')

            # Saved on the phone.
            recs = page.evaluate("JSON.parse(localStorage.getItem('pubby.gameRecords') || '[]')")
            check(len(recs) == played, f'{n} players: saved in past games ({len(recs)} saved)')
            if recs:
                check(recs[0]['playerCount'] == n, f'{n} players: newest saved game is this one')
                if cfg['ultimate']:
                    ult_played = recs[0]['ultimate']['played']
                    check(ult_played == cfg['voteYes'], f"{n} players: Ultimate Round {'played' if ult_played else 'voted down'} as expected")
            check(page.evaluate("localStorage.getItem('pubby.currentGame')") in (None, 'null'), f'{n} players: game in progress cleared after Back to home')

        if only:
            check(not errors, f'no page errors ({errors[:3]})')
            browser.close()
            failed = [w for ok, w in checks if not ok]
            print(f'\n{len(checks) - len(failed)} of {len(checks)} checks passed')
            sys.exit(1 if failed else 0)

        # Profiles: Amy and Ben played all 4 games, Hal only the 8-player game.
        profiles = page.evaluate("JSON.parse(localStorage.getItem('pubby.profiles') || '{}')")
        check(profiles.get('Amy', {}).get('gamesPlayed') == 4, f"Amy has 4 games ({profiles.get('Amy', {}).get('gamesPlayed')})")
        check(profiles.get('Hal', {}).get('gamesPlayed') == 1, 'Hal has 1 game')
        check(len(set(profiles['Amy']['games'])) == 4, 'no game counted twice')
        total_rounds = sum(sum(1 for r in rec['rounds'] if not r['ultimate']) for rec in page.evaluate("JSON.parse(localStorage.getItem('pubby.gameRecords'))"))
        amy = profiles['Amy']
        check(amy['roundWins'] + amy['roundLosses'] <= total_rounds, 'round wins and losses add up')

        # Home screen and Past games screen.
        page.get_by_role('button', name='Past games (4)').click()
        rows = page.locator('li.record')
        check(rows.count() == 4, 'Past games lists 4 games')
        rows.first.locator('.record-head').click()
        check(page.locator('li.record.open ol.standings li').count() == 8, 'newest game opens with 8 standings')
        page.get_by_role('button', name='Share game stats').click()
        check(page.locator('textarea.csv-box').count() == 1, 'share from Past games shows the CSV')
        page.get_by_role('button', name='Close').click()
        page.locator('li.record.open').get_by_role('button', name='Delete').click()
        page.get_by_role('button', name='Tap to delete').click()
        check(rows.count() == 3, 'deleting a past game takes two taps')
        page.get_by_role('button', name='‹ Back').click()

        page.get_by_role('button', name='Profiles (8)').click()
        page.locator('li.profile .record-head', has_text='Amy').click()
        details = page.locator('.profile-details').inner_text()
        check('Games played' in details and '4' in details, 'Amy profile details show 4 games')
        page.get_by_role('button', name='Share profile stats (CSV)').click()
        csv = page.locator('textarea.csv-box').input_value()
        check(csv.startswith('Pubby profile,Amy') and 'Games played,4' in csv, 'profile CSV shown')
        page.get_by_role('button', name='Close').click()

        # Survives a reload.
        page.reload()
        check(page.get_by_role('button', name='Past games (3)').count() == 1, 'past games survive a page reload')
        page.screenshot(path='/tmp/pubby-home.png')

        check(not errors, f'no page errors ({errors[:3]})')
        browser.close()

    failed = [w for ok, w in checks if not ok]
    print(f'\n{len(checks) - len(failed)} of {len(checks)} checks passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
