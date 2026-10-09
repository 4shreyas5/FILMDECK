#!/usr/bin/env node
// Source text/markdown -> storyboard JSON (Claude, or deterministic fixtures with --mock) -> validator gate -> bounded repair loop.
// Input modes: .md/.txt (paragraph blocks p1..pN, unchanged), normalized source .json from tools/ingest-source.mjs, or .pdf/.pptx/.docx (ingested in-process first).
// usage: node tools/generate-storyboard.mjs <source.md|txt|normalized.json|pdf|pptx|docx> --out <storyboard.json> [--mock [--fixture <file>]] [--max-repairs N] [--model id]
// Exit codes: 0 valid storyboard saved; 1 could not produce a valid storyboard; 2 usage; 3 live mode without ANTHROPIC_API_KEY.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { prepareSource, runPipeline, mockCaller, MAX_REPAIRS } from './ai/storyboard-lib.mjs';
import { callClaude, hasKey, DEFAULT_MODEL, ClaudeError } from './ai/claude.mjs';
import { planStrategy, runMapStage, callBudget, DocumentTooLargeError } from './ai/multichunk.mjs';
import { ingestFile, detectType, IngestError } from './ingest/index.mjs';
import { checkNormalized, normalizedToSrc } from './source-to-prompt.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2); const flag = n => args.includes(n); const val = n => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith('--') && !['--out', '--fixture', '--max-repairs', '--model'].includes(args[i - 1]));
const out = val('--out');
if (!file || !out) { console.error('usage: node tools/generate-storyboard.mjs <source-file> --out <storyboard.json> [--mock] [--fictional] [--fixture file] [--max-repairs N<=3] [--model id]'); process.exit(2); }
const mock = flag('--mock'); const model = val('--model') || process.env.FILMDECK_MODEL || DEFAULT_MODEL;
if (!mock && !hasKey()) { console.error('ANTHROPIC_API_KEY is not set: live mode cannot run (no result was invented). Use --mock for offline fixture runs.'); process.exit(3); }

// Mock mode sends nothing anywhere, so long sources are fine there; a live call is limited to one prompt's worth until chunked generation exists.
const lim = { maxChars: Infinity }; // size policy lives in planStrategy (single call up to 60,000 characters, map/design above, refusal above 300,000)
const progress = e => { if (process.env.FILMDECK_PROGRESS === '1') console.log('@@FD ' + JSON.stringify(e)); }; // machine-readable progress for runFilmDeck
let src, doc = null;
try {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md' || ext === '.txt') src = prepareSource(fs.readFileSync(file, 'utf8'), path.basename(file));
  else if (ext === '.json') { doc = checkNormalized(JSON.parse(fs.readFileSync(file, 'utf8'))); src = normalizedToSrc(doc, lim); }
  else if (detectType(file)) { doc = ingestFile(file, { fictional: flag('--fictional') }); src = normalizedToSrc(doc, lim); }
  else throw new IngestError('unsupported', `unsupported input "${ext}"`);
  if (flag('--fictional')) src.meta.fictional = true;
} catch (e) { console.error('INPUT FAILED: ' + e.message); process.exit(1); }
const base = path.basename(file).replace(/\.[^.]+$/, '');
const call = mock ? mockCaller(path.resolve(val('--fixture') || path.join(root, 'tests/ai/fixtures', base + '.json')))
  : ({ system, user, maxTokens }) => callClaude({ system, messages: [{ role: 'user', content: user }], model, ...(maxTokens ? { maxTokens } : {}) });
