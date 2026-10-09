// Tests of the programmatic entry point tools/lib/filmdeck.mjs (what a future web server would call). No browser (qaMode "none"), mock only.
// Run: node tests/e2e/api-tests.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
import { runFilmDeck, projectName, QA_MODES } from '../../tools/lib/filmdeck.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), IN = f => path.join(root, 'tests/e2e/inputs', f), FIX = path.join(root, 'tests/ai/fixtures/arcdesk.json');
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-api-')); const noKey = () => { const e = { ...process.env }; delete e.ANTHROPIC_API_KEY; return e; };

const events = []; const out = path.join(tmp, 'a');
const r = await runFilmDeck({ inputPath: IN('arcdesk.md'), outputDir: out, mode: 'mock', mockFixture: FIX, qaMode: 'none', env: noKey(), onEvent: e => events.push(e) });
t('returns a result object (the library never exits the process)', r.ok === true && r.exitCode === 0 && r.status === 'ready-unverified' && r.indexHtml === path.join(out, 'index.html') && fs.existsSync(r.indexHtml));
t('progress is reported through onEvent', events[0].type === 'mode' && /NOT from AI/.test(events[0].message) && events.some(e => e.type === 'ok' && /Storyboard validated/.test(e.message)) && events.some(e => e.type === 'warn'));
const m = J(path.join(out, 'run.json'));
t('manifest: hashes of source, normalized source and storyboard match the files', m.source.sha256 === sha(IN('arcdesk.md')) && m.normalizedSourceSha256 === sha(path.join(out, 'source.json')) && m.storyboardSha256 === sha(path.join(out, 'storyboard.json')) && m.deckSha256 === sha(path.join(out, 'index.html')));
t('manifest: recipes, counts, generator, runtime, QA mode and result', m.recipes.length === m.sceneCount && m.beatCount > 10 && m.generator.version === 2 && /^film-runtime\.js@[0-9a-f]{12}$/.test(m.generator.runtime) && /3\.12\.5/.test(m.generator.gsap) && m.qaMode === 'none' && m.qa.skipped === true && m.sectionCount === 6 && m.chunkCount === 1);
t('manifest: generation mode and API usage are explicit', m.generation.mode === 'mock' && m.generation.aiGenerated === false && m.generation.apiUsed === false && m.generation.model === null && m.generation.fixture === 'tests/ai/fixtures/arcdesk.json');
t('manifest: stage timings recorded for every stage', ['ingest', 'chunk', 'storyboard', 'validate', 'generate'].every(k => m.timingsMs[k] >= 0) && m.totalMs > 0);
t('manifest: warnings are collected (ingestion + layout)', Array.isArray(m.warnings));
const secret = 'sk-ant-API-TEST-SECRET-9876543210'; const out2 = path.join(tmp, 'b');
const r2 = await runFilmDeck({ inputPath: IN('arcdesk.md'), outputDir: out2, mode: 'mock', mockFixture: FIX, qaMode: 'none', env: { ...process.env, ANTHROPIC_API_KEY: secret } });
const blob = fs.readdirSync(out2).map(f => fs.statSync(path.join(out2, f)).isFile() ? fs.readFileSync(path.join(out2, f), 'utf8') : '').join('\n') + JSON.stringify(r2);
t('a key in the environment is never written to artifacts or returned (mock mode)', r2.ok && !blob.includes(secret) && J(path.join(out2, 'run.json')).generation.apiUsed === false);
t('same inputs give identical artifacts through the library', ['source.json', 'storyboard.json', 'deck.json', 'scenes.js', 'scenes.css', 'index.html', 'chunks.json'].every(f => fs.readFileSync(path.join(out, f), 'utf8') === fs.readFileSync(path.join(out2, f), 'utf8')));

// failures are values, not exits
const f1 = await runFilmDeck({ inputPath: path.join(tmp, 'missing.pdf'), outputDir: path.join(tmp, 'x1'), mode: 'mock', mockFixture: FIX, qaMode: 'none', env: noKey() });
t('missing file: ok=false, stage ingest, exitCode 1', !f1.ok && f1.stage === 'ingest' && f1.exitCode === 1 && /INGESTION FAILED/.test(f1.title) && /not found/.test(f1.reason));
fs.writeFileSync(path.join(tmp, 'empty.txt'), '');
const f2 = await runFilmDeck({ inputPath: path.join(tmp, 'empty.txt'), outputDir: path.join(tmp, 'x2'), mode: 'mock', mockFixture: FIX, qaMode: 'none', env: noKey() });
t('ingestion failure: result carries stage, title, reason, output folder and a failed manifest', !f2.ok && f2.stage === 'ingest' && f2.outputDir && J(path.join(tmp, 'x2/run.json')).failedStage === 'ingest' && !fs.existsSync(path.join(tmp, 'x2/index.html')));
const f3 = await runFilmDeck({ inputPath: IN('arcdesk.md'), mode: 'live', qaMode: 'none', env: noKey() });
t('live without a key: exitCode 3, nothing created', !f3.ok && f3.exitCode === 3 && f3.stage === 'usage' && /ANTHROPIC_API_KEY/.test(f3.reason));
t('invalid options are usage errors', (await runFilmDeck({})).exitCode === 2 && (await runFilmDeck({ inputPath: IN('arcdesk.md'), mode: 'turbo' })).exitCode === 2 && (await runFilmDeck({ inputPath: IN('arcdesk.md'), qaMode: 'slow' })).exitCode === 2);
t('mock without a fixture refuses to invent one', (await runFilmDeck({ inputPath: path.join(tmp, 'empty.txt'), outputDir: path.join(tmp, 'x3'), mode: 'mock', qaMode: 'none', env: noKey() })).reason.includes('never invents'));
t('QA modes exported for callers', QA_MODES.join() === 'fast,full,none' && projectName('Strategy Deck v2.PPTX') === 'strategy-deck-v2');

// concurrency: independent runs in different folders do not interfere
const [p1, p2] = await Promise.all([1, 2].map(i => runFilmDeck({ inputPath: IN('arcdesk.md'), outputDir: path.join(tmp, 'par' + i), mode: 'mock', mockFixture: FIX, qaMode: 'none', env: noKey() })));
t('two runs in parallel both succeed with identical decks', p1.ok && p2.ok && sha(p1.indexHtml) === sha(p2.indexHtml));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL API TESTS PASSED'); process.exit(bad ? 1 : 0);
