#!/usr/bin/env node
// LIVE evaluation harness: runs real documents through the whole pipeline with REAL Claude and measures what happens.
// !! THIS COSTS MONEY !! Every run makes billable Anthropic calls. It is never part of `npm test`. It refuses to run without ANTHROPIC_API_KEY.
// usage: node tests/live/live-eval.mjs [--only id,id] [--qa fast|full|none] [--repeats N] [--out dir] [--cases file] [--yes]
//   --repeats N   how many times the 'variance' cases run (default 2). Other cases run once.
//   --yes         skip the 5-second cost warning
// Output: <out>/summary.json, <out>/report.md and one folder per run (the normal FilmDeck artifacts, no key in any of them).
// Every number in the report is measured in this run; nothing is estimated except cost, which is computed only if you set
// FILMDECK_PRICE_IN_PER_MTOK and FILMDECK_PRICE_OUT_PER_MTOK (USD per million tokens) yourself.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { runFilmDeck, priceUsage } from '../../tools/lib/filmdeck.mjs'; import { DEFAULT_MODEL } from '../../tools/ai/claude.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2), val = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.trim()) { console.error('REFUSING TO RUN: ANTHROPIC_API_KEY is not set. The live evaluation calls the real Claude API and costs money; it never falls back to mock.'); process.exit(3); }
const overridden = !!process.env.ANTHROPIC_BASE_URL, model = process.env.FILMDECK_MODEL || DEFAULT_MODEL;
const qaMode = val('--qa') || 'fast', repeats = Number(val('--repeats') || 2), only = (val('--only') || '').split(',').filter(Boolean);
if (!['fast', 'full', 'none'].includes(qaMode)) { console.error('--qa must be fast, full or none'); process.exit(2); }
const casesFile = path.resolve(root, val('--cases') || 'tests/live/cases.json'); let cases = JSON.parse(fs.readFileSync(casesFile, 'utf8')).cases; if (only.length) cases = cases.filter(c => only.includes(c.id));
if (!cases.length) { console.error('no matching cases'); process.exit(2); }
const plan = cases.flatMap(c => Array.from({ length: c.variance ? repeats : 1 }, (_, i) => ({ c, rep: i + 1 })));
const outDir = path.resolve(root, val('--out') || path.join('generated/live-eval', new Date().toISOString().replace(/[:.]/g, '-')));
console.log(`LIVE EVALUATION  model=${model}  QA=${qaMode}  runs=${plan.length}${overridden ? '\n!! ANTHROPIC_BASE_URL is set: these results are NOT from api.anthropic.com and say nothing about real Claude !!' : ''}`);
console.log(`Each run makes 1 to 4 Claude calls (1 initial + up to 3 repairs); long documents add one call per ~24,000-character chunk. This costs money.`);
if (!a.includes('--yes')) { console.log('Starting in 5 seconds. Press Ctrl+C to cancel.'); await new Promise(r => setTimeout(r, 5000)); }
fs.mkdirSync(outDir, { recursive: true });

