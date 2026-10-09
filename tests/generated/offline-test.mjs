// Opens a generated deck in a browser whose network is switched OFF (and DNS broken) and plays the whole deck.
// Proves portability: no request leaves the page, GSAP is defined, the three embedded font families load, every scene plays.
// usage: node tests/generated/offline-test.mjs <generated-dir>      (needs FILMDECK_QA_MODULES)
import '../support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const dir = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: node tests/generated/offline-test.mjs <generated-dir>'); process.exit(2); }
const { chromium } = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js')('playwright-core');
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, offline: true }); const page = await ctx.newPage();
const requests = [], failed = [], errors = []; page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); }); page.on('requestfailed', r => failed.push(r.url()));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
await page.goto('file://' + path.join(dir, 'index.html')); await page.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 15000 });
t('page loaded with the network off and GSAP defined', await page.evaluate(() => typeof gsap === 'object' && gsap.version === '3.12.5'));
await page.click('#go'); await page.evaluate(() => { gsap.globalTimeline.timeScale(10); }); await page.waitForTimeout(500);
const n = await page.evaluate(() => __deck.SL.length); let ended = false;
await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); for (let g = 0; g < 400; g++) { const D = __deck; if (D.cur === D.SL.length - 1 && D.step === D.SL[D.cur].steps.length) break; D.next(); await w(130); } });
ended = await page.evaluate(() => __deck.cur === __deck.SL.length - 1 && __deck.step === __deck.SL[__deck.cur].steps.length);
t(`all ${n} scenes play to the end offline`, ended);
const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')); });
t('the three embedded font families load', ['Barlow Condensed', 'Instrument Serif', 'JetBrains Mono'].every(f => fonts.includes(f)), fonts.join());
t('no network request was made by the page', requests.length === 0, requests.slice(0, 3).join(', '));
t('no failed request, no console error', failed.length === 0 && errors.length === 0, [...failed, ...errors].slice(0, 3).join(' | '));
await browser.close(); console.log(bad ? `\n${bad} FAILED` : '\nOFFLINE TEST PASSED'); process.exit(bad ? 1 : 0);
