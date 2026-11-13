"""Phase 4c slice O2 check: online rooms in the app, through a local relay (CODE.md 9r.7, PROJECT.md 12d).

Each phase starts its own relay (testbed/relay_server.ts: the same RoomCore and
DirectoryCore as the Cloudflare Worker, so the logic is the real one) and runs
the built app (dist/) on phone-sized pages that all point at it with ?server=.

  A  default relay: the mode screens; a host makes a room; it shows, with its
     seats, on other pages' room lists; a wrong passcode is refused; three phones
     join and every lobby shows the same seats; the host removes one, who joins
     again; the invite link opens that room's passcode screen; the host starts
     (the room leaves the list, a late join is refused); four phones play a whole
     game with testbed/bot.js; the host goes home and the room is gone from the list.
  B  --fast-limits relay: wrong passcodes stop with "Too many wrong tries", and
     the right one works once the window has passed.
  C  --fast-idle relay: an empty room leaves the room list by itself.
  D  the relay is stopped in the lobby: the joining phone shows "Connection
     lost" and the host shows "Room closed".

Not checked here: a version mismatch (the relay's version check is a unit test,
tests/server/room.test.ts) and frames over FRAME_MAX (unit test too).

Usage: npm run build && python3 testbed/online_check.py
"""

import functools
import http.server
import pathlib
import queue
import re
import subprocess
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
ROOM = 'Test table'
CODE = '4321'
GAME = {'players': 4, 'rounds': 1, 'manualDeal': False, 'swap': False, 'reshuffle': False,
        'ultimate': False, 'voteYes': False, 'forfeitChance': 0.0, 'stayAtEnd': True}
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({detail})' if detail else ''), flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(Quiet, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def wait_for(fn, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def start_relay(*flags):
    """Starts the local relay on a free port and returns (process, its address)."""
    # Own process group: npx starts node as a child, and the whole group must stop with the relay.
    proc = subprocess.Popen(['npx', 'tsx', 'testbed/relay_server.ts', '--port', '0', *flags], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    lines = queue.Queue()

    def read():
        for line in proc.stdout:
            lines.put(line)

    threading.Thread(target=read, daemon=True).start()
    end = time.time() + 90
    while time.time() < end:
        try:
            line = lines.get(timeout=1)
        except queue.Empty:
            continue
        m = re.search(r'RELAY_READY (\d+)', line)
        if m:
            return proc, f'http://127.0.0.1:{m.group(1)}'
    proc.kill()
    raise SystemExit('the relay did not start')


def stop_relay(proc):
    import os, signal
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(10)
    except (subprocess.TimeoutExpired, ProcessLookupError):
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def new_page(browser, base, server, errors, label):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    # A refused request (403 for a wrong passcode) is expected; only real errors count.
    page.on('console', lambda m: errors.append(f'{label} console: {m.text}')
            if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.goto(f'{base}?server={server}')
    page.wait_for_selector('text=Multiplayer')
    return page


def open_online(page, as_host, name):
    page.get_by_role('button', name='Multiplayer').click()
    page.get_by_role('button', name='Online').click()
    page.get_by_role('button', name='Host a room' if as_host else 'Join a room').click()
    page.get_by_placeholder('New name').fill(name)
    page.get_by_role('button', name='Go', exact=True).click()


def host_room(page, name, room, code):
    open_online(page, True, name)
    page.wait_for_selector('input[aria-label="Room name"]')
    page.locator('input[aria-label="Room name"]').fill(room)
    page.locator('input[aria-label="Passcode"]').fill(code)
    page.get_by_role('button', name='Make the room').click()
    return wait_for(lambda: page.locator('.room-code').count() == 1, 20)


def watch_list(page, name):
    open_online(page, False, name)
    return wait_for(lambda: page.locator('h1', has_text='Join a room').count() == 1, 10)


def join_room(page, room, code):
    page.locator('.room-item', has_text=room).click()
    page.locator('input[aria-label="Passcode"]').fill(code)
    page.get_by_role('button', name='Join the room').click()


def enter_passcode(page, code):
    page.locator('input[aria-label="Passcode"]').fill(code)
    page.get_by_role('button', name='Join the room').click()


def in_list(page, room):
    return page.locator('.room-item', has_text=room).count() == 1


def step_of(page):
    return page.evaluate('window.pubbyLobby.step()')


def seat_count(page):
    return page.locator('.count').first.inner_text()


def game_progress(page):
    return page.evaluate("() => { const s = window.pubbyNet && window.pubbyNet.session(); return s ? s.log.length : -1; }")


def play_bot_game(pages):
    """testbed/bot.js taps the real screens on every phone until the final standings show on all of them."""
    for p in pages:
        p.evaluate(BOT)
    last_log = None
    last_progress = time.time()
    t0 = time.time()
    while time.time() - t0 < 600:
        for p in pages:
            p.evaluate('cfg => window.pubbyBot.step(cfg)', GAME)
        if all(p.get_by_text('Final standings').count() for p in pages):
            return True
        now_log = pages[0].evaluate("() => { const s = window.pubbyNet && window.pubbyNet.session(); return s ? s.log.length : -1; }")
        if now_log != last_log:
            last_log = now_log
            last_progress = time.time()
        if time.time() - last_progress > 60:
            return False
        time.sleep(0.05)
    return False


def phase_a(browser, base, errors):
    proc, server = start_relay()
    try:
        amy = new_page(browser, base, server, errors, 'Amy')
        ben = new_page(browser, base, server, errors, 'Ben')
        cat = new_page(browser, base, server, errors, 'Cat')
        dan = new_page(browser, base, server, errors, 'Dan')
        eve = new_page(browser, base, server, errors, 'Eve')
        fay = new_page(browser, base, server, errors, 'Fay')

        # 1. The first screen offers Online and Nearby; Online then offers host or join.
        amy.get_by_role('button', name='Multiplayer').click()
        check('mode screen: Online and Nearby', amy.get_by_role('button', name='Online').count() == 1
              and amy.get_by_role('button', name='Nearby').count() == 1)
        amy.get_by_role('button', name='Online').click()
        check('Online: host a room or join a room', amy.get_by_role('button', name='Host a room').count() == 1
              and amy.get_by_role('button', name='Join a room').count() == 1)
        amy.get_by_role('button', name='‹ Back').click()
        amy.get_by_role('button', name='‹ Back').click()
        check('back from Online goes to the main menu', wait_for(lambda: amy.get_by_role('button', name='Multiplayer').count() == 1, 5))

        # 2. The host makes a room with a name and a passcode.
        made = host_room(amy, 'Amy', ROOM, CODE)
        check('host makes a room: lobby shows the passcode', made and amy.locator('.room-code').inner_text() == CODE)
        check('host lobby: Share invite, no Add player', amy.get_by_role('button', name='Share invite').count() == 1
              and amy.get_by_role('button', name='Add player').count() == 0)
        room_id = amy.evaluate('window.pubbyLobby.room()')

        # 3. The room shows on other pages' lists, with the host and the seats.
        check('Ben and Eve see the room in their lists', watch_list(ben, 'Ben') and watch_list(eve, 'Eve')
              and wait_for(lambda: in_list(ben, ROOM) and in_list(eve, ROOM), 8))
        item = eve.locator('.room-item', has_text=ROOM).inner_text()
        check('the room shows the host’s name and 1 / 8', 'Amy' in item and '1 / 8' in item, item.replace('\n', ' | '))

        # 4. A wrong passcode is refused; the right one joins.
        join_room(ben, ROOM, '1111')
        check('wrong passcode: "Wrong passcode." and no join', wait_for(lambda: ben.get_by_text('Wrong passcode.').count() == 1, 10)
              and step_of(ben) == 'room-pass')
        ben.get_by_role('button', name='‹ Back').click()  # back to the room list
        join_room(ben, ROOM, CODE)
        check('right passcode: Ben joins the lobby', wait_for(lambda: step_of(ben) == 'lobby', 20))
        check('host shows 2 / 8 and Ben is listed', wait_for(lambda: seat_count(amy) == '2 / 8', 10))

        # 5. Two more phones join; every lobby shows the same seats.
        join_room(cat, ROOM, CODE) if watch_list(cat, 'Cat') and wait_for(lambda: in_list(cat, ROOM), 8) else None
        check('Cat joins the lobby', wait_for(lambda: step_of(cat) == 'lobby', 20))
        join_room(dan, ROOM, CODE) if watch_list(dan, 'Dan') and wait_for(lambda: in_list(dan, ROOM), 8) else None
        check('Dan joins the lobby', wait_for(lambda: step_of(dan) == 'lobby', 20))
        check('host shows 4 / 8', wait_for(lambda: seat_count(amy) == '4 / 8', 10))
        same = wait_for(lambda: all(p.locator('ol.seats li').count() == 4 for p in (amy, ben, cat, dan)), 10)
        check('every lobby lists the same four players', same)

        # 6. The host removes Cat (two taps: Remove, then Remove?). Cat sees it and joins again.
        amy.get_by_role('button', name='Remove Cat').click()
        amy.get_by_role('button', name='Remove Cat').click()
        check('removed phone sees "The host took you out of this game."',
              wait_for(lambda: cat.get_by_text('The host took you out of this game.').count() == 1, 10))
        check('host shows 3 / 8 after the removal', wait_for(lambda: seat_count(amy) == '3 / 8', 10))
        cat.get_by_role('button', name='Join again').click()
        check('removed phone is back on the room list, not the Nearby screen', wait_for(lambda: step_of(cat) == 'room-list', 8))
        join_room(cat, ROOM, CODE)
        check('Cat joins again with the passcode', wait_for(lambda: step_of(cat) == 'lobby', 20))
        check('host shows 4 / 8 again', wait_for(lambda: seat_count(amy) == '4 / 8', 10))

        # 7. The invite link opens the passcode screen for that room.
        fay.goto(f'{base}?server={server}#room={room_id}')
        fay.wait_for_selector('text=Who’s on this phone?')
        fay.get_by_placeholder('New name').fill('Fay')
        fay.get_by_role('button', name='Go', exact=True).click()
        check('invite link: the room’s passcode screen', wait_for(lambda: fay.get_by_role('button', name='Join the room').count() == 1
              and fay.locator('h2', has_text=ROOM).count() == 1, 10))

        # 8. The host starts: the room leaves the list, and a late join is refused.
        amy.get_by_role('button', name='Start game').click()
        check('Start puts all four phones in the game', wait_for(lambda: all(p.locator('.screen.game').count() == 1 for p in (amy, ben, cat, dan)), 20))
        check('the room leaves the room list', wait_for(lambda: not in_list(eve, ROOM), 8))
        enter_passcode(fay, CODE)
        check('a late join is refused: "That game has already started."',
              wait_for(lambda: fay.get_by_text('That game has already started.').count() == 1, 10))

        # 9. A whole game on four phones.
        played = play_bot_game([amy, ben, cat, dan])
        check('four phones play a whole game to the final standings', played)
        ended = [p.evaluate("() => { const s = window.pubbyNet.session(); return s && s.ended ? JSON.stringify(s.ended.standings) : null; }") for p in (amy, ben, cat, dan)]
        check('every phone shows the same final standings', ended[0] is not None and all(x == ended[0] for x in ended), str(ended)[:200])

        # 10. The host goes home: the room closes for the others and leaves the list.
        amy.get_by_role('button', name='Back to home').click()
        time.sleep(1.5)
        check('joining phones keep the game over screen when the host leaves',
              all(p.get_by_text('Final standings').count() for p in (ben, cat, dan)))
        check('no room is listed after the host goes home', wait_for(lambda: not in_list(eve, ROOM), 8))
        check('no page errors in phase A', not errors, '; '.join(errors[:3]))
        for p in (amy, ben, cat, dan, eve, fay):
            p.context.close()
    finally:
        stop_relay(proc)


def phase_b(browser, base, errors):
    proc, server = start_relay('--fast-limits')
    try:
        amy = new_page(browser, base, server, errors, 'Amy')
        ben = new_page(browser, base, server, errors, 'Ben')
        host_room(amy, 'Amy', 'Limits', '9876')
        watch_list(ben, 'Ben')
        wait_for(lambda: in_list(ben, 'Limits'), 8)
        tries = 0
        blocked = False
        for _ in range(8):
            join_room(ben, 'Limits', '1111') if tries == 0 else enter_passcode(ben, '1111')
            tries += 1
            time.sleep(0.6)  # quick tries: they must fall inside the 10 s window of --fast-limits
            if ben.get_by_text('Too many wrong tries').count() == 1:
                blocked = True
                break
        check(f'wrong passcodes stop with "Too many wrong tries" (after {tries})', blocked)
        enter_passcode(ben, '9876')
        time.sleep(1)
        check('the right passcode is still refused during the wait', ben.get_by_text('Too many wrong tries').count() == 1)
        time.sleep(12)
        enter_passcode(ben, '9876')
        check('after the wait, the right passcode joins', wait_for(lambda: step_of(ben) == 'lobby', 20))
        check('no page errors in phase B', not errors, '; '.join(errors[:3]))
        for p in (amy, ben):
            p.context.close()
    finally:
        stop_relay(proc)


def phase_c(browser, base, errors):
    proc, server = start_relay('--fast-idle')
    try:
        amy = new_page(browser, base, server, errors, 'Amy')
        eve = new_page(browser, base, server, errors, 'Eve')
        host_room(amy, 'Amy', 'Idle table', '1357')
        watch_list(eve, 'Eve')
        check('an empty room is listed', wait_for(lambda: in_list(eve, 'Idle table'), 8))
        check('the empty room leaves the list by itself', wait_for(lambda: not in_list(eve, 'Idle table'), 20))
        for p in (amy, eve):
            p.context.close()
    finally:
        stop_relay(proc)


def phase_d(browser, base, errors):
    proc, server = start_relay()
    amy = ben = None
    try:
        amy = new_page(browser, base, server, errors, 'Amy')
        ben = new_page(browser, base, server, errors, 'Ben')
        host_room(amy, 'Amy', 'Doomed', '2468')
        watch_list(ben, 'Ben')
        wait_for(lambda: in_list(ben, 'Doomed'), 8)
        join_room(ben, 'Doomed', '2468')
        check('before the stop: Ben is in the lobby', wait_for(lambda: step_of(ben) == 'lobby', 20))
    finally:
        stop_relay(proc)
    check('relay stopped: Ben sees "Connection lost"', wait_for(lambda: ben.get_by_text('Connection lost').count() == 1, 20))
    check('relay stopped: the host sees "Room closed"', wait_for(lambda: amy.get_by_text('Room closed').count() == 1, 20))
    if amy and ben:
        for p in (amy, ben):
            p.context.close()


def main():
    dist = ROOT / 'dist'
    httpd = serve(dist)
    base = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        errors = []
        phase_a(browser, base, errors)
        phase_b(browser, base, errors)
        phase_c(browser, base, errors)
        phase_d(browser, base, [])
        browser.close()
    httpd.shutdown()
    print(f'\n{sum(results)} of {len(results)} checks passed')
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
