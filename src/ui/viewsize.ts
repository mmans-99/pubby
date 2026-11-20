/**
 * 9aq.19 A (3.0.5): the size of the part of the window the game may use (DOM, not pure: kept out of layout.ts).
 * The window less the safe-area insets (the notch, the home bar, the iPad's status-bar band). The insets come from
 * the --sat/--sab/--sal/--sar variables in styles.css, read through a hidden probe, so the layout
 * and the CSS padding always agree. Chromium and Android report 0 for every inset.
 */
let probeEl: HTMLElement | null = null;
export function viewSize(): { w: number; h: number } {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { w: 390, h: 844 };
  if (!probeEl) {
    probeEl = document.createElement('div');
    probeEl.setAttribute('aria-hidden', 'true');
    probeEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:var(--sat) var(--sar) var(--sab) var(--sal);';
    document.body.appendChild(probeEl);
  }
  const cs = getComputedStyle(probeEl);
  const px = (v: string) => parseFloat(v) || 0;
  const sat = px(cs.paddingTop), sar = px(cs.paddingRight), sab = px(cs.paddingBottom), sal = px(cs.paddingLeft);
  return { w: Math.max(0, window.innerWidth - sal - sar), h: Math.max(0, window.innerHeight - sat - sab) };
}
