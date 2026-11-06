/**
 * Random number source for the rules engine.
 *
 * The engine never calls Math.random directly. It takes an Rng so tests can
 * use a fixed seed and get the same shuffle every time.
 */
export type Rng = () => number; // returns a number in [0, 1)

/** Seeded generator (mulberry32). Same seed, same sequence. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default generator for real games. Uses the browser's crypto when available. */
export function defaultRng(): Rng {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    return () => {
      c.getRandomValues(buf);
      return (buf[0] as number) / 4294967296;
    };
  }
  return Math.random;
}

/** Fisher-Yates shuffle. Returns a new array; the input is not changed. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
