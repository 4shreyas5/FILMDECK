// Parity test: drives a reference deck and its extracted-runtime build through the same scenario and compares the records.
// usage: node parity.mjs <name> <reference.html> <build.html> [outdir]
// needs playwright-core: set FILMDECK_QA_MODULES to a node_modules dir containing it.
import '../support/qa-env.mjs';
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { installGsapRoute } from '../support/gsap-cache.mjs';
const req = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js');
const { chromium } = req('playwright-core');
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [name, REF, BUILD_ARG, OUT = '/tmp/filmdeck-parity'] = process.argv.slice(2);
const BUILD = BUILD_ARG || REF; const single = BUILD === REF; // single mode: one file, run once, asserted by expectations instead of compared
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true });

async function openDeck(file, vp = { width: 1920, height: 1080 }, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: vp, ...ctxOpts }); const page = await ctx.newPage(); await installGsapRoute(page); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__aud = 0; window.__fs = 0;
    for (const k of ['createOscillator', 'createBufferSource']) { const o = AudioContext.prototype[k]; AudioContext.prototype[k] = function (...a) { window.__aud++; return o.apply(this, a); }; }
    const rf = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };
  });
  await page.goto('file://' + file); await page.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 15000 });
  return { ctx, page, errors };
}
const W = (p, ms) => p.waitForTimeout(ms);
const fast = p => p.evaluate(() => { gsap.globalTimeline.timeScale(10); });
const pos = p => p.evaluate(() => [__deck.cur, __deck.step]);
const snap = p => p.evaluate(() => {
  const s = document.querySelector('.slide.on'); const fx = document.querySelector('#fx'); const c = fx.getContext('2d'); let lit = 0;
  try { const d = c.getImageData(0, 0, fx.width, fx.height).data; for (let i = 3; i < d.length; i += 4 * 11) if (d[i] > 8) lit++; } catch (e) { lit = -1; }
  return { pos: [__deck.cur, __deck.step], txt: s ? s.textContent.replace(/\s+/g, ' ').trim().length : -1, els: s ? s.querySelectorAll('*').length : -1,
    chap: document.querySelector('#hud .chap').textContent, dots: document.querySelectorAll('#hud .dots i').length, done: document.querySelectorAll('#hud .dots i.done').length,
    hudQuiet: document.querySelector('#hud').classList.contains('quiet'), tc: /^\d\d:\d\d:\d\d:\d\d$/.test(document.querySelector('#tc').textContent), fxLit: lit > 0, aud: window.__aud };
});