console.log(mock ? 'MODE: MOCK (deterministic fixture responses, not an AI result)' : `MODE: LIVE (${model})`);
const outBase = out.replace(/\.json$/, ''); fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const t0 = Date.now();
// A failure of the live path is saved as <out>.error.json: a machine-readable kind plus a message that is safe to show. Provider text is never shown.
const failLive = (kind, message, extra = {}) => { fs.writeFileSync(outBase + '.error.json', JSON.stringify({ kind, message, ...extra }, null, 2)); console.error(`FAILED (${kind}): ${message}`); process.exit(1); };
let strategy = 'single', mapRes = null, sourceInner;
try {
  if (!mock && doc) {
    const plan = planStrategy(doc); strategy = plan.strategy;
    if (strategy === 'multi-chunk') {
      mapRes = await runMapStage({ doc, call, onProgress: progress });
      fs.writeFileSync(outBase + '.digest.json', JSON.stringify({ chunkCount: mapRes.chunkCount, droppedCandidates: mapRes.stats.dropped, parts: mapRes.parts }, null, 2));
      sourceInner = mapRes.digest; console.log(`MAP: ${mapRes.chunkCount} parts, ${mapRes.stats.calls} call(s), ${mapRes.stats.dropped} candidate fact(s) dropped as not exact quotes`);
    }
  }
  progress({ type: 'design-start', strategy });
} catch (e) {
  if (e instanceof DocumentTooLargeError) failLive('too-large', e.message);
  if (e instanceof ClaudeError) failLive(e.kind, e.message, { status: e.status, callsAttempted: (e.pipeline?.calls || 0) + 1, httpAttempts: (e.pipeline?.httpAttempts || 0) + (e.httpAttempts || 0) });
  failLive(e.kind || 'malformed', e.message);
}
const res = await runPipeline({ src, call, sourceInner, maxRepairs: Number(val('--max-repairs') ?? MAX_REPAIRS), onProgress: progress }).catch(e => ({ fatal: e }));
if (res.fatal) { const e = res.fatal; if (e instanceof ClaudeError) failLive(e.kind, e.message, { status: e.status, callsAttempted: (e.pipeline?.calls || 0) + 1, httpAttempts: (e.pipeline?.httpAttempts || 0) + (e.httpAttempts || 0) }); console.error('FAILED:', e.message); process.exit(1); }
res.attempts.forEach(a => console.log(`attempt ${a.attempt} (${a.kind}): ${a.valid ? 'VALID' : a.errorCount + ' error(s)'}${a.errors.length ? '  [' + [...new Set(a.errors.map(e => e.category))].join(', ') + ']' : ''}`));
const m = mapRes ? mapRes.stats : { calls: 0, httpAttempts: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, dropped: 0, duplicates: 0, retries: 0 };
const usage = { input: res.usage.input + m.usage.input, output: res.usage.output + m.usage.output, cacheRead: res.usage.cacheRead + m.usage.cacheRead, cacheWrite: res.usage.cacheWrite + m.usage.cacheWrite };
const report = { mode: mock ? 'mock' : 'live', model: mock ? null : (res.model || model), strategy: mock ? 'fixture' : strategy, chunkCount: mapRes ? mapRes.chunkCount : 1, source: path.basename(file), valid: res.valid, firstPassValid: res.firstPassValid, repairsUsed: res.repairsUsed,
  calls: { total: m.calls + res.calls, map: m.calls, design: res.calls, repair: res.repairsUsed }, httpAttempts: m.httpAttempts + res.httpAttempts, mapRetries: m.retries, droppedCandidates: m.dropped, duplicateCandidates: m.duplicates || 0, callBudget: mock ? null : callBudget({ strategy, chunkCount: mapRes ? mapRes.chunkCount : 1, maxRepairs: Number(val('--max-repairs') ?? MAX_REPAIRS) }), usage, aiMs: Date.now() - t0, attempts: res.attempts };
fs.writeFileSync(outBase + '.report.json', JSON.stringify(report, null, 2));
if (res.valid) { fs.writeFileSync(out, JSON.stringify(res.storyboard, null, 2)); console.log(`saved valid storyboard: ${out} (${res.repairsUsed} repair(s))`); process.exit(0); }
fs.writeFileSync(outBase + '.rejected.txt', res.lastText);
if (!mock) fs.writeFileSync(outBase + '.error.json', JSON.stringify({ kind: 'validation', message: `the storyboard was still invalid after ${res.repairsUsed} repair attempt(s)`, categories: [...new Set(res.attempts.at(-1).errors.map(e => e.category))] }, null, 2));
console.error(`FAILED: still invalid after ${res.repairsUsed} repair attempt(s). Last response saved to ${outBase}.rejected.txt. Nothing was patched.`); process.exit(1);
