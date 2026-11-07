/**
 * QR scanning with the phone's camera and the browser's built-in barcode
 * reader (BarcodeDetector: Chrome and Samsung Internet on Android). iPhone
 * Safari has no built-in reader yet; that needs a bundled decoder later
 * (CODE.md section 4a).
 */

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  const c = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof c === 'function' ? c : null;
}

/** True if this browser has a built-in QR reader. */
export function hasQrReader(): boolean {
  return detectorCtor() !== null;
}

export interface Scanner { stop(): void }

/**
 * Start the back camera in `video` and call `onCode` with each QR code read.
 * `onError` gets a message to show if the camera or reader can't start.
 */
export function startScanner(
  video: HTMLVideoElement,
  onCode: (text: string) => void,
  onError: (message: string) => void,
): Scanner {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: number | undefined;
  const Ctor = detectorCtor();

  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    onError('This browser can’t use the camera here.');
    return { stop };
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(async (s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play().catch(() => undefined);
      if (!Ctor) {
        onError('This browser has no built-in QR reader (iPhones don’t yet). Use an Android phone with Chrome or Samsung Internet for this test.');
        return;
      }
      let detector: BarcodeDetectorLike;
      try {
        detector = new Ctor({ formats: ['qr_code'] });
      } catch {
        onError('The QR reader didn’t start on this phone.');
        return;
      }
      const tick = async (): Promise<void> => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const found = await detector.detect(video);
            if (stopped) return;
            const hit = found.find((b) => b.rawValue);
            if (hit) onCode(hit.rawValue);
          }
        } catch {
          // A frame that can't be read; try the next one.
        }
        if (!stopped) timer = window.setTimeout(() => { void tick(); }, 150);
      };
      void tick();
    })
    .catch((e: unknown) => {
      const name = e instanceof DOMException ? e.name : '';
      onError(name === 'NotAllowedError'
        ? 'Camera blocked. Allow the camera for this site in the browser settings, then try again.'
        : 'The camera didn’t start. Close other apps using it and try again.');
    });

  return { stop };
}
