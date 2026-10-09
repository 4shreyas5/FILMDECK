// End-to-end: one real document of each format -> `filmdeck` (ingest, mock storyboard, validate, generate, assemble, REAL browser QA) -> finished HTML.
// Needs playwright-core (FILMDECK_QA_MODULES). No API key, no network except the GSAP CDN script the decks load. Slow (about 2-4 minutes per deck).
// Run: node tests/e2e/e2e.mjs [--only md|txt|docx|pdf|pptx]
import '../support/qa-env.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawnSync } from 'child_process';
import { validateStoryboard } from '../../tools/validate-storyboard.mjs'; import { checkSchema } from '../../tools/schema-lite.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), IN = f => path.join(root, 'tests/e2e/inputs', f), J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const cases = [['md', 'arcdesk.md', []], ['txt', 'arcdesk.txt', ['--fictional']], ['pptx', 'northwind-q3.pptx', ['--fictional']], ['docx', 'arcdesk.docx', []], ['pdf', 'arcdesk-report.pdf', []]]
  .filter(c => !process.argv.includes('--only') || c[0] === process.argv[process.argv.indexOf('--only') + 1]);
const srcSchema = J(path.join(root, 'schemas/source.schema.json'));
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; // E2E must never depend on, or use, a key
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-e2e-'));
for (const [kind, file, extra] of cases) {
  const out = path.join(tmp, kind); const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, 'tools/filmdeck.mjs'), IN(file), '--out', out, '--qa=full', ...extra], { encoding: 'utf8', env, maxBuffer: 1 << 28, timeout: 15 * 60 * 1000 });
  t(`${kind}: pipeline exits 0 (${((Date.now() - t0) / 1000).toFixed(0)}s)`, r.status === 0, (r.stderr || '') + (r.stdout || '').slice(-400));
  if (r.status !== 0) continue;
  const src = J(path.join(out, 'source.json')), sb = J(path.join(out, 'storyboard.json')), qa = J(path.join(out, 'qa-report.json')), run = J(path.join(out, 'run.json'));
  t(`${kind}: ingestion produced a valid normalized source`, checkSchema(srcSchema, src).length === 0 && src.document.type === { md: 'markdown', txt: 'text' }[kind] || checkSchema(srcSchema, src).length === 0 && src.document.type === kind, src.document.type);
  t(`${kind}: storyboard validates`, validateStoryboard(sb).errors.length === 0);
  t(`${kind}: every artifact exists`, ['source.json', 'storyboard.json', 'deck.json', 'scenes.js', 'scenes.css', 'index.html', 'qa-report.json', 'run.json'].every(f => fs.existsSync(path.join(out, f))));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  t(`${kind}: HTML is a complete deck (runtime once, all scenes)`, html.length > 50000 && html.split('const SND=').length === 2 && sb.scenes.every((s, i) => html.includes(`id="s${i + 1}"`)));
  t(`${kind}: browser QA passed (${qa.checks.passed}/${qa.checks.total}), no console errors`, qa.passed === true && qa.mode === 'full' && qa.checks.failed === 0 && qa.consoleErrors === 0 && qa.checks.total >= 29, JSON.stringify(qa.checks));
  t(`${kind}: qa-report has scene/beat counts and duration`, qa.sceneCount === sb.scenes.length && qa.beatCount === run.beatCount && qa.durationMs > 0);
  t(`${kind}: run.json says ready, mock, not AI`, run.status === 'ready' && run.generation.mode === 'mock' && run.generation.aiGenerated === false && run.qa.passed === true);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL END-TO-END TESTS PASSED'); process.exit(bad ? 1 : 0);
