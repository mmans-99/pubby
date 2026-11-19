"""Voice chat check (CODE.md 9aq.13 item 2, 3.0.0): three phones in an online room.

Runs the built app (dist/) through a local relay (testbed/relay_server.ts, which
has the /turn route and answers STUN only). Chrome's fake camera and mic
(--use-fake-ui-for-media-stream, --use-fake-device-for-media-stream) give a mic
with a beeping tone. Host Amy, joiners Ben and Cat.

  1  the mic and Voice buttons are on the lobby screens of all three phones
  2  Ben turns the mic on: Amy and Cat show "Mic on" for Ben
  3  Ben talks: a talk ring shows on the other two phones
  4  Cat mutes Ben: Cat shows "Muted by you", and no ring for Ben on Cat's phone
  5  Cat unmutes Ben
  6  Ben's page is hidden: Ben's mic goes off, and Amy and Cat show "Mic off"
  7  the Voice sheet opens on a phone, with its rows, Mute all and Unmute all
  8  no page errors

Usage: npm run build && python3 testbed/voice_check.py
       python3 testbed/voice_check.py --repeat 20 --trace

--repeat N   runs the whole check N times, each with a fresh relay and browser (9aq.15 B2).
--trace      during step 3 saves the ?voicedebug snapshot of all three pages every 250 ms to
             testbed/out/voice_trace_<run>.json, and prints a suggested H1 to H5 for a missed ring.
             Every page loads with ?voicedebug (the testbed adds it; players never see it).
"""

import argparse
import array
import json
import math
import struct
import sys
import tempfile
import time
import pathlib
import wave

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'testbed'))

import online_check as oc  # noqa: E402  (the room helpers and the local relay)

ROOM = 'Voice table'
CODE = '5150'
OUT = ROOT / 'testbed' / 'out'
TALK_LEVEL = 0.02  # src/net/voice.ts TALK_LEVEL
DEBUG = '&voicedebug'


def tone_wav(seconds=600, rate=48000):
    """A speech-like fake mic: phrases of a wandering tone (0.8 s on, 0.2 s pause, repeated).

    A steady tone counts as background to noise suppression, so the level flickers; phrases with
    short pauses read as talking, the way a voice does. Long enough for the whole run.
    """
    path = pathlib.Path(tempfile.gettempdir()) / 'pubby_voice_tone.wav'
    out = array.array('h')
    for i in range(rate * seconds):
        t = i / rate
        phase = t % 1.0
        if phase >= 0.8:
            out.append(0)
            continue
        f = 220 + 80 * math.sin(2 * math.pi * 0.7 * t)
        env = 0.5 * (1 - math.cos(math.pi * phase / 0.8))  # soft edges, like a syllable
        out.append(int(0.5 * env * 32767 * math.sin(2 * math.pi * f * t)))
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(out.tobytes())
    return path


def mic_button(page):
    return page.locator('button.mic-btn')


def chip(page, text):
    return page.locator('.voice-chip', has_text=text)


def talking_rings(page):
    # The lobby rings the seat number; the table rings the seat disc. Both carry data-voice.
    return page.locator('[data-voice].talking').count()


