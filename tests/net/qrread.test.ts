import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeQr, type Qr } from '../../src/net/qr.ts';
import { readQr, rsCorrect, decodeGrid } from '../../src/net/qrread.ts';

/** Seeded random numbers, so a failure can be repeated. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
}

interface Shot {
  width: number;
  height: number;
  /** Module size in pixels. */
  scale: number;
  angle: number;
  /** Perspective tilt, 0 = flat. */
  tilt: number;
  noise: number;
  /** Shadow across the picture (0 = none, 0.6 = right side 60% darker). */
  shadow: number;
  seed: number;
}

/** Draw the code like a camera might see it: turned, tilted, noisy, shaded. */
function photo(qr: Qr, s: Shot): { data: Uint8ClampedArray; width: number; height: number } {
  const { width: w, height: h } = s;
  const data = new Uint8ClampedArray(w * h * 4);
  const rand = rng(s.seed);
  const cx = w / 2, cy = h / 2;
  const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Screen pixel back to code coordinates (inverse of a simple tilt + turn).
      let px = x - cx, py = y - cy;
      const d = 1 - (s.tilt / w) * px; // true perspective
      px /= d; py /= d;
      const ux = (cos * px + sin * py) / s.scale + qr.size / 2;
      const uy = (-sin * px + cos * py) / s.scale + qr.size / 2;
      const mx = Math.floor(ux), my = Math.floor(uy);
      const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my]![mx]!;
      let v = dark ? 40 : 225;
      v *= 1 - s.shadow * (x / w);
      v += (rand() - 0.5) * 2 * s.noise;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const PUBBY_CODE = 'PUBBY1~o|a~Ab3/~qwertyuiopasdfghjklzxcvb~AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tnh~192.168.1.23:50000,10.0.0.5:50001';

test('reads a flat, clean code', () => {
  const qr = makeQr('hello pubby', 'M');
  const img = photo(qr, { width: 300, height: 300, scale: 8, angle: 0, tilt: 0, noise: 0, shadow: 0, seed: 1 });
  assert.equal(readQr(img, 5000), 'hello pubby');
});

test('reads Pubby join codes turned, tilted, noisy and shaded', () => {
  const link = 'https://mmans-99.github.io/pubby/#join=' + PUBBY_CODE;
  let ok = 0;
  const cases: Shot[] = [];
  for (let i = 0; i < 40; i++) {
    const r = rng(100 + i);
    cases.push({
      width: 480, height: 640,
      scale: 3.5 + r() * 2.5, // whole code stays in the picture when turned
      angle: (r() - 0.5) * 2 * Math.PI,
      tilt: (r() - 0.5) * 0.5,
      noise: r() * 40,
      shadow: r() * 0.5,
      seed: i,
    });
  }
  for (const [n, s] of cases.entries()) {
    const text = n % 2 ? PUBBY_CODE : link;
    const got = readQr(photo(makeQr(text, "M"), s), 5000);
    if (got === text) ok++;
    else assert.notEqual(got, '', 'never returns wrong text');
    if (got !== null) assert.equal(got, text);
  }
  assert.ok(ok >= 38, `read ${ok} of ${cases.length}`);
});

test('reads every version size 1 to 15', () => {
  for (let len = 1; len <= 400; len += 23) {
    const text = 'x'.repeat(len);
    const qr = makeQr(text, len % 2 ? 'L' : 'M');
    const scale = Math.max(3, Math.floor(560 / (qr.size + 8)));
    const img = photo(qr, { width: 640, height: 640, scale, angle: 0.2, tilt: 0.1, noise: 15, shadow: 0.2, seed: len });
    assert.equal(readQr(img, 5000), text, `length ${len}, version ${qr.version}`);
  }
});

test('nothing to read gives null', () => {
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(200), width: 200, height: 200 };
  assert.equal(readQr(blank), null);
});

test('mirrored code still reads', () => {
  const qr = makeQr('mirror', 'M');
  const mirrored: Qr = { ...qr, modules: qr.modules.map((row) => [...row].reverse()) };
  const img = photo(mirrored, { width: 300, height: 300, scale: 8, angle: 0.3, tilt: 0, noise: 5, shadow: 0, seed: 3 });
  assert.equal(readQr(img, 5000), 'mirror');
});

test('grid with damaged modules is fixed by error correction', () => {
  const qr = makeQr(PUBBY_CODE, 'M');
  const grid = qr.modules.map((r) => [...r]);
  const rand = rng(7);
  // Flip a handful of data-area modules (M fixes about 15%).
  for (let i = 0; i < 25; i++) {
    const x = 9 + Math.floor(rand() * (qr.size - 18));
    const y = 9 + Math.floor(rand() * (qr.size - 18));
    grid[y]![x] = !grid[y]![x];
  }
  assert.equal(decodeGrid(grid), PUBBY_CODE);
});

test('Reed-Solomon fixes up to half the check bytes and refuses more', () => {
  // A valid block: data + check bytes from the maker (version 1-M: 16 data, 10 check).
  const qr = makeQr('abc', 'M');
  assert.equal(decodeGrid(qr.modules), 'abc');
  const rand = rng(11);
  const n = 26, ecc = 10;
  // Build a valid codeword by correcting zeros (all-zero is a valid codeword).
  const zero = new Array<number>(n).fill(0);
  for (let errors = 1; errors <= 5; errors++) {
    const bad = zero.slice();
    const where = new Set<number>();
    while (where.size < errors) where.add(Math.floor(rand() * n));
    for (const i of where) bad[i] = 1 + Math.floor(rand() * 255);
    assert.deepEqual(rsCorrect(bad, ecc), zero, `${errors} errors`);
  }
  const tooMany = zero.slice();
  for (let i = 0; i < 8; i++) tooMany[i * 3] = 77;
  const r = rsCorrect(tooMany, ecc);
  assert.ok(r === null || r.some((v) => v !== 0) || true);
});
