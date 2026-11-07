/**
 * QR code reader, written for Pubby so phones with no built-in reader
 * (iPhones) can scan inside the app, offline, with no package. Follows the QR
 * Code standard (ISO/IEC 18004): finds the three corner squares, the
 * alignment square, maps the grid with a perspective transform, reads the
 * format and version, unmasks, de-interleaves the blocks, fixes errors with
 * Reed-Solomon, then reads numeric, alphanumeric and byte (UTF-8) data.
 * All error-correction levels (L, M, Q, H) and versions 1 to 40.
 *
 *   const text = readQr({ data, width, height });   // RGBA pixels, or null
 */

export interface Pixels {
  /** RGBA, 4 bytes per pixel (as from canvas getImageData). */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Read one QR code from the image. Returns its text, or null if none was read. */
export function readQr(img: Pixels, timeLimitMs = 150): string | null {
  deadline = performance.now() + timeLimitMs;
  const gray = toGray(img);
  // Two ways of telling black from white: local (copes with shadows and
  // glare) and one threshold for the whole picture (copes with big modules).
  for (const bin of [binarizeLocal(gray, img.width, img.height), binarizeGlobal(gray, img.width, img.height)]) {
    const text = readFromBits(new BitImage(bin, img.width, img.height));
    if (text !== null) return text;
  }
  return null;
}

/** Give up on a frame after this time, so the camera view stays smooth. */
let deadline = Infinity;

// ---------------------------------------------------------------------------
// Black and white
// ---------------------------------------------------------------------------

class BitImage {
  constructor(readonly bits: Uint8Array, readonly width: number, readonly height: number) {}
  /** 1 = dark. Outside the picture counts as light. */
  get(x: number, y: number): number {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.bits[y * this.width + x]!;
  }
}

function toGray(img: Pixels): Uint8Array {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  const d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (d[j]! * 77 + d[j + 1]! * 150 + d[j + 2]! * 29) >> 8;
  return out;
}

function binarizeLocal(gray: Uint8Array, w: number, h: number): Uint8Array {
  // Integral image, then each pixel against the mean of the square around it.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]!;
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 12));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1]! - integral[y0 * (w + 1) + x1]! - integral[y1 * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!;
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x]! < mean * 0.9 - 2 ? 1 : 0;
    }
  }
  return out;
}

function binarizeGlobal(gray: Uint8Array, w: number, h: number): Uint8Array {
  // Otsu's threshold.
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!]!++;
  const total = w * h;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  const out = new Uint8Array(total);
  for (let i = 0; i < total; i++) out[i] = gray[i]! <= threshold ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Finding the code
// ---------------------------------------------------------------------------

interface Point { x: number; y: number }
interface Finder extends Point { size: number; count: number }

/** Five runs in a 1:1:3:1:1 pattern (dark, light, dark, light, dark)? */
function finderRatio(r: readonly number[]): boolean {
  let total = 0;
  for (const c of r) { if (c === 0) return false; total += c; }
  if (total < 7) return false;
  const m = total / 7;
  const v = m / 2;
  return Math.abs(m - r[0]!) < v && Math.abs(m - r[1]!) < v && Math.abs(3 * m - r[2]!) < 3 * v
    && Math.abs(m - r[3]!) < v && Math.abs(m - r[4]!) < v;
}

/**
 * Walk through (cx, cy) along (dx, dy) both ways and measure the five runs.
 * Returns the centre of the middle run and the total length, or null.
 */
function crossCheck(img: BitImage, cx: number, cy: number, dx: number, dy: number, maxRun: number): { x: number; y: number; total: number } | null {
  if (!img.get(cx, cy)) return null;
  const runs = [0, 0, 0, 0, 0];
  // Backwards: middle dark, light, outer dark.
  let i = 0;
  while (img.get(cx - i * dx, cy - i * dy) && i <= maxRun * 3) { runs[2]!++; i++; }
  while (!img.get(cx - i * dx, cy - i * dy) && runs[1]! <= maxRun && inside(img, cx - i * dx, cy - i * dy)) { runs[1]!++; i++; }
  while (img.get(cx - i * dx, cy - i * dy) && runs[0]! <= maxRun) { runs[0]!++; i++; }
  const back = i;
  // Forwards.
  i = 1;
  while (img.get(cx + i * dx, cy + i * dy) && i <= maxRun * 3) { runs[2]!++; i++; }
  while (!img.get(cx + i * dx, cy + i * dy) && runs[3]! <= maxRun && inside(img, cx + i * dx, cy + i * dy)) { runs[3]!++; i++; }
  while (img.get(cx + i * dx, cy + i * dy) && runs[4]! <= maxRun) { runs[4]!++; i++; }
  if (!finderRatio(runs)) return null;
  // Middle of the centre run, in steps from (cx, cy).
  const startOfMiddle = -(back - runs[0]! - runs[1]!) + 1;
  const mid = startOfMiddle + (runs[2]! - 1) / 2;
  return { x: cx + mid * dx, y: cy + mid * dy, total: runs.reduce((a, b) => a + b, 0) };
}

