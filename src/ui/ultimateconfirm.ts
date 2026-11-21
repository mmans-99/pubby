/**
 * 9ar.2 (M): the Ultimate Round vote is confirmed before it is called. Used by the results screen of a
 * network game (netscreens.ts) and of a one-phone game (between.ts). The caller decides what the buttons do.
 */

import { h } from './dom.ts';

export interface UltimateConfirmOpts {
  /** Who votes YES first: the caller's name (ignored when `you` is set). */
  readonly voter: string;
  /** True on the caller's own phone: "You vote YES." */
  readonly you: boolean;
  readonly onCall: () => void;
  readonly onCancel: () => void;
}

export function ultimateConfirm(opts: UltimateConfirmOpts): HTMLElement {
  return h('section', { class: 'panel ultimate-confirm', role: 'dialog', 'aria-label': 'Call an Ultimate Round vote' },
    h('h2', { class: 'center' }, 'Call an Ultimate Round vote?'),
    h('p', { class: 'small center' }, opts.you ? 'You vote YES.' : `${opts.voter} votes YES.`),
    h('div', { class: 'row round-buttons' },
      h('button', { class: 'secondary', onclick: opts.onCancel }, 'Cancel'),
      h('button', { class: 'big', onclick: opts.onCall }, 'Call vote')));
}
