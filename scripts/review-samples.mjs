#!/usr/bin/env node
// Builds the fictional sample decks in MOCK mode (no key, no network) and writes a visual-review report for each plus a gallery page.
// usage: node scripts/review-samples.mjs [--only 01,03] [--sizes 1280x720,800x1200] [--fast] [--out generated/review]
// Output: <out>/<doc>/ (the deck + review/), <out>/index.html (gallery). Open the gallery and judge the decks yourself.
import '../tests/support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process'; import { fileURLToPath } from 'url';
import { runFilmDeck } from '../tools/lib/filmdeck.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), a = process.argv.slice(2), val = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
const only = (val('--only') || '').split(',').filter(Boolean), out = path.resolve(root, val('--out') || 'generated/review');
const docs = fs.readdirSync(path.join(root, 'tests/corpus/docs')).filter(f => !only.length || only.some(o => f.startsWith(o))).sort();
const dirs = [];
for (const f of docs) {
  const base = f.replace(/\.[^.]+$/, ''), dir = path.join(out, base);
  const r = await runFilmDeck({ inputPath: path.join(root, 'tests/corpus/docs', f), outputDir: dir, mode: 'mock', mockFixture: path.join(root, 'tests/corpus/fixtures', base + '.json'), qaMode: 'none', fictional: true });
  if (!r.ok) { console.error(`${f}: ${r.title}: ${r.reason}`); process.exit(1); } console.log(`built ${f}`); dirs.push(dir);
}
const extra = [val('--sizes') && ['--sizes', val('--sizes')], a.includes('--fast') && ['--fast']].filter(Boolean).flat();
const r = spawnSync(process.execPath, [path.join(root, 'tools/review-deck.mjs'), ...dirs, '--gallery', path.join(out, 'index.html'), ...extra], { stdio: 'inherit' });
process.exit(r.status || 0);
