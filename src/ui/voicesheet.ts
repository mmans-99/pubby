/**
 * The Voice sheet (CODE.md 9aq.12, Part J, 3.0.0): the mic switch, Mute all and
 * Unmute all, one row per other person, and the voice volume. It is only a view:
 * the screen that opens it keeps the state and passes the actions in.
 */
import { h } from './dom.ts';
import { icon } from './icons.ts';

export interface VoiceSheetRow {
  id: string;
  name: string;
  connected: boolean;
  talking: boolean;
  /** Muted by this phone. */
  muted: boolean;
  /** The other phone's mic is on. */
  micOn: boolean;
}

export interface VoiceSheetProps {
  micOn: boolean;
  micBlocked: boolean;
  rows: VoiceSheetRow[];
  volume: number;
  onClose(): void;
  onMic(): void;
  onMuteAll(): void;
  onUnmuteAll(): void;
  /** `hear` is true to hear this person, false to mute them. */
  onHear(id: string, hear: boolean): void;
  onVolume(v: number): void;
}

/** iPhone and iPad ignore audio.volume, so the slider is not shown there (9aq.12 item 2). */
export function volumeWorks(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  return !ios;
}

export function voiceSheetView(p: VoiceSheetProps): HTMLElement {
  return h('div', { class: 'sheet voice-sheet', role: 'dialog', 'aria-label': 'Voice', 'data-scroll': 'voice' },
    h('div', { class: 'sheet-head' },
      h('h2', null, icon('speaker'), ' Voice'),
      h('button', { class: 'icon', 'aria-label': 'Close Voice', onclick: p.onClose }, '✕'),
    ),
    h('label', { class: 'toggle voice-mic' },
      h('input', { type: 'checkbox', checked: p.micOn, disabled: p.micBlocked && !p.micOn, onchange: p.onMic }),
      h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
      h('span', { class: 'grow' }, 'Your mic',
        p.micBlocked ? h('span', { class: 'muted small block' }, 'Mic blocked · allow it in your browser') : null),
    ),
    h('div', { class: 'voice-all' },
      h('button', { class: 'big secondary', onclick: p.onMuteAll }, 'Mute all'),
      h('button', { class: 'big secondary outlined', onclick: p.onUnmuteAll }, 'Unmute all'),
    ),
    h('ul', { class: 'seats voice-rows' }, p.rows.map((r) => {
      const status = !r.connected ? 'Not connected'
        : r.muted ? 'Muted by you'
          : r.talking ? 'Talking'
            : r.micOn ? 'Mic on' : 'Mic off';
      return h('li', { class: 'seat voice-row' },
        h('div', { class: 'seat-top' },
          h('span', { class: 'seat-no', 'data-voice': r.id }, r.name.trim().charAt(0).toUpperCase() || '?'),
          h('span', { class: 'grow name' }, r.name,
            h('span', { class: `muted small block voice-status${r.talking && !r.muted ? ' ok' : ''}` }, status)),
          h('label', { class: 'toggle', 'aria-label': `Hear ${r.name}` },
            h('input', { type: 'checkbox', checked: !r.muted, onchange: (e: Event) => p.onHear(r.id, (e.target as HTMLInputElement).checked) }),
            h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }),
          ),
        ),
      );
    })),
    volumeWorks()
      ? h('label', { class: 'field voice-volume' },
        h('span', null, 'Voice volume'),
        h('input', {
          type: 'range', min: '0', max: '100', step: '5', value: String(p.volume),
          oninput: (e: Event) => p.onVolume(Number((e.target as HTMLInputElement).value)),
        }),
      )
      : null,
    h('p', { class: 'muted small' }, 'Muting only stops you hearing them. Mutes are remembered on this phone.'),
  );
}
