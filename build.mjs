// Builds the Pubby app into one self-contained page: dist/index.html.
// The UI is plain TypeScript (no framework). esbuild bundles src/main.ts with
// the rules engine and session layer, and the styles are inlined, so the page
// works offline and can be hosted on GitHub Pages as a single file.
// Usage: npm run build   (needs esbuild)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  loader: { '.md': 'text' },
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*STYLES*/', () => css)
  .replace('/*BUNDLE*/', () => js);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(1)} KB)`);
