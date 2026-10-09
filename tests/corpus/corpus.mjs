// Corpus run: every fictional document of tests/corpus/docs goes through the whole pipeline in MOCK mode (hand-planned storyboard fixtures,
// never AI output): ingest -> normalize -> chunk -> storyboard gates -> validate -> generate -> assemble -> browser QA (fast; full for a subset).
// These results say NOTHING about live Claude performance. Needs playwright-core (FILMDECK_QA_MODULES).
// usage: node tests/corpus/corpus.mjs [--only <substring>] [--full-all | --no-full]   (summary: generated/corpus/summary.json)
import '../support/qa-env.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
import { runFilmDeck } from '../../tools/lib/filmdeck.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), DOCS = path.join(root, 'tests/corpus/docs'), FX = path.join(root, 'tests/corpus/fixtures');
const arg = n => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const FULL = ['01-consulting-deck', '03-annual-report', '07-financial-report']; // representative: pptx, pdf (with the icon-rows recipe), markdown with a table
const files = fs.readdirSync(DOCS).sort().filter(f => !arg('--only') || f.includes(arg('--only')));
const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-corpus-')); const rows = []; let bad = 0;
const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 400) + ')'}`); if (!ok) bad++; };
console.log('MOCK MODE: storyboards are hand-planned fixtures, not AI output. These results are not evidence about live Claude.\n');
for (const f of files) {
  const base = f.replace(/\.[^.]+$/, ''); const qaMode = process.argv.includes('--full-all') || (FULL.includes(base) && !process.argv.includes('--no-full')) ? 'full' : 'fast';
  const out = path.join(tmp, base); const t0 = Date.now();
  const r = await runFilmDeck({ inputPath: path.join(DOCS, f), outputDir: out, mode: 'mock', mockFixture: path.join(FX, base + '.json'), qaMode, fictional: true, env });
  const row = { doc: f, ok: r.ok, qaMode, totalMs: Date.now() - t0 };
  if (r.ok) {
    const m = r.manifest, src = JSON.parse(fs.readFileSync(path.join(out, 'source.json'), 'utf8')), sb = JSON.parse(fs.readFileSync(path.join(out, 'storyboard.json'), 'utf8')), qa = JSON.parse(fs.readFileSync(path.join(out, 'qa-report.json'), 'utf8'));
    Object.assign(row, { sections: m.sectionCount, tables: src.stats.tables, chunks: m.chunkCount, extractionWarnings: src.warnings.length, facts: sb.facts.length, scenes: m.sceneCount, beats: m.beatCount, recipes: [...new Set(m.recipes)], qaChecks: `${qa.checks.passed}/${qa.checks.total}`, consoleErrors: qa.consoleErrors, layoutWarnings: qa.layoutWarnings, timingsMs: m.timingsMs, bytes: fs.statSync(path.join(out, 'index.html')).size, warnings: m.warnings.slice(0, 5) });
    t(`${base}: pipeline ok (${qaMode} QA ${row.qaChecks}, ${row.scenes} scenes / ${row.beats} beats, ${row.facts} facts, ${row.layoutWarnings} layout warnings, ${(row.totalMs / 1000).toFixed(0)}s)`, qa.passed === true && qa.consoleErrors === 0);
    if (base.startsWith('11-')) t('long report: needs more than one chunk', m.chunkCount > 1, m.chunkCount);
    else t(`${base}: fits in one chunk`, m.chunkCount === 1, m.chunkCount);
    if (base.startsWith('10-')) t('qualitative narrative: no numbers in the source and no facts', !/\d/.test(src.sections.map(s => s.text).join(' ')) && sb.facts.length === 0);
  } else { row.failure = `${r.title}: ${r.reason}`; t(`${base}: pipeline`, false, row.failure); }
  rows.push(row); fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(path.join(root, 'generated/corpus'), { recursive: true });
fs.writeFileSync(path.join(root, 'generated/corpus/summary.json'), JSON.stringify({ note: 'MOCK mode: hand-planned fixtures, not AI output', docs: rows }, null, 2));
console.log('\ndoc'.padEnd(34) + 'sections tables chunks facts scenes beats qa   layout-warn  time');
for (const r of rows) console.log(r.doc.padEnd(32) + [r.sections, r.tables, r.chunks, r.facts, r.scenes, r.beats].map(x => String(x ?? '-').padStart(7)).join('') + '  ' + (r.qaChecks || 'FAIL').padEnd(6) + String(r.layoutWarnings ?? '-').padStart(5) + String((r.totalMs / 1000).toFixed(0) + 's').padStart(9));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL CORPUS TESTS PASSED'); process.exit(bad ? 1 : 0);
