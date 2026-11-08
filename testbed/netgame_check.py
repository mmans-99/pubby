"""Phase 4 slice 2 check: whole games over the network on several phone-sized pages.

Each game: one page hosts, the others join through the lobby (codes passed
straight from the on-screen QR element to the other page, as lobby_check.py
does after its camera tests). The host starts, then testbed/bot.js taps through
the real screens on every page at once: each phone only acts for its own
player and waits otherwise.

Checks: every phone enters the game; each phone's copy of the game only ever
holds its own cards (other hands, the deck, the waste pile and the hidden
decks are blank); every phone shows the same seats and card counts as the
host; only the dealer's phone can deal; pop-ups (SLAP! and the others) show on
phones that didn't make the move; moves for another player, out of turn, or
from a phone that isn't connected are refused with a message; the game ends
on every phone with the same standings and is saved on every phone (to that
phone's own profile only); leaving and closing mid-game; no page errors.

Usage: npm run build && python3 testbed/netgame_check.py
"""
import functools
import http.server
import json
import pathlib
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOT = (ROOT / 'testbed' / 'bot.js').read_text()
NAMES = ['Amy', 'Ben', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal']
results = []

GAMES = [
    {'players': 2, 'rounds': 2, 'manualDeal': True, 'swap': True, 'reshuffle': False, 'ultimate': False, 'voteYes': False, 'forfeitChance': 0.3, 'stayAtEnd': True},
    {'players': 3, 'rounds': 2, 'manualDeal': False, 'swap': True, 'reshuffle': False, 'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'stayAtEnd': True},
    {'players': 5, 'rounds': 1, 'manualDeal': True, 'swap': False, 'reshuffle': False, 'ultimate': False, 'voteYes': False, 'forfeitChance': 0.2, 'stayAtEnd': True},
]


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


def open_lobby(page, as_host, name):
    page.get_by_role('button', name='Play on several phones').click()
    page.get_by_role('button', name='Host a game' if as_host else 'Join a game').click()
    page.get_by_placeholder('New name').fill(name)
    page.get_by_role('button', name='Go', exact=True).click()


def add(host, joiner):
    host.get_by_role('button', name='Add player').click()
    host.wait_for_selector('.qr')
    code1 = host.locator('.qr').get_attribute('data-code')
    joiner.evaluate('t => window.pubbyLobby.scan(t)', code1)
    joiner.wait_for_selector('.qr', timeout=15000)
    code2 = joiner.locator('.qr').get_attribute('data-code')
    host.get_by_role('button', name='Scan their code').click()
    host.evaluate('t => window.pubbyLobby.scan(t)', code2)
    ok = wait_for(lambda: joiner.evaluate('window.pubbyLobby.step()') == 'lobby', 20)
    return ok


def new_page(browser, base, errors, label):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    page.on('console', lambda m: errors.append(f'{label} console: {m.text}') if m.type == 'error' else None)
    page.goto(base)
    page.wait_for_selector('text=Play on several phones')
    return page


# Real card ids (not blank) this page's copy holds anywhere, minus its own hand.
LEAKS_JS = """() => {
  const s = window.pubbyNet.session(); const info = window.pubbyNet.info();
  if (!s || !info) return null;
  const me = info.me; const out = [];
  const real = (cards) => (cards || []).filter((c) => !c.id.startsWith('hidden-')).map((c) => c.id);
  const mine = new Set([...(s.hands[me] || []), ...((s.play && s.play.hands[me]) || []), ...((s.deal && s.deal.hands[me]) || [])].map((c) => c.id));
  const all = [];
  for (const p of s.order) { all.push(...real(s.hands[p])); if (s.play) all.push(...real(s.play.hands[p])); if (s.deal) all.push(...real(s.deal.hands[p])); }
  for (const d of Object.values(s.hiddenDecks || {})) all.push(...real(d));
  if (s.deal) { all.push(...real(s.deal.remaining)); for (const d of Object.values(s.deal.hiddenDecks || {})) all.push(...real(d)); }
  if (s.play) all.push(...real(s.play.wastePile));
  for (const id of all) if (!mine.has(id)) out.push(id);
  return out;
}"""

SNAP_JS = """() => {
  const s = window.pubbyNet.session();
  if (!s) return null;
  const count = (p) => s.play ? (s.play.hands[p] || []).length : s.deal ? (s.deal.hands[p] || []).length : (s.hands[p] || []).length;
  return { phase: s.phase, round: s.round, turn: s.play ? s.play.turn : null, counts: s.order.map(count), log: s.log.length,
    ended: s.ended ? s.ended.standings : null, scores: s.order.map((p) => s.scores[p] || 0) };
}"""

POPUP_WATCH_JS = """() => {
  window.__pops = window.__pops || { slap: 0, other: 0, haha: 0 };
  new MutationObserver(() => {
    for (const el of document.querySelectorAll('.popup:not([data-counted])')) {
      el.setAttribute('data-counted', '1');
      if (el.classList.contains('haha')) window.__pops.haha++;
      else if (el.classList.contains('slap')) window.__pops.slap++;
      else window.__pops.other++;
    }
  }).observe(document.body, { childList: true, subtree: true });
}"""


def setup(browser, base, n, errors):
    pages = [new_page(browser, base, errors, NAMES[i]) for i in range(n)]
    open_lobby(pages[0], True, NAMES[0])
    joined = True
    for i in range(1, n):
        open_lobby(pages[i], False, NAMES[i])
        joined = add(pages[0], pages[i]) and joined
    return pages, joined


def play(cfg, browser, base):
    n = cfg['players']
    errors = []
    pages, joined = setup(browser, base, n, errors)
    check(f'{n} players: every phone joined the lobby', joined)
    for p in pages:
        p.evaluate(POPUP_WATCH_JS)
    pages[0].get_by_role('button', name='Start').click()
    in_game = wait_for(lambda: all(p.locator('.screen.game').count() == 1 for p in pages), 15)
    check(f'{n} players: Start puts every phone in the game', in_game)
    infos = [p.evaluate('window.pubbyNet.info()') for p in pages]
    check(f'{n} players: each phone plays its own seat (host p1)',
          [i and i['me'] for i in infos] == [f'p{k + 1}' for k in range(n)] and infos[0]['role'] == 'host'
          and all(i['role'] == 'join' for i in infos[1:]), json.dumps(infos))

    # Only the dealer's phone can deal (round 1: the host).
    time.sleep(2)
    sel = '[aria-label^="First card to"], [aria-label^="Deal a card to"]'
    watcher_taps = sum(p.locator(sel).count() for p in pages[1:])
    dealer_taps = pages[0].locator(sel).count()
    check(f'{n} players: only the dealer can deal', dealer_taps == n and watcher_taps == 0, f'dealer {dealer_taps}, others {watcher_taps}')
    check(f'{n} players: other phones see "X is dealing"', all(p.get_by_text(f'{NAMES[0]} is dealing').count() for p in pages[1:]))

    # A forged move (another player's) and a move by a phone for itself out of turn are refused.
    forged = pages[1].evaluate("window.pubbyNet.send([{ type: 'autoDealStart', by: 'p1', firstSeat: 'p1' }])")
    time.sleep(0.6)
    t1 = pages[1].locator('.toast').all_inner_texts()
    check(f'{n} players: a move for another player is refused', forged and any('own player' in t for t in t1), str(t1))
    pages[1].evaluate("window.pubbyNet.send([{ type: 'autoDealStart', by: 'p2', firstSeat: 'p1' }])")
    time.sleep(0.6)
    t2 = pages[1].locator('.toast').all_inner_texts()
    check(f'{n} players: dealing from a phone that isn\'t the dealer is refused', any('dealer' in t for t in t2), str(t2))

    for p in pages:
        p.evaluate(BOT)
    leaks = []
    mismatch = []
    turns_by = set()
    t0 = time.time()
    last_progress = time.time()
    last_log = -1
    done = False
    acts = {}
    shots = set()
    shot_dir = pathlib.Path('/tmp/pubby-net-shots')
    shot_dir.mkdir(exist_ok=True)
    while time.time() - t0 < 900:
        for i, p in enumerate(pages):
            act = p.evaluate('cfg => window.pubbyBot.step(cfg)', cfg)
            key = act.split(' ')[0]
            acts[key] = acts.get(key, 0) + 1
            if act.startswith('play ') or act.startswith('pick up') or act.startswith('forfeit'):
                turns_by.add(i)
        snaps = [p.evaluate(SNAP_JS) for p in pages]
        # Screenshots of a joining phone for a look by eye (not checked).
        s1 = snaps[1]
        if s1 and s1['phase'] not in shots and not pages[1].locator('.popup-overlay').count():
            shots.add(s1['phase'])
            pages[1].screenshot(path=str(shot_dir / f'{n}p-{s1["phase"]}.png'))
        for i, p in enumerate(pages[1:], start=1):
            lk = p.evaluate(LEAKS_JS)
            if lk:
                leaks.append((i, lk[:3]))
        h = snaps[0]
        if h and h['log'] != last_log:
            last_log = h['log']
            last_progress = time.time()
        # Once every phone has the host's latest log, they must agree.
        if h and all(s and s['log'] == h['log'] for s in snaps):
            for i, s in enumerate(snaps[1:], start=1):
                if (s['phase'], s['round'], s['turn'], s['counts'], s['scores']) != (h['phase'], h['round'], h['turn'], h['counts'], h['scores']):
                    mismatch.append((i, s, h))
        if all(p.get_by_text('Final standings').count() for p in pages):
            done = True
            break
        if time.time() - last_progress > 45:
            break
        time.sleep(0.05)
    check(f'{n} players: game played to the end on every phone', done,
          '' if done else f'stuck: {[p.evaluate(SNAP_JS) for p in pages]} {[p.locator("main").inner_text()[:160] for p in pages]}')
    check(f'{n} players: no phone ever held another player\'s card', not leaks, str(leaks[:3]))
    check(f'{n} players: every phone agreed with the host (phase, turn, card counts, scores)', not mismatch, str(mismatch[:1]))
    check(f'{n} players: every phone played its own cards', turns_by == set(range(n)), str(sorted(turns_by)))
    if cfg['players'] <= 3:
        check(f'{n} players: hidden swap on each phone', acts.get('keep', 0) + acts.get('swap', 0) >= n, json.dumps(acts))
    print('   bot actions:', json.dumps(acts), flush=True)
    snaps = [p.evaluate(SNAP_JS) for p in pages]
    check(f'{n} players: same final standings on every phone', all(s['ended'] == snaps[0]['ended'] for s in snaps) and snaps[0]['ended'], str([s['ended'] for s in snaps]))
    pops = [p.evaluate('window.__pops') for p in pages]
    check(f'{n} players: pop-ups shown on every phone', all(x['other'] > 0 for x in pops), json.dumps(pops))
    slaps = [x['slap'] for x in pops]
    check(f'{n} players: SLAP! pop-ups shown on every phone alike', len(set(slaps)) == 1, str(slaps))
    recs = [json.loads(p.evaluate("localStorage.getItem('pubby.gameRecords') || '[]'")) for p in pages]
    check(f'{n} players: the game is saved on every phone', all(len(r) == 1 for r in recs), str([len(r) for r in recs]))
    profs = [json.loads(p.evaluate("localStorage.getItem('pubby.profiles') || '{}'")) for p in pages]
    own = all(len(profs[i].get(NAMES[i], {}).get('games', [])) == 1 for i in range(n))
    check(f'{n} players: each phone adds the game to its own profile', own)
    saved = [p.evaluate("localStorage.getItem('pubby.currentGame')") for p in pages]
    check(f'{n} players: a network game is not saved as the one-phone game', all(x in (None, 'null') for x in saved), str(saved))
    # Host goes home first: a phone still on game over keeps its screen.
    pages[0].get_by_role('button', name='Back to home').click()
    time.sleep(1.5)
    check(f'{n} players: phones keep the game over screen when the host leaves', all(p.get_by_text('Final standings').count() for p in pages[1:]))
    pages[1].get_by_role('button', name='Back to home').click()
    check(f'{n} players: Back to home on a joining phone', pages[1].get_by_role('button', name='Play on several phones').count() == 1)
    check(f'{n} players: no page errors', not errors, '; '.join(errors[:3]))
    for p in pages:
        p.context.close()


def leaving(browser, base):
    errors = []
    pages, joined = setup(browser, base, 3, errors)
    pages[0].get_by_role('button', name='Start').click()
    wait_for(lambda: all(p.locator('.screen.game').count() == 1 for p in pages), 15)
    # A joining phone leaves from the menu (asks first).
    pages[2].get_by_role('button', name='Menu').click()
    pages[2].get_by_role('button', name='Leave the game').click()
    check('leaving: asks first', pages[2].get_by_role('button', name='Tap again to leave the game').count() == 1)
    pages[2].get_by_role('button', name='Tap again to leave the game').click()
    check('leaving: the phone is back on the main menu', wait_for(lambda: pages[2].get_by_role('button', name='Play on several phones').count() == 1, 5))
    check('leaving: the host and the others are told', wait_for(lambda: all(p.locator('.net-lost').count() == 1 for p in pages[:2]), 8),
          pages[0].locator('main').inner_text()[:200])
    # A one-phone game saved before is still there after a network game.
    # The host closes the game: the other phone is told.
    pages[0].get_by_role('button', name='Menu').click()
    pages[0].get_by_role('button', name='Close the game').click()
    pages[0].get_by_role('button', name='Tap again: close the game on every phone').click()
    check('closing: host back on the main menu', wait_for(lambda: pages[0].get_by_role('button', name='Play on several phones').count() == 1, 5))
    check('closing: the other phone sees "Game closed"', wait_for(lambda: pages[1].get_by_text('Game closed').count() == 1, 8),
          pages[1].locator('main').inner_text()[:200])
    check('leaving and closing: no page errors', not errors, '; '.join(errors[:3]))
    for p in pages:
        p.context.close()


def one_phone_game_kept(browser, base):
    """A one-phone game saved on the host's phone survives a network game."""
    errors = []
    host = new_page(browser, base, errors, 'host')
    host.evaluate("""() => localStorage.setItem('pubby.profiles', JSON.stringify({}))""")
    host.get_by_role('button', name='New game').click()
    for name in ['Amy', 'Zed']:
        host.get_by_label('New player name').fill(name)
        host.get_by_role('button', name='Add', exact=True).click()
    host.get_by_role('button', name='Start game · 2 players').click()
    host.wait_for_selector('.screen.game')
    before = host.evaluate("localStorage.getItem('pubby.currentGame')")
    host.get_by_role('button', name='Menu').click()
    host.get_by_role('button', name='Home (game is kept)').click()
    joiner = new_page(browser, base, errors, 'joiner')
    open_lobby(host, True, 'Amy')
    open_lobby(joiner, False, 'Ben')
    add(host, joiner)
    host.get_by_role('button', name='Start').click()
    wait_for(lambda: joiner.locator('.screen.game').count() == 1, 10)
    mid = host.evaluate("localStorage.getItem('pubby.currentGame')")
    host.get_by_role('button', name='Menu').click()
    host.get_by_role('button', name='Close the game').click()
    host.get_by_role('button', name='Tap again: close the game on every phone').click()
    after = host.evaluate("localStorage.getItem('pubby.currentGame')")
    check('one-phone game kept: still saved during and after a network game', before == mid == after and before not in (None, 'null'))
    check('one-phone game kept: Carry on is back on the main menu', host.get_by_role('button', name='Carry on game (round 1)').count() == 1)
    check('one-phone game kept: no page errors', not errors, '; '.join(errors[:3]))
    host.context.close()
    joiner.context.close()


def main():
    import sys
    only = sys.argv[1:]  # e.g. "2", "leaving", "kept"; nothing = everything
    dist = ROOT / 'dist'
    httpd = serve(dist)
    base = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        for cfg in GAMES:
            if not only or str(cfg['players']) in only:
                play(cfg, browser, base)
        if not only or 'leaving' in only:
            leaving(browser, base)
        if not only or 'kept' in only:
            one_phone_game_kept(browser, base)
        browser.close()
    httpd.shutdown()
    print(f'\n{sum(results)} of {len(results)} checks passed')
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
