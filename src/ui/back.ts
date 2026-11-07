/**
 * The phone's back gesture / back button (Android). Without this, back leaves
 * the page and Pubby closes at once.
 *
 * How it works: Pubby keeps one extra "guard" entry in the browser history.
 * A back gesture pops it (a `popstate` event); Pubby then does its own back
 * step and puts the guard back. Back does, in order:
 *   1. close an open sheet: quick rules, the CSV sheet, the in-game menu, the
 *      "Exit Pubby?" question;
 *   2. in a game: nothing (user choice 2026-11-07; the game has its own menu);
 *   3. close an opened profile or past game;
 *   4. profiles, past games, new game setup: back to the main menu;
 *   5. main menu: ask "Exit Pubby?". The guard is not put back while asking,
 *      so a second back gesture really exits. "Stay" puts it back.
 *
 * Chrome skips history entries a page added without a tap, so the guard is
 * (re)added after the first tap too. iPhones have no back gesture in an
 * installed web app, so none of this runs there in practice.
 */
import { getState, update } from './store.ts';

const GUARD = 'pubby-guard';
let guarded = false;

function addGuard(): void {
  try {
    if (history.state?.[GUARD]) { guarded = true; return; }
    history.pushState({ [GUARD]: true }, '');
    guarded = true;
  } catch {
    /* History not available (some embedded previews): back just leaves. */
  }
}

/** Puts the guard back (used by "Stay" on the exit question). */
export function keepPubbyOpen(): void {
  update({ exitAsk: false });
  addGuard();
}

/** Tries to leave Pubby ("Exit" on the exit question). */
export function leavePubby(): void {
  update({ exitAsk: false });
  guarded = false;
  try { window.close(); } catch { /* ignore */ }
  try { history.back(); } catch { /* ignore */ }
  // An installed app can't always close itself from a button; if we're still
  // here, the next back gesture leaves (no guard is set).
  window.setTimeout(() => {
    if (!document.hidden) update({ message: 'Swipe back again to close Pubby.' });
  }, 600);
}

/** Pubby's own back step. Returns true when the guard should be put back. */
export function backStep(): boolean {
  const st = getState();
  if (st.exitAsk) { update({ exitAsk: false }); return true; }
  if (st.rulesOpen) { update({ rulesOpen: false }); return true; }
  if (st.csvSheet) { update({ csvSheet: null }); return true; }
  if (st.menuOpen) { update({ menuOpen: false }); return true; }
  if (st.screen === 'game') return true;
  if (st.screen === 'profiles' && st.openProfile) { update({ openProfile: null, armed: null }); return true; }
  if (st.screen === 'history' && st.openRecord) { update({ openRecord: null, armed: null }); return true; }
  if (st.screen !== 'home') {
    update({ screen: 'home', armed: null, openProfile: null, openRecord: null });
    return true;
  }
  update({ exitAsk: true });
  return false;
}

export function setupBack(): void {
  addGuard();
  window.addEventListener('popstate', () => {
    guarded = false;
    if (backStep()) addGuard();
  });
  // Re-add the guard after a tap, so Chrome doesn't skip it.
  document.addEventListener('pointerdown', () => {
    if (!guarded && !getState().exitAsk) addGuard();
  }, { capture: true });
}
