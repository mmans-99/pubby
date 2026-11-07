/**
 * Stops pinch zoom. The viewport tag and CSS `touch-action: pan-x pan-y`
 * cover Android browsers; iPhone Safari ignores both, so its gesture events
 * and two-finger moves are cancelled here too. One-finger scrolling and taps
 * are untouched.
 */
export function blockZoom(): void {
  const stop = (e: Event): void => { e.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }
  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}
