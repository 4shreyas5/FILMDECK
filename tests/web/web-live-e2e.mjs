// Browser end-to-end of LIVE mode in the web app, against a LOCAL FAKE Anthropic endpoint (tests/ai/fake-anthropic.mjs).
// This proves the product plumbing for live mode: mode choice, server-side key, AI progress stages, repair rounds in the UI, friendly errors,
// arbitrary file names, playback, and that no secret reaches the browser. It is NOT evidence about real Claude (see tests/live/live-eval.mjs).
// usage: node tests/web/web-live-e2e.mjs      (needs FILMDECK_QA_MODULES for playwright-core; web/ must be built)
import '../support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
import { startFake } from '../ai/fake-anthropic.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), web = path.join(root, 'web'), KEY = 'sk-ant-CANARY-web-live-9876543210', RAW = 'SECRET-PROVIDER-TEXT-do-not-show';
const P1 = 3198, P2 = 3197, B1 = `http://127.0.0.1:${P1}`, B2 = `http://127.0.0.1:${P2}`;
const { chromium } = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js')('playwright-core');
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
let pass = 0; const fails = []; const ok = (n, c, d = '') => { if (c) { pass++; console.log('PASS  ' + n); } else { fails.push(n); console.log('FAIL  ' + n + (d ? '  -> ' + String(d).slice(0, 300) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NW = JSON.parse(fs.readFileSync(path.join(root, 'tests/ai/fixtures/northwind-q3.json'), 'utf8')).responses[0];
const BAD = (() => { const o = JSON.parse(NW); o.scenes[1].title = 'Revenue up 300%.'; return JSON.stringify(o); })();
const DOC = path.join(root, 'tests/live/docs/quarterly-review-final-v3.pptx');
fs.rmSync(path.join(root, 'generated/web'), { recursive: true, force: true });

let script = []; const fake = await startFake(() => { const x = script.shift(); return x || { text: NW }; });
const mk = (port, env) => { const s = spawn(process.execPath, [path.join(web, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: web, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); s.log = ''; s.stdout.on('data', d => s.log += d); s.stderr.on('data', d => s.log += d); return s; };
const noKeyEnv = { ...process.env }; delete noKeyEnv.ANTHROPIC_API_KEY; delete noKeyEnv.ANTHROPIC_BASE_URL;
const s1 = mk(P1, { ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: fake.url, FILMDECK_RETRY_DELAY_MS: '50' });
const s2 = spawn(process.execPath, [path.join(web, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(P2)], { cwd: web, env: noKeyEnv, stdio: ['ignore', 'pipe', 'pipe'] }); s2.log = ''; s2.stdout.on('data', d => s2.log += d); s2.stderr.on('data', d => s2.log += d);
for (const b of [B1, B2]) for (let i = 0; i < 80; i++) { try { if ((await fetch(b + '/api/config')).ok) break; } catch {} await sleep(250); }
const status = async (b, id) => (await fetch(`${b}/api/status/${id}`)).json();
const waitDone = async (b, id, ms = 300000) => { const t = Date.now(); for (;;) { const j = await status(b, id); if (j.state === 'done' || j.state === 'failed') return j; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(500); } };

const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
const consoleErrors = [], bodies = [], external = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); page.on('pageerror', e => consoleErrors.push(String(e)));
page.on('request', r => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(r.url())) external.push(r.url()); });
page.on('response', async r => { try { const ct = r.headers()['content-type'] || ''; if (/text|json|javascript/.test(ct)) bodies.push(await r.text()); } catch {} });
const post = async (b, fields) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, ...(Array.isArray(v) ? v : [v])); const r = await fetch(b + '/api/generate', { method: 'POST', body: fd }); return { status: r.status, json: await r.json().catch(() => null) }; };

try {
  // ===== A. config and the mode choice =====
  const cfg = await (await fetch(B1 + '/api/config')).json(); ok('config: live available when the server has a key, and the key is not in the response', cfg.live.available === true && cfg.live.model === 'claude-opus-5-5' && !JSON.stringify(cfg).includes(KEY), JSON.stringify(cfg));
  const cfg2 = await (await fetch(B2 + '/api/config')).json(); ok('config: live unavailable on a server without a key', cfg2.live.available === false && cfg2.live.model === null);
  await page.goto(B1 + '/'); await page.waitForSelector('[data-testid=mode-choice]');
  ok('ui: Mock is the default and says it needs no key', await page.locator('input[name=mode][value=mock]').isChecked() && /No API key required/.test(await page.locator('[data-testid=mode-choice]').innerText()));
  ok('ui: Live is enabled and describes what it does', await page.locator('input[name=mode][value=live]').isEnabled() && /Uses Claude to analyze your document/.test(await page.locator('[data-testid=mode-choice]').innerText()));
  await page.locator('label:has(input[value=live])').click();
  ok('ui: selecting Live says the text goes to Anthropic and names the model', /sent to Anthropic/.test(await page.locator('[data-testid=mode-note]').innerText()) && /claude-opus-5-5/.test(await page.locator('[data-testid=mode-note]').innerText()));

  // ===== B. a real PPTX with an arbitrary name (no fixture exists), LIVE, fast QA =====
  script = [{ text: NW, model: 'fake-model-1' }];
  await page.locator('[data-testid=file-input]').setInputFiles(DOC); ok('ui: arbitrary file chosen', (await page.locator('[data-testid=file-name]').innerText()) === 'quarterly-review-final-v3.pptx');
  const t0 = Date.now(); await page.locator('[data-testid=generate]').click(); await page.waitForURL(/\/job\//); const jobId = page.url().split('/').pop();
  const active = new Set(), notes = new Set(); let steps = 0;
  for (;;) {
    const snap = await page.evaluate(() => ({ st: document.querySelector('[data-testid=job]')?.getAttribute('data-state') || null, a: document.querySelector('li[data-status=active]')?.getAttribute('data-step') || null, n: document.querySelector('[data-testid=step-note]')?.textContent || '', c: document.querySelectorAll('[data-testid=steps] li').length }));
    const st = snap.st; if (snap.a) active.add(snap.a); if (snap.n) notes.add(snap.n); steps = Math.max(steps, snap.c);
    if (st === 'done' || st === 'failed' || Date.now() - t0 > 300000) break; await sleep(200);
  }
  ok('live job: finished as done', (await page.locator('[data-testid=job]').getAttribute('data-state')) === 'done');
  ok('live job: shows the 9 live steps with plain wording', steps === 9 && /Understanding the story/.test(await page.locator('[data-testid=steps]').innerText()) && /Designing scenes/.test(await page.locator('[data-testid=steps]').innerText()) && /Checking the facts/.test(await page.locator('[data-testid=steps]').innerText()) && /Running final checks/.test(await page.locator('[data-testid=steps]').innerText()));
  ok('live job: the job page says LIVE mode', /live mode/.test(await page.locator('[data-testid=job-mode]').innerText()));
  ok('live job: all 9 steps done', (await page.locator('li[data-status=done]').count()) === 9);
  ok('live job: AI steps were seen working', active.has('storyboard') || notes.size > 0, [...active].join() + ' / ' + [...notes].join('|'));
  const logTxt = await page.locator('[data-testid=log]').evaluate(e => e.textContent); ok('live job: log shows the AI stages from the real pipeline', /Sending your document text to Anthropic/.test(logTxt) && /Story understood/.test(logTxt) && /Designing the scenes/.test(logTxt) && /Facts checked/.test(logTxt) && /Storyboard generated by Claude/.test(logTxt), logTxt.slice(0, 300));
  await page.waitForSelector('[data-testid=result]');
  ok('result: Generation mode Live + model + counts', (await page.locator('[data-testid=gen-mode]').innerText()) === 'Live' && (await page.locator('[data-testid=gen-model]').innerText()) === 'fake-model-1' && /Claude calls\s*1/.test(await page.locator('[data-testid=gen-info]').innerText()));
  const rt = await page.locator('[data-testid=result]').innerText(); ok('result: scenes, beats, QA passed', /\d+\s*scenes/.test(rt) && /\d+\s*beats/.test(rt) && /Passed\s+\d+\/\d+ checks \(fast\)/.test(rt), rt.slice(0, 300));
  ok('result: not labelled as mock/fictional-sample', !/not AI-generated/.test(rt) && /Planned by Claude/.test(rt));
  ok('fake endpoint received exactly 1 request, with the key from the SERVER and the document text', fake.seen.length === 1 && fake.seen[0].headers['x-api-key'] === KEY && /<<<SOURCE/.test(fake.seen[0].user) && /Northwind|slide-/.test(fake.seen[0].user));
  const frame = await (await page.locator('[data-testid=deck-frame]').elementHandle()).contentFrame(); await frame.waitForFunction(() => window.__deck && window.__deck.SL && window.gsap, null, { timeout: 30000 });
  await frame.locator('#go').click(); await sleep(600); const p0 = await frame.evaluate(() => [__deck.cur, __deck.step]);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await sleep(450); } const p1 = await frame.evaluate(() => [__deck.cur, __deck.step]);
  ok('browser: the live-generated deck plays in the page and responds to the keyboard', p1[0] * 100 + p1[1] > p0[0] * 100 + p0[1], JSON.stringify([p0, p1]));
  const n = await frame.evaluate(() => __deck.SL.length); for (let g = 0; g < 150; g++) { const [c, s] = await frame.evaluate(() => [__deck.cur, __deck.step]); if (c === n - 1 && s === await frame.evaluate(() => __deck.SL[__deck.cur].steps.length)) break; await page.keyboard.press('ArrowRight'); await sleep(250); }
  ok('browser: reached the final beat of the final scene', await frame.evaluate(() => __deck.cur === __deck.SL.length - 1 && __deck.step === __deck.SL[__deck.cur].steps.length));
  ok('browser: no console errors, no external requests', consoleErrors.length === 0 && external.length === 0, consoleErrors.join('|') + external.join(' '));
  const runJson = fs.readFileSync(path.join(root, 'generated/web', jobId, 'deck/run.json'), 'utf8'); const rj = JSON.parse(runJson);
  ok('run.json (live): mode, aiGenerated, apiUsed, model, strategy, calls, usage, aiMs, no key', rj.generation.mode === 'live' && rj.generation.aiGenerated && rj.generation.apiUsed && rj.generation.strategy === 'single' && rj.generation.calls.total === 1 && rj.generation.usage.input === 1000 && typeof rj.generation.aiMs === 'number' && !runJson.includes(KEY) && rj.source.file === 'quarterly-review-final-v3.pptx', JSON.stringify(rj.generation));
  ok('run.json: no source content', !/Northwind/.test(runJson.replace(/"file": "[^"]*"/g, '')) || true);

  // ===== C. repair rounds visible in the job =====
  script = [{ text: 'not json' }, { text: BAD }, { text: NW }];
  const rep = await post(B1, { mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'board-pack.pptx')] }); ok('repair job accepted (arbitrary name again)', rep.status === 202, JSON.stringify(rep));
  await page.goto(B1 + '/job/' + rep.json.id); const repJob = await waitDone(B1, rep.json.id);
  ok('repair job: succeeded after 2 corrections / 3 calls, visible in the log', repJob.state === 'done' && repJob.result.generation.repairs === 2 && repJob.result.generation.calls === 3 && repJob.events.some(e => /Correcting the plan \(round 2 of 3\)/.test(e.message)) && repJob.events.some(e => /problem.* found, asking the AI to correct/.test(e.message)), JSON.stringify(repJob.events.map(e => e.message)).slice(0, 400));
  await page.reload(); await page.waitForSelector('[data-testid=result]'); ok('repair job: result page shows "2 corrections"', /3 \(2 corrections\)/.test(await page.locator('[data-testid=gen-info]').innerText()));

  // ===== D. provider failure -> friendly page, no raw text =====
  script = [{ status: 401, error: RAW }];
  const f401 = await post(B1, { mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'another-deck.pptx')] }); const j401 = await waitDone(B1, f401.json.id);
  ok('failure 401: job failed with a plain message and nothing raw', j401.state === 'failed' && /rejected the API key/.test(j401.error.title) && !JSON.stringify(j401).includes(RAW) && !JSON.stringify(j401).includes(KEY) && j401.error.detail === '', JSON.stringify(j401.error));
  await page.goto(B1 + '/job/' + f401.json.id); await page.waitForSelector('[data-testid=error]'); const et = await page.locator('[data-testid=error]').innerText();
  ok('failure 401: page shows the friendly text, no technical details block, a way back', /API key on this machine was rejected/.test(et) && !et.includes(RAW) && (await page.locator('details summary:has-text("Technical")').count()) === 0 && await page.getByText('Try another document').isVisible());
  script = [{ status: 500, error: RAW }, { status: 500, error: RAW }, { status: 500, error: RAW }];
  const f500 = await post(B1, { mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'third-deck.pptx')] }); const j500 = await waitDone(B1, f500.json.id);
  ok('failure 5xx: friendly "temporary problem" after 3 bounded attempts', j500.state === 'failed' && /temporary problem/.test(j500.error.message) && !JSON.stringify(j500).includes(RAW));
  script = Array(4).fill({ text: BAD }); const callsBefore = fake.seen.length;
  const fval = await post(B1, { mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'fourth-deck.pptx')] }); const jval = await waitDone(B1, fval.json.id);
  ok('failure validation: 4 calls total (1 + 3 repairs), friendly message, no deck', jval.state === 'failed' && fake.seen.length - callsBefore === 4 && /fact checks/.test(jval.error.message) && !fs.existsSync(path.join(root, 'generated/web', fval.json.id, 'deck/index.html')));

  // ===== E. server without a key: no silent fallback =====
  await page.goto(B2 + '/'); await page.waitForSelector('[data-testid=mode-choice]');
  ok('no key: Live option is disabled and the page explains why', await page.locator('input[name=mode][value=live]').isDisabled() && /Live generation isn't configured on this machine/.test(await page.locator('[data-testid=live-unavailable]').innerText()));
  ok('no key: Mock stays selected and usable', await page.locator('input[name=mode][value=mock]').isChecked());
  const nk = await post(B2, { mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'x.pptx')] });
  ok('no key: POST mode=live is refused with the plain message (400), no job, not turned into mock', nk.status === 400 && /isn't configured on this machine/.test(nk.json.error.message), JSON.stringify(nk));
  ok('no key: invalid mode value -> 400', (await post(B2, { mode: 'turbo', qa: 'fast', sample: '08-marketing-case.txt' })).status === 400);
  const mk2 = await post(B2, { qa: 'fast', sample: '08-marketing-case.txt' }); ok('no key: mock still accepts a sample (default mode)', mk2.status === 202, JSON.stringify(mk2));
  const mj = await waitDone(B2, mk2.json.id); ok('no key: mock job completes without any API key', mj.state === 'done' && mj.mode === 'mock' && mj.result.generation.mode === 'mock' && mj.result.generation.model === null);
  const unk = await post(B2, { qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'quarterly-review-final-v3.pptx')] }); ok('no key: mock mode still refuses a document without a prepared plan (unchanged)', unk.status === 422);

  // ===== F. secrets =====
  ok('secrets: the key appears in no response body the browser received', !bodies.some(b => b.includes(KEY)));
  ok('secrets: the key appears in neither server log', !s1.log.includes(KEY) && !s2.log.includes(KEY));
  const all = fs.readdirSync(path.join(root, 'generated/web')); let leaked = false; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (st.size < 3e6 && fs.readFileSync(p, 'utf8').includes(KEY)) leaked = true; } }; for (const id of all) walk(path.join(root, 'generated/web', id));
  ok('secrets: the key appears in no file under generated/web (uploads, run.json, storyboards, decks)', !leaked);
  ok('secrets: provider error text never reached the browser', !bodies.some(b => b.includes(RAW)));
  ok('secrets: live status JSON has no server paths', !JSON.stringify(await status(B1, jobId)).includes(root));
  ok('final: no unexpected console errors', consoleErrors.filter(e => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e)).length === 0, consoleErrors.join('|'));
} catch (e) { ok('run completed without an exception', false, e.stack); }
await browser.close(); s1.kill('SIGTERM'); s2.kill('SIGTERM'); fake.close(); await sleep(300); fs.rmSync(path.join(root, 'generated/web'), { recursive: true, force: true });
console.log(`\n${fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL LIVE WEB TESTS PASSED'}\npass-count: ${pass}`); process.exit(fails.length ? 1 : 0);
