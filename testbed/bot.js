// Pubby playthrough bot. Injected into the built app (dist/index.html) by
// testbed/playthrough.py. Each call to window.pubbyBot.step(cfg) does one thing
// a player would do on the screen (tap a button, a card, a pad) and returns
// what it did, "wait" (something is animating) or "stuck".
// It only uses what is on screen, like a person would.
(() => {
  const visible = (el) => el && el.getClientRects().length > 0;
  const buttons = () => [...document.querySelectorAll('button')].filter((b) => !b.disabled && visible(b));
  const byText = (start) => buttons().find((b) => b.textContent.trim().startsWith(start));
  const byLabel = (start) => buttons().filter((b) => (b.getAttribute('aria-label') || '').startsWith(start));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const text = () => document.body.innerText;
  const st = (window.__bot = window.__bot || { log: [], problems: [], csv: [], shared: false, ultCalled: false, reshuffleCalled: false, swaps: 0, manualDeals: 0 });
  const problem = (m) => { st.problems.push(m); };

  function click(el, what) { el.click(); return what; }

  function seatCounts() {
    return [...document.querySelectorAll('.seat-strip')][0]
      ? [...document.querySelectorAll('.seat-strip')[0].querySelectorAll('.seat-count')]
        .map((x) => parseInt(x.textContent, 10)).filter((n) => !Number.isNaN(n))
      : [];
  }

  function step(cfg) {
    // Pop-ups first.
    const ok = document.querySelector('.popup-ok');
    if (visible(ok)) return click(ok, 'popup ' + (document.querySelector('.popup-title, .vote-word')?.textContent || ''));
    if (document.querySelector('.popup-overlay')) return 'wait';

    // CSV sheet (share sheet fallback).
    const box = document.querySelector('textarea.csv-box');
    if (visible(box)) {
      st.csv.push(box.value);
      return click(byText('Close'), 'csv sheet read and closed');
    }

    // Reaction Tap.
    const go = document.querySelector('.tap-pad.go');
    if (visible(go)) { go.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 'reaction tap'; }
    if (visible(document.querySelector('.tap-pad.wait'))) return 'wait';
    const start = document.querySelector('button.tap-start');
    if (visible(start)) return click(start, 'reaction start');
    const done = byText('Done · pass the phone on');
    if (done) return click(done, 'reaction done');

    // Votes.
    const yes = buttons().find((b) => b.textContent.trim() === 'YES');
    const no = buttons().find((b) => b.textContent.trim() === 'NO');
    if (yes && no) return cfg.voteYes ? click(yes, 'vote yes') : click(no, 'vote no');

    // Game over.
    if (/Final standings/.test(text()) && byText('Back to home')) {
      if (/could not be saved/.test(text())) problem('game over: game not saved');
      const share = byText('📤 Share game stats');
      if (share && !st.shared) { st.shared = true; return click(share, 'share game stats'); }
      if (!share) problem('game over: no share button');
      st.shared = false; st.ultCalled = false; st.reshuffleCalled = false;
      return click(byText('Back to home'), 'GAME OVER');
    }

    // Results screen.
    const ult = byText('Start the Ultimate Round');
    if (ult) return click(ult, 'start ultimate round');
    const next = byText('Next round');
    if (next) {
      const m = /Round (\d+)/.exec(document.querySelector('.banner .small')?.textContent || '');
      const round = m ? Number(m[1]) : 0;
      if (round < cfg.rounds) return click(next, `next round after ${round}`);
      if (cfg.ultimate && !st.ultCalled) {
        const callers = [...document.querySelectorAll('.name-chip')].filter((b) => /Called by/.test(b.getAttribute('aria-label') || ''));
        if (callers.length) { st.ultCalled = true; return click(callers[0], 'ultimate vote called'); }
        const call = byText('Call an Ultimate Round vote') || byText('Ask to play the Ultimate Round');
        if (call) return click(call, 'call ultimate vote');
      }
      const end = byText('Tap again') || byText('End the game');
      if (end) return click(end, 'end the game');
    }

    // Pass-the-phone screens.
    const me = buttons().find((b) => /^I'm .*, (show my cards|let me vote|let me answer|I'm ready)$/.test(b.textContent.trim()));
    if (me) return click(me, 'show my cards');

    // Hidden swap.
    const keep = byText('Keep my hand');
    if (keep) {
      if (cfg.swap && Math.random() < 0.5) {
        const cards = [...document.querySelectorAll('.hand .card[role="button"]')];
        const swapBtn = byText('Swap ');
        if (swapBtn && /Swap [12] card/.test(swapBtn.textContent)) {
          const n = parseInt(/Swap (\d)/.exec(swapBtn.textContent)[1], 10);
          if (n >= 2 || cards.length < 2) { st.swaps++; return click(swapBtn, 'swap cards'); }
        }
        const unpicked = cards.filter((c) => !c.classList.contains('selected'));
        if (unpicked.length) return click(pick(unpicked), 'pick card to swap');
      }
      return click(keep, 'keep hand');
    }

    // Final two choice.
    const pickUp = byText('Pick up the waste pile');
    if (pickUp) {
      if (Math.random() < cfg.forfeitChance) {
        const f = byText('Tap again to forfeit') || byText('Forfeit');
        if (f) return click(f, 'forfeit');
      }
      return click(pickUp, 'pick up waste pile');
    }

    // Playing a card.
    const playable = [...document.querySelectorAll('.hand .card.playable')];
    if (playable.length) {
      const playBtn = byText('Play ');
      if (playBtn && /^Play \S/.test(playBtn.textContent.trim()) && !/^Play a card/.test(playBtn.textContent.trim())) return click(playBtn, 'play ' + playBtn.textContent.trim().slice(5));
      return click(pick(playable), 'select card');
    }
    if (byText('Lead any card') || byText('Play a card')) problem('my turn but no playable card');

    // Hand screens: pass on.
    const hide = byText('Hide my cards ·');
    if (hide) return click(hide, 'hide my cards');

    // Dealing.
    const first = byLabel('First card to');
    if (first.length) return click(pick(first), 'first card to');
    const manual = byLabel('Deal a card to');
    if (manual.length) {
      if (cfg.manualDeal) {
        const before = seatCounts();
        if (before.length && Math.max(...before) - Math.min(...before) > 1) problem(`manual deal uneven: ${before.join(',')}`);
        st.manualDeals++;
        return click(pick(manual), 'manual deal card');
      }
      const auto = byText('Switch to auto deal') || byText('Back to auto deal');
      if (auto) return click(auto, 'switch to auto deal');
    }
    const rest = byText('Deal the rest now');
    if (rest) return click(rest, 'deal the rest');
    if (/Dealing clockwise/.test(text())) return 'wait';

    // Reshuffle phase.
    if (cfg.reshuffle && !st.reshuffleCalled) {
      const callers = byLabel('Called by');
      if (callers.length) { st.reshuffleCalled = true; return click(callers[0], 'reshuffle vote called'); }
      const call = byText('Call a reshuffle vote') || byText('Ask for a reshuffle');
      if (call) return click(call, 'call reshuffle vote');
    }
    const startRound = byText('Start the round (');
    if (startRound) return click(startRound, 'start the round');

    // Winner picks who leads.
    const leads = byLabel('Leads:');
    if (leads.length) return click(pick(leads), 'choose leader');

    return 'stuck';
  }

  window.pubbyBot = { step, state: st };
})();
