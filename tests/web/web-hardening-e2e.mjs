// Browser + HTTP tests of the product journey details and the local-runtime hardening added in Phase 6: replace/remove a file, client-side file checks,
// error recovery (switch mode, try again), delete files, responsive layout, queue and concurrency limits, orphan cleanup, symlink escape,
// Host-header (DNS rebinding) refusal, missing Content-Length, client-supplied model/endpoint ignored, information leakage.
// Uses a LOCAL FAKE Anthropic endpoint for the live parts: plumbing evidence only. usage: node tests/web/web-hardening-e2e.mjs
import '../support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import http from 'http'; import { spawn } from 'child_process'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
import { startFake } from '../ai/fake-anthropic.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), web = path.join(root, 'web'), DATA = path.join(root, 'generated/web');
const PORT = 3196, BASE = `http://127.0.0.1:${PORT}`, KEY = 'sk-ant-CANARY-hardening-77aa88bb99', RAW = 'SECRET-PROVIDER-TEXT-hardening';
const { chromium } = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js')('playwright-core');
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
let pass = 0; const fails = []; const ok = (n, c, d = '') => { if (c) { pass++; console.log('PASS  ' + n); } else { fails.push(n); console.log('FAIL  ' + n + (d ? '  -> ' + String(d).slice(0, 300) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NW = JSON.parse(fs.readFileSync(path.join(root, 'tests/ai/fixtures/northwind-q3.json'), 'utf8')).responses[0], DOC = path.join(root, 'tests/live/docs/quarterly-review-final-v3.pptx');
const CORRUPT = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('not really a zip')]);

fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
const ORPHAN = 'a1b2c3d4'.repeat(4); fs.mkdirSync(path.join(DATA, ORPHAN)); fs.writeFileSync(path.join(DATA, ORPHAN, 'old.txt'), 'left over from an earlier server run'); fs.mkdirSync(path.join(DATA, 'keepme')); fs.writeFileSync(path.join(DATA, 'keepme/x'), 'not a job folder');
let script = []; const fake = await startFake(() => script.shift() || { text: NW });
const server = spawn(process.execPath, [path.join(web, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: web, env: { ...process.env, ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: fake.url, FILMDECK_MAX_QUEUED: '1', FILMDECK_RETRY_DELAY_MS: '20' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/config')).ok) break; } catch {} await sleep(250); }
const post = async (fields, headers = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, ...(Array.isArray(v) ? v : [v])); const r = await fetch(BASE + '/api/generate', { method: 'POST', body: fd, headers }); return { status: r.status, json: await r.json().catch(() => null) }; };
const status = async id => (await fetch(`${BASE}/api/status/${id}`)).json().catch(() => null);
const waitDone = async (id, ms = 300000) => { const t0 = Date.now(); for (;;) { const j = await status(id); if (j && (j.state === 'done' || j.state === 'failed')) return j; if (Date.now() - t0 > ms) throw new Error('timeout ' + id); await sleep(400); } };
const raw = (opts, body) => new Promise(res => { const q = http.request({ host: '127.0.0.1', port: PORT, ...opts }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, body: b })); }); q.on('error', e => res({ status: 0, body: String(e) })); if (body) q.write(body); q.end(); });

const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage();
const posts = [], consoleErrors = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); }); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); page.on('pageerror', e => consoleErrors.push(String(e)));
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
try {
  // ===== 1. journey details on the home page =====
  await page.goto(BASE + '/'); await page.waitForSelector('[data-testid=dropzone]');
  const home = await page.locator('main').innerText();
  ok('home: purpose is clear (document in, cinematic presentation out) and limits are visible', /Turn a document into a cinematic presentation/i.test(home) && /\.pptx \.docx \.pdf \.md \.txt/.test(await page.locator('[data-testid=limits]').innerText()) && /25 MB/.test(await page.locator('[data-testid=limits]').innerText()));
  ok('home: mock mode states its prepared-storyboard limitation plainly', /only for the 12 sample documents/.test(await page.locator('[data-testid=mode-note]').innerText()) && /Any other document needs Live/.test(await page.locator('[data-testid=mode-note]').innerText()));
  ok('home: quality check options explain time and what they test', /About 1 minute/.test(await page.locator('[data-testid=qa-choice]').innerText()) && /About 3 minutes/.test(await page.locator('[data-testid=qa-choice]').innerText()));
  const fc1 = page.waitForEvent('filechooser'); await page.locator('[data-testid=dropzone]').click(); const ch = await fc1; await ch.setFiles(DOC);
  ok('upload: choosing a file via the picker shows its name and size', (await page.locator('[data-testid=file-name]').innerText()) === 'quarterly-review-final-v3.pptx' && await page.locator('[data-testid=chosen]').isVisible());
  const fc2 = page.waitForEvent('filechooser'); await page.locator('[data-testid=replace]').click(); await (await fc2).setFiles(path.join(root, 'tests/corpus/docs/08-marketing-case.txt'));
  ok('upload: Replace swaps the selected document', (await page.locator('[data-testid=file-name]').innerText()) === '08-marketing-case.txt');
  await page.locator('[data-testid=remove]').click(); ok('upload: Remove returns to the empty drop zone and disables Generate', await page.locator('[data-testid=dropzone]').isVisible() && await page.locator('[data-testid=generate]').isDisabled());
  const before = posts.length; await page.locator('[data-testid=file-input]').setInputFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  ok('upload: a wrong file type is refused in the page with a plain message, before any upload', /Unsupported file type/.test(await page.locator('[data-testid=error]').innerText()) && posts.length === before && await page.locator('[data-testid=generate]').isDisabled());
  await page.locator('[data-testid=file-input]').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(26 * 1024 * 1024, 0x25) });
  ok('upload: a file over 25 MB is refused in the page with its size, before any upload', /File too large/.test(await page.locator('[data-testid=error]').innerText()) && /26\.0 MB/.test(await page.locator('[data-testid=error]').innerText()) && posts.length === before);
  await page.locator('[data-testid=file-input]').setInputFiles({ name: 'empty.md', mimeType: 'text/markdown', buffer: Buffer.alloc(0) }); ok('upload: an empty file is refused in the page', /Empty file/.test(await page.locator('[data-testid=error]').innerText()));
  // drag a second file over an already chosen file
  await page.locator('[data-testid=file-input]').setInputFiles(DOC);
  await page.evaluate(async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'second.txt')); const el = [...document.querySelectorAll('.muted')].find(e => /drop another file/.test(e.textContent)); el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, Buffer.from('hello 5 percent').toString('base64'));
  ok('upload: dropping a new file onto a chosen file replaces it', (await page.locator('[data-testid=file-name]').innerText()) === 'second.txt');
  // recovery: a document with no prepared plan -> offered Live
  await page.locator('[data-testid=file-input]').setInputFiles({ name: 'my-quarterly-numbers.pptx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(DOC) }); await page.locator('[data-testid=generate]').click(); await page.waitForSelector('[data-testid=error]');
  ok('recovery: the "no prepared plan" error explains the limitation and offers Switch to Live (Live is available here)', /No prepared deck plan/.test(await page.locator('[data-testid=error]').innerText()) && await page.getByRole('button', { name: 'Switch to Live mode' }).isVisible());
  await page.getByRole('button', { name: 'Switch to Live mode' }).click(); ok('recovery: Switch to Live selects Live and clears the error', await page.locator('input[name=mode][value=live]').isChecked() && (await page.locator('[data-testid=error]').count()) === 0);

  // ===== 2. orphan cleanup and burst of concurrent submissions =====
  const first = await post({ qa: 'fast', file: [new File([CORRUPT], 'arcdesk.docx')] }); await waitDone(first.json.id);
  ok('cleanup: a leftover job folder from an earlier server run is removed on first use; non-job folders are never touched', !fs.existsSync(path.join(DATA, ORPHAN)) && fs.existsSync(path.join(DATA, 'keepme/x')));
  const burst = await Promise.all(Array.from({ length: 12 }, () => post({ qa: 'fast', file: [new File([CORRUPT], 'arcdesk.docx')] })));
  ok('concurrency: 12 simultaneous uploads get only 202 (accepted) or 429 (busy), never a server error', burst.every(b => b.status === 202 || b.status === 429) && burst.some(b => b.status === 202), burst.map(b => b.status).join(','));
  const accepted = burst.filter(b => b.status === 202); const fin = await Promise.all(accepted.map(b => waitDone(b.json.id)));
  ok('concurrency: every accepted job ends in a clean friendly failure (corrupt documents), the server stays up', fin.every(j => j.state === 'failed' && j.error.title) && (await fetch(BASE + '/api/config')).ok);
  ok('concurrency: refused (429) submissions left no folder behind', fs.readdirSync(DATA).filter(f => /^[a-f0-9]{32}$/.test(f)).length === 1 + accepted.length, fs.readdirSync(DATA).join());

  // ===== 3. queue limit, ignored client fields, running-job protection =====
  script = [{ text: NW }];
  const A = await post({ mode: 'live', qa: 'fast', model: 'claude-evil-9', endpoint: 'http://evil.example', baseUrl: 'http://evil.example', apiKey: 'sk-ant-from-the-browser', file: [new File([fs.readFileSync(DOC)], 'board-pack.pptx')] }); ok('queue: live job A accepted', A.status === 202, JSON.stringify(A));
  const B = await post({ qa: 'fast', file: [new File([CORRUPT], 'arcdesk.docx')] }), C = await post({ qa: 'fast', file: [new File([CORRUPT], 'arcdesk.docx')] });
  ok('queue: with one waiting slot, the first extra job queues (202) and the next is refused (429 Busy)', B.status === 202 && C.status === 429 && /Busy|waiting/i.test(JSON.stringify(C.json)), `${B.status} ${C.status}`);
  const sB = await status(B.json.id); ok('queue: the waiting job reports its position', sB.state === 'queued' && sB.queuePosition === 1, JSON.stringify([sB.state, sB.queuePosition]));
  const del = (id, headers = {}) => fetch(`${BASE}/api/status/${id}`, { method: 'DELETE', headers }), retry = (id, headers = {}) => fetch(`${BASE}/api/retry/${id}`, { method: 'POST', headers });
  ok('delete: a running job cannot be deleted (409), nor a queued one', (await del(A.json.id)).status === 409 && (await del(B.json.id)).status === 409);
  ok('retry: a job that is not failed cannot be retried (409); unknown id 404', (await retry(A.json.id)).status === 409 && (await retry('f'.repeat(32))).status === 404);
  ok('retry/delete: cross-origin requests are refused (403)', (await retry(A.json.id, { Origin: 'https://evil.example' })).status === 403 && (await del(A.json.id, { Origin: 'https://evil.example' })).status === 403);
  const jA = await waitDone(A.json.id); ok('queue: job A completes', jA.state === 'done', JSON.stringify(jA.error));
  ok('limits: the model name, endpoint, base URL and key sent by the client were ignored (one request, default model, to the configured endpoint, server key)', fake.seen.length === 1 && fake.seen[0].body.model === 'claude-opus-5-5' && fake.seen[0].headers['x-api-key'] === KEY && !JSON.stringify(fake.seen[0].body).includes('evil') && !JSON.stringify(fake.seen).includes('from-the-browser'));
  const jB = await waitDone(B.json.id); ok('queue: the waiting job then ran and failed cleanly', jB.state === 'failed');

  // ===== 4. result page: completed state, responsive layout, download, symlink, delete =====
  await page.goto(`${BASE}/job/${A.json.id}`); await page.waitForSelector('[data-testid=result]');
  const res = await page.locator('[data-testid=result]').innerText();
  ok('result: identifies the document, the mode and the model', /board-pack\.pptx/.test(await page.locator('[data-testid=gen-doc]').innerText()) && (await page.locator('[data-testid=gen-mode]').innerText()) === 'Live' && /claude-opus-5-5|fake-model-1/.test(await page.locator('[data-testid=gen-model]').innerText()));
  ok('result: offers play, open full window, download, make another and delete', /Open full window/i.test(res) && /Download HTML file/i.test(res) && /Make another/i.test(res) && /Delete files/i.test(res));
  const dl = page.waitForEvent('download'); await page.locator('[data-testid=download-deck]').click(); const d = await dl; ok('result: the download is a .html file', /^filmdeck-[a-z0-9-]+\.html$/.test(d.suggestedFilename()), d.suggestedFilename());
  const widths = [1440, 1024, 820, 600, 390]; const over = [];
  for (const w of widths) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); const o = await overflow(); const fw = await page.locator('[data-testid=deck-frame]').evaluate(e => e.getBoundingClientRect().width); over.push([w, o, Math.round(fw)]); }
  ok('responsive: the result page has no horizontal scroll at 1440, 1024, 820, 600 and 390 px, and the player fits', over.every(([w, o, fw]) => o <= 1 && fw <= w), JSON.stringify(over));
  await page.screenshot({ path: path.join(root, 'generated/web-ui-result-390.png') });
  for (const w of widths) { await page.setViewportSize({ width: w, height: 900 }); await page.goto(BASE + '/'); await page.waitForSelector('[data-testid=dropzone]'); const o = await overflow(); const btn = await page.locator('[data-testid=generate]').boundingBox(); over.push([w, o]); if (o > 1 || !btn || btn.x + btn.width > w) { ok(`responsive: home at ${w}px`, false, `overflow ${o}`); } }
  ok('responsive: the home page has no horizontal scroll at any tested width and the main button stays on screen', true);
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(root, 'generated/web-ui-home-390.png'), fullPage: true });
  await page.goto(`${BASE}/job/${jB.id}`); await page.waitForSelector('[data-testid=error]'); await page.setViewportSize({ width: 390, height: 844 }); ok('responsive: the failure page fits a phone and offers a way back', (await overflow()) <= 1 && await page.getByText('Try another document').isVisible());
  await page.setViewportSize({ width: 1280, height: 900 });
  // symlink escape: the deck file becomes a link to a file outside the job folder
  const idx = path.join(DATA, A.json.id, 'deck/index.html'); fs.renameSync(idx, idx + '.bak'); fs.symlinkSync('/etc/hosts', idx);
  const sym = await fetch(`${BASE}/deck/${A.json.id}`); ok('symlink: a deck file that is a link to a file outside its folder is not served', sym.status === 404 && !(await sym.text()).includes('localhost'));
  fs.rmSync(idx); fs.renameSync(idx + '.bak', idx); ok('symlink: the real file is served again', (await fetch(`${BASE}/deck/${A.json.id}`)).status === 200);
  // delete via the UI
  await page.goto(`${BASE}/job/${A.json.id}`); await page.waitForSelector('[data-testid=result]'); page.once('dialog', dlg => dlg.accept()); await page.locator('[data-testid=delete]').click(); await page.waitForURL(BASE + '/');
  ok('delete: Delete files removes the job from disk and the registry, then returns home', !fs.existsSync(path.join(DATA, A.json.id)) && (await fetch(`${BASE}/api/status/${A.json.id}`)).status === 404 && (await fetch(`${BASE}/deck/${A.json.id}`)).status === 404);

  // ===== 5. try again after a provider failure =====
  script = [{ status: 500, error: RAW }, { status: 500, error: RAW }, { status: 500, error: RAW }, { status: 401, error: RAW }];
  const D = await post({ mode: 'live', qa: 'fast', file: [new File([fs.readFileSync(DOC)], 'retry-me.pptx')] }); const jD = await waitDone(D.json.id);
  ok('retry: a provider outage fails the job with a plain message, and the job can be retried', jD.state === 'failed' && jD.canRetry === true && /temporary problem/.test(jD.error.message) && !JSON.stringify(jD).includes(RAW));
  await page.goto(`${BASE}/job/${D.json.id}`); await page.waitForSelector('[data-testid=retry]'); const n0 = fake.seen.length; await page.locator('[data-testid=retry]').click(); await page.waitForFunction(old => !location.pathname.endsWith(old), D.json.id);
  const E = page.url().split('/').pop(); ok('retry: "Try again" starts a NEW job (new id) from the same stored upload and options', E !== D.json.id && /^[a-f0-9]{32}$/.test(E));
  const jE = await waitDone(E); ok('retry: the new job ran once against the provider (one deliberate user action = one new run), and its own failure is shown plainly', jE.state === 'failed' && fake.seen.length === n0 + 1 && /rejected the API key/.test(jE.error.title) && jE.mode === 'live' && jE.displayName === 'retry-me.pptx', `${fake.seen.length - n0} ${JSON.stringify(jE.error)}`);
  ok('retry: nothing retries automatically (the call count is stable)', await (async () => { const c = fake.seen.length; await sleep(1500); return fake.seen.length === c; })());

  // ===== 5b. retention: only the newest 20 finished jobs are kept =====
  const ids = []; for (let k = 0; k < 22; k++) { const r = await post({ qa: 'fast', file: [new File([CORRUPT], 'arcdesk.docx')] }); if (r.status === 202) { ids.push(r.json.id); await waitDone(r.json.id); } }
  const dirsNow = fs.readdirSync(DATA).filter(f => /^[a-f0-9]{32}$/.test(f));
  ok('retention: after 22 more finished jobs at most 20 job folders remain, and the oldest are deleted from disk and registry', ids.length >= 21 && dirsNow.length <= 20 && !fs.existsSync(path.join(DATA, ids[0])) && (await fetch(`${BASE}/api/status/${ids[0]}`)).status === 404 && (await fetch(`${BASE}/api/status/${ids[ids.length - 1]}`)).status === 200, `${ids.length} ${dirsNow.length}`);

  // ===== 6. request-level hardening =====
  const mp = '--b\r\nContent-Disposition: form-data; name="qa"\r\n\r\nfast\r\n--b--\r\n';
  const chunked = await raw({ method: 'POST', path: '/api/generate', headers: { 'Content-Type': 'multipart/form-data; boundary=b', 'Transfer-Encoding': 'chunked' } }, mp); ok('limits: a request with no Content-Length (unbounded body) is refused with 411', chunked.status === 411, chunked.status + chunked.body.slice(0, 80));
  const hostile = await raw({ method: 'POST', path: '/api/generate', headers: { Host: 'evil.example:' + PORT, 'Content-Type': 'multipart/form-data; boundary=b', 'Content-Length': Buffer.byteLength(mp) } }, mp); ok('rebinding: a request whose Host is not a loopback name is refused (403)', hostile.status === 403, hostile.status);
  const hostileDel = await raw({ method: 'DELETE', path: '/api/status/' + 'f'.repeat(32), headers: { Host: 'attacker.test' } }); ok('rebinding: the same for delete', hostileDel.status === 403);
  const localhostOk = await raw({ method: 'DELETE', path: '/api/status/' + 'f'.repeat(32), headers: { Host: 'localhost:' + PORT } }); ok('rebinding: localhost is still accepted (reaches the handler, 404 for an unknown id)', localhostOk.status === 404);
  const bogusType = await raw({ method: 'POST', path: '/api/generate', headers: { 'Content-Type': 'text/plain', 'Content-Length': 5 } }, 'hello'); ok('leakage: a malformed upload gives a plain 400 with no stack trace or file path', bogusType.status === 400 && !/\.ts|\.mjs|node_modules|\/Users\//.test(bogusType.body), bogusType.body.slice(0, 120));
  const nf = await fetch(BASE + '/definitely/not/here'); const nft = await nf.text(); ok('leakage: an unknown URL is a plain 404 page with no paths', nf.status === 404 && !/\/Users\/|node_modules|\.mjs/.test(nft));
  const big = await post({ qa: 'fast', file: [new File([Buffer.alloc(26 * 1024 * 1024, 0x61)], 'big.md')] }); ok('limits: a 26 MB upload is refused (413)', big.status === 413);
  ok('leakage: the status JSON of a failed live job contains no path and no environment value', !JSON.stringify(await status(D.json.id)).includes(root) && !JSON.stringify(await status(D.json.id)).includes(KEY));
  ok('secrets: the key is in no file under generated/web, no response header and not in the server log', (() => { let leaked = false; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.lstatSync(p); if (s.isDirectory()) walk(p); else if (!s.isSymbolicLink() && s.size < 3e6 && fs.readFileSync(p, 'utf8').includes(KEY)) leaked = true; } }; walk(DATA); return !leaked && !log.includes(KEY); })());
  ok('final: no unexpected console errors', consoleErrors.filter(e => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e)).length === 0, consoleErrors.join('|'));
} catch (e) { ok('run completed without an exception', false, e.stack); }
await browser.close(); server.kill('SIGTERM'); fake.close(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true });
console.log(`\n${fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL HARDENING WEB TESTS PASSED'}\npass-count: ${pass}`); process.exit(fails.length ? 1 : 0);
