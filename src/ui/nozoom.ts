/**
 * Stops pinch zoom. The viewport tag and CSS `touch-action: pan-x pan-y`
 * (on every element since v1.5, because scrolling areas start their own
 * touch-action chain) cover Android browsers; iPhone Safari ignores both, so its gesture events
 * and two-finger moves are cancelled here too. One-finger scrolling and taps
 * are untouched.
 */
export function blockZoom(): void {
  const stop = (e: Event): void => { e.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }
  // v1.5: also stop the second finger as soon as it lands. Once one finger
  // has started a scroll, browsers (Samsung Internet) may no longer let a
  // page cancel the move, so a pinch could slip through; a touchstart can
  // always be cancelled.
  document.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}
