// Programmatic entry point of FilmDeck: document in, finished deck folder out. The CLI (tools/filmdeck.mjs) is a thin wrapper around this,
// and a future web server can call the same function. It never calls process.exit, never reads stdin, and reports progress through onEvent.
// Each stage runs the existing tool as a separate process (arguments are passed as an array, never through a shell).
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { spawn } from 'child_process'; import { fileURLToPath } from 'url';
import { detectType } from '../ingest/index.mjs'; import { DEFAULT_MODEL } from '../ai/claude.mjs'; import { projectName } from '../filmdeck-lib.mjs';
export { projectName };
// Cost of a live run, computed ONLY from the token counts the API reported times prices YOU configure (USD per million tokens). No built-in prices exist.
// Cache tokens are priced separately and only if their prices are set; otherwise they are listed as unpriced, never guessed. Returns null if no prices are set.
export function priceUsage(usage, env = process.env) {
  const price = n => { const v = env[n]; return v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null; };
  const pin = price('FILMDECK_PRICE_IN_PER_MTOK'), pout = price('FILMDECK_PRICE_OUT_PER_MTOK'), pcr = price('FILMDECK_PRICE_CACHE_READ_PER_MTOK'), pcw = price('FILMDECK_PRICE_CACHE_WRITE_PER_MTOK');
  if (!usage || pin === null || pout === null) return null;
  const c = { input: usage.input * pin / 1e6, output: usage.output * pout / 1e6, cacheRead: pcr === null ? null : usage.cacheRead * pcr / 1e6, cacheWrite: pcw === null ? null : usage.cacheWrite * pcw / 1e6 };
  return { kind: 'computed from actual API-reported usage and configured prices', currency: 'USD', usd: +(c.input + c.output + (c.cacheRead || 0) + (c.cacheWrite || 0)).toFixed(6), components: c,
    unpricedCacheTokens: { read: pcr === null ? usage.cacheRead : 0, write: pcw === null ? usage.cacheWrite : 0 } };
}
// What the user is told when the live (Claude) path fails. Provider text is never shown; the kind comes from storyboard.error.json.
export const LIVE_ERRORS = {
  auth: ['AI ACCESS DENIED', "FilmDeck couldn't sign in to the AI service: the API key on this machine was rejected."],
  rate_limit: ['AI SERVICE BUSY', 'The AI service is busy right now (rate limit). Please try again in a minute.'],
  server: ['AI SERVICE PROBLEM', 'The AI service had a temporary problem. Please try again.'],
  network: ['AI SERVICE UNREACHABLE', "FilmDeck couldn't reach the AI service. Check the internet connection and try again."],
  timeout: ['AI SERVICE TOO SLOW', 'The AI service took too long to answer. Please try again.'],
  context: ['DOCUMENT TOO LARGE FOR THE AI', 'This document is too large for the AI to analyse. Try a shorter document.'],
  'too-large': ['DOCUMENT TOO LONG', 'This document is too long. FilmDeck handles roughly 300,000 characters (about 150 pages).'],
  malformed: ['AI ANSWER UNUSABLE', "The AI's answer could not be used even after a retry. Please try again."],
  validation: ['PLAN FAILED THE FACT CHECKS', "The AI's plan did not pass FilmDeck's fact checks, even after corrections. Nothing was published. Please try again."],
  client: ['AI ANALYSIS FAILED', "FilmDeck couldn't complete the AI analysis. Please try again."],
};
export const NO_KEY_MESSAGE = "Live generation isn't configured on this machine (ANTHROPIC_API_KEY is not set). Nothing was run. Use mock mode, or set the key on the server.";
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATED = path.join(root, 'generated');
export const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
export const QA_MODES = ['fast', 'full', 'none'];
export const ARTIFACTS = ['source.json', 'chunks.json', 'storyboard.json', 'storyboard.report.json', 'storyboard.rejected.txt', 'storyboard.error.json', 'storyboard.digest.json', 'review', 'deck.json', 'scenes.js', 'scenes.css', 'index.html', 'index.failed-qa.html', 'qa-report.json', 'qa-output', 'run.json'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const TIMEOUT = { 'tools/ingest-source.mjs': 300000, 'tests/generated/qa.mjs': 1200000, 'tools/generate-storyboard.mjs': 1500000 }; // a hostile or huge document must not hang a worker forever
const nodeRun = (script, args, env, onLine) => new Promise(res => { const c = spawn(process.execPath, [path.join(root, script), ...args], { env, cwd: root, timeout: TIMEOUT[script] || 120000 }); let out = '', err = '', buf = ''; c.stdout.on('data', d => { out += d; if (onLine) { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } } }); c.stderr.on('data', d => err += d); c.on('error', e => res({ status: 1, stdout: out, stderr: String(e) })); c.on('close', status => res({ status, stdout: out, stderr: err })); });

