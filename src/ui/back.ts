/**
 * The phone's back gesture / back button (Android). Without this, back leaves
 * the page and Pubby closes at once.
 *
 * Back does, in order:
 *   1. close an open sheet: quick rules, the CSV sheet, the in-game menu;
 *   2. in a game: nothing (user choice 2026-11-07; the game has its own menu);
 *   3. close an opened profile or past game;
 *   4. profiles, past games, new game setup: back to the main menu;
 *   5. main menu: ask "Exit Pubby?"; the next back gesture really exits.
 *
 * How it works: Pubby adds "guard" entries to the browser history (state
 * `{ pubby: 1 }`, `{ pubby: 2 }` on top of the page's own entry). A back
 * gesture moves back one entry inside Pubby (a `popstate` event) instead of
 * leaving, and Pubby does its own back step.
 *
 * v1.2 fix (v1.1 still closed the installed app): Chrome's "history
 * manipulation intervention" makes the back gesture skip history entries a
 * page added without a real tap, and on a touch screen `pointerdown` doesn't
 * count as a tap. So guards are only added inside a tap (`click`, `touchend`,
 * `keydown`), never at start-up or inside `popstate`. Two guards are kept so
 * that two quick back gestures without a tap in between still stay in Pubby;
 * they are topped up on the next tap.
 *
 * Exit question: Pubby goes back through any guards left (ignoring those
 * `popstate` events), so the next back gesture leaves. "Stay" (a tap) puts the
 * guards back. iPhones have no back gesture in an installed web app.
 */
import { getState, update } from './store.ts';

const KEY = 'pubby';
const GUARDS = 2;
/** `popstate` events caused by Pubby itself, to ignore. */
let ignore = 0;

function depth(): number {
  const d = (history.state as Record<string, unknown> | null)?.[KEY];
  return typeof d === 'number' ? d : 0;
}

/** Tops the guards back up. Only call from inside a tap. */
function topUp(): void {
  try {
    for (let d = depth(); d < GUARDS; d++) history.pushState({ [KEY]: d + 1 }, '');
  } catch {
    /* History not available (some embedded previews): back just leaves. */
  }
}

/** Goes back through the remaining guards, so the next back gesture leaves. */
function dropGuards(): void {
  const d = depth();
  if (d > 0) {
    ignore += 1; // one popstate for the whole jump
    history.go(-d);
  }
}

/** "Stay" on the exit question (a tap). */
export function keepPubbyOpen(): void {
  update({ exitAsk: false });
  topUp();
}

/** "Exit" on the exit question. */
export function leavePubby(): void {
  update({ exitAsk: false });
  try { window.close(); } catch { /* ignore */ }
  // An installed app can't always close itself from a button; there are no
  // guards left now, so the next back gesture closes it.
  window.setTimeout(() => {
    if (!document.hidden) update({ message: 'Swipe back to close Pubby.' });
  }, 400);
}

/** Pubby's own back step. Returns false when it asked "Exit Pubby?". */
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
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; return; }
    if (!backStep()) dropGuards();
  });
  // Real taps only (these count as user activation; pointerdown on touch does not).
  const onTap = (): void => { if (!getState().exitAsk) topUp(); };
  for (const type of ['click', 'touchend', 'keydown']) {
    document.addEventListener(type, onTap, { capture: true });
  }
}
