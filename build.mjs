// Builds the Pubby app into dist/:
//   index.html             the whole game in one self-contained page
//   manifest.webmanifest   lets phones install Pubby on the home screen
//   sw.js                  service worker that keeps the app for offline play
//   icons/                 app icons (PNGs are pre-rendered from icon.svg)
// The UI is plain TypeScript (no framework). esbuild bundles src/main.ts with
// the rules engine and session layer, and the styles are inlined. dist/ is
// what GitHub Pages serves (.github/workflows/pages.yml).
// Usage: npm run build   (needs esbuild)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const pwa = join(root, 'src/pwa');

// Version shown in the app: MAJOR.MINOR from package.json ("1.2.0" -> "1.2").
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const appVersion = pkg.version.split('.').slice(0, 2).join('.');

const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  loader: { '.md': 'text' },
  define: {
    __PUBBY_VERSION__: JSON.stringify(appVersion),
    // The room server (CODE.md 9r.5.1). PUBBY_SERVER overrides it for a test build.
    __PUBBY_SERVER__: JSON.stringify(process.env.PUBBY_SERVER ?? 'https://pubby-rooms.mmans99.workers.dev'),
  },
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*STYLES*/', () => css)
  .replace('/*BUNDLE*/', () => js);

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'icons'), { recursive: true });
writeFileSync(join(dist, 'index.html'), html);

// Static files, copied as they are.
const icons = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
for (const f of icons) copyFileSync(join(pwa, f), join(dist, 'icons', f));
copyFileSync(join(pwa, 'manifest.webmanifest'), join(dist, 'manifest.webmanifest'));

// Everything the service worker saves for offline play. './' is the app page.
const shell = ['./', 'manifest.webmanifest', ...icons.map((f) => `icons/${f}`)];

// Version = hash of every shell file, so any change makes a new cache.
const hash = createHash('sha256');
hash.update(html);
hash.update(readFileSync(join(dist, 'manifest.webmanifest')));
for (const f of icons) hash.update(readFileSync(join(dist, 'icons', f)));
const version = hash.digest('hex').slice(0, 12);

const sw = readFileSync(join(pwa, 'sw.js'), 'utf8')
  .replace("'__VERSION__'", () => JSON.stringify(version))
  .replace('__SHELL__', () => JSON.stringify(shell));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`Pubby v${appVersion}. dist/ written: index.html (${(html.length / 1024).toFixed(1)} KB), sw.js, manifest, ${icons.length} icons; version ${version}`);
