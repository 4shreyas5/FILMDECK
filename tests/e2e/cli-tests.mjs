// Fast tests of the unified CLI (no browser: --no-qa). Real pipeline runs, mock mode only, no network.
// Run: node tests/e2e/cli-tests.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawn } from 'child_process';
import { projectName } from '../../tools/filmdeck-lib.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), IN = f => path.join(root, 'tests/e2e/inputs', f);
const run = (a, env = {}) => new Promise(r => { const e = { ...process.env, ...env }; if (env.ANTHROPIC_API_KEY === undefined) delete e.ANTHROPIC_API_KEY; const c = spawn('node', [path.join(root, 'tools/filmdeck.mjs'), ...a], { env: e, cwd: root }); let o = '', er = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => er += d); c.on('close', status => r({ status, out: o, err: er })); });
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-cli-')); const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const FILES = ['source.json', 'storyboard.json', 'deck.json', 'scenes.js', 'scenes.css', 'index.html'];

// ---- project naming ----
t('name: strategy.pdf -> strategy', projectName('strategy.pdf') === 'strategy');
t('name: MBA_Case.pptx -> mba-case', projectName('MBA_Case.pptx') === 'mba-case');
t('name: path traversal collapses to a flat name', projectName('../../etc/passwd.md') === 'passwd' && projectName('..\\..\\Windows\\x y.docx') === 'x-y');
t('name: unsafe and non-ASCII characters removed', projectName('Q3 report (final)!!.pdf') === 'q3-report-final' && projectName('Café.md') === 'cafe' && projectName('日本語.md') === 'project');
t('name: dots/empty/very long are safe', projectName('..') === 'project' && projectName('.md') === 'project' && projectName('a'.repeat(200) + '.md').length <= 40 && /^[a-z0-9-]+$/.test(projectName('...x...y.md')));

// ---- usage, modes ----
let r = await run([]); t('no arguments: usage, exit 2', r.status === 2 && /node tools\/filmdeck\.mjs/.test(r.err));
r = await run([IN('arcdesk.md'), '--mock', '--live']); t('--mock with --live is a usage error', r.status === 2);
r = await run([IN('arcdesk.md'), '--live', '--out', path.join(tmp, 'live')]); t('--live without a key fails clearly, runs nothing', r.status === 3 && /ANTHROPIC_API_KEY/.test(r.err) && !fs.existsSync(path.join(tmp, 'live')));
r = await run([IN('arcdesk.md'), '--out', path.join(tmp, 'auto'), '--no-qa']);
t('auto without a key uses mock and says so', r.status === 0 && /MODE: MOCK \(auto: no ANTHROPIC_API_KEY\)/.test(r.out) && /NOT from AI/.test(r.out), r.err + r.out);
r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'm1'), '--no-qa']);
const m1 = path.join(tmp, 'm1'); t('mock run succeeds and writes every artifact', r.status === 0 && FILES.every(f => fs.existsSync(path.join(m1, f))) && fs.existsSync(path.join(m1, 'run.json')) && fs.existsSync(path.join(m1, 'storyboard.report.json')), r.err + r.out);
const run1 = J(path.join(m1, 'run.json'));
t('run.json: version, source, mode, counts, recipes, no secrets', run1.filmdeckVersion && run1.source.file === 'arcdesk.md' && run1.source.type === 'markdown' && run1.generation.mode === 'mock' && run1.generation.aiGenerated === false && run1.generation.fixture === 'tests/ai/fixtures/arcdesk.json' && run1.sceneCount === 6 && run1.beatCount > 10 && run1.recipes.includes('gauge-needle') && run1.timestamp, JSON.stringify(run1).slice(0, 300));
t('run.json: --no-qa is recorded as not verified', run1.status === 'ready-unverified' && run1.qa.skipped === true && /NOT been verified/.test(r.out));
const secret = 'sk-ant-TESTSECRET-1234567890';
r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'sec'), '--no-qa'], { ANTHROPIC_API_KEY: secret });
const allText = fs.readdirSync(path.join(tmp, 'sec')).map(f => fs.statSync(path.join(tmp, 'sec', f)).isFile() ? fs.readFileSync(path.join(tmp, 'sec', f), 'utf8') : '').join('\n') + r.out + r.err;
t('--mock never calls the API even when a key is set, and the key is not written anywhere', r.status === 0 && /MODE: MOCK\./.test(r.out) && !allText.includes(secret));
r = await run([IN('arcdesk.md'), '--out', path.join(tmp, 'autolive'), '--no-qa'], { ANTHROPIC_API_KEY: secret, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' });
t('auto with a key selects LIVE (fails on the unreachable endpoint; key not leaked)', /MODE: LIVE/.test(r.out) && r.status === 1 && !(r.out + r.err).includes(secret), r.out + r.err);

// ---- determinism ----
r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'm2'), '--no-qa'], {});
const same = FILES.every(f => fs.readFileSync(path.join(m1, f), 'utf8') === fs.readFileSync(path.join(tmp, 'm2', f), 'utf8'));
t('same source + fixture + config -> byte-identical artifacts', same);
const a = J(path.join(m1, 'run.json')), b = J(path.join(tmp, 'm2', 'run.json')); for (const o of [a, b]) { delete o.timestamp; delete o.timingsMs; delete o.totalMs; }
t('run.json identical apart from timestamp and timings', JSON.stringify(a) === JSON.stringify(b));
r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'm3'), '--no-qa'], { SOURCE_DATE_EPOCH: '1700000000' });
t('SOURCE_DATE_EPOCH fixes the timestamp', J(path.join(tmp, 'm3', 'run.json')).timestamp === '2023-11-14T22:13:20.000Z');