function inside(img: BitImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < img.width && y < img.height;
}

function findFinders(img: BitImage): Finder[] {
  const found: Finder[] = [];
  const { width: w, height: h } = img;
  const step = h > 900 ? 2 : 1;
  for (let y = 0; y < h; y += step) {
    // Runs along the row.
    const runs: number[] = [];
    const starts: number[] = [];
    let color = 0;
    let len = 0;
    for (let x = 0; x <= w; x++) {
      const c = x < w ? img.get(x, y) : -1;
      if (c === color) { len++; continue; }
      runs.push(len); starts.push(x - len);
      color = c; len = 1;
    }
    // runs[0] is light (maybe 0 long), then alternating dark, light...
    for (let k = 1; k + 4 < runs.length; k += 2) {
      const five = [runs[k]!, runs[k + 1]!, runs[k + 2]!, runs[k + 3]!, runs[k + 4]!];
      if (!finderRatio(five)) continue;
      const total = five.reduce((a, b) => a + b, 0);
      const cx = Math.floor(starts[k + 2]! + runs[k + 2]! / 2);
      const maxRun = Math.ceil(total / 2);
      const v = crossCheck(img, cx, y, 0, 1, maxRun);
      if (!v || 5 * Math.abs(v.total - total) >= 2 * total) continue;
      const hz = crossCheck(img, cx, Math.floor(v.y), 1, 0, maxRun);
      if (!hz || 5 * Math.abs(hz.total - total) >= 2 * total) continue;
      const diag = crossCheck(img, Math.floor(hz.x), Math.floor(v.y), 1, 1, maxRun);
      if (!diag) continue;
      const size = (v.total + hz.total) / 14;
      const p = { x: hz.x + 0.5, y: v.y + 0.5 };
      const near = found.find((f) => Math.abs(f.x - p.x) <= Math.max(size, f.size) && Math.abs(f.y - p.y) <= Math.max(size, f.size)
        && Math.abs(f.size - size) <= Math.max(1, Math.min(f.size, size)));
      if (near) {
        const n = near.count;
        near.x = (near.x * n + p.x) / (n + 1);
        near.y = (near.y * n + p.y) / (n + 1);
        near.size = (near.size * n + size) / (n + 1);
        near.count++;
      } else {
        found.push({ ...p, size, count: 1 });
      }
    }
  }
  return found;
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Likely sets of three corner squares, best first: [topLeft, topRight, bottomLeft]. */
function finderTriples(finders: Finder[]): [Finder, Finder, Finder][] {
  // Seen on two or more rows is much more likely real; noise gives one-offs.
  const confirmed = finders.filter((f) => f.count >= 2);
  const pool = (confirmed.length >= 3 ? confirmed : finders).sort((a, b) => b.count - a.count).slice(0, 10);
  const scored: { t: [Finder, Finder, Finder]; score: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const a = pool[i]!, b = pool[j]!, c = pool[k]!;
        const sizes = [a.size, b.size, c.size];
        if (Math.max(...sizes) > 1.6 * Math.min(...sizes)) continue;
        // The corner is opposite the longest side.
        const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
        let tl: Finder, p: Finder, q: Finder, longest: number, s1: number, s2: number;
        if (bc >= ab && bc >= ca) { tl = a; p = b; q = c; longest = bc; s1 = ab; s2 = ca; }
        else if (ca >= ab) { tl = b; p = a; q = c; longest = ca; s1 = ab; s2 = bc; }
        else { tl = c; p = a; q = b; longest = ab; s1 = bc; s2 = ca; }
        const ms = (a.size + b.size + c.size) / 3;
        if (Math.min(s1, s2) < 10 * ms) continue; // too close: at least version 1
        if (Math.max(s1, s2) > 2 * Math.min(s1, s2)) continue;
        const rightAngle = Math.abs(longest * longest - s1 * s1 - s2 * s2) / (longest * longest);
        if (rightAngle > 0.35) continue;
        const cross = (p.x - tl.x) * (q.y - tl.y) - (p.y - tl.y) * (q.x - tl.x);
        const [tr, bl] = cross > 0 ? [p, q] : [q, p];
        const score = rightAngle + Math.abs(s1 - s2) / Math.max(s1, s2) - 0.02 * Math.min(a.count + b.count + c.count, 30);
        scored.push({ t: [tl, tr, bl], score });
      }
    }
  }
  scored.sort((x, y) => x.score - y.score);
  return scored.slice(0, 6).map((s) => s.t);
}

