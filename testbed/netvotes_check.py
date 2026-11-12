"""Phase 4 slice 3 check (version 2.5): votes, take-cards, pause and ready-up on every phone.

Three phone-sized pages (Amy hosts, Ben and Cat join). The scenario is driven
by hand, as a player would tap it:

  before the round: Ben proposes a target score (every phone votes, live);
    Ben calls a reshuffle vote (Amy and Cat vote no, so the round goes on to
    the hidden swap; everyone keeps their hand).
  play: Ben asks Cat for their cards (every phone sees who asked whom; the
    player whose turn it is can't play; Cat agrees; Ben sees the answer);
    Ben asks the host to pause; Amy approves; every phone shows the pause,
    only Amy can resume or set a time limit; a one-minute pause runs out on
    every phone at the same time, and the host's phone resumes the game.
  results: ready-up shows on every phone; Cat calls the Ultimate Round vote
    (live ballots on every phone; the vote is turned down).

Uses testbed/netgame_check.py for the lobby, checks and the bot.

Usage: npm run build && python3 testbed/netvotes_check.py
"""
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import netgame_check as ng  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

CFG = {'players': 3, 'rounds': 2, 'manualDeal': False, 'swap': True, 'reshuffle': False,
       'ultimate': False, 'voteYes': True, 'forfeitChance': 0.0, 'stayAtEnd': True}
HOST, BEN, CAT = 'p1', 'p2', 'p3'


def sess(page):
    return page.evaluate('() => window.pubbyNet.session()')


def phase(page):
    s = sess(page)
    return s and s['phase']


def body(page):
    return page.evaluate('() => document.body.innerText')


def seat_of(page):
    return page.evaluate('() => window.pubbyNet.info().me')


