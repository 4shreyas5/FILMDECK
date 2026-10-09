// QA for a generated deck folder (output of tools/generate-deck.mjs).
// Static checks, then browser checks (headless Chromium via playwright-core), then the full navigation/parity harness in single-file mode.
// usage: node tests/generated/qa.mjs <generated-dir> [--mode=fast|full]   (default full)
// FAST = static checks + offline proof + console errors + every-scene walk with layout checks + forward/back/rebuild/final-scene navigation.
// FULL = FAST + the complete interaction harness (keyboard, mouse, rapid clicks, transitions, HUD, blackout, help, fullscreen, sound, reduced motion, 3 viewports).      needs FILMDECK_QA_MODULES=<dir containing playwright-core> (see docs)
import '../support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import { probeScene, SAFE } from '../support/layout-probe.mjs'; import { createRequire } from 'module'; import { spawnSync } from 'child_process'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: node tests/generated/qa.mjs <generated-dir>'); process.exit(2); }
const MODE = ((process.argv.find(a => a.startsWith('--mode=')) || '--mode=full').slice(7)); if (!['fast', 'full'].includes(MODE)) { console.error('--mode must be fast or full'); process.exit(2); }
const t0 = Date.now(); const results = []; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');

// ---------- static ----------
const html = fs.existsSync(path.join(dir, 'index.html')) ? rd('index.html') : '';
check('1 generated HTML exists', html.length > 0);
const sb = JSON.parse(rd('storyboard.json')), deck = JSON.parse(rd('deck.json')), scenesJs = rd('scenes.js'), scenesCss = rd('scenes.css');
const marker = '/* @@FILM_SCENES@@ */\n'; const rt = fs.readFileSync(path.join(root, 'engine/film-runtime.js'), 'utf8'); const [rtA, rtB] = rt.split(marker);
const count = (s, sub) => s.split(sub).length - 1;
check('2 runtime appears exactly once and is byte-identical to engine/film-runtime.js', count(html, 'const SND=') === 1 && count(html, 'function runStep') === 1 && html.includes(rtA) && html.includes(rtB) && html.includes(fs.readFileSync(path.join(root, 'engine/film-runtime.css'), 'utf8')));
check('2b scenes inserted at the runtime splice point', html.includes(rtA + scenesJs) && html.includes(scenesJs + rtB));
check('5 storyboard scene ids unique', new Set(sb.scenes.map(s => s.id)).size === sb.scenes.length);
check('5b section ids unique and match scenes', new Set(deck.sections).size === deck.sections.length && deck.sections.length === sb.scenes.length && deck.sections.every(id => count(html, `<section class="slide" id="${id}">`) === 1));
const { recipes } = await import('../../engine/recipes/index.mjs');
check('6 recipe ids valid', sb.scenes.every(s => recipes[s.recipe]));
const { validateStoryboard } = await import('../../tools/validate-storyboard.mjs'); const v = validateStoryboard(sb);
check('7 no untraceable factual numbers (storyboard validator)', v.errors.length === 0, v.errors.slice(0, 3).join(' | '));
const FORB = /<\s*\/?\s*[a-z!]|`|\$\{|javascript:|=>|\bfunction\s*\(|\beval\s*\(/i;
const codeLike = []; (function walk(o, p) { if (typeof o === 'string') { if (FORB.test(o)) codeLike.push(p); } else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], p + '.' + k); })(sb, '$');
check('8 no code or markup inside storyboard JSON', codeLike.length === 0, codeLike.slice(0, 3).join(', '));
check('4 step counts planned per scene equal storyboard beats', deck.scenes.every((m, i) => m.beats.length === sb.scenes[i].beats.length));
check('H source references survive generation', deck.scenes.every((m, i) => { const used = JSON.stringify(sb.scenes[i].inputs).match(/"fact":"([a-z0-9-]+)"/g) || []; return used.every(u => m.sourceRefs.some(r => `"fact":"${r.fact}"` === u)); }) && /window\.__filmdeckMeta=/.test(scenesJs));
check('G speaker notes survive generation', deck.scenes.every((m, i) => m.beats.every((b, k) => b.notes === sb.scenes[i].beats[k].notes)));
check('runtime duplicated nowhere else in the output folder', fs.readdirSync(dir).filter(f => f !== 'index.html' && fs.statSync(path.join(dir, f)).isFile()).every(f => !fs.readFileSync(path.join(dir, f), 'utf8').includes('const SND=')));
check('no em-dashes in generated files', ![scenesJs, scenesCss, html].some(t => t.includes('—')));
const externalUrls = [...html.matchAll(/(?:src|href)=["'](https?:[^"']+)|url\((?:["']?)(https?:[^)"']+)|@import\s+["']?(https?:[^"';\s]+)/g)].map(m => m[1] || m[2] || m[3]);
check('offline: the HTML references no external URL (GSAP and fonts are embedded)', externalUrls.length === 0, externalUrls.slice(0, 3).join(', '));
check('offline: GSAP and embedded fonts are present in the file', html.includes('GSAP 3.12.5') && html.includes('@font-face') && html.includes('data:font/woff2;base64,'));
if (fs.existsSync(path.join(dir, 'source.json'))) { const { groundCheck } = await import('../../tools/ai/storyboard-lib.mjs'); const { normalizedToSrc } = await import('../../tools/source-to-prompt.mjs'); const ge = groundCheck(sb, normalizedToSrc(JSON.parse(rd('source.json')), { maxChars: 1e9 }), { requireEvidence: true }); check('7e every fact is in its source section with an exact evidence quote', ge.length === 0, ge.slice(0, 2).join(' | ')); }
check('doctype absent (quirks mode preserved, as in the reference decks)', !/^\s*<!doctype/i.test(html));

// ---------- browser ----------
const req = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js'); let chromium;
const report = extra => ({ ok: !results.some(r => !r.ok), passed: !results.some(r => !r.ok), checks: { total: results.length, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }, results, sceneCount: sb.scenes.length, beatCount: sb.scenes.reduce((n, s) => n + s.beats.length, 0), consoleErrors: 0, mode: MODE, durationMs: Date.now() - t0, ...extra });
try { ({ chromium } = req('playwright-core')); } catch { check('playwright-core available (set FILMDECK_QA_MODULES)', false); fs.writeFileSync(path.join(dir, 'qa-report.json'), JSON.stringify(report({ passed: false }), null, 2)); process.exit(1); }
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); const external = []; await page.route(/^https?:\/\//, r => { external.push(r.request().url()); r.abort(); }); const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.join(dir, 'index.html')); await page.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 15000 });
const live = await page.evaluate(() => ({ scenes: __deck.SL.map(s => ({ id: s.id, chapter: s.chapter, steps: s.steps.length, letterbox: !!s.letterbox, mood: s.mood })), meta: window.__filmdeckMeta && window.__filmdeckMeta.scenes.length }));
await page.evaluate(() => document.fonts.ready);
check('3 every storyboard scene exists in the deck with its chapter', live.scenes.length === sb.scenes.length && live.scenes.every((s, i) => s.id === deck.sections[i] && s.chapter === sb.scenes[i].chapter));
check('4 every storyboard beat has a corresponding step', live.scenes.every((s, i) => s.steps === sb.scenes[i].beats.length), live.scenes.map(s => s.steps).join(','));
check('G meta (notes, sources) available at runtime via window.__filmdeckMeta', live.meta === sb.scenes.length);
await page.click('#go'); await page.evaluate(() => { gsap.globalTimeline.timeScale(10); }); await page.waitForTimeout(500);
// on-screen number provenance in the real DOM, at the final state of every scene
const allowedTokens = new Set(deck.allowedNumberStrings.flatMap(a => (a.match(/\d[\d,.]*/g) || []).map(t => t.replace(/[.,]+$/, '')))); const bad = [];
const layout = { errors: [], warnings: [] }; const probe = async (i, b) => { const r = await page.evaluate(probeScene, { zones: deck.scenes[i].textZones || [], safe: SAFE }); for (const k of ['errors', 'warnings']) for (const m of r[k]) layout[k].push({ scene: i + 1, beat: b, ...m }); };
for (let i = 0; i < live.scenes.length; i++) {
  await page.evaluate(k => __deck.jumpTo(k), i); await page.waitForTimeout(1400);
  for (let b = 0; b < live.scenes[i].steps; b++) { await page.evaluate(() => __deck.next()); await page.waitForTimeout(350); await probe(i, b + 1); }
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.querySelector('.slide.on').innerText);
  for (let tok of text.match(/\d[\d,.]*/g) || []) { tok = tok.replace(/[.,]+$/, ''); if (!allowedTokens.has(tok)) bad.push(`scene ${i + 1}: "${tok}"`); }
}
check('7b every number visible in the rendered scenes traces to a fact display or a declared axis tick', bad.length === 0, bad.slice(0, 5).join('; '));
const uniq = (a, k) => [...new Map(a.map(x => [x.kind + x.msg, x])).values()];
const lerr = uniq(layout.errors.filter(e => !/^text-fit/.test(e.kind))), ferr = uniq(layout.errors.filter(e => /^text-fit/.test(e.kind)));
const fmt = a => a.slice(0, 4).map(e => `scene ${e.scene} beat ${e.beat}: ${e.msg}`).join(' | ');
check('7c layout: no critical text outside the stage and none clipped', lerr.length === 0, fmt(lerr));
check('7d text fit: every recipe text zone is within its declared width and line count', ferr.length === 0, fmt(ferr));
const fontInfo = await page.evaluate(() => ({ loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')), ok: ['900 40px "Barlow Condensed"', 'italic 400 40px "Instrument Serif"', '500 16px "JetBrains Mono"'].map(f => document.fonts.check(f)) }));
check('9b embedded fonts load without the network', ['Barlow Condensed', 'Instrument Serif', 'JetBrains Mono'].every(f => fontInfo.loaded.includes(f)), fontInfo.loaded.join(','));
check('9d page encoding is UTF-8 (no mojibake for non-ASCII text)', await page.evaluate(() => document.characterSet === 'UTF-8'));
check('9c no external network request was attempted by the page', external.length === 0, external.slice(0, 3).join(', '));
check('9 no console errors while opening and walking every scene', errors.length === 0, errors.slice(0, 2).join(' | '));
const nav = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), D = __deck, N = D.SL.length, sig = () => document.querySelector('.slide.on').innerText.replace(/\s+/g, ' ').trim(); const o = { problems: [] };
  const atEnd = () => D.cur === N - 1 && D.step === D.SL[N - 1].steps.length, atStart = () => D.cur === 0 && D.step === 0;
  D.jumpTo(0); await wait(600); while (D.step > 0) { D.prev(); await wait(120); } let guard = 0, seen = new Set([D.cur]), last = -1;
  while (!atEnd() && guard++ < 400) { const c = D.cur, s0 = D.step; D.next(); await wait(140); if (D.cur < c || (D.cur === c && D.step < s0)) o.problems.push('forward moved backwards'); seen.add(D.cur); }
  o.forwardEnd = atEnd(); o.scenesSeen = seen.size; guard = 0;
  while (!atStart() && guard++ < 400) { D.prev(); await wait(140); } o.backStart = atStart();
  o.rebuild = []; for (let s = 0; s < N; s++) { D.jumpTo(s); await wait(300); while (D.step < D.SL[s].steps.length) { D.next(); await wait(140); } await wait(500); const a = sig(); D.prev(); await wait(300); D.next(); await wait(500); o.rebuild.push(a === sig()); }
  D.jumpTo(N - 1); await wait(300); while (D.step < D.SL[N - 1].steps.length) { D.next(); await wait(140); } o.finalReachable = atEnd();
  return o;
});
check('3b navigation: forward through every beat, backward to the start, final scene reachable', nav.forwardEnd && nav.backStart && nav.finalReachable && nav.scenesSeen === live.scenes.length && nav.problems.length === 0, JSON.stringify(nav));
check('3c scene rebuild: stepping back one beat and forward again restores the identical scene', nav.rebuild.every(Boolean), JSON.stringify(nav.rebuild));
await browser.close();

// ---------- full interaction harness (forward/back/rebuild/keys/mouse/rapid/viewports/reduced motion/final scene) ----------
const par = MODE === 'fast' ? { status: 0, skipped: true } : spawnSync(process.execPath, [path.join(root, 'tests/parity/parity.mjs'), 'generated-' + deck.generator.deckId, path.join(dir, 'index.html'), '', path.join(dir, 'qa-output')], { stdio: 'inherit', env: process.env });
if (MODE === 'full') check('10-14 forward, back, rebuild, keyboard, mouse, rapid clicks, transitions, HUD, timecode, blackout, help, fullscreen request, sound toggle, reduced motion, 3 viewports, final scene reachable', par.status === 0);
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(dir, 'qa-report.json'), JSON.stringify(report({ consoleErrors: errors.length, consoleErrorMessages: errors.slice(0, 5), layoutWarnings: uniq(layout.warnings).length, warnings: uniq(layout.warnings).slice(0, 40).map(w => `scene ${w.scene} beat ${w.beat}: [${w.kind}] ${w.msg}`) }), null, 2));
console.log(failed.length ? `QA FAILED (${failed.length})` : `QA OK (${results.length} checks)`); process.exit(failed.length ? 1 : 0);