async function scenario(file) {
  const { ctx, page, errors } = await openDeck(file); const R = { intro: {}, fwd: [], back: [], misc: {} };
  R.intro = await page.evaluate(() => ({ title: document.title, go: document.querySelector('#go').textContent, intro: document.querySelector('#intro').innerText.replace(/\s+/g, ' '), help: document.querySelector('#help').innerText.replace(/\s+/g, ' '),
    scenes: __deck.SL.map(s => [s.id, s.chapter, s.steps.length, !!s.letterbox, JSON.stringify(s.mood), !!s.frame, !!s.exitFx]), compat: document.compatMode, fonts: document.fonts.check('900 20px "Barlow Condensed"') }));
  R.intro.stageT = await page.evaluate(() => document.querySelector('#stage').style.transform);
  await page.click('#go'); await fast(page); await W(page, 600);
  R.misc.fullscreenOnBegin = await page.evaluate(() => window.__fs);
  const total = R.intro.scenes.reduce((a, s) => a + s[2], 0), n = R.intro.scenes.length;
  // forward, every beat and every scene boundary; screenshot final state of each scene
  let prevAud = await page.evaluate(() => window.__aud);
  for (let i = 0; i < total + n + 2; i++) {
    await page.evaluate(() => __deck.next()); await W(page, 750); await fast(page); await W(page, 150);
    const s = await snap(page); const dAud = s.aud - prevAud; prevAud = s.aud; s.dAud = dAud; delete s.aud; R.fwd.push(s);
    const sc = R.intro.scenes[s.pos[0]]; if (s.pos[1] === sc[2]) { await W(page, 900); await page.screenshot({ path: `${OUT}/${name}-${path.basename(file, '.html')}-s${s.pos[0] + 1}.png` }); }
  }
  for (let i = 0; i < total + n + 2; i++) { await page.evaluate(() => __deck.prev()); await W(page, 450); await fast(page); await W(page, 150); const s = await snap(page); delete s.aud; R.back.push(s); }
  // back then forward again within every scene: structure must match first pass
  R.rebuild = [];
  for (let si = 0; si < n; si++) {
    await page.evaluate(i => __deck.jumpTo(i), si); await W(page, 1500);
    for (let k = 0; k < R.intro.scenes[si][2]; k++) { await page.evaluate(() => __deck.next()); await W(page, 500); } await W(page, 1200);
    const a = await snap(page); await page.evaluate(() => __deck.prev()); await W(page, 500); const mid = await snap(page);
    await page.evaluate(() => __deck.next()); await W(page, 1500); const b = await snap(page);
    R.rebuild.push({ scene: si + 1, same: a.txt === b.txt && a.els === b.els, midStep: mid.pos[1], expectMid: R.intro.scenes[si][2] - 1 });
  }
  // rapid clicking
  await page.evaluate(() => __deck.jumpTo(0)); await W(page, 1500);
  await page.evaluate(() => { for (let i = 0; i < 40; i++) __deck.next(); }); await W(page, 2500); R.misc.rapidFwd = await pos(page);
  await page.evaluate(() => { for (let i = 0; i < 40; i++) __deck.prev(); }); await W(page, 2500); R.misc.rapidBack = await pos(page);
  // jump + back across boundary
  await page.evaluate(() => __deck.jumpTo(4)); await W(page, 1500); await page.evaluate(() => __deck.prev()); await W(page, 1500); R.misc.jumpThenPrev = await pos(page);
  // keyboard
  const key = async (k, ms = 400) => { await page.keyboard.press(k); await W(page, ms); return pos(page); };
  await page.evaluate(() => __deck.jumpTo(0)); await W(page, 1500);
  const K = {}; K.right = await key('ArrowRight'); K.space = await key('Space'); K.pgdn = await key('PageDown'); K.enter = await key('Enter'); K.down = await key('ArrowDown');
  K.left = await key('ArrowLeft', 600); K.pgup = await key('PageUp', 600); K.up = await key('ArrowUp', 600); K.bksp = await key('Backspace', 600);
  K.n = await key('n', 1800); K.p = await key('p', 1800); K.d3 = await key('3', 1800); K.d0 = await key('0', 1800); K.d9 = await key('9', 1800); K.end = await key('End', 1800); K.home = await key('Home', 1800);
  R.keys = K;
  await page.keyboard.press('b'); R.misc.blackOn = await page.evaluate(() => document.querySelector('#blackout').classList.contains('on'));
  await page.keyboard.press('ArrowRight'); R.misc.blackClearedByNext = await page.evaluate(() => !document.querySelector('#blackout').classList.contains('on'));
  await page.keyboard.press('.'); R.misc.blackDot = await page.evaluate(() => document.querySelector('#blackout').classList.contains('on')); await page.keyboard.press('.');
  await page.keyboard.press('h'); R.misc.helpOn = await page.evaluate(() => document.querySelector('#help').classList.contains('on')); await page.keyboard.press('Escape'); R.misc.helpOff = await page.evaluate(() => !document.querySelector('#help').classList.contains('on'));
  await page.click('#bHelp'); R.misc.helpBtn = await page.evaluate(() => document.querySelector('#help').classList.contains('on')); await page.mouse.click(300, 300);
  R.misc.helpClosedByClick = await page.evaluate(() => !document.querySelector('#help').classList.contains('on'));
  const fs0 = await page.evaluate(() => window.__fs); await page.keyboard.press('f'); R.misc.fullscreenKey = (await page.evaluate(() => window.__fs)) - fs0; const fs1 = await page.evaluate(() => window.__fs); await page.click('#bFull'); R.misc.fullscreenBtn = (await page.evaluate(() => window.__fs)) - fs1;
  await page.keyboard.press('m'); R.misc.soundOff = await page.evaluate(() => document.querySelector('#bSound').textContent); await page.click('#bSound'); R.misc.soundOn = await page.evaluate(() => document.querySelector('#bSound').textContent);
  // mouse
  await page.evaluate(() => __deck.jumpTo(0)); await W(page, 1500); await page.mouse.click(600, 300); await W(page, 500); R.misc.mouseL = await pos(page);
  await page.mouse.click(600, 300, { button: 'right' }); await W(page, 700); R.misc.mouseR = await pos(page);
  // timecode advances
  const t1 = await page.evaluate(() => document.querySelector('#tc').textContent); await W(page, 1300); const t2 = await page.evaluate(() => document.querySelector('#tc').textContent); R.misc.timecodeAdvances = t1 !== t2;
  // audio: sound-off must stop creating nodes? (muting only gates master gain, so just record that sfx still runs / not)
  R.errors = errors.slice(); await ctx.close();
  // real-time (1x speed) pass over the first scene and its transition
  { const o = await openDeck(file); await o.page.click('#go'); await W(o.page, 800); const rt = [];
    for (let i = 0; i < 6; i++) { await o.page.evaluate(() => __deck.next()); await W(o.page, i === 4 ? 2500 : 1600); rt.push((await pos(o.page)).join(':')); }
    R.misc.realtime = rt; R.errors.push(...o.errors); await o.ctx.close(); }
  // viewport scaling + reduced motion + cdn blocked
  for (const vp of [{ width: 1280, height: 720 }, { width: 800, height: 1200 }, { width: 2560, height: 1080 }]) { const o = await openDeck(file, vp); R.misc['stage' + vp.width] = await o.page.evaluate(() => document.querySelector('#stage').style.transform); R.errors.push(...o.errors); await o.ctx.close(); }
  { const o = await openDeck(file, { width: 1280, height: 720 }, { reducedMotion: 'reduce' }); R.misc.rmGrain = await o.page.evaluate(() => getComputedStyle(document.querySelector('#grain')).display); R.errors.push(...o.errors); await o.ctx.close(); }
  return R;
}
const A = await scenario(REF); const B = single ? A : await scenario(BUILD);
// ---- compare
const diffs = [];
const eq = (what, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ what, ref: a, build: b }); };
eq('intro', A.intro, B.intro); eq('misc', A.misc, B.misc); eq('keys', A.keys, B.keys); eq('rebuild', A.rebuild, B.rebuild);
['fwd', 'back'].forEach(k => A[k].forEach((s, i) => { const t = B[k][i]; const same = s.pos.join() === t.pos.join() && s.chap === t.chap && s.dots === t.dots && s.done === t.done && s.hudQuiet === t.hudQuiet && s.tc === t.tc &&  s.txt === t.txt && s.els === t.els; if (!same) diffs.push({ what: `${k}[${i}]`, ref: s, build: t }); }));
// particle activity is sampled from a random field, so compare it in aggregate: share of snapshots with lit particles must agree within 10 points
const lit = R => [...R.fwd, ...R.back].filter(x => x.fxLit).length / (R.fwd.length + R.back.length);
const particleShare = [lit(A), lit(B)]; if (Math.abs(particleShare[0] - particleShare[1]) > 0.10) diffs.push({ what: 'particleShare', ref: particleShare[0], build: particleShare[1] });
let audDiff = []; A.fwd.forEach((s, i) => { if (Math.abs(s.dAud - B.fwd[i].dAud) > 3) audDiff.push([i, s.pos.join(':'), s.dAud, B.fwd[i].dAud]); });
const summary = { name, beats: A.intro.scenes.reduce((a, s) => a + s[2], 0), scenes: A.intro.scenes.length, fwdEnd: [A.fwd.at(-1).pos, B.fwd.at(-1).pos], backEnd: [A.back.at(-1).pos, B.back.at(-1).pos],
  rebuildAllSame: [A, B].map(R => R.rebuild.every(r => r.same && r.midStep === r.expectMid)), refErrors: A.errors, buildErrors: B.errors, structuralDiffs: diffs.length, particleShare, audioDiffsOver3Nodes: audDiff, misc: B.misc, keys: B.keys };
