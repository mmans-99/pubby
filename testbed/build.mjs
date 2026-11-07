// Builds testbed/index.html: bundles testbed/main.ts (and the real rules
// engine it imports) into one self-contained page.
// Usage: node testbed/build.mjs   (needs esbuild)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'template.html'), 'utf8').replace('/*BUNDLE*/', () => js);
writeFileSync(join(here, 'index.html'), html);
console.log(`testbed/index.html written (${(html.length / 1024).toFixed(1)} KB)`);