function readFromBits(img: BitImage): string | null {
  const finders = findFinders(img);
  if (finders.length < 3) return null;
  for (const [tl, tr, bl] of finderTriples(finders)) {
    if (performance.now() > deadline) return null;
    // Module size measured along the code's own sides (a turned code looks
    // wider across a row than it really is).
    const along = [sizeAlong(img, tl, tr), sizeAlong(img, tr, tl), sizeAlong(img, tl, bl), sizeAlong(img, bl, tl)].filter((v) => v > 0);
    const ms = along.length ? along.reduce((a, b) => a + b, 0) / along.length : (tl.size + tr.size + bl.size) / 3;
    const est = (dist(tl, tr) + dist(tl, bl)) / (2 * ms) + 7;
    const guess = Math.round((est - 17) / 4);
    // Try the estimated size first, then its neighbours (perspective can fool it).
    for (const ver of [guess, guess + 1, guess - 1]) {
      if (ver < 1 || ver > 40) continue;
      const text = readGrid(img, tl, tr, bl, ver, ms);
      if (text !== null) return text;
    }
  }
  return null;
}

/** Module size of finder `f` measured along the line towards `to` (0 if unreadable). */
function sizeAlong(img: BitImage, f: Point, to: Point): number {
  const d = dist(f, to);
  if (d === 0) return 0;
  const run = crossCheck(img, Math.floor(f.x), Math.floor(f.y), (to.x - f.x) / d, (to.y - f.y) / d, Math.ceil(d / 4));
  return run ? run.total / 7 : 0;
}

function readGrid(img: BitImage, tl: Point, tr: Point, bl: Point, ver: number, ms: number): string | null {
  const dim = ver * 4 + 17;
  // The fourth point: the alignment square (version 2 and up) or the far
  // corner worked out from the other three (version 1).
  let fourth: Point;
  let fourthAt: number;
  if (ver === 1) {
    fourth = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
    fourthAt = dim - 3.5;
  } else {
    fourth = findAlignment(img, tl, tr, bl, dim, ms);
    fourthAt = dim - 6.5;
  }
  const first = sampleAndDecode(img, tl, tr, bl, fourth, fourthAt, dim);
  if (first !== null) return first;
  // Only worth nudging if this looks like a real code: the format bits by the
  // top-left corner (which don't depend on the fourth point) must read.
  if (first === null && !formatReadable(sampleGrid(img, tl, tr, bl, fourth, fourthAt, dim))) return null;
  // Tilted codes: the fourth point may be a little off. Nudge it around.
  const ux = { x: (tr.x - tl.x) / (dim - 7), y: (tr.y - tl.y) / (dim - 7) };
  const uy = { x: (bl.x - tl.x) / (dim - 7), y: (bl.y - tl.y) / (dim - 7) };
  for (let r = 0.5; r <= 2; r += 0.5) {
    for (let j = -r; j <= r; j += 0.5) {
      for (let i = -r; i <= r; i += 0.5) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const p = { x: fourth.x + i * ux.x + j * uy.x, y: fourth.y + i * ux.y + j * uy.y };
        const text = sampleAndDecode(img, tl, tr, bl, p, fourthAt, dim);
        if (text !== null) return text;
      }
    }
  }
  return null;
}

function sampleAndDecode(img: BitImage, tl: Point, tr: Point, bl: Point, fourth: Point, fourthAt: number, dim: number): string | null {
  if (performance.now() > deadline) return null;
  const grid = sampleGrid(img, tl, tr, bl, fourth, fourthAt, dim);
  return grid ? (decodeGrid(grid) ?? decodeGrid(transpose(grid))) : null;
}

