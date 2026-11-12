// CODE.md 9m.1 rule 2: files in src/ai/ may import only the pure rules, the
// session types and view, and (in seen.ts only) netgame.ts. Never the session
// logic, the UI, audio or the other network files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aiDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/ai');

function importsOf(source: string): string[] {
  const specs: string[] = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) for (const m of source.matchAll(re)) specs.push(m[1] as string);
  return specs;
}

function allowed(file: string, spec: string): boolean {
  if (spec.startsWith('./')) return true; // same folder (src/ai)
  if (/^\.\.\/rules\/[^/]+\.ts$/.test(spec)) return true;
  if (spec === '../session/types.ts' || spec === '../session/view.ts') return true;
  if (spec === '../net/netgame.ts') return file === 'seen.ts';
  return false;
}

test('src/ai imports only the allowed modules', () => {
  const files = readdirSync(aiDir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 8, 'expected the src/ai modules to be present');
  const bad: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(aiDir, file), 'utf8');
    for (const spec of importsOf(source)) {
      if (!allowed(file, spec)) bad.push(`${file} imports ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('only seen.ts reads the network copy code', () => {
  const files = readdirSync(aiDir).filter((f) => f.endsWith('.ts'));
  const users = files.filter((f) => importsOf(readFileSync(join(aiDir, f), 'utf8')).includes('../net/netgame.ts'));
  assert.deepEqual(users, ['seen.ts']);
});
