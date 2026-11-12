"""Checks Pubby's sound (PROJECT.md 12b, CODE.md 9g) in a phone-sized
headless browser: defaults (on, music 40, effects 60), the sound button and
sheet on every screen including mid-game, switches and sliders, settings kept
after a reload, the right music for each screen, and effects from the game.

Usage: npm run build && python3 testbed/sound_check.py
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'dist' / 'index.html').as_uri() + '?onephone=1'  # one-phone button (hidden from the menu)
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
checks = []


def check(ok, what):
    checks.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what)


def track(page):
    return page.evaluate('window.pubbySound.track()')


def settings(page):
    return page.evaluate('window.pubbySound.settings()')


def log(page):
    return page.evaluate('window.pubbySound.log.slice()')


def open_sheet(page, where):
    page.locator('.sound-btn').click()
    ok = page.get_by_role('dialog', name='Sound').is_visible()
    check(ok, f'sound sheet opens: {where}')
    has = page.get_by_label('Music volume').count() == 1 and page.get_by_label('Sound effects volume').count() == 1
    check(has, f'music and effects sliders on the sheet: {where}')
    return ok


def close_sheet(page):
    page.get_by_role('dialog', name='Sound').get_by_role('button', name='Close').click()


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--autoplay-policy=user-gesture-required'])
    page = browser.new_page(viewport={'width': 390, 'height': 800}, has_touch=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(APP)
    page.wait_for_timeout(300)

    check(settings(page) == {'musicOn': False, 'musicVol': 40, 'sfxOn': True, 'sfxVol': 60}, 'defaults: music off, effects on, music 40, effects 60')
    check(track(page) is None, 'no music before the first tap')
    page.locator('.sound-btn').click()
    page.wait_for_timeout(200)
    check(track(page) is None, 'music stays off after the first tap (off by default)')
    check('tap' in log(page), 'tap sound on a button')
    page.get_by_role('dialog', name='Sound').locator('label.toggle').first.click()
    page.wait_for_timeout(150)
    check(track(page) == 'menu', 'music switched on: menu music')
    close_sheet(page)

    # Home: sheet, switches, slider.
    open_sheet(page, 'home')
    page.get_by_role('dialog', name='Sound').locator('label.toggle').first.click()
    page.wait_for_timeout(100)
    check(settings(page)['musicOn'] is False and track(page) is None, 'music switch off stops the music')
    check(page.locator('.sound-btn').get_attribute('aria-label') == 'Sound', 'button still shows sound (effects on)')
    page.get_by_role('dialog', name='Sound').locator('label.toggle').first.click()
    page.wait_for_timeout(100)
    check(settings(page)['musicOn'] is True and track(page) == 'menu', 'music switch on starts it again')
    slider = page.get_by_label('Music volume')
    slider.evaluate("el => { el.value = '70'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
    check(settings(page)['musicVol'] == 70, 'music slider changes the music volume')
    page.get_by_label('Music volume').evaluate("el => { el.value = '0'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
    check(track(page) is None, 'music volume 0 stops the music')
    page.get_by_label('Music volume').evaluate("el => { el.value = '35'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
    page.get_by_label('Sound effects volume').evaluate("el => { el.value = '45'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
    check(settings(page)['sfxVol'] == 45, 'effects slider changes the effects volume')
    close_sheet(page)

    page.reload()
    page.wait_for_timeout(300)
    check(settings(page) == {'musicOn': True, 'musicVol': 35, 'sfxOn': True, 'sfxVol': 45}, 'settings kept after a reload')

    # Both off: button shows muted.
    page.locator('.sound-btn').click()
    toggles = page.get_by_role('dialog', name='Sound').locator('label.toggle')
    toggles.nth(0).click(); toggles = page.get_by_role('dialog', name='Sound').locator('label.toggle'); toggles.nth(1).click()
    page.wait_for_timeout(100)
    check(page.locator('.sound-btn').get_attribute('aria-label') == 'Sound (off)', 'button shows 🔇 with both off')
    toggles = page.get_by_role('dialog', name='Sound').locator('label.toggle')
    toggles.nth(0).click(); toggles = page.get_by_role('dialog', name='Sound').locator('label.toggle'); toggles.nth(1).click()
    close_sheet(page)

    # Setup screen.
    page.get_by_role('button', name='New game').click()
    open_sheet(page, 'game setup')
    close_sheet(page)
    check(track(page) == 'menu', 'menu music on the setup screen')
    for name in ['Amy', 'Ben', 'Cat']:
        page.get_by_label('New player name').fill(name)
        page.get_by_role('button', name='Add', exact=True).click()
    page.get_by_role('button', name='Start game · 3 players').click()
    page.wait_for_timeout(100)
    check(page.locator('.deck.shuffling').count() == 1, 'shuffle animation before the deal')
    check(page.get_by_text('Amy shuffles').count() == 1 or page.locator('h2', has_text='shuffles').count() == 1, 'dealer shown shuffling')
    check('shuffle' in log(page), 'shuffle sound with the shuffle animation')
    page.wait_for_timeout(1900)
    check(page.locator('.deck.shuffling').count() == 0 and page.locator('#deck').count() == 1, 'deal screen after the shuffle')
    check(track(page) == 'play', 'play music once the game starts')
    open_sheet(page, 'dealing')
    close_sheet(page)

    # Play a while with the bot.
    page.evaluate(BOT)
    cfg = {'players': 3, 'rounds': 1, 'manualDeal': False, 'swap': True, 'reshuffle': False, 'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'jokers': True}
    played = 0
    for _ in range(4000):
        a = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        if a.startswith('play'):
            played += 1
        if played >= 6 or a == 'GAME OVER':
            break
        page.wait_for_timeout(20 if a not in ('wait', 'stuck') else 120)
    lg = log(page)
    check('deal' in lg, 'deal sound while dealing')
    check('shuffle' in lg, 'shuffle sound at the round start')
    check('play' in lg or 'joker' in lg, 'card sound when a card is played')
    page.wait_for_timeout(600)
    lg = log(page)
    check('yourTurn' not in lg, 'no your-turn ding when the phone passes')
    check(page.evaluate('window.__bot.anims || 0') > 0, 'end-of-trick animation shown')

    # Mid-game: sheet over the table, game carries on.
    page.locator('.popup-ok').first.click() if page.locator('.popup-ok').count() else None
    before = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('pubby.currentGame') || 'null')?.session?.log?.length)")
    open_sheet(page, 'mid-game')
    page.get_by_label('Sound effects volume').evaluate("el => { el.value = '80'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
    check(settings(page)['sfxVol'] == 80, 'effects volume changed mid-game')
    after = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('pubby.currentGame') || 'null')?.session?.log?.length)")
    check(before == after, 'opening the sound sheet changes nothing in the game')
    close_sheet(page)

    # Pause: click sound, music stops; resume: click up, music back.
    if page.get_by_role('button', name='Pause', exact=True).count():
        page.get_by_role('button', name='Pause', exact=True).click()
        page.get_by_role('button', name='Pause now', exact=False).click()
        page.wait_for_timeout(150)
        check(track(page) is None and log(page)[-1] == 'paused', 'pause: click down, music stops')
        page.get_by_role('button', name='Resume', exact=False).click()
        page.wait_for_timeout(150)
        check(track(page) == 'play' and 'resumed' in log(page), 'resume: click up, music back')
    else:
        check(False, 'pause button not found')

    # Play to the end: results music.
    page.evaluate('window.pubbySound.clear()')
    for _ in range(20000):
        a = page.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
        if a == 'GAME OVER':
            break
        st = page.evaluate("JSON.parse(localStorage.getItem('pubby.currentGame') || 'null')?.session?.phase")
        if st == 'results':
            break
        page.wait_for_timeout(15 if a not in ('wait', 'stuck') else 120)
    for _ in range(80):
        if page.locator('.anim-block').count() == 0:
            break
        page.wait_for_timeout(100)
    page.wait_for_timeout(600)
    lg = page.evaluate('window.pubbySound.seen()')
    check(track(page) == 'results', 'results music on the results screen')
    check('lastPlace' in lg and 'roundWinner' in lg, 'round winner fanfare and sad trombone at the round end')
    check('trickDone' in lg or 'pickUp' in lg, 'trick-done swish or pick-up when the trick cards move')
    open_sheet(page, 'results')
    close_sheet(page)

    bad = page.evaluate('window.pubbySound.tryAll()')
    check(bad == [], f'all {22} effects play without an error ({bad})')
    check(page.evaluate("(() => { const c = document.querySelector('.sound-btn'); return !!c; })()"), 'sound button on the results screen')
    check(not errors, f'no page errors ({errors[:3]})')
    browser.close()

passed = sum(1 for ok, _ in checks if ok)
print(f'\n{passed} of {len(checks)} checks passed')
sys.exit(0 if passed == len(checks) else 1)