function sampleGrid(img: BitImage, tl: Point, tr: Point, bl: Point, fourth: Point, fourthAt: number, dim: number): boolean[][] | null {
  const src = [{ x: 3.5, y: 3.5 }, { x: dim - 3.5, y: 3.5 }, { x: 3.5, y: dim - 3.5 }, { x: fourthAt, y: fourthAt }];
  const H = homography(src, [tl, tr, bl, fourth]);
  if (!H) return null;
  const grid: boolean[][] = [];
  for (let y = 0; y < dim; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < dim; x++) {
      const p = apply(H, x + 0.5, y + 0.5);
      row.push(img.get(p.x, p.y) === 1);
    }
    grid.push(row);
  }
  return grid;
}

function formatReadable(grid: boolean[][] | null): boolean {
  if (!grid) return false;
  return [grid, transpose(grid)].some((g) => {
    const at = (x: number, y: number): number => (g[y]![x]! ? 1 : 0);
    let f = 0;
    readFormatPositions(g.length)[0].forEach(([x, y], i) => { f |= at(x, y) << i; });
    for (let d = 0; d < 32; d++) if (popcount(formatCode(d) ^ f) <= 3) return true;
    return false;
  });
}

function findAlignment(img: BitImage, tl: Point, tr: Point, bl: Point, dim: number, ms: number): Point {
  const br = { x: tr.x - tl.x + bl.x, y: tr.y - tl.y + bl.y };
  const k = 1 - 3 / (dim - 7);
  const est = { x: tl.x + k * (br.x - tl.x), y: tl.y + k * (br.y - tl.y) };
  // Module steps along the code's own axes, from the corner squares.
  const ux = { x: (tr.x - tl.x) / (dim - 7), y: (tr.y - tl.y) / (dim - 7) };
  const uy = { x: (bl.x - tl.x) / (dim - 7), y: (bl.y - tl.y) / (dim - 7) };
  for (const radiusModules of [4, 9, 16]) {
    const r = Math.ceil(radiusModules * ms);
    let best = -1;
    let sx = 0, sy = 0, n = 0;
    for (let y = Math.floor(est.y - r); y <= est.y + r; y++) {
      for (let x = Math.floor(est.x - r); x <= est.x + r; x++) {
        if (!img.get(x, y)) continue;
        let score = 0;
        for (let j = -2; j <= 2; j++) {
          for (let i = -2; i <= 2; i++) {
            const want = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
            if (img.get(x + i * ux.x + j * uy.x, y + i * ux.y + j * uy.y) === want) score++;
          }
        }
        if (score > best) { best = score; sx = x; sy = y; n = 1; }
        else if (score === best) { sx += x; sy += y; n++; }
      }
    }
    if (best >= 23) return { x: sx / n + 0.5, y: sy / n + 0.5 };
  }
  return est;
}

/** Perspective transform taking the 4 `src` points to the 4 `dst` points. */
function homography(src: Point[], dst: Point[]): number[] | null {
  // Solve for h0..h7 (h8 = 1): u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1), v likewise.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    if (Math.abs(A[piv]![c]!) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return A.map((row, i) => row[8]! / row[i]!);
}

function apply(h: number[], x: number, y: number): Point {
  const d = h[6]! * x + h[7]! * y + 1;
  return { x: (h[0]! * x + h[1]! * y + h[2]!) / d, y: (h[3]! * x + h[4]! * y + h[5]!) / d };
}

function transpose(g: boolean[][]): boolean[][] {
  return g.map((row, y) => row.map((_, x) => g[x]![y]!));
}

// ---------------------------------------------------------------------------
// Reading the grid
// ---------------------------------------------------------------------------

type Level = 'L' | 'M' | 'Q' | 'H';
// Index = version (0 unused).
const ECC_PER_BLOCK: Record<Level, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const NUM_BLOCKS: Record<Level, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
// Format bits 3-4 stand for the level: 01 L, 00 M, 11 Q, 10 H.
const LEVEL_FROM_BITS: readonly Level[] = ['M', 'L', 'H', 'Q'];