const NUM = /\d[\d,.]*/g, nums = s => (String(s).match(NUM) || []).map(t => t.replace(/[.,]+$/, '').replace(/,/g, ''));
const J = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const jac = (x, y) => { const A = new Set(x), B = new Set(y), i = [...A].filter(v => B.has(v)).length, u = new Set([...A, ...B]).size; return u ? +(i / u).toFixed(2) : 1; };
const runs = [];
for (const { c, rep } of plan) {
  const dir = path.join(outDir, `${c.id}-r${rep}`), t0 = Date.now();
  console.log(`\n--- ${c.id} (run ${rep}) ${c.kind}`);
  const r = await runFilmDeck({ inputPath: path.join(root, c.file), outputDir: dir, name: `${c.id}-r${rep}`, mode: 'live', qaMode, fictional: !!c.fictional, onEvent: e => { if (e.type !== 'note') console.log('   ' + e.message); } });
  const run = { case: c.id, kind: c.kind, rep, ok: r.ok, wallMs: Date.now() - t0, errorKind: r.errorKind || null, failedStage: r.ok ? null : r.stage, failure: r.ok ? null : r.reason };
  const m = r.manifest || J(path.join(dir, 'run.json')), rep0 = J(path.join(dir, 'storyboard.report.json')), sb = J(path.join(dir, 'storyboard.json')), src = J(path.join(dir, 'source.json'));
  if (m) { run.generation = m.generation; run.chunkCount = m.chunkCount; run.sectionCount = m.sectionCount; run.qa = m.qa; run.timingsMs = m.timingsMs; }
  if (rep0) { run.attempts = rep0.attempts.map(x => ({ attempt: x.attempt, valid: x.valid, errorCount: x.errorCount, categories: [...new Set(x.errors.map(e => e.category))] })); run.firstPassValid = rep0.firstPassValid; run.repairsUsed = rep0.repairsUsed; }
  if (sb && src) {
    const text = new Map(src.sections.map(s => [s.id, s.text])), facts = sb.facts || [];
    run.scenes = sb.scenes.length; run.beats = sb.scenes.reduce((n, s) => n + s.beats.length, 0); run.recipes = sb.scenes.map(s => s.recipe); run.factCount = facts.length;
    run.factsDisplay = facts.filter(f => !f.derivation).map(f => f.display); run.sourceRefs = [...new Set(facts.map(f => f.sourceRef).filter(Boolean).concat((sb.sources || []).map(s => s.id)))];
    run.sourceCoverage = +(run.sourceRefs.length / src.sections.length).toFixed(2);
    // independent re-check (separate from the validator): every number of every non-derived fact occurs in the cited section's text
    run.inventedNumbers = facts.filter(f => !f.derivation).flatMap(f => nums(f.display).filter(n => !nums(text.get(f.sourceRef) || '').includes(n)).map(n => `${f.id}:${n}`));
    run.titles = { deck: sb.deck.title, scenes: sb.scenes.map(s => s.title || s.kicker || s.id) };
    if (c.expectNoFacts) run.noFactsOk = facts.length === 0;
    if (c.injection) { const all = JSON.stringify(sb) + (fs.existsSync(path.join(dir, 'index.html')) ? fs.readFileSync(path.join(dir, 'index.html'), 'utf8') : ''); run.injectionLeaks = c.injection.filter(s => all.toLowerCase().includes(s.toLowerCase())); }
  }
  if (c.expectMultiChunk) run.multiChunkOk = !!(m && m.generation && m.generation.strategy === 'multi-chunk');
  runs.push(run); console.log(`   => ${r.ok ? 'OK' : 'FAILED (' + (r.errorKind || r.stage) + ')'}  ${run.scenes ?? '-'} scenes / ${run.beats ?? '-'} beats, calls ${run.generation?.calls?.total ?? '-'}, repairs ${run.repairsUsed ?? '-'}, ${Math.round(run.wallMs / 1000)}s`);
}

// ---------- metrics (only what was measured) ----------
const reached = runs.filter(r => r.attempts), cats = {};
for (const r of reached) for (const at of r.attempts) for (const k of at.categories) cats[k] = (cats[k] || 0) + 1;
const sum = f => runs.reduce((n, r) => n + (f(r) || 0), 0), pct = (x, y) => (y ? +(100 * x / y).toFixed(1) : null);
const tokens = { input: sum(r => r.generation?.usage?.input), output: sum(r => r.generation?.usage?.output), cacheRead: sum(r => r.generation?.usage?.cacheRead), cacheWrite: sum(r => r.generation?.usage?.cacheWrite) };
const cost = priceUsage(tokens); // null unless FILMDECK_PRICE_IN_PER_MTOK and FILMDECK_PRICE_OUT_PER_MTOK are set (cache prices: FILMDECK_PRICE_CACHE_READ_PER_MTOK / _CACHE_WRITE_)
const metrics = {
  runs: runs.length, runsThatProducedAStoryboardAttempt: reached.length, succeeded: runs.filter(r => r.ok).length, failed: runs.filter(r => !r.ok).length,
  firstPassValidRate: pct(reached.filter(r => r.firstPassValid).length, reached.length), repairRate: pct(reached.filter(r => r.repairsUsed > 0).length, reached.length),
  avgRepairsPerRun: reached.length ? +(sum(r => r.repairsUsed) / reached.length).toFixed(2) : null,
  errorCategoriesAcrossAllAttempts: cats,
  groundingFailures: (cats['ungrounded-fact'] || 0) + (cats['evidence'] || 0) + (cats['number-provenance'] || 0) + (cats['source-reference'] || 0),
  unsupportedRecipeFailures: (cats['unsupported-recipe'] || 0) + (cats['unknown-recipe'] || 0), beatCountFailures: cats['beat-count'] || 0,
  textLimitAndInputFailures: (cats['recipe-input'] || 0) + (cats['forbidden-content'] || 0) + (cats['schema'] || 0),
  qaFailures: runs.filter(r => r.failedStage === 'qa').length, claudeCalls: sum(r => r.generation?.calls?.total), httpAttempts: sum(r => r.generation?.httpAttempts),
  totalWallSeconds: Math.round(sum(r => r.wallMs) / 1000), totalAiSeconds: Math.round(sum(r => r.generation?.aiMs) / 1000), tokens,
  inventedNumbersFoundByIndependentCheck: sum(r => r.inventedNumbers?.length),
  costUSD: cost ? cost.usd : 'not computed: set FILMDECK_PRICE_IN_PER_MTOK and FILMDECK_PRICE_OUT_PER_MTOK', costDetail: cost || undefined,
};
// variance: same document, repeated runs
const variance = []; for (const c of cases.filter(x => x.variance)) { const rs = runs.filter(r => r.case === c.id && r.recipes); if (rs.length < 2) continue;
  variance.push({ case: c.id, runs: rs.length, scenes: rs.map(r => r.scenes), beats: rs.map(r => r.beats), facts: rs.map(r => r.factCount), repairs: rs.map(r => r.repairsUsed), calls: rs.map(r => r.generation.calls.total), qaPassed: rs.map(r => !!(r.qa && r.qa.passed)),
    recipeSequenceIdentical: rs.every(r => r.recipes.join() === rs[0].recipes.join()), recipeSetJaccard: jac(rs[0].recipes, rs[1].recipes), factSetJaccard: jac(rs[0].factsDisplay, rs[1].factsDisplay), sourceRefJaccard: jac(rs[0].sourceRefs, rs[1].sourceRefs), deckTitles: rs.map(r => r.titles.deck), sceneTitles: rs.map(r => r.titles.scenes) }); }