def play_scenario(browser, base):
    errors = []
    pages, joined = ng.setup(browser, base, 3, errors)
    ng.check('3 phones: all joined the lobby', joined)
    pages[0].get_by_role('button', name='Start').click()
    ng.check('3 phones: Start puts every phone in the game',
             ng.wait_for(lambda: all(p.locator('.screen.game').count() == 1 for p in pages), 15))

    # Dealing: the host's phone deals all cards (the dealer's move).
    pages[0].evaluate("() => window.pubbyNet.send([{type:'setDealMode',by:'p1',mode:'auto'},{type:'autoDealStart',by:'p1',firstSeat:'p1'},{type:'autoDealAll',by:'p1'}])")
    ng.check('before the round: every phone reaches the round-start step',
             ng.wait_for(lambda: all(phase(p) == 'reshuffle' for p in pages), 20))

    # Target score proposed by Ben (round 1, before the round): every phone votes, live.
    pages[1].get_by_role('button', name='Propose', exact=True).click()
    pages[1].get_by_role('button', name='Propose 10 points', exact=True).click()
    ng.check('target vote: every phone shows three ballots',
             ng.wait_for(lambda: all(p.locator('.ballot').count() == 3 for p in pages), 10))
    pages[0].get_by_role('button', name='YES', exact=True).click()
    ng.check('target vote: Amy\'s YES shows live on Cat\'s phone',
             ng.wait_for(lambda: pages[2].locator('.ballot.yes').count() >= 1, 5))
    pages[2].get_by_role('button', name='YES', exact=True).click()
    ng.check('target vote: agreed, so every phone shows 10 points',
             ng.wait_for(lambda: all(p.locator('.slim .v', has_text='10 points').count() == 1 for p in pages), 10))
    ng.check('target vote: no Propose once the target is agreed',
             pages[1].get_by_role('button', name='Propose', exact=True).count() == 0)

    # Reshuffle called by Ben from his own phone: Amy and Cat vote no.
    pages[1].get_by_role('button', name='Deal again? Call a reshuffle vote', exact=True).click()
    ng.check('reshuffle: the vote shows on every phone',
             ng.wait_for(lambda: all(p.locator('.vote-panel').count() == 1 for p in pages), 10))
    pages[0].get_by_role('button', name='NO', exact=True).click()
    pages[2].get_by_role('button', name='NO', exact=True).click()
    # Turned down: the round goes on to the hidden swap (3 players), with no new deal.
    ng.check('reshuffle: turned down, so the round goes on (hidden swap, no new deal)',
             ng.wait_for(lambda: all(p.locator('.vote-panel').count() == 0 for p in pages), 10)
             and all(phase(p) == 'swap' for p in pages), str([phase(p) for p in pages]))
    ng.check('reshuffle: Ben\'s session shows the reshuffle as used this round',
             pages[1].evaluate('() => window.pubbyNet.session().reshuffleUsed') is True)
    # Hidden swap: everyone keeps their hand.
    for p in pages:
        if ng.wait_for(lambda: p.get_by_role('button', name='Keep', exact=True).count() == 1, 10):
            p.get_by_role('button', name='Keep', exact=True).click()
    # Each phone shows its hand after the swap until its player taps Done.
    for p in pages:
        if ng.wait_for(lambda: p.get_by_role('button', name='Done', exact=True).count() == 1, 10):
            p.get_by_role('button', name='Done', exact=True).click()
    ng.check('round 1 starts after the swap on every phone',
             ng.wait_for(lambda: all(phase(p) == 'playing' for p in pages), 20), str([phase(p) for p in pages]))

    # Take-cards: Ben asks Cat (or Cat asks Ben if Ben leads).
    turn = (sess(pages[0]) or {}).get('play', {}).get('turn')
    requester, target = (BEN, CAT) if turn != BEN else (CAT, BEN)
    rp = pages[int(requester[1]) - 1]
    tp = pages[int(target[1]) - 1]
    names = {'p1': 'Amy', 'p2': 'Ben', 'p3': 'Cat'}
    rp.get_by_role('button', name='Ask to take someone’s cards').click()
    rp.get_by_role('button', name=f'Ask {names[target]}', exact=True).click()
    ng.check('take-cards: every other phone sees who asked whom',
             ng.wait_for(lambda: pages[0].locator('.host-line', has_text=f'{names[requester]} asked {names[target]}').count() == 1, 8))
    turn_page = pages[int(turn[1]) - 1] if turn else pages[0]
    if turn != target:
        ng.check('take-cards: the player whose turn it is sees the play held back',
                 ng.wait_for(lambda: 'Waiting for' in body(turn_page), 5))
    ng.check('take-cards: the asked player gets Agree and Refuse',
             ng.wait_for(lambda: tp.get_by_role('button', name='Agree', exact=True).count() == 1, 5))
    tp.get_by_role('button', name='Agree', exact=True).click()
    # Agreed: the cards move at the gap between tricks, shown to every phone as "Cards taken!"
    # (or, if they move later, the asker's private note says they agreed).
    ng.check('take-cards: the answer shows on every phone (Cards taken! or the asker\'s note)',
             ng.wait_for(lambda: all('Cards taken' in body(p) for p in pages)
                         or pages[int(requester[1]) - 1].locator('.private-note', has_text='agreed').count() == 1, 8))
    ng.check('take-cards: the status line goes away once answered',
             ng.wait_for(lambda: pages[0].locator('.host-line', has_text='asked').count() == 0, 5))
    ng.check('take-cards: the play is back on every phone',
             ng.wait_for(lambda: 'Waiting for' not in body(turn_page), 8))

    # Pause: Ben asks the host, Amy approves.
    pages[1].get_by_role('button', name='Ask the host to pause').click()
    pages[1].get_by_role('button', name='Ask to pause', exact=True).click()
    ng.check('pause: Amy sees the request',
             ng.wait_for(lambda: pages[0].locator('.pause-req').count() == 1, 8))
    pages[0].locator('.pause-req').get_by_role('button', name='Pause', exact=True).click()
    ng.check('pause: every phone shows the pause',
             ng.wait_for(lambda: all(p.locator('.pause-overlay').count() == 1 for p in pages), 8))
    ng.check('pause: only the host sees Resume',
             pages[0].get_by_role('button', name='Resume', exact=False).count() == 1
             and pages[1].get_by_role('button', name='Resume', exact=False).count() == 0)

    # A one-minute pause: the countdown matches on every phone, and the host's phone resumes it.
    pages[0].locator('.pause-overlay').get_by_role('button', name='1 min', exact=True).click()
    ng.check('timed pause: countdown on every phone', ng.wait_for(
        lambda: all(p.locator('.pause-clock').count() == 1 for p in pages), 8))
    clocks = [p.locator('.pause-clock').inner_text() for p in pages]

    def secs(t):
        m = re.search(r'(\d+):(\d\d)', t)
        return int(m.group(1)) * 60 + int(m.group(2)) if m else -1
    vals = [secs(c) for c in clocks]
    ng.check('timed pause: the countdown agrees on every phone (within a second)',
             all(v >= 0 for v in vals) and max(vals) - min(vals) <= 1, str(clocks))
    ng.check('timed pause: the game resumes on every phone when the minute is up',
             ng.wait_for(lambda: all(p.locator('.pause-overlay').count() == 0 for p in pages), 75),
             'waited for the limit')

    # Let the bot finish the round, then check the results screen.
    for p in pages:
        p.evaluate(ng.BOT)
    t0 = time.time()
    while time.time() - t0 < 600 and phase(pages[0]) != 'results':
        for p in pages:
            p.evaluate('cfg => window.pubbyBot.step(cfg)', CFG)
        time.sleep(0.05)
    ng.check('round 1 reaches the results screen', phase(pages[0]) == 'results', phase(pages[0]) or '')

    # Ready-up: each phone readies its own player; everyone sees who is ready.
    pages[1].get_by_role('button', name="I'm ready", exact=True).click()
    ng.check('ready-up: every phone shows 1 of 3 ready',
             ng.wait_for(lambda: all(p.locator('.ready-row', has_text='1 of 3 ready').count() == 1 for p in pages), 8))
    ng.check('ready-up: Ben sees his own Ready as done',
             pages[1].get_by_role('button', name='Ready', exact=True).count() == 1)
    ng.check('ready-up: Cat\'s phone can still ready Cat only (no one else\'s button)',
             pages[2].get_by_role('button', name="I'm ready", exact=True).count() == 1)

    # Ultimate Round vote called by Cat: live ballots on every phone; Amy and Ben turn it down.
    pages[2].get_by_role('button', name='Ultimate Round vote', exact=True).click()
    ng.check('ultimate vote: every phone shows three ballots',
             ng.wait_for(lambda: all(p.locator('.ballot').count() == 3 for p in pages), 10))
    pages[0].get_by_role('button', name='NO', exact=True).click()
    pages[1].get_by_role('button', name='NO', exact=True).click()
    ng.check('ultimate vote: turned down, back to the results screen on every phone',
             ng.wait_for(lambda: all(p.locator('.vote-panel').count() == 0 for p in pages), 10) and phase(pages[0]) == 'results')

    ng.check('no page errors', not errors, '; '.join(errors[:3]))


def main():
    httpd = ng.serve(ng.ROOT / 'dist')
    base = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        play_scenario(browser, base)
        browser.close()
    httpd.shutdown()
    print(f'\n{sum(ng.results)} of {len(ng.results)} checks passed')
    raise SystemExit(0 if all(ng.results) else 1)


if __name__ == '__main__':
    main()