function formatCode(data: number): number {
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionCode(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function popcount(n: number): number {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Where the two copies of the 15 format bits sit, bit 0 first. */
function readFormatPositions(size: number): [[number, number][], [number, number][]] {
  const p1: [number, number][] = [];
  for (let i = 0; i <= 5; i++) p1.push([8, i]);
  p1.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) p1.push([14 - i, 8]);
  const p2: [number, number][] = [];
  for (let i = 0; i < 8; i++) p2.push([size - 1 - i, 8]);
  for (let i = 8; i < 15; i++) p2.push([8, size - 15 + i]);
  return [p1, p2];
}

/** Read a sampled grid (grid[y][x], true = dark). Returns the text or null. */
export function decodeGrid(grid: boolean[][]): string | null {
  const size = grid.length;
  if (size < 21 || (size - 17) % 4 !== 0) return null;
  let ver = (size - 17) / 4;
  const at = (x: number, y: number): number => (grid[y]![x]! ? 1 : 0);

  // Format: two copies; take whichever is nearest a real format code.
  let f1 = 0, f2 = 0;
  const [p1, p2] = readFormatPositions(size);
  p1.forEach(([x, y], i) => { f1 |= at(x, y) << i; });
  p2.forEach(([x, y], i) => { f2 |= at(x, y) << i; });
  let bestFormat = -1, bestDist = 99;
  for (let d = 0; d < 32; d++) {
    const code = formatCode(d);
    const dd = Math.min(popcount(code ^ f1), popcount(code ^ f2));
    if (dd < bestDist) { bestDist = dd; bestFormat = d; }
  }
  if (bestDist > 3) return null;
  const level = LEVEL_FROM_BITS[bestFormat >> 3]!;
  const mask = bestFormat & 7;

  if (ver >= 7) {
    let v1 = 0, v2 = 0;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      v1 |= at(a, b) << i;
      v2 |= at(b, a) << i;
    }
    let bestVer = -1, bd = 99;
    for (let v = 7; v <= 40; v++) {
      const code = versionCode(v);
      const dd = Math.min(popcount(code ^ v1), popcount(code ^ v2));
      if (dd < bd) { bd = dd; bestVer = v; }
    }
    if (bd <= 3 && bestVer !== ver) return null; // sampled at the wrong size
    if (bd <= 3) ver = bestVer;
  }

  // Which modules are fixed patterns rather than data.
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (x0: number, y0: number, w: number, h: number): void => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fixed[y]![x] = true;
  };
  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  const pos = alignmentPositions(ver);
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      mark(pos[i]! - 2, pos[j]! - 2, 5, 5);
    }
  }
  if (ver >= 7) { mark(size - 11, 0, 3, 6); mark(0, size - 11, 6, 3); }

  // Data bits in the zig-zag order, unmasked.
  const totalCodewords = Math.floor(rawDataModules(ver) / 8);
  const raw = new Array<number>(totalCodewords).fill(0);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y]![x]) continue;
        if (bit < totalCodewords * 8) {
          const v = (grid[y]![x]! !== maskBit(mask, x, y)) ? 1 : 0;
          raw[bit >> 3]! |= v << (7 - (bit & 7));
        }
        bit++;
      }
    }
  }

  // Undo the block interleaving, fix errors.
  const numBlocks = NUM_BLOCKS[level][ver]!;
  const eccLen = ECC_PER_BLOCK[level][ver]!;
  const numShort = numBlocks - (totalCodewords % numBlocks);
  const shortLen = Math.floor(totalCodewords / numBlocks);
  const blocks: number[][] = [];
  const dataLens: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    dataLens.push(shortLen - eccLen + (b < numShort ? 0 : 1));
    blocks.push([]);
  }
  let k = 0;
  const maxData = shortLen - eccLen + 1;
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < numBlocks; b++) if (i < dataLens[b]!) blocks[b]!.push(raw[k++]!);
  }
  for (let i = 0; i < eccLen; i++) {
    for (let b = 0; b < numBlocks; b++) blocks[b]!.push(raw[k++]!);
  }
  const data: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    const fixedBlock = rsCorrect(blocks[b]!, eccLen);
    if (!fixedBlock) return null;
    data.push(...fixedBlock.slice(0, dataLens[b]!));
  }
  return readSegments(data, ver);
}

// ---------------------------------------------------------------------------
// Reed-Solomon (GF(256), polynomial 0x11d, roots a^0 .. a^(n-1))
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}
const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);
const div = (a: number, b: number): number => (a === 0 ? 0 : EXP[(LOG[a]! + 255 - LOG[b]!) % 255]!);

/** Evaluate a polynomial given lowest power first at x. */
function evalLow(p: number[], x: number): number {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = mul(y, x) ^ p[i]!;
  return y;
}