fs.writeFileSync(`${OUT}/${name}-parity.json`, JSON.stringify({ summary, diffs, A, B }, null, 1));
console.log(JSON.stringify(summary, null, 1)); if (diffs.length) console.log('DIFFS', JSON.stringify(diffs.slice(0, 8), null, 1));
const nScenes = A.intro.scenes.length, last = A.intro.scenes.at(-1);
const problems = [];
if (diffs.length) problems.push(`${diffs.length} structural difference(s)`);
if (A.errors.length || B.errors.length) problems.push('console/page errors');
if (JSON.stringify(A.fwd.at(-1).pos) !== JSON.stringify([nScenes - 1, last[2]])) problems.push('final scene/beat not reached going forward');
if (JSON.stringify(A.back.at(-1).pos) !== '[0,0]') problems.push('did not return to the start going back');
if (![A, B].every(R => R.rebuild.every(r => r.same && r.midStep === r.expectMid))) problems.push('scene rebuild failed');
if (A.keys.home.join() !== '0,0' || A.keys.end.join() !== `${nScenes - 1},0`) problems.push('Home/End keys');
if (A.keys.n.join() !== '1,0' && nScenes > 1) problems.push('N key'); if (A.keys.p.join() !== '0,0') problems.push('P key');
if (!A.misc.blackOn || !A.misc.helpOn || !A.misc.helpOff || !A.misc.timecodeAdvances || A.misc.fullscreenKey !== 1) problems.push('black/help/timecode/fullscreen controls');
if (A.misc.rmGrain !== 'none') problems.push('reduced motion grain');
console.log(problems.length ? 'PARITY/QA PROBLEMS: ' + problems.join('; ') : 'PARITY/QA OK');
await browser.close(); process.exit(problems.length ? 1 : 0);
