/**
 * QR scanning with the phone's camera. Uses the browser's built-in barcode
 * reader where there is one (BarcodeDetector: Chrome and Samsung Internet on
 * Android) and Pubby's own reader everywhere else (iPhones: Safari and the
 * home-screen app), so every phone can scan inside Pubby, offline.
 */

import { readQr } from './qrread.ts';

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  const c = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof c === 'function' ? c : null;
}

/** True if this phone can scan inside Pubby (it has a camera API). */
export function canScan(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Which reader scanning uses here: the browser's, or Pubby's own. */
export function readerKind(): 'built-in' | 'pubby' {
  return detectorCtor() ? 'built-in' : 'pubby';
}

export interface Scanner { stop(): void }

/** Longest side of the frame Pubby's reader looks at (smaller = faster). */
const FRAME_MAX = 720;
const EVERY_MS = 150;

/**
 * Start the back camera in `video` and call `onCode` with each QR code read.
 * `onError` gets a message to show if the camera can't start.
 */
export function startScanner(
  video: HTMLVideoElement,
  onCode: (text: string) => void,
  onError: (message: string) => void,
): Scanner {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: number | undefined;

  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };

  if (!canScan()) {
    onError('This browser can’t use the camera here.');
    return { stop };
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    .then(async (s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = s;
      await video.play().catch(() => undefined);
      const read = makeReader();
      const tick = async (): Promise<void> => {
        if (stopped) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const text = await read(video);
            if (stopped) return;
            if (text) onCode(text);
          }
        } catch {
          // A frame that can't be read; try the next one.
        }
        if (!stopped) timer = window.setTimeout(() => { void tick(); }, EVERY_MS);
      };
      void tick();
    })
    .catch((e: unknown) => {
      const name = e instanceof DOMException ? e.name : '';
      onError(name === 'NotAllowedError'
        ? 'Camera blocked. Allow the camera for this site in the browser settings (iPhone: Settings › Apps › Safari › Camera), then try again.'
        : 'The camera didn’t start. Close other apps using it and try again.');
    });

  return { stop };
}

type FrameReader = (video: HTMLVideoElement) => Promise<string | null>;

function makeReader(): FrameReader {
  const Ctor = detectorCtor();
  if (Ctor) {
    try {
      const detector = new Ctor({ formats: ['qr_code'] });
      const ours = pubbyReader();
      let builtInFails = 0;
      return async (video) => {
        // If the built-in reader keeps throwing, switch to Pubby's.
        if (builtInFails >= 5) return ours(video);
        try {
          const found = await detector.detect(video);
          builtInFails = 0;
          return found.find((b) => b.rawValue)?.rawValue ?? null;
        } catch {
          builtInFails++;
          return null;
        }
      };
    } catch {
      // Fall through to Pubby's reader.
    }
  }
  return pubbyReader();
}

function pubbyReader(): FrameReader {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx) return null;
    const scale = Math.min(1, FRAME_MAX / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, 0, w, h);
    return readQr(ctx.getImageData(0, 0, w, h));
  };
}