/** Fix up to eccLen/2 wrong bytes in a block (highest power first). Null if too damaged. */
export function rsCorrect(block: number[], eccLen: number): number[] | null {
  const n = block.length;
  const S: number[] = [];
  let clean = true;
  for (let j = 0; j < eccLen; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s = mul(s, EXP[j]!) ^ block[i]!;
    S.push(s);
    if (s) clean = false;
  }
  if (clean) return block;

  // Berlekamp-Massey: error locator, lowest power first.
  let C = [1];
  let B = [1];
  let L = 0, m = 1, b = 1;
  for (let r = 0; r < eccLen; r++) {
    let d = S[r]!;
    for (let i = 1; i <= L; i++) d ^= mul(C[i] ?? 0, S[r - i]!);
    if (d === 0) { m++; continue; }
    const coef = div(d, b);
    const next = C.slice();
    for (let i = 0; i < B.length; i++) {
      while (next.length <= i + m) next.push(0);
      next[i + m]! ^= mul(coef, B[i]!);
    }
    if (2 * L <= r) { B = C; L = r + 1 - L; b = d; m = 1; } else { m++; }
    C = next;
  }
  if (2 * L > eccLen) return null;

  // Chien search: byte i has locator X = a^(n-1-i); a root at X^-1.
  const out = block.slice();
  // Error evaluator: S(x) * C(x) mod x^eccLen.
  const omega = new Array<number>(eccLen).fill(0);
  for (let i = 0; i < eccLen; i++) for (let j = 0; j <= i && j < C.length; j++) omega[i]! ^= mul(C[j]!, S[i - j]!);
  const dC: number[] = [];
  for (let i = 1; i < C.length; i++) dC.push(i % 2 === 1 ? C[i]! : 0);
  let found = 0;
  for (let i = 0; i < n; i++) {
    const p = n - 1 - i;
    const Xinv = EXP[(255 - p) % 255]!;
    if (evalLow(C, Xinv) !== 0) continue;
    const denom = evalLow(dC, Xinv);
    if (denom === 0) return null;
    const X = EXP[p % 255]!;
    out[i]! ^= mul(X, div(evalLow(omega, Xinv), denom));
    found++;
  }
  if (found !== L) return null;
  // Check the fix.
  for (let j = 0; j < eccLen; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s = mul(s, EXP[j]!) ^ out[i]!;
    if (s) return null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data segments
// ---------------------------------------------------------------------------

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function readSegments(data: number[], ver: number): string | null {
  let pos = 0;
  const total = data.length * 8;
  const read = (len: number): number => {
    let v = 0;
    for (let i = 0; i < len; i++, pos++) v = (v << 1) | ((data[pos >> 3]! >> (7 - (pos & 7))) & 1);
    return v;
  };
  const sizeClass = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  const bytes: number[] = [];
  let text = '';
  const flush = (): void => {
    if (!bytes.length) return;
    const arr = new Uint8Array(bytes);
    try { text += new TextDecoder('utf-8', { fatal: true }).decode(arr); }
    catch { text += String.fromCharCode(...arr); }
    bytes.length = 0;
  };
  while (pos + 4 <= total) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 0b0111) { // ECI: skip the designator
      const first = read(8);
      if ((first & 0x80) === 0) continue;
      if ((first & 0xc0) === 0x80) { read(8); continue; }
      read(16); continue;
    }
    if (mode === 0b0100) {
      const count = read([8, 16, 16][sizeClass]!);
      if (pos + count * 8 > total) return null;
      for (let i = 0; i < count; i++) bytes.push(read(8));
      continue;
    }
    flush();
    if (mode === 0b0001) {
      let count = read([10, 12, 14][sizeClass]!);
      while (count >= 3) { if (pos + 10 > total) return null; text += String(read(10)).padStart(3, '0'); count -= 3; }
      if (count === 2) text += String(read(7)).padStart(2, '0');
      else if (count === 1) text += String(read(4));
    } else if (mode === 0b0010) {
      let count = read([9, 11, 13][sizeClass]!);
      while (count >= 2) { if (pos + 11 > total) return null; const v = read(11); text += ALNUM[Math.floor(v / 45)]! + ALNUM[v % 45]!; count -= 2; }
      if (count === 1) text += ALNUM[read(6)]!;
    } else {
      return null; // Kanji, structured append, FNC1: not used by Pubby
    }
  }
  flush();
  return text;
}