// ---- every input format reaches a deck (no browser) ----
for (const [f, extra] of [['arcdesk.txt', ['--fictional']], ['arcdesk.docx', []], ['arcdesk-report.pdf', []], ['northwind-q3.pptx', ['--fictional']]]) {
  const o = path.join(tmp, 'fmt-' + f); r = await run([IN(f), '--mock', '--out', o, '--no-qa', ...extra]);
  t(`${f}: ingest -> mock storyboard -> validate -> generate`, r.status === 0 && FILES.every(x => fs.existsSync(path.join(o, x))), r.err + r.out.slice(-300));
}

// ---- failures stop the pipeline ----
const fx = (name, content) => { const p = path.join(tmp, name); fs.writeFileSync(p, content); return p; };
r = await run([fx('empty.txt', ''), '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/arcdesk.json'), '--out', path.join(tmp, 'f1')]);
t('ingestion failure: clear message, exit 1, no storyboard or deck', r.status === 1 && /INGESTION FAILED/.test(r.err) && /Reason:/.test(r.err) && !fs.existsSync(path.join(tmp, 'f1/index.html')) && !fs.existsSync(path.join(tmp, 'f1/storyboard.json')) && J(path.join(tmp, 'f1/run.json')).failedStage === 'ingest', r.err);
r = await run([path.join(root, 'tests/ingestion/fixtures/scanned.pdf'), '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/arcdesk.json'), '--out', path.join(tmp, 'f2')]);
t('scanned PDF: INGESTION FAILED, explains OCR', r.status === 1 && /INGESTION FAILED/.test(r.err) && /OCR/.test(r.err));
r = await run([IN('arcdesk.md'), '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/01-saas-churn.json'), '--out', path.join(tmp, 'ok2'), '--no-qa']);
t('(control) the 01 fixture also fits this brief', r.status === 0);
r = await run([IN('northwind-q3.pptx'), '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/01-saas-churn.json'), '--out', path.join(tmp, 'f3'), '--fictional']);
t('fixture that does not match the document is rejected (grounding), no deck', r.status === 1 && /STORYBOARD GENERATION FAILED/.test(r.err) && !fs.existsSync(path.join(tmp, 'f3/index.html')) && J(path.join(tmp, 'f3/run.json')).failedStage === 'storyboard', r.err);
r = await run([fx('nofixture-xyz.md', '# Hello\n\nSome words 12.\n'), '--mock', '--out', path.join(tmp, 'f4')]);
t('mock mode with no fixture: refuses to invent one', r.status === 2 && /never invents a storyboard/.test(r.err) && !fs.existsSync(path.join(tmp, 'f4')));
r = await run([path.join(tmp, 'missing.pdf'), '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/arcdesk.json')]);
t('missing source file', r.status === 1 && /file not found/.test(r.err));
const badSb = fx('bad-fixture.json', JSON.stringify({ mock: true, responses: ['{"storyboardVersion":1}', '{"storyboardVersion":1}', '{"storyboardVersion":1}', '{"storyboardVersion":1}'] }));
r = await run([IN('arcdesk.md'), '--mock', '--mock-fixture', badSb, '--out', path.join(tmp, 'f5')]);
t('a storyboard that never validates stops after the repair budget; no deck', r.status === 1 && /STORYBOARD GENERATION FAILED/.test(r.err) && !fs.existsSync(path.join(tmp, 'f5/index.html')) && fs.existsSync(path.join(tmp, 'f5/storyboard.rejected.txt')));