const summary = { generatedAt: new Date().toISOString(), endpoint: overridden ? 'OVERRIDDEN via ANTHROPIC_BASE_URL (not real Claude)' : 'api.anthropic.com', simulated: overridden, requestedModel: model, modelsReported: [...new Set(runs.map(r => r.generation?.model).filter(Boolean))], qaMode, metrics, variance, runs };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
const md = [`# FilmDeck live evaluation`, '', overridden ? '> **NOT REAL CLAUDE: ANTHROPIC_BASE_URL was overridden.**\n' : '', `Model: ${model} (reported by API: ${summary.modelsReported.join(', ') || 'none'}) · QA: ${qaMode} · ${new Date().toISOString()}`, '',
  '## Metrics (measured)', '', '```json', JSON.stringify(metrics, null, 2), '```', '', '## Runs', '', '| case | run | result | scenes | beats | facts | calls | repairs | first pass | source coverage | invented numbers | QA | seconds |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...runs.map(r => `| ${r.case} | ${r.rep} | ${r.ok ? 'ok' : 'FAILED ' + (r.errorKind || r.failedStage)} | ${r.scenes ?? '-'} | ${r.beats ?? '-'} | ${r.factCount ?? '-'} | ${r.generation?.calls?.total ?? '-'} | ${r.repairsUsed ?? '-'} | ${r.firstPassValid ?? '-'} | ${r.sourceCoverage ?? '-'} | ${r.inventedNumbers ? r.inventedNumbers.length : '-'} | ${r.qa ? (r.qa.passed ? 'pass' : 'FAIL') : '-'} | ${Math.round(r.wallMs / 1000)} |`),
  '', '## Variance (same document, repeated)', '', variance.length ? '```json\n' + JSON.stringify(variance, null, 2) + '\n```' : '(no variance case ran twice)', '',
  '## Special checks', '', ...runs.filter(r => r.injectionLeaks !== undefined || r.noFactsOk !== undefined || r.multiChunkOk !== undefined).map(r => `- ${r.case}: ${[r.injectionLeaks !== undefined ? 'injection text leaked into deck: ' + (r.injectionLeaks.length ? r.injectionLeaks.join('; ') : 'none') : '', r.noFactsOk !== undefined ? 'no invented facts: ' + r.noFactsOk : '', r.multiChunkOk !== undefined ? 'used multi-chunk strategy: ' + r.multiChunkOk : ''].filter(Boolean).join(' · ')}`),
  '', '## Narrative titles (read these: usable story?)', '', ...runs.filter(r => r.titles).map(r => `- **${r.case} r${r.rep}**: ${r.titles.deck} → ${r.titles.scenes.join(' / ')}`), ''].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(`\nreport: ${path.relative(root, path.join(outDir, 'report.md'))}\n` + JSON.stringify({ succeeded: metrics.succeeded, failed: metrics.failed, firstPassValidRate: metrics.firstPassValidRate, repairRate: metrics.repairRate, claudeCalls: metrics.claudeCalls, tokens }, null, 1));
process.exit(metrics.failed || metrics.inventedNumbersFoundByIndependentCheck ? 1 : 0);
