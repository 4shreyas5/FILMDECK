// Deterministic tests of tools/chunk-source.mjs. No browser, no network. Run: node tests/ingestion/chunk-tests.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawnSync } from 'child_process';
import { chunkSource, splitText, reassemble, DEFAULT_MAX_CHARS } from '../../tools/chunk-source.mjs';
import { ingestFile, ingestBuffer } from '../../tools/ingest/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), C = f => path.join(root, 'tests/corpus/docs', f), F = f => path.join(root, 'tests/ingestion/fixtures', f);
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const lossless = (doc, r) => { const m = reassemble(r); return doc.sections.every(s => m.get(s.id) === s.text) && m.size === doc.sections.length; };

const small = ingestFile(F('report.pdf')); const rs = chunkSource(small);
t('a short document is one chunk', rs.chunkCount === 1 && rs.chunks[0].id === 'chunk-1' && rs.chunks[0].sectionIds.length === small.sections.length);
t('chunk has ids, text, size estimates, first/last location', (() => { const c = rs.chunks[0]; return c.text.startsWith('[page-1-b1] (page 1 · heading)\n') && c.chars === c.text.length && c.tokenEstimate === Math.ceil(c.chars / 3.6) && c.first.sectionId === 'page-1-b1' && c.first.location === 'page-1' && c.last.location === 'page-3'; })());
t('section ids and order preserved', rs.chunks.flatMap(c => c.sectionIds).join() === small.sections.map(s => s.id).join());
t('lossless for a short document', lossless(small, rs));

const long = ingestFile(C('11-long-report.md'), { fictional: true }); const rl = chunkSource(long);
t('the long corpus report (over 120,000 characters) needs several chunks', long.sections.reduce((n, s) => n + s.text.length, 0) > 120000 && rl.chunkCount > 1, rl.chunkCount);
t('every chunk respects the size limit', rl.chunks.every(c => c.chars <= DEFAULT_MAX_CHARS), rl.chunks.map(c => c.chars).join());
t('nothing lost, duplicated or reordered across chunks (long report)', lossless(long, rl));
t('chunks are consecutive and cover every section in document order', rl.chunks.map(c => c.id).join() === rl.chunks.map((_, i) => `chunk-${i + 1}`).join() && [...new Set(rl.chunks.flatMap(c => c.sectionIds))].join() === long.sections.map(s => s.id).join());
t('deterministic: same input, byte-identical output', JSON.stringify(chunkSource(long)) === JSON.stringify(rl));
t('chunk boundaries fall between sections where possible (no section split when it fits)', rl.chunks.every(c => !/part \d+\/\d+/.test(c.text)));

// splitting
const prose = ('Revenue was ₹ 4,200 crore, up 12.5 % on 3.5 x coverage. Margin rose to 41.3 % from 39.8 %; growth hit $ 1,234,567.89 overall. ').repeat(60);
let ok = true, reason = '';
for (const max of [211, 250, 333, 400, 557, 901]) {
  const parts = splitText(prose, max);
  if (parts.join('') !== prose) { ok = false; reason = 'not lossless at ' + max; break; }
  if (parts.some(p => p.length > max)) { ok = false; reason = 'part too long at ' + max; break; }
  for (let i = 0; i < parts.length - 1; i++) { const a = parts[i].trimEnd(), b = parts[i + 1].trimStart(); if (/[\d₹$€£¥%.,+\-−–]$/.test(a.replace(/[.!?]$/, '')) && /^[\d₹$€£¥%.,+\-−–x]/.test(b) && !/[.!?]\s*$/.test(parts[i])) { ok = false; reason = `number split at max=${max}: "${a.slice(-12)}" | "${b.slice(0, 12)}"`; } }
}
t('splitting is lossless and never cuts a number from its unit or neighbours', ok, reason);
t('sentence boundaries are preferred over mid-sentence cuts', splitText(prose, 400).slice(0, -1).every(p => /[.!?]\s+$/.test(p)));
t('text with no boundary at all falls back to a hard cut but stays lossless', splitText('x'.repeat(1000), 300).join('') === 'x'.repeat(1000) && splitText('x'.repeat(1000), 300).every(p => p.length <= 300));
t('a single oversized section becomes labelled parts that reassemble exactly', (() => { const d = ingestBuffer(Buffer.from('# Big\n\n' + prose), 'big.md'); const r = chunkSource(d, { maxChars: 1500 }); return r.chunkCount > 2 && lossless(d, r) && r.chunks.some(c => /part 2\/\d+/.test(c.text)) && r.chunks.every(c => c.chars <= 1500); })());
t('tables stay intact when they fit and split on row boundaries when they do not', (() => { const rows = Array.from({ length: 80 }, (_, i) => `| Region ${i} | ${1000 + i} | ${i % 9}.${i % 7}% |`).join('\n'); const d = ingestBuffer(Buffer.from(`| Name | Value | Rate |\n|---|---|---|\n${rows}\n`), 't.md'); const r = chunkSource(d, { maxChars: 1000 }); return r.chunkCount > 1 && lossless(d, r) && r.chunks.every(c => c.text.split('\n').every(l => !l || /^\[|^\w/.test(l))); })());
t('every number token of the source appears in the chunks (information preserved)', (() => { const all = rl.chunks.map(c => c.text).join('\n'); return (long.sections.map(s => s.text).join('\n').match(/\d[\d,.]*\d|\d/g) || []).every(n => all.includes(n)); })());
// CLI
const out = path.join(root, 'generated/sources/chunk-test.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); const norm = path.join(root, 'generated/sources/long-test-source.json');
fs.writeFileSync(norm, JSON.stringify(long));
let r = spawnSync('node', [path.join(root, 'tools/chunk-source.mjs'), norm, '--out', out, '--max-chars', '30000'], { encoding: 'utf8' });
t('CLI writes chunks.json and honours --max-chars', r.status === 0 && JSON.parse(fs.readFileSync(out, 'utf8')).maxChars === 30000 && JSON.parse(fs.readFileSync(out, 'utf8')).chunks.every(c => c.chars <= 30000), r.stderr);
r = spawnSync('node', [path.join(root, 'tools/chunk-source.mjs'), path.join(root, 'package.json')], { encoding: 'utf8' }); t('CLI rejects input that is not a normalized source', r.status === 1 && /CHUNKING FAILED/.test(r.stderr));
fs.rmSync(out, { force: true }); fs.rmSync(norm, { force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL CHUNKING TESTS PASSED'); process.exit(bad ? 1 : 0);
