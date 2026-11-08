/**
 * Sound in the app (PROJECT.md 12b, CODE.md 9g): the round sound button on
 * every screen, the sound sheet (music and effects, each with a switch and a
 * volume slider, changeable at any time, also mid-game), which music goes
 * with which screen, and the tap sound for buttons.
 */

import { setupVisibility, unlockAudio } from '../audio/engine.ts';
import { currentTrack, setTrack, type Track } from '../audio/music.ts';
import { allMuted, setSound, soundSettings } from '../audio/settings.ts';
import { sfx, sfxLog, sfxSeen, tryAllSfx } from '../audio/sfx.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { getState, update, type State } from './store.ts';

export function setupSound(): void {
  setupVisibility();
  // Every button gives the soft tap sound (effects for what it does come from the game).
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    const b = t?.closest?.('button');
    if (!b || b.disabled || b.classList.contains('no-tap-sfx')) return;
    // In a game the move's own sound is enough: the tap is only for the menu, sheets and the bar.
    if (getState().screen === 'game' && !b.closest('.menu, .sheet, .game-bar, .sound-btn, .rules-btn')) return;
    sfx('tap');
  }, true);
  // For the automated checks.
  (window as unknown as { pubbySound: unknown }).pubbySound = { track: currentTrack, log: sfxLog, seen: () => [...sfxSeen], clear: () => sfxSeen.clear(), settings: soundSettings, tryAll: tryAllSfx };
}

/** The music for what is on screen (null = none). */
export function trackFor(st: State): Track | null {
  if (st.screen === 'bye') return null;
  if (st.screen !== 'game' || !st.game) return 'menu';
  const s = st.game.session;
  if (s.paused) return null;
  if (s.phase === 'results' || s.phase === 'gameOver') return 'results';
  if (s.ultimateRound) return 'ultimate';
  return 'play';
}

/** After every draw. */
export function syncSound(): void {
  setTrack(trackFor(getState()));
}

export function soundButton(): HTMLElement {
  const muted = allMuted();
  return h('button', {
    class: 'sound-btn',
    'aria-label': muted ? 'Sound (off)' : 'Sound',
    onclick: () => { unlockAudio(); update({ soundOpen: true }); },
  }, icon(muted ? 'mute' : 'vol'));
}

export function soundOverlay(): HTMLElement {
  const close = (): void => update({ soundOpen: false });
  const s = soundSettings();
  const row = (label: string, on: boolean, vol: number, onKey: 'musicOn' | 'sfxOn', volKey: 'musicVol' | 'sfxVol'): HTMLElement => {
    const num = h('span', { class: 'vol-num' }, `${vol}%`);
    const slider = h('input', {
      type: 'range', min: '0', max: '100', step: '5', value: String(vol), class: 'vol-slider',
      'aria-label': `${label} volume`, disabled: !on,
      // While dragging: change the sound only, no redraw (a redraw would drop the slider).
      oninput: (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        setSound({ [volKey]: v });
        num.textContent = `${v}%`;
      },
      onchange: () => { if (volKey === 'sfxVol') sfx('play'); update({}); },
    });
    return h('div', { class: 'sound-row' },
      h('label', { class: 'toggle' },
        h('input', {
          type: 'checkbox', checked: on,
          onchange: (e) => {
            unlockAudio();
            setSound({ [onKey]: (e.target as HTMLInputElement).checked });
            if (onKey === 'sfxOn' && (e.target as HTMLInputElement).checked) sfx('play');
            update({});
          },
        }),
        h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
        h('span', { class: 'grow' }, label, h('span', { class: 'muted small block' }, on ? 'On' : 'Off')),
      ),
      h('div', { class: on ? 'vol-line' : 'vol-line off' }, icon('vol'), slider, num),
    );
  };
  return h('div', { class: 'overlay sound-overlay', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet sound-sheet', role: 'dialog', 'aria-label': 'Sound' },
      h('div', { class: 'sheet-head' },
        h('h2', null, 'Sound'),
        h('button', { class: 'ghost', onclick: close }, 'Close'),
      ),
      row('Music', s.musicOn, s.musicVol, 'musicOn', 'musicVol'),
      row('Sound effects', s.sfxOn, s.sfxVol, 'sfxOn', 'sfxVol'),
      h('p', { class: 'small sound-note' }, 'Only this phone changes. The game carries on while this is open.'),
      h('p', { class: 'small sound-note' }, 'iPhone: turn the silent switch off to hear Pubby.'),
    ),
  );
}