def hide_page(page):
    """Simulates the phone's screen going off (visibilitychange with the page hidden)."""
    page.evaluate("""() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")


def show_page(page):
    page.evaluate("""() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")


SNAP_JS = "() => (window.__pubbyVoice ? window.__pubbyVoice.snapshot() : null)"


def watch_talk(pages, listeners, seconds, trace):
    """9aq.15 B2: waits up to `seconds` for a talk ring on each listener, polling every 250 ms.

    With trace, every page's snapshot is kept in each poll. Returns (rang per listener, frames).
    """
    frames = []
    rang = {name: False for name in listeners}
    end = time.time() + seconds
    while time.time() < end:
        frame = {'t': round(time.time(), 3)} if trace else None
        for name, page in pages.items():
            if trace:
                try:
                    frame[name] = page.evaluate(SNAP_JS)
                except Exception as e:  # a page can close mid-run; the trace says so
                    frame[name] = {'error': str(e)[:200]}
        for name in listeners:
            if not rang[name]:
                rang[name] = pages[name].locator('[data-voice].talking').count() >= 1
        if trace:
            frames.append(frame)
        if all(rang.values()):
            break
        time.sleep(0.25)
    return rang, frames


def diagnose(frames, talker, listener, host):
    """9aq.15 B3: a suggested H1 to H5 for a missed ring, read from the trace. Opus confirms; this only points."""
    if not frames:
        return 'no trace'
    talker_id = None
    for f in reversed(frames):
        snap = f.get(talker) or {}
        if snap.get('me'):
            talker_id = snap['me']
            break
    last_listener = next((f[listener] for f in reversed(frames) if f.get(listener)), None)
    if not last_listener or talker_id is None:
        return 'no snapshot for the listener or the talker'
    host_snap = frames[-1].get(host) or {}
    dropped = sum((host_snap.get('vsigDropped') or {}).values())
    pair = (last_listener.get('peers') or {}).get(talker_id)
    if pair is None:
        return f'no pair with the talker ({talker_id}) on {listener}; host dropped {dropped}: H1 if dropped > 0'
    link = pair.get('link') or {}
    state = link.get('connectionState')
    ctx_states = {f[listener].get('audioContext') for f in frames if f.get(listener)}
    peak = max((f[listener]['peers'][talker_id].get('maxLevel2s', 0) for f in frames
                if f.get(listener) and talker_id in (f[listener].get('peers') or {})), default=0)
    track = link.get('remoteTrack') or {}
    if state != 'connected':
        return f'link {state}; host dropped {dropped}: ' + ('H1' if dropped > 0 else 'not connected and no drops counted (cause not on the list)')
    if 'suspended' in ctx_states and peak == 0:
        return 'H2: connected, AudioContext suspended, level 0'
    if track.get('readyState') != 'live':
        return f'H4: remote track {track.get("readyState")}'
    if 0 < peak < TALK_LEVEL:
        return f'H3: connected, context {sorted(ctx_states)}, peak level {peak} under {TALK_LEVEL}'
    if peak >= TALK_LEVEL:
        return f'H5: level fine (peak {peak}), the ring came late or not at all'
    return f'not on the list: level 0 with a live track, context {sorted(ctx_states)}'


class RunAborted(Exception):
    """9aq.17 C: a join failed. The run ends here; the batch goes on with the next run."""


def abort_run(name, pages):
    """Records the failed check, prints each page's step and the start of its screen, then ends the run."""
    oc.check(name, False)
    for label, page in pages.items():
        try:
            step = oc.step_of(page)
        except Exception as e:  # the page may be gone
            step = f'? ({str(e)[:80]})'
        try:
            text = page.inner_text('body')[:300]
        except Exception as e:
            text = f'? ({str(e)[:80]})'
        print(f'  {label}: step {step}; screen: {text!r}', flush=True)
    raise RunAborted(name)


def run(browser, base, errors, run_no=1, trace=False):
    proc, server = oc.start_relay()
    try:
        amy = oc.new_page(browser, base, server, errors, 'Amy', DEBUG)
        ben = oc.new_page(browser, base, server, errors, 'Ben', DEBUG)
        cat = oc.new_page(browser, base, server, errors, 'Cat', DEBUG)
        pages = {'Amy': amy, 'Ben': ben, 'Cat': cat}
        if not oc.host_room(amy, 'Amy', ROOM, CODE):
            abort_run('Amy makes the voice table', pages)
        oc.check('Amy makes the voice table', True)
        if not (oc.watch_list(ben, 'Ben') and oc.wait_for(lambda: oc.in_list(ben, ROOM), 8)):
            abort_run('Ben sees the voice table in the room list', pages)
        oc.join_room(ben, ROOM, CODE)
        if not oc.wait_for(lambda: oc.step_of(ben) == 'lobby', 20):
            abort_run('Ben joins the voice table', pages)
        oc.check('Ben joins the voice table', True)
        if not (oc.watch_list(cat, 'Cat') and oc.wait_for(lambda: oc.in_list(cat, ROOM), 8)):
            abort_run('Cat sees the voice table in the room list', pages)
        oc.join_room(cat, ROOM, CODE)
        if not oc.wait_for(lambda: oc.step_of(cat) == 'lobby', 20):
            abort_run('Cat joins the voice table', pages)
        oc.check('Cat joins the voice table', True)

        # 1: the controls are there on every lobby.
        for label, p in (('Amy', amy), ('Ben', ben), ('Cat', cat)):
            ok = oc.wait_for(lambda p=p: mic_button(p).count() == 1 and p.get_by_role('button', name='Voice').count() == 1, 20)
            oc.check(f'{label} sees the mic and Voice buttons', ok)

        # 2: Ben turns the mic on; the others see it. The first-time hint shows until the first tap.
        oc.check('Ben starts with the mic off', oc.wait_for(lambda: mic_button(ben).get_attribute('aria-pressed') == 'false', 10))
        oc.check('a first-time phone shows "Mic is off until you tap it."', ben.get_by_text('Mic is off until you tap it.').count() == 1)
        mic_button(ben).click()
        oc.check('the hint goes after the first tap', oc.wait_for(lambda: ben.get_by_text('Mic is off until you tap it.').count() == 0, 10))
        oc.check('Ben turns the mic on', oc.wait_for(lambda: mic_button(ben).get_attribute('aria-pressed') == 'true', 15))
        oc.check('Amy sees Ben\'s mic on', oc.wait_for(lambda: chip(amy, 'Mic on').count() >= 1, 20))
        oc.check('Cat sees Ben\'s mic on', oc.wait_for(lambda: chip(cat, 'Mic on').count() >= 1, 20))

        # 3: Ben talks (the fake tone); the others get a talk ring. Each phone is tapped once first, as a player would (sound needs a tap).
        for p in (amy, ben, cat):
            p.locator('body').click(position={'x': 4, 'y': 4})
        pages = {'Amy': amy, 'Ben': ben, 'Cat': cat}
        rang, frames = watch_talk(pages, ('Amy', 'Cat'), 25, trace)
        if trace:
            OUT.mkdir(exist_ok=True)
            path = OUT / f'voice_trace_{run_no:02d}.json'
            path.write_text(json.dumps(frames, indent=1))
        oc.check('Amy sees a talk ring while Ben talks', rang['Amy'])
        oc.check('Cat sees a talk ring while Ben talks', rang['Cat'])
        if trace and not (rang['Amy'] and rang['Cat']):
            for name in ('Amy', 'Cat'):
                if not rang[name]:
                    print(f'  H-suggest ({name} listening to Ben): {diagnose(frames, "Ben", name, "Amy")}', flush=True)
                    last = next((f[name] for f in reversed(frames) if f.get(name)), None)
                    print(f'  last snapshot on {name}: {json.dumps(last)}', flush=True)

        # 4 and 5: Cat mutes Ben, then unmutes.
        cat.get_by_role('button', name='Mute Ben').click()
        oc.check('Cat shows Ben as muted', oc.wait_for(lambda: chip(cat, 'Muted by you').count() == 1, 10))
        saved = cat.evaluate("() => localStorage.getItem('pubby.voice')")
        oc.check('the mute is kept by name in pubby.voice', saved is not None and '"ben"' in saved, str(saved))
        oc.check('Cat sees no talk ring for a muted Ben', oc.wait_for(lambda: talking_rings(cat) == 0, 6))
        cat.get_by_role('button', name='Unmute Ben').click()
        oc.check('Cat unmutes Ben', oc.wait_for(lambda: cat.get_by_role('button', name='Mute Ben').count() == 1, 10))

        # 6: Ben's phone is hidden: the mic goes off everywhere.
        hide_page(ben)
        oc.check('a hidden phone turns its mic off', oc.wait_for(lambda: mic_button(ben).get_attribute('aria-pressed') == 'false', 10))
        oc.check('Amy sees Ben\'s mic off', oc.wait_for(lambda: chip(amy, 'Mic off').count() >= 1, 15))
        show_page(ben)
        # The mic stays off when the phone shows again (by design); Ben taps it back on for the table checks.
        mic_button(ben).click()
        oc.check('Ben turns his mic back on once his phone shows again', oc.wait_for(lambda: mic_button(ben).get_attribute('aria-pressed') == 'true', 10))
        oc.check('Amy sees Ben\'s mic on again', oc.wait_for(lambda: chip(amy, 'Mic on').count() >= 1, 15))

        # 7: the Voice sheet opens with its rows and the two buttons.
        amy.get_by_role('button', name='Voice').click()
        sheet = amy.locator('.voice-sheet')
        oc.check('the Voice sheet opens on Amy\'s phone', oc.wait_for(lambda: sheet.count() == 1, 8))
        oc.check('the Voice sheet has Mute all and Unmute all',
                 sheet.get_by_role('button', name='Mute all', exact=True).count() == 1 and sheet.get_by_role('button', name='Unmute all', exact=True).count() == 1)
        oc.check('the Voice sheet has a row for each other person', sheet.locator('.voice-row').count() == 2)
        amy.get_by_role('button', name='Close Voice').click()
        oc.check('the Voice sheet closes', oc.wait_for(lambda: sheet.count() == 0, 8))

        # 8: the table. The game starts; Ben's table has the mic button, the discs carry the voice
        # attribute, and a tap on another person's seat opens its card with Mute.
        amy.get_by_role('button', name='Start game').click()
        oc.check('the game starts on all three phones', oc.wait_for(lambda: all(p.locator('.screen.game').count() == 1 for p in (amy, ben, cat)), 25))
        oc.check('a talk ring shows on the table while Ben talks', oc.wait_for(lambda: talking_rings(amy) >= 1, 15),
                 f"ben mic pressed={mic_button(ben).get_attribute('aria-pressed') if mic_button(ben).count() else 'none'} "
                 f"audios={amy.evaluate("() => [...document.querySelectorAll('audio')].map(a => [a.paused, a.muted, a.readyState])")} "
                 f"discs={amy.evaluate("() => [...document.querySelectorAll('[data-voice]')].map(e => e.className)")} "
                 f"chips={amy.locator('.voice-chip').all_inner_texts()}")
        # No flash: once the table has settled, the seat discs stay the same elements while Ben talks.
        # (The game's own deal steps redraw the table; the voice code must not add redraws.)
        time.sleep(4)
        amy.evaluate("() => { window.__disc = document.querySelector('.seat-disc[data-voice]'); }")
        time.sleep(4)
        oc.check('the seat discs keep their elements while people talk (no redraw)',
                 amy.evaluate("() => window.__disc !== undefined && window.__disc !== null && window.__disc.isConnected"))
        oc.check('Ben\'s table has the mic button', oc.wait_for(lambda: ben.locator('button.table-mic').count() == 1, 10))
        oc.check('Amy\'s table discs carry the voice attribute', oc.wait_for(lambda: amy.locator('.seat-disc[data-voice]').count() >= 2, 10),
                 str(amy.locator('.seat-disc[data-voice]').count()))
        # The seat card is for taps nothing else uses. In the deal, other seats are taken by the
        # game (take and watch), so the card is checked only when the seats are plain.
        if amy.locator('div.seat-quiet[data-seat]').count() > 0:
            amy.locator('div.seat-quiet[data-seat]').first.click()
            oc.check('a tap on another seat opens its card', oc.wait_for(lambda: amy.locator('.voice-seat-card').count() == 1, 8))
            oc.check('the seat card has a Mute button', amy.locator('.voice-seat-card').get_by_role('button', name='Mute', exact=False).count() == 1)
        else:
            print('SKIP the seat card: other seats are taken by the game at this stage (not a voice fault)', flush=True)

        oc.check('no page errors', not errors, '; '.join(errors[:3]))
        for p in (amy, ben, cat):
            p.context.close()
    finally:
        oc.stop_relay(proc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repeat', type=int, default=1, help='runs of the whole check (fresh relay and browser each)')
    ap.add_argument('--trace', action='store_true', help='save the step-3 snapshots to testbed/out/')
    args = ap.parse_args()
    httpd = oc.serve(ROOT / 'dist')
    base = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    per_run = []
    for n in range(1, args.repeat + 1):
        errors = []
        start = len(oc.results)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path='/usr/bin/google-chrome',
                args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                      f'--use-file-for-fake-audio-capture={tone_wav()}', '--autoplay-policy=no-user-gesture-required'],
            )
            try:
                run(browser, base, errors, run_no=n, trace=args.trace)
            except RunAborted as e:
                print(f'run {n} ended early: {e}', flush=True)
            finally:
                browser.close()
        this = oc.results[start:]
        per_run.append(all(this))
        print(f'\nrun {n}: {sum(this)} of {len(this)} checks passed', flush=True)
    httpd.shutdown()
    if args.repeat > 1:
        print(f'\n{sum(per_run)} of {len(per_run)} runs passed every check')
    print(f'\n{sum(oc.results)} of {len(oc.results)} checks passed')
    raise SystemExit(0 if all(oc.results) else 1)


if __name__ == '__main__':
    main()