/** options: inputPath (required), outputDir, name, mode 'auto'|'mock'|'live', mockFixture, qaMode 'fast'|'full'|'none', fictional, maxRepairs, model, onEvent, env */
export async function runFilmDeck(opts) {
  const { inputPath, outputDir, name: nameOpt, mode: requested = 'auto', mockFixture, qaMode = 'fast', fictional = false, maxRepairs, model, onEvent = () => {}, env = process.env } = opts;
  const say = (type, message, extra = {}) => onEvent({ type, message, ...extra });
  const usage = (message, exitCode = 2) => ({ ok: false, exitCode, stage: 'usage', title: 'USAGE', reason: message });
  if (!inputPath) return usage('inputPath is required');
  if (!['auto', 'mock', 'live'].includes(requested)) return usage(`mode must be auto, mock or live (got "${requested}")`);
  if (!QA_MODES.includes(qaMode)) return usage(`qaMode must be one of ${QA_MODES.join(', ')}`);
  const keyPresent = !!(env.ANTHROPIC_API_KEY && String(env.ANTHROPIC_API_KEY).trim()); const mode = requested === 'auto' ? (keyPresent ? 'live' : 'mock') : requested;
  if (mode === 'live' && !keyPresent) return usage(NO_KEY_MESSAGE, 3);
  let fixture = null; // live mode never needs one: any supported document is eligible
  if (mode === 'mock') {
    fixture = mockFixture ? path.resolve(mockFixture) : path.join(root, 'tests/ai/fixtures', projectName(inputPath) + '.json');
    if (!fs.existsSync(fixture)) return usage(`MOCK MODE: no storyboard fixture for "${path.basename(inputPath)}" (looked for ${path.relative(root, fixture)}).\nMock mode never invents a storyboard. Pass a fixture, or use live mode with an API key.`);
  }
  if (!fs.existsSync(inputPath)) return { ok: false, exitCode: 1, stage: 'ingest', title: 'INGESTION FAILED', reason: `file not found: ${inputPath}` };
  const name = nameOpt ? projectName(nameOpt) : projectName(inputPath);
  const projectDir = outputDir ? path.resolve(outputDir) : path.join(GENERATED, name);
  if (!outputDir && path.relative(GENERATED, projectDir).split(path.sep)[0] !== name) return usage('refusing to write outside generated/');
  const type = detectType(inputPath), P = f => path.join(projectDir, f), t0 = Date.now();
  // Only a folder that is empty or holds FilmDeck's own artifacts may be (re)used: the run replaces those files, and must never delete anything else.
  if (fs.existsSync(projectDir)) {
    if (!fs.statSync(projectDir).isDirectory()) return usage(`output path exists and is not a folder: ${projectDir}`);
    const foreign = fs.readdirSync(projectDir).filter(f => !ARTIFACTS.includes(f) && f !== '.DS_Store');
    if (foreign.length) return usage(`output folder ${projectDir} contains files FilmDeck did not create (${foreign.slice(0, 3).join(', ')}${foreign.length > 3 ? ', ...' : ''}). Choose an empty folder or another --name/--out.`);
  }
  fs.mkdirSync(projectDir, { recursive: true }); for (const f of ARTIFACTS) fs.rmSync(P(f), { recursive: true, force: true });
  const srcBytes = fs.readFileSync(inputPath);
  const runtimeSha = sha(fs.readFileSync(path.join(root, 'engine/film-runtime.js'))).slice(0, 12);
  const manifest = { filmdeckVersion: VERSION, status: 'failed', failedStage: null,
    source: { file: path.basename(inputPath), type, sizeBytes: srcBytes.length, sha256: sha(srcBytes) },
    normalizedSourceSha256: null, storyboardSha256: null,
    generation: { requestedMode: requested, mode, aiGenerated: mode === 'live', apiUsed: mode === 'live', fixture: fixture ? path.relative(root, fixture) : null, model: mode === 'live' ? (model || env.FILMDECK_MODEL || DEFAULT_MODEL) : null, repairsUsed: null, strategy: mode === 'live' ? null : 'fixture', calls: null, httpAttempts: null, usage: null, aiMs: null },
    generator: { version: null, runtime: `film-runtime.js@${runtimeSha}`, gsap: '3.12.5 (embedded)', fonts: 'Barlow Condensed, Instrument Serif, JetBrains Mono (embedded, latin + latin-ext)' },
    timestamp: new Date(env.SOURCE_DATE_EPOCH ? Number(env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString(),
    sectionCount: null, chunkCount: null, sceneCount: null, beatCount: null, recipes: [], warnings: [], qaMode, qa: null, timingsMs: {} };
  const save = () => fs.writeFileSync(P('run.json'), JSON.stringify(manifest, null, 2) + '\n');
  const fail = (stage, title, reason, extra = {}) => { manifest.failedStage = stage; save(); return { ok: false, exitCode: 1, stage, title, reason: scrubKey(String(reason).trim().split('\n').slice(-40).join('\n')), outputDir: projectDir, manifest, ...extra }; };
  const timed = async (stage, f) => { const s = Date.now(); const r = await f(); manifest.timingsMs[stage] = Date.now() - s; return r; };
  const runEnv = { ...env }; delete runEnv.FILMDECK_NO_KEY_PLACEHOLDER; runEnv.FILMDECK_PROGRESS = '1';
  if (mode === 'mock') { delete runEnv.ANTHROPIC_API_KEY; delete runEnv.ANTHROPIC_BASE_URL; } // mock never talks to a provider: the children do not even receive the key
  const secret = (mode === 'live' && keyPresent) ? String(env.ANTHROPIC_API_KEY).trim() : null; const scrubKey = t => (secret ? String(t).split(secret).join('[key]') : String(t));
  say('mode', mode === 'mock' ? `MODE: MOCK${requested === 'auto' ? ' (auto: no ANTHROPIC_API_KEY)' : ''}. The storyboard comes from a stored fixture (${manifest.generation.fixture}), NOT from AI.` : `MODE: LIVE (${manifest.generation.model})`, { mode });

  // 1. ingest
  let r = await timed('ingest', () => nodeRun('tools/ingest-source.mjs', [inputPath, '--out', P('source.json'), ...(fictional ? ['--fictional'] : [])], runEnv));
  if (r.status !== 0) return fail('ingest', 'INGESTION FAILED', r.stderr || r.stdout);
  const source = JSON.parse(fs.readFileSync(P('source.json'), 'utf8')); manifest.sectionCount = source.sections.length; manifest.warnings.push(...source.warnings.map(w => `ingest: ${w}`));
  manifest.normalizedSourceSha256 = sha(fs.readFileSync(P('source.json')));
  say('ok', `Source detected: ${type.toUpperCase()}`); say('ok', `Extracted: ${source.sections.length} sections`); source.warnings.slice(0, 5).forEach(w => say('warn', w));
  // 2. chunk (deterministic; the future model call reads chunks, mock mode and validation use the full source)
  r = await timed('chunk', () => nodeRun('tools/chunk-source.mjs', [P('source.json'), '--out', P('chunks.json')], runEnv));
  if (r.status !== 0) return fail('chunk', 'CHUNKING FAILED', r.stderr || r.stdout);
  manifest.chunkCount = JSON.parse(fs.readFileSync(P('chunks.json'), 'utf8')).chunkCount; say('ok', `Chunked: ${manifest.chunkCount} chunk${manifest.chunkCount === 1 ? '' : 's'}`);
  // 3. storyboard (includes the gates and repair loop). Live mode streams real progress from the child process (lines starting with @@FD).
  const gargs = [P('source.json'), '--out', P('storyboard.json')], live = mode === 'live';
  if (mode === 'mock') gargs.push('--mock', '--fixture', fixture); else { if (maxRepairs !== undefined) gargs.push('--max-repairs', String(maxRepairs)); if (model) gargs.push('--model', model); if (fictional) gargs.push('--fictional'); }
  let mapOf = 0;
  const onLine = line => {
    if (!live || !line.startsWith('@@FD ')) return; let e; try { e = JSON.parse(line.slice(5)); } catch { return; }
    if (e.type === 'map-start') { mapOf = e.of; say('info', `Understanding the story: reading ${e.of} parts of a long document`, { stage: 'analyze' }); }
    else if (e.type === 'map-done') say('note', `Understood part ${e.done} of ${e.of}`, { stage: 'analyze' });
    else if (e.type === 'design-start') { say('ok', 'Story understood'); say('note', 'Designing the scenes', { stage: 'design' }); }
    else if (e.type === 'attempt-start' && e.attempt > 0) say('note', `Correcting the plan (round ${e.attempt} of ${e.maxRepairs})`, { stage: 'repair' });
    else if (e.type === 'attempt-result') say('note', e.valid ? 'Facts checked: everything is grounded in your document' : `Checking the facts: ${e.errorCount} problem${e.errorCount === 1 ? '' : 's'} found${e.attempt < e.maxRepairs ? ', asking the AI to correct them' : ''}`, { stage: 'check' });
  };
  if (live) say('info', 'Sending your document text to Anthropic for analysis', { stage: 'analyze' });
  r = await timed('storyboard', () => nodeRun('tools/generate-storyboard.mjs', gargs, runEnv, onLine));
  const readJson = f => { try { return JSON.parse(fs.readFileSync(P(f), 'utf8')); } catch { return null; } };
  const rep = readJson('storyboard.report.json');
  if (rep) { const g = manifest.generation; g.repairsUsed = rep.repairsUsed; if (live) { g.strategy = rep.strategy; g.calls = rep.calls; g.httpAttempts = rep.httpAttempts; g.usage = rep.usage; g.aiMs = rep.aiMs; g.model = rep.model || g.model; g.droppedCandidates = rep.droppedCandidates; g.duplicateCandidates = rep.duplicateCandidates; g.callBudget = rep.callBudget; g.cost = priceUsage(rep.usage, env); g.firstPassValid = rep.firstPassValid; if (rep.chunkCount) manifest.chunkCount = rep.chunkCount; } }
  if (r.status !== 0) {
    if (live) { const er = readJson('storyboard.error.json'); if (er && er.callsAttempted != null) { manifest.generation.callsAttempted = er.callsAttempted; manifest.generation.httpAttempts = er.httpAttempts ?? null; } const [title, reason] = LIVE_ERRORS[er && er.kind] || (r.status === 3 ? ['LIVE GENERATION UNAVAILABLE', NO_KEY_MESSAGE] : LIVE_ERRORS.client); return fail('storyboard', title, reason, { errorKind: (er && er.kind) || 'client' }); }
    return fail('storyboard', r.status === 3 ? 'LIVE MODE UNAVAILABLE' : 'STORYBOARD GENERATION FAILED', (r.stderr || '') + '\n' + (r.stdout || '').split('\n').filter(l => /^attempt|FAILED/.test(l)).join('\n'));
  }
  say('ok', mode === 'mock' ? 'Storyboard loaded from mock fixture' : `Storyboard generated by Claude (${rep.repairsUsed} repair${rep.repairsUsed === 1 ? '' : 's'}, ${rep.calls.total} AI call${rep.calls.total === 1 ? '' : 's'})`);
  // 4. validate
  r = await timed('validate', () => nodeRun('tools/validate-storyboard.mjs', [P('storyboard.json')], runEnv));
  if (r.status !== 0) return fail('validate', 'STORYBOARD VALIDATION FAILED', r.stdout + r.stderr);
  const sb = JSON.parse(fs.readFileSync(P('storyboard.json'), 'utf8')); manifest.storyboardSha256 = sha(fs.readFileSync(P('storyboard.json')));
  manifest.sceneCount = sb.scenes.length; manifest.beatCount = sb.scenes.reduce((n, s) => n + s.beats.length, 0); manifest.recipes = sb.scenes.map(s => s.recipe);
  say('ok', 'Storyboard validated'); say('ok', `${manifest.sceneCount} scenes / ${manifest.beatCount} beats`);
  // 5. generate + assemble (offline: GSAP and fonts embedded)
  r = await timed('generate', () => nodeRun('tools/generate-deck.mjs', [P('storyboard.json'), '--out', projectDir, '--no-qa'], runEnv));
  if (r.status !== 0 || !fs.existsSync(P('index.html'))) return fail('generate', 'GENERATION FAILED', r.stderr || r.stdout || 'index.html was not created');
  manifest.generator.version = JSON.parse(fs.readFileSync(P('deck.json'), 'utf8')).generator.version; manifest.deckSha256 = sha(fs.readFileSync(P('index.html')));
  say('ok', 'Deck generated and assembled (offline: GSAP and fonts embedded)');
  // 6. browser QA (tests/generated/qa.mjs): fast = quick safety net, full = release suite
  if (qaMode === 'none') {
    manifest.qa = { skipped: true, passed: false }; manifest.status = 'ready-unverified'; save();
    say('warn', 'Browser QA skipped: this deck has NOT been verified.');
  } else {
    say('info', `Running browser QA (${qaMode}${qaMode === 'full' ? ', about 3 minutes' : ', about a minute'})`);
    r = await timed('qa', () => nodeRun('tests/generated/qa.mjs', [projectDir, `--mode=${qaMode}`], runEnv));
    let qa = null; try { qa = JSON.parse(fs.readFileSync(P('qa-report.json'), 'utf8')); } catch {}
    if (r.status !== 0 || !qa || !qa.passed) {
      manifest.qa = { mode: qaMode, passed: false, checks: qa ? qa.checks : null }; if (fs.existsSync(P('index.html'))) fs.renameSync(P('index.html'), P('index.failed-qa.html'));
      return fail('qa', 'BROWSER QA FAILED', (qa ? qa.results.filter(x => !x.ok).map(x => `FAIL ${x.name} ${x.detail || ''}`).join('\n') : '') || r.stderr || r.stdout.split('\n').slice(-15).join('\n'));
    }
    manifest.qa = { mode: qaMode, passed: true, checks: qa.checks, consoleErrors: qa.consoleErrors, layoutWarnings: qa.layoutWarnings || 0, durationMs: qa.durationMs }; manifest.status = 'ready';
    manifest.warnings.push(...(qa.warnings || []).map(w => `layout: ${w}`));
    say('ok', `Browser QA (${qaMode}): ${qa.checks.passed}/${qa.checks.total}${qa.layoutWarnings ? `, ${qa.layoutWarnings} layout warning(s) in qa-report.json` : ''}`);
  }
  manifest.totalMs = Date.now() - t0; manifest.artifacts = ARTIFACTS.filter(f => fs.existsSync(P(f)) && f !== 'run.json').concat('run.json'); save();
  say('ok', manifest.status === 'ready' ? 'Presentation ready' : 'Presentation generated (not verified)');
  return { ok: true, exitCode: 0, status: manifest.status, outputDir: projectDir, indexHtml: P('index.html'), manifest, durationMs: manifest.totalMs };
}

// Open a file with the operating system's default handler (macOS open, Windows start, Linux xdg-open). Best effort; never throws.
export function openFile(file) {
  const [cmd, a] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { const c = spawn(cmd, a, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
}
