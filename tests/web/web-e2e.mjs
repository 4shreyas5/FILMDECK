// Browser end-to-end + security tests of the local web app (web/). Starts its own production server on a test port, drives it with a real
// Chromium: upload -> progress -> ready -> play the deck. Then hostile requests. Mock mode only; a canary API key proves no secret leaks.
// usage: node tests/web/web-e2e.mjs [--skip-full]      (needs FILMDECK_QA_MODULES for playwright-core; builds web/ if not built)
import '../support/qa-env.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path'; import net from 'net'; import { spawn, spawnSync } from 'child_process'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), web = path.join(root, 'web'), PORT = 3199, BASE = `http://127.0.0.1:${PORT}`;
const SKIP_FULL = process.argv.includes('--skip-full'), CANARY = 'sk-ant-CANARY-0123456789abcdef';
const { chromium } = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js')('playwright-core');
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
let pass = 0, fails = [];
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log('PASS  ' + name); } else { fails.push(name); console.log('FAIL  ' + name + (detail ? '  -> ' + String(detail).slice(0, 300) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DOCS = path.join(root, 'tests/corpus/docs'), PPTX = path.join(DOCS, '01-consulting-deck.pptx');

// ---- server ----
if (!fs.existsSync(path.join(web, '.next/BUILD_ID'))) { console.log('building web/ ...'); const b = spawnSync('npx', ['next', 'build'], { cwd: web, encoding: 'utf8' }); if (b.status !== 0) { console.log(b.stdout + b.stderr); process.exit(1); } }
const WEBDATA = path.join(root, 'generated/web'); fs.rmSync(WEBDATA, { recursive: true, force: true });
const server = spawn(process.execPath, [path.join(web, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: web, env: { ...process.env, ANTHROPIC_API_KEY: CANARY }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
const stop = async () => { server.kill('SIGTERM'); await sleep(300); };
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/samples')).ok) break; } catch {} await sleep(250); }

const post = async (fields, headers = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, ...(Array.isArray(v) ? v : [v])); const r = await fetch(BASE + '/api/generate', { method: 'POST', body: fd, headers }); return { status: r.status, json: await r.json().catch(() => null) }; };
const status = async id => { const r = await fetch(`${BASE}/api/status/${id}`); return { status: r.status, json: await r.json().catch(() => null) }; };
const waitState = async (id, states, ms = 400000) => { const t = Date.now(); for (;;) { const j = (await status(id)).json; if (j && states.includes(j.state)) return j; if (Date.now() - t > ms) throw new Error('timeout waiting for job ' + id); await sleep(500); } };
const fileOf = (p, name) => [new File([fs.readFileSync(p)], name || path.basename(p))];

const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
const consoleErrors = [], external = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); page.on('pageerror', e => consoleErrors.push(String(e)));
page.on('request', r => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(r.url())) external.push(r.url()); });

try {
  // ================= 1. landing page =================
  await page.goto(BASE + '/'); await page.waitForSelector('[data-testid=dropzone]');
  ok('home: landing page renders with upload zone', (await page.title()) === 'FilmDeck' && await page.locator('[data-testid=dropzone]').isVisible());
  ok('home: generate disabled until a file is chosen', await page.locator('[data-testid=generate]').isDisabled());
  ok('home: mock mode is stated (no AI, no key)', /Mock mode/.test(await page.locator('[data-testid=mode-note]').innerText()));
  ok('home: 12 sample documents offered', (await page.locator('[data-testid^=sample-]').count()) === 12);
  ok('home: fast is the default quality check', await page.locator('input[value=fast]').isChecked());

  // ================= 2. drag-and-drop a real PPTX, fast QA =================
  await page.evaluate(async b64 => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], '01-consulting-deck.pptx'));
    const z = document.querySelector('[data-testid=dropzone]'); z.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); z.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, fs.readFileSync(PPTX).toString('base64'));
  ok('drop: dropped file is shown by name', (await page.locator('[data-testid=file-name]').innerText()) === '01-consulting-deck.pptx');
  ok('drop: generate is enabled', await page.locator('[data-testid=generate]').isEnabled());
  const tStart = Date.now(); await page.locator('[data-testid=generate]').click(); await page.waitForURL(/\/job\/[a-f0-9]{32}$/);
  const jobId = page.url().split('/').pop();
  // observe real progress while it runs
  const seenActive = new Set(), doneCounts = []; let sawElapsed = false;
  for (;;) {
    const st = await page.locator('[data-testid=job]').getAttribute('data-state').catch(() => null);
    const act = await page.locator('li[data-status=active]').getAttribute('data-step').catch(() => null); if (act) seenActive.add(act);
    doneCounts.push(await page.locator('li[data-status=done]').count());
    if (/\d/.test(await page.locator('[data-testid=elapsed]').innerText().catch(() => ''))) sawElapsed = true;
    if (st === 'done' || st === 'failed') break; if (Date.now() - tStart > 300000) break; await sleep(250);
  }
  ok('progress: several distinct steps were seen active while running', seenActive.size >= 2, [...seenActive].join(','));
  ok('progress: completed-step count never goes down', doneCounts.every((n, i) => i === 0 || n >= doneCounts[i - 1]));
  ok('progress: elapsed timer shown', sawElapsed);
  ok('progress: job finished as done', (await page.locator('[data-testid=job]').getAttribute('data-state')) === 'done');
  ok('progress: all 8 steps done', (await page.locator('li[data-status=done]').count()) === 8);
  const log = await page.locator('[data-testid=log]').innerText().catch(() => '');
  const logHtml = await page.locator('[data-testid=log]').evaluate(e => e.textContent).catch(() => '');
  ok('progress: activity log came from the real pipeline', /Source detected: PPTX/.test(logHtml) && /Storyboard validated/.test(logHtml), logHtml.slice(0, 200));

  // ================= 3. result + playback in the page =================
  await page.waitForSelector('[data-testid=result]');
  ok('result: shows scenes/beats', /6\s*scenes/.test(await page.locator('[data-testid=result]').innerText()) && /21\s*beats/.test(await page.locator('[data-testid=result]').innerText()));
  ok('result: QA passed (fast)', /Passed\s+\d+\/\d+ checks \(fast\)/.test(await page.locator('[data-testid=qa-result]').innerText()), await page.locator('[data-testid=qa-result]').innerText());
  ok('result: labelled as not AI generated', /not AI-generated/.test(await page.locator('[data-testid=result]').innerText()));
  const fh = await page.locator('[data-testid=deck-frame]').elementHandle(); const frame = await fh.contentFrame();
  await frame.waitForFunction(() => window.__deck && window.__deck.SL && window.gsap, null, { timeout: 30000 });
  ok('play: deck loaded inside the sandboxed frame (runtime + GSAP present)', true);
  ok('play: iframe is sandboxed without same-origin', (await fh.getAttribute('sandbox')) === 'allow-scripts');
  const n = await frame.evaluate(() => __deck.SL.length); ok('play: deck has 6 scenes', n === 6, n);
  // real keyboard control: click the frame, then arrow keys
  ok('play: the deck starts on its Begin screen', await frame.evaluate(() => !document.querySelector('#intro').classList.contains('gone')));
  await frame.locator('#go').click(); await sleep(600);
  ok('play: clicking Begin starts the presentation', await frame.evaluate(() => document.querySelector('#intro').classList.contains('gone')));
  const pos = () => frame.evaluate(() => [__deck.cur, __deck.step]); const p0 = await pos();
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(450); }
  const p1 = await pos(); ok('play: ArrowRight advances the deck', p1[0] * 100 + p1[1] > p0[0] * 100 + p0[1], JSON.stringify([p0, p1]));
  await page.keyboard.press('ArrowLeft'); await sleep(450); const p2 = await pos(); ok('play: ArrowLeft goes back', p2[0] * 100 + p2[1] < p1[0] * 100 + p1[1], JSON.stringify([p1, p2]));
  for (let g = 0; g < 120; g++) { const [c, s] = await pos(); if (c === n - 1 && s === await frame.evaluate(() => __deck.SL[__deck.cur].steps.length)) break; await page.keyboard.press('ArrowRight'); await sleep(260); }
  const last = await frame.evaluate(() => [__deck.cur, __deck.step, __deck.SL[__deck.cur].steps.length]);
  ok('play: reached the final beat of the final scene with the keyboard', last[0] === n - 1 && last[1] === last[2], JSON.stringify(last));
  ok('play: no browser console errors / CSP violations', consoleErrors.length === 0, consoleErrors.join(' | ')); const playErrors = consoleErrors.length;
  ok('play: the page and the deck made no request outside this server', external.length === 0, external.join(' '));
  // full window + download (Begin asks the browser for full screen, as a presenter wants: leave it before using the page again)
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await frame.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {}); await sleep(300);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-testid=open-deck]').click()]);
  await popup.waitForFunction(() => window.__deck && window.__deck.SL, null, { timeout: 30000 });
  ok('play: "Open full window" plays the deck on its own', (await popup.evaluate(() => __deck.SL.length)) === 6); await popup.close();
  const dl = await fetch(`${BASE}/deck/${jobId}?download=1`); const dlText = await dl.text();
  ok('download: attachment with a .html name', /attachment; filename="filmdeck-[a-z0-9-]+\.html"/.test(dl.headers.get('content-disposition') || ''));
  ok('download: file is the complete offline deck', dlText.startsWith('<!DOCTYPE') || dlText.startsWith('<meta') || dlText.includes('<html'), dlText.slice(0, 60));
  ok('download: no external script/stylesheet/font URLs inside', !/(src|href)=["']https?:/.test(dlText) && !/url\(["']?https?:/.test(dlText));
  const deckHead = await fetch(`${BASE}/deck/${jobId}`); const csp = deckHead.headers.get('content-security-policy') || '';
  ok('security: deck response has a restrictive CSP (no network, sandboxed)', /default-src 'none'/.test(csp) && /connect-src 'none'/.test(csp) && /sandbox allow-scripts/.test(csp), csp);
  ok('security: deck response nosniff + no-store', deckHead.headers.get('x-content-type-options') === 'nosniff' && /no-store/.test(deckHead.headers.get('cache-control') || ''));
  // a finished job leaves its files only in its own folder
  const jobDir = path.join(WEBDATA, jobId); ok('storage: job files live under generated/web/<id>/ and the uploaded original is removed once the deck exists', fs.existsSync(path.join(jobDir, 'deck/index.html')) && fs.existsSync(path.join(jobDir, 'deck/run.json')) && !fs.existsSync(path.join(jobDir, 'upload')));
  const runJson = fs.readFileSync(path.join(jobDir, 'deck/run.json'), 'utf8'); const st1 = JSON.stringify((await status(jobId)).json);
  ok('security: run.json says mock / aiGenerated false / apiUsed false even with a key in the environment', /"mode": "mock"/.test(runJson) && /"aiGenerated": false/.test(runJson) && /"apiUsed": false/.test(runJson));
  ok('security: the API key never appears in any artifact, status or deck', ![runJson, st1, dlText, serverLog].some(t => t.includes(CANARY)) && !fs.readdirSync(path.join(jobDir, 'deck')).some(f => { const p = path.join(jobDir, 'deck', f); return fs.statSync(p).isFile() && fs.readFileSync(p, 'utf8').includes(CANARY); }));
  ok('security: status JSON exposes no server paths', !st1.includes(root) && !/\/Users\//.test(st1));

  // ================= 4. friendly errors in the browser =================
  await page.goto(BASE + '/'); await page.locator('[data-testid=file-input]').setInputFiles({ name: 'my-quarterly-numbers.pptx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(PPTX) });
  await page.locator('[data-testid=generate]').click(); await page.waitForSelector('[data-testid=error]');
  const e1 = await page.locator('[data-testid=error]').innerText();
  ok('error: a document without a prepared plan gets a plain explanation', /No prepared deck plan/.test(e1) && /sample/i.test(e1) && !/Error:|at \w+\.|stack/.test(e1), e1);
  ok('error: still on the upload page, nothing started', !/\/job\//.test(page.url()));
  await page.locator('[data-testid=file-input]').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ....') });
  await page.waitForFunction(() => /Unsupported file type/.test(document.querySelector('[data-testid=error]')?.textContent || ''));
  ok('error: an unsupported file type is explained in the page and Generate stays disabled (the server also refuses it with 415, tested below)', await page.locator('[data-testid=generate]').isDisabled());
  await page.goto(BASE + '/job/' + '0'.repeat(32)); await page.waitForSelector('[data-testid=error]');
  ok('error: unknown job id gives a friendly page', /not found/i.test(await page.locator('[data-testid=error]').innerText()));
  // a corrupt document that passes the type check fails inside the pipeline: the failed job page
  const bad = await post({ qa: 'fast', file: [new File([Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('this is not really a zip archive')])], 'arcdesk.docx')] });
  ok('error: corrupt .docx is accepted by the type check (PK header)', bad.status === 202, JSON.stringify(bad));
  const badJob = await waitState(bad.json.id, ['failed', 'done']);
  ok('error: corrupt .docx ends as a failed job at the ingest stage with a friendly message', badJob.state === 'failed' && /could not read/i.test(badJob.error.title) && badJob.error.message.length > 20, JSON.stringify(badJob.error));
  ok('error: failed job reports no raw paths or stack frames', !JSON.stringify(badJob).includes(root) && !/\s+at .*\.mjs:\d+/.test(JSON.stringify(badJob)));
  await page.goto(BASE + '/job/' + bad.json.id); await page.waitForSelector('[data-testid=error]');
  ok('error: failed job page shows the message and a way back', /could not read/i.test(await page.locator('[data-testid=error]').innerText()) && await page.getByText('Try another document').isVisible());
  ok('error: failed step is marked in the step list', (await page.locator('li[data-status=failed]').count()) === 1);
  ok('security: deck of a failed job is not served', (await fetch(`${BASE}/deck/${bad.json.id}`)).status === 409);

  // ================= 5. security =================
  const dirs0 = fs.readdirSync(WEBDATA).length;
  for (const id of ['../../package.json', '..%2f..%2fpackage.json', '%2e%2e/%2e%2e/etc/passwd', 'ABCDEF0123456789ABCDEF0123456789', 'a'.repeat(31), 'a'.repeat(33), 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', 'a'.repeat(32), '%20']) {
    const a = await fetch(`${BASE}/api/status/${id}`), b = await fetch(`${BASE}/deck/${id}`);
    const bt = await b.text(), at = await a.text();
    ok(`security: id "${id.slice(0, 24)}" is refused by status and deck routes`, a.status === 404 && b.status === 404 && !bt.includes('__deck') && !at.includes('"state"') && !bt.includes('"name": "filmdeck'), `${a.status}/${b.status}`);
  }
  ok('security: deck route serves nothing but the one deck file (extra path segments do not exist)', (await fetch(`${BASE}/deck/${jobId}/../../../package.json`)).status !== 200 || !(await (await fetch(`${BASE}/deck/${jobId}/../../../package.json`)).text()).includes('"filmdeck"'));
  ok('security: /deck/<id>/run.json and other files are not served', (await fetch(`${BASE}/deck/${jobId}/run.json`)).status === 404 && (await fetch(`${BASE}/deck/${jobId}/source.json`)).status === 404);
  const cross = await post({ qa: 'fast', sample: '01-consulting-deck.pptx' }, { Origin: 'https://evil.example' });
  ok('security: cross-origin POST is refused', cross.status === 403, JSON.stringify(cross));
  ok('security: cross-site fetch metadata is refused', (await post({ qa: 'fast', sample: '01-consulting-deck.pptx' }, { 'Sec-Fetch-Site': 'cross-site' })).status === 403);
  ok('security: no file -> 400', (await post({ qa: 'fast' })).status === 400);
  ok('security: invalid QA option -> 400', (await post({ qa: 'ultra', sample: '01-consulting-deck.pptx' })).status === 400);
  ok('security: qa "none" cannot be chosen from the web', (await post({ qa: 'none', sample: '01-consulting-deck.pptx' })).status === 400);
  for (const s of ['../../etc/passwd', '/etc/passwd', '..\\..\\x', '99-unknown.pptx', '01-consulting-deck.pptx/../../package.json', '../docs/01-consulting-deck.pptx']) ok(`security: sample "${s}" is refused`, (await post({ qa: 'fast', sample: s })).status === 400);
  ok('security: empty file -> 400', (await post({ qa: 'fast', file: [new File([], 'arcdesk.md')] })).status === 400);
  ok('security: .exe -> 415', (await post({ qa: 'fast', file: [new File(['MZ'], 'x.exe')] })).status === 415);
  ok('security: double extension "arcdesk.md.exe" -> 415', (await post({ qa: 'fast', file: [new File(['hello'], 'arcdesk.md.exe')] })).status === 415);
  ok('security: no extension -> 415', (await post({ qa: 'fast', file: [new File(['hello'], 'arcdesk')] })).status === 415);
  ok('security: legacy .ppt -> 415 with advice', /pptx/.test(JSON.stringify((await post({ qa: 'fast', file: [new File(['x'], 'old.ppt')] })).json)));
  ok('security: text renamed to .pdf -> 415', (await post({ qa: 'fast', file: [new File(['just text'], 'arcdesk.pdf')] })).status === 415);
  ok('security: html renamed to .pptx -> 415', (await post({ qa: 'fast', file: [new File(['<html><script>alert(1)</script>'], 'arcdesk.pptx')] })).status === 415);
  ok('security: binary renamed to .md -> 415', (await post({ qa: 'fast', file: [new File([Buffer.from([1, 2, 0, 3, 4])], 'arcdesk.md')] })).status === 415);
  const big = await post({ qa: 'fast', file: [new File([Buffer.alloc(26 * 1024 * 1024, 0x61)], 'arcdesk.md')] });
  ok('security: 26 MB upload -> 413', big.status === 413, big.status);
  ok('security: nothing was stored for any refused request', fs.readdirSync(WEBDATA).length === dirs0 + 0, `${dirs0} -> ${fs.readdirSync(WEBDATA).length}`);
  // path traversal in the client file name: stored under the job folder with a sanitised ASCII name
  const trav = await post({ qa: 'fast', file: [new File([Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('x')])], '../../../evil/arcdesk.docx')] });
  ok('security: traversal file name is accepted only as its base name', trav.status === 202, JSON.stringify(trav));
  const tj = await waitState(trav.json.id, ['failed', 'done']);
  ok('security: traversal name stayed inside generated/web/<id>/upload', fs.readdirSync(path.join(WEBDATA, trav.json.id, 'upload')).join() === 'arcdesk.docx' && !fs.existsSync(path.join(root, 'generated/evil')) && !fs.existsSync(path.join(root, 'evil')) && tj.state === 'failed');
  const uni = await post({ qa: 'fast', file: [new File([Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('x')])], 'ARCDESK;$(touch pwned)`id`.docx')] });
  ok('security: shell metacharacters in a file name are inert', [202, 422].includes(uni.status)); if (uni.status === 202) await waitState(uni.json.id, ['failed', 'done']);
  ok('security: no command was executed from a file name', !fs.existsSync(path.join(root, 'pwned')) && !fs.existsSync(path.join(web, 'pwned')));
  // loopback only
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
  if (lan) { const refused = await new Promise(res => { const s = net.connect({ host: lan.address, port: PORT, timeout: 2000 }); s.on('connect', () => { s.destroy(); res(false); }); s.on('error', () => res(true)); s.on('timeout', () => { s.destroy(); res(true); }); }); ok(`security: server is not reachable on the LAN address ${lan.address}`, refused); }
  else ok('security: no LAN interface to probe (skipped)', true);
  const home = await fetch(BASE + '/'); ok('security: no X-Powered-By header', !home.headers.get('x-powered-by'));
  ok('security: key never printed in the server log', !serverLog.includes(CANARY));

  // ================= 6. full QA chosen in the UI, via the file chooser =================
  if (SKIP_FULL) console.log('(full-QA browser run skipped by --skip-full)');
  else {
    await page.goto(BASE + '/'); await page.locator('[data-testid=file-input]').setInputFiles(path.join(root, 'tests/e2e/inputs/northwind-q3.pptx'));
    await page.locator('label:has(input[value=full])').click(); ok('full: the Full radio can be selected', await page.locator('input[value=full]').isChecked());
    await page.locator('[data-testid=generate]').click(); await page.waitForURL(/\/job\//); await page.waitForSelector('[data-testid=result]', { timeout: 420000 });
    const q = await page.locator('[data-testid=qa-result]').innerText(); ok('full: deck ready with full QA passed', /Passed\s+\d+\/\d+ checks \(full\)/.test(q), q);
    const f2 = await (await page.locator('[data-testid=deck-frame]').elementHandle()).contentFrame(); await f2.waitForFunction(() => window.__deck && window.__deck.SL, null, { timeout: 30000 });
    ok('full: second deck plays too', (await f2.evaluate(() => __deck.SL.length)) > 0);
  }
  const unexpected = consoleErrors.filter(e => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e)); // the 4xx are the refusals this test provokes on purpose
  ok('final: no unexpected console errors in the whole browser session', unexpected.length === 0, unexpected.join(' | '));
  ok('final: no request left this machine during the whole session', external.length === 0, external.join(' '));
} catch (e) { ok('test run completed without an exception', false, e.stack); }
await browser.close(); await stop();
fs.rmSync(WEBDATA, { recursive: true, force: true });
console.log(`\n${fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL WEB TESTS PASSED'}\npass-count: ${pass}`); process.exit(fails.length ? 1 : 0);