// ---- stale files cleared; default output stays inside generated/ ----
fs.writeFileSync(path.join(m1, 'index.failed-qa.html'), 'stale');
await run([IN('arcdesk.md'), '--mock', '--out', m1, '--no-qa']); t('re-running clears stale artifacts', !fs.existsSync(path.join(m1, 'index.failed-qa.html')));
const evil = fx('Evil ..Name!!.md', fs.readFileSync(IN('arcdesk.md'), 'utf8'));
r = await run([evil, '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/arcdesk.json'), '--no-qa']);
const dflt = path.join(root, 'generated/evil-name'); t('default output is generated/<safe-name>/ inside the repo', r.status === 0 && fs.existsSync(path.join(dflt, 'index.html')) && /generated\/evil-name\/index\.html/.test(r.out), r.err + r.out); fs.rmSync(dflt, { recursive: true, force: true });
r = await run([IN('arcdesk.md'), '--mock', '--name', '../../../tmp/zzz', '--no-qa']);
t('--name cannot escape generated/', r.status === 0 && fs.existsSync(path.join(root, 'generated/zzz/index.html')) && !fs.existsSync('/tmp/zzz')); fs.rmSync(path.join(root, 'generated/zzz'), { recursive: true, force: true });

// ---- hostile file names and unsafe output folders ----
{
  const nasty = path.join(tmp, 'x $(touch PWNED) `touch PWNED2` ;touch PWNED3; \'q\' "d".md'); fs.writeFileSync(nasty, fs.readFileSync(IN('arcdesk.md')));
  r = await run([nasty, '--mock', '--mock-fixture', path.join(root, 'tests/ai/fixtures/arcdesk.json'), '--out', path.join(tmp, 'nasty-out'), '--no-qa']);
  t('shell metacharacters in the source file name are inert (no shell is used)', r.status === 0 && ['PWNED', 'PWNED2', 'PWNED3'].every(n => !fs.existsSync(path.join(tmp, n)) && !fs.existsSync(path.join(root, n))), r.err + r.out.slice(-200));
  const keep = path.join(tmp, 'mine'); fs.mkdirSync(keep); fs.writeFileSync(path.join(keep, 'precious.txt'), 'do not delete'); fs.writeFileSync(path.join(keep, 'index.html'), 'my own page');
  r = await run([IN('arcdesk.md'), '--mock', '--out', keep, '--no-qa']);
  t('an output folder that holds other files is refused and nothing is deleted', r.status === 2 && /contains files FilmDeck did not create/.test(r.err) && fs.readFileSync(path.join(keep, 'precious.txt'), 'utf8') === 'do not delete' && fs.readFileSync(path.join(keep, 'index.html'), 'utf8') === 'my own page');
  const file = path.join(tmp, 'afile'); fs.writeFileSync(file, 'x'); r = await run([IN('arcdesk.md'), '--mock', '--out', file, '--no-qa']); t('an output path that is a file is refused', r.status === 2);
  r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'm1'), '--no-qa']); t('re-using a folder that only holds FilmDeck artifacts is allowed', r.status === 0);
}

// ---- --open uses the OS opener (stubbed here so no browser window appears) ----
{
  const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin); const log = path.join(tmp, 'opened.txt');
  for (const n of ['open', 'xdg-open']) { fs.writeFileSync(path.join(bin, n), `#!/bin/sh\necho "$@" >> "${log}"\n`); fs.chmodSync(path.join(bin, n), 0o755); }
  r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'op'), '--no-qa', '--open'], { PATH: bin + path.delimiter + process.env.PATH });
  for (let i = 0; i < 50 && !fs.existsSync(log); i++) await new Promise(res => setTimeout(res, 100));
  t('--open launches the OS opener with the deck path', r.status === 0 && fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes(path.join(tmp, 'op', 'index.html')), r.err);
  r = await run([IN('arcdesk.md'), '--mock', '--out', path.join(tmp, 'noop'), '--no-qa'], { PATH: bin + path.delimiter + process.env.PATH });
  await new Promise(res => setTimeout(res, 500));
  t('without --open nothing is opened (CI-safe)', r.status === 0 && fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length === 1);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL CLI TESTS PASSED'); process.exit(bad ? 1 : 0);
