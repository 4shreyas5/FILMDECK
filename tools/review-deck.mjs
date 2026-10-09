#!/usr/bin/env node
// Local, offline visual-review workflow for generated decks. It plays a deck in the real runtime, takes screenshots of every scene
// (the transition, the settled opening, the final state), records text density and layout findings, and writes ONE static HTML report
// next to the deck that puts the narrative, the evidence and the pictures side by side for a HUMAN to judge.
// It never scores "beauty": passing technical checks does not mean a deck is good. No network, no AI, no API key.
// usage: node tools/review-deck.mjs <deck-dir>... [--out <dir>] [--sizes 1280x720,820x1180] [--fast] [--gallery <file.html>]
//   <deck-dir>   a folder produced by FilmDeck (needs index.html, deck.json, storyboard.json; qa-report.json, run.json, source.json are used if present)
//   --out        report folder (default: <deck-dir>/review; with several decks, give none)
//   --sizes      extra viewports: one screenshot of the final state of every scene per size (stage scales; the main 1920x1080 pass always runs)
//   --fast       play animations at 3x speed (quicker, transition frames are less faithful)
//   --gallery    also write an index page linking all reports
import '../tests/support/qa-env.mjs';
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
import { probeScene, SAFE } from '../tests/support/layout-probe.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), val = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined), flag = n => a.includes(n);
const dirs = a.filter((x, i) => !x.startsWith('--') && !['--out', '--sizes', '--gallery'].includes(a[i - 1]));
if (!dirs.length) { console.error('usage: node tools/review-deck.mjs <deck-dir>... [--out dir] [--sizes 1280x720,820x1180] [--fast] [--gallery file.html]'); process.exit(2); }
if (dirs.length > 1 && val('--out')) { console.error('--out can only be used with one deck'); process.exit(2); }
const sizes = (val('--sizes') || '').split(',').filter(Boolean).map(s => { const m = s.match(/^(\d{3,4})x(\d{3,4})$/); if (!m) { console.error(`bad size "${s}" (use WIDTHxHEIGHT)`); process.exit(2); } return { w: +m[1], h: +m[2] }; });
let chromium; try { ({ chromium } = createRequire((process.env.FILMDECK_QA_MODULES || '') + '/x.js')('playwright-core')); } catch { console.error('playwright-core not found. Run "npm run setup:qa" once (or set FILMDECK_QA_MODULES).'); process.exit(1); }
const EXE = process.env.CHROMIUM_PATH || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const J = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const factIds = o => { const ids = new Set(); (function w(x) { if (!x || typeof x !== 'object') return; if (typeof x.fact === 'string') ids.add(x.fact.split('.')[0]); for (const v of Object.values(x)) w(v); })(o); return ids; };
// words visible to the audience in the active scene (text of elements that are actually shown)
function visibleText() {
  const root = document.querySelector('.slide.on'); if (!root) return { words: 0, items: 0, text: '' };
  const eff = el => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); } return o; };
  const parts = []; for (const el of root.querySelectorAll('*')) { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue; t = t.trim(); if (t && !el.closest('canvas') && eff(el) > 0.3) parts.push(t); }
  const text = parts.join(' · '); return { words: text.split(/\s+/).filter(Boolean).length, items: parts.length, text };
}
const density = w => (w <= 45 ? 'light' : w <= 75 ? 'moderate' : 'dense');

async function review(dir) {
  dir = path.resolve(dir); const out = path.resolve(val('--out') || path.join(dir, 'review')), img = path.join(out, 'img');
  const deck = J(path.join(dir, 'deck.json')), sb = J(path.join(dir, 'storyboard.json')); if (!deck || !sb || !fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`${dir} is not a FilmDeck output folder (needs index.html, deck.json, storyboard.json)`);
  const qa = J(path.join(dir, 'qa-report.json')), run = J(path.join(dir, 'run.json')), src = J(path.join(dir, 'source.json')), factById = new Map((sb.facts || []).map(f => [f.id, f]));
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(img, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, headless: true }); const external = [], errors = [];
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); await page.route(/^https?:\/\//, r => { external.push(r.request().url()); r.abort(); }); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto('file://' + path.join(dir, 'index.html')); await page.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 }); await page.evaluate(() => document.fonts.ready); await page.click('#go'); if (flag('--fast')) await page.evaluate(() => { gsap.globalTimeline.timeScale(3); }); await sleep(700); return { ctx, page }; };
  const shot = async (page, name, q = 72) => { await page.screenshot({ path: path.join(img, name), type: 'jpeg', quality: q }); return 'img/' + name; };
  const k = flag('--fast') ? 1 / 3 : 1, wait = ms => sleep(ms * k);
  const { ctx, page } = await open(1920, 1080); const scenes = [];
  const n = await page.evaluate(() => __deck.SL.length);
  for (let i = 0; i < n; i++) {
    const meta = sb.scenes[i], ds = deck.scenes[i], steps = await page.evaluate(j => __deck.SL[j].steps.length, i), layout = { errors: [], warnings: [] };
    await page.evaluate(j => __deck.jumpTo(j), i); await wait(450); const enter = await shot(page, `s${i + 1}-enter.jpg`); await wait(1900); const start = await shot(page, `s${i + 1}-start.jpg`);
    const beatLog = [], beatFrames = [];
    for (let b = 0; b < steps; b++) {
      await page.evaluate(() => __deck.next()); await wait(1500); beatFrames.push(await shot(page, `s${i + 1}-b${b + 1}.jpg`, 66));
      const r = await page.evaluate(probeScene, { zones: (ds && ds.textZones) || [], safe: SAFE }); for (const kd of ['errors', 'warnings']) for (const m of r[kd]) layout[kd].push({ beat: b + 1, ...m });
      beatLog.push({ n: b + 1, words: (await page.evaluate(visibleText)).words });
    }
    await wait(900); const vt = await page.evaluate(visibleText); const end = beatFrames[beatFrames.length - 1] || start;
    const uniq = arr => [...new Map(arr.map(x => [x.kind + x.msg, x])).values()];
    const ids = [...factIds(meta.inputs)]; const facts = ids.map(id => factById.get(id)).filter(Boolean);
    scenes.push({ n: i + 1, id: meta.id, chapter: meta.chapter, kicker: meta.kicker, title: meta.title || '', recipe: meta.recipe, mood: meta.mood, idea: meta.idea || '', steps, beats: (meta.beats || []).map(b => ({ n: b.n, summary: b.summary || '', notes: b.notes || '' })),
      frames: { enter, start, end, beats: beatFrames }, words: vt.words, textItems: vt.items, density: density(vt.words), visibleText: vt.text, peakBeatWords: Math.max(0, ...beatLog.map(x => x.words)), layoutErrors: uniq(layout.errors), layoutWarnings: uniq(layout.warnings), facts: facts.map(f => ({ id: f.id, display: f.display, kind: f.kind, sourceRef: f.sourceRef || null, derivation: f.derivation || null, evidence: f.evidence || null })), extra: [] });
    console.log(`  scene ${i + 1}/${n} ${meta.recipe}: ${vt.words} words (${density(vt.words)}), ${layout.errors.length} layout error(s), ${layout.warnings.length} warning(s)`);
  }
  await ctx.close();
  for (const sz of sizes) { // extra viewports: the final state of every scene
    const { ctx: c2, page: p2 } = await open(sz.w, sz.h);
    for (let i = 0; i < n; i++) { const steps = await p2.evaluate(j => __deck.SL[j].steps.length, i); await p2.evaluate(j => __deck.jumpTo(j), i); await wait(1800); for (let b = 0; b < steps; b++) { await p2.evaluate(() => __deck.next()); await wait(900); } await wait(900); scenes[i].extra.push({ size: `${sz.w}x${sz.h}`, file: await shot(p2, `s${i + 1}-${sz.w}x${sz.h}.jpg`) }); }
    await c2.close(); console.log(`  extra viewport ${sz.w}x${sz.h} captured`);
  }
  await browser.close();
  // evidence excerpts: the cited source section with the quote highlighted
  const sec = new Map(((src && src.sections) || []).map(s => [s.id, s]));
  for (const s of scenes) for (const f of s.facts) { const sc = f.sourceRef && sec.get(f.sourceRef); if (sc && f.evidence) { const i = sc.text.replace(/\s+/g, ' ').indexOf(f.evidence.replace(/\s+/g, ' ')); const t = sc.text.replace(/\s+/g, ' '); f.excerpt = i >= 0 ? { before: t.slice(Math.max(0, i - 160), i), quote: t.slice(i, i + f.evidence.length), after: t.slice(i + f.evidence.length, i + f.evidence.length + 160), where: sc.location ? `${sc.location.kind} ${sc.location.number}` : f.sourceRef } : null; } }
  const summary = { deck: sb.deck.title, subtitle: sb.deck.subtitle || '', fictional: !!sb.deck.fictional, source: run && run.source ? run.source.file : (sb.sources && sb.sources[0] && sb.sources[0].label) || 'unknown', mode: run ? run.generation.mode : 'unknown', model: run && run.generation ? run.generation.model : null, status: run ? run.status : 'unknown',
    scenes: n, beats: scenes.reduce((m, s) => m + s.steps, 0), qa: qa ? { passed: qa.passed, mode: qa.mode, checks: qa.checks, layoutWarnings: qa.layoutWarnings || 0 } : null, pageErrors: errors.length, externalRequests: external.length, layoutErrors: scenes.reduce((m, s) => m + s.layoutErrors.length, 0), layoutWarnings: scenes.reduce((m, s) => m + s.layoutWarnings.length, 0), denseScenes: scenes.filter(s => s.density === 'dense').map(s => s.n) };
  fs.writeFileSync(path.join(out, 'review.json'), JSON.stringify({ summary, scenes: scenes.map(({ visibleText: _v, ...x }) => x) }, null, 2));
  fs.writeFileSync(path.join(out, 'index.html'), html(summary, scenes, path.relative(out, path.join(dir, 'index.html'))));
  console.log(`report: ${path.relative(process.cwd(), path.join(out, 'index.html'))}`);
  return { dir, out, summary };
}

function html(S, scenes, deckHref) {
  const chip = (t, cls = '') => `<span class="chip ${cls}">${esc(t)}</span>`;
  const qaTxt = S.qa ? `${S.qa.passed ? 'passed' : 'FAILED'} ${S.qa.checks ? S.qa.checks.passed + '/' + S.qa.checks.total : ''} (${S.qa.mode})` : 'no QA report in this folder';
  const arc = scenes.map(s => `<li><a href="#s${s.n}"><b>${s.n}</b> ${esc(s.chapter)}<small>${esc(s.title || s.kicker)} · ${esc(s.recipe)} · ${esc(s.mood)}</small></a></li>`).join('');
  const card = s => `<section class="scene" id="s${s.n}"><header><h2><span>${String(s.n).padStart(2, '0')}</span> ${esc(s.chapter)}</h2><div class="chips">${chip(s.recipe)}${chip(s.mood)}${chip(s.steps + ' beats')}${chip(s.words + ' words · ' + s.density, s.density === 'dense' ? 'warn' : '')}${s.layoutErrors.length ? chip(s.layoutErrors.length + ' layout error(s)', 'bad') : chip('no layout errors', 'ok')}${s.layoutWarnings.length ? chip(s.layoutWarnings.length + ' layout warning(s)', 'warn') : ''}</div></header>
    <p class="idea">${esc(s.title ? s.title + ' · ' : '')}${esc(s.kicker)}${s.idea ? ' · ' + esc(s.idea) : ''}</p>
    <div class="frames"><figure><a href="${s.frames.enter}"><img loading="lazy" src="${s.frames.enter}" alt="Scene ${s.n} entering"></a><figcaption>Entering (transition caught mid-flight)</figcaption></figure><figure><a href="${s.frames.start}"><img loading="lazy" src="${s.frames.start}" alt="Scene ${s.n} settled"></a><figcaption>Settled, before beat 1</figcaption></figure>${s.frames.beats.map((f, j) => `<figure><a href="${f}"><img loading="lazy" src="${f}" alt="Scene ${s.n} after beat ${j + 1}"></a><figcaption>After beat ${j + 1} of ${s.steps}${j === s.steps - 1 ? ' (final state)' : ''}</figcaption></figure>`).join('')}</div>
    ${s.extra.length ? `<div class="frames extra">${s.extra.map(e => `<figure><a href="${e.file}"><img loading="lazy" src="${e.file}" alt="Scene ${s.n} at ${e.size}"></a><figcaption>Final state at ${esc(e.size)}</figcaption></figure>`).join('')}</div>` : ''}
    <div class="cols"><div><h3>What the audience reads (final state)</h3><p class="read">${esc(s.visibleText) || '<i>nothing</i>'}</p>${s.beats.length ? `<h3>Beats and speaker notes</h3><ol class="beats">${s.beats.map(b => `<li>${esc(b.summary)}${b.notes ? `<small>${esc(b.notes)}</small>` : ''}</li>`).join('')}</ol>` : ''}</div>
    <div><h3>Evidence behind the figures</h3>${s.facts.length ? s.facts.map(f => `<div class="ev"><b>${esc(f.display)}</b> <small>${esc(f.id)}${f.derivation ? ' · derived (' + esc(f.derivation.op) + ' of ' + esc(f.derivation.of.join(', ')) + ')' : ' · from ' + esc(f.excerpt ? f.excerpt.where : f.sourceRef)}</small>${f.evidence ? `<blockquote>${f.excerpt ? `…${esc(f.excerpt.before)}<mark>${esc(f.excerpt.quote)}</mark>${esc(f.excerpt.after)}…` : esc(f.evidence)}</blockquote>` : ''}</div>`).join('') : '<p class="muted">No figures in this scene.</p>'}</div></div>
    ${s.layoutErrors.concat(s.layoutWarnings).length ? `<details><summary>Layout findings (${s.layoutErrors.length} errors, ${s.layoutWarnings.length} warnings)</summary><ul>${s.layoutErrors.map(e => `<li class="bad">beat ${e.beat}: ${esc(e.msg)}</li>`).join('')}${s.layoutWarnings.map(e => `<li>beat ${e.beat}: ${esc(e.msg)}</li>`).join('')}</ul></details>` : ''}
    <fieldset class="check"><legend>Your review of scene ${s.n}</legend>${['Is the one big idea obvious in 3 seconds?', 'Is the text readable and not crowded?', 'Is the chart / data clear and honest?', 'Does the evidence match what the slide claims?', 'Does it fit the scenes before and after?'].map((q, j) => `<label><input type="checkbox" data-k="s${s.n}-${j}"> ${esc(q)}</label>`).join('')}<textarea data-k="s${s.n}-note" placeholder="Notes (kept in this browser only)"></textarea></fieldset></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review: ${esc(S.deck)}</title><style>
:root{--paper:#EEE9E0;--ink:#06070A;--line:#C9C2B3;--dim:#5E6470;--ember:#C9692B;--sig:#0E7C93;--bad:#B3342B;--ok:#2F7A4B}
@media (prefers-color-scheme:dark){:root{--paper:#06070A;--ink:#DCE3D8;--line:#262C37;--dim:#8A91A0;--ember:#F2A247;--sig:#62C4D8;--bad:#E5544B;--ok:#8FBF9A}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,sans-serif}main{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
h1{font:800 clamp(30px,5vw,54px)/1 "Arial Narrow",system-ui;text-transform:uppercase;margin:0 0 6px}h2{font:700 22px/1.2 "Arial Narrow",system-ui;text-transform:uppercase;letter-spacing:.04em;margin:0}h2 span{color:var(--ember);font:500 13px ui-monospace,monospace;margin-right:6px}h3{font:600 12px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin:14px 0 6px}
.banner{border-left:4px solid var(--ember);padding:8px 14px;background:color-mix(in srgb,var(--ember) 10%,transparent);margin:14px 0 20px}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:14px 0}.meta div{background:var(--paper);padding:10px 12px}.meta b{display:block;font:500 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.chip{font:500 11px ui-monospace,monospace;border:1px solid var(--line);padding:2px 7px}.chip.warn{border-color:var(--ember);color:var(--ember)}.chip.bad{border-color:var(--bad);color:var(--bad)}.chip.ok{border-color:var(--ok);color:var(--ok)}
.arc{list-style:none;padding:0;margin:0 0 30px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.arc a{display:block;text-decoration:none;border:1px solid var(--line);padding:8px 10px;color:inherit}.arc a:hover{border-color:var(--ink)}.arc b{color:var(--ember);font-family:ui-monospace,monospace;margin-right:4px}.arc small{display:block;color:var(--dim);font-size:12px}
.scene{border-top:3px solid var(--ink);padding:18px 0 26px}.scene header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.idea{color:var(--dim);margin:8px 0}
.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.frames.extra{margin-top:10px}.frames img{width:100%;aspect-ratio:auto;display:block;border:1px solid var(--line);background:#000}figure{margin:0}figcaption{font:11px ui-monospace,monospace;color:var(--dim);margin-top:4px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.read{font:13px/1.6 ui-monospace,monospace;background:color-mix(in srgb,var(--ink) 5%,transparent);padding:10px;margin:0}.beats{padding-left:20px;margin:0}.beats small{display:block;color:var(--dim)}
.ev{margin-bottom:10px}.ev small{color:var(--dim);font-family:ui-monospace,monospace}blockquote{margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--sig);font-size:13px;color:var(--dim)}mark{background:color-mix(in srgb,var(--ember) 35%,transparent);color:var(--ink)}
.check{border:1px dashed var(--line);margin-top:12px;display:grid;gap:4px;padding:10px 14px}.check legend{font:600 12px ui-monospace,monospace;color:var(--dim)}.check textarea{width:100%;min-height:54px;background:transparent;color:inherit;border:1px solid var(--line);font:inherit;padding:6px}.bad{color:var(--bad)}.muted{color:var(--dim)}
@media (max-width:820px){.cols{grid-template-columns:1fr}}</style></head><body><main>
<h1>${esc(S.deck)}</h1><div class="muted">${esc(S.subtitle)}</div>
<div class="banner"><b>This report is for human judgment.</b> Passing technical checks (layout, grounding, playback) does not mean the deck is clear, beautiful or persuasive. Nothing here is scored automatically; the screenshots, the text the audience reads and the evidence are laid out so you can decide. Word-count density labels are a rough heuristic (up to 45 light, up to 75 moderate, above 75 dense).</div>
<div class="meta"><div><b>Source document</b>${esc(S.source)}</div><div><b>Generation</b>${esc(S.mode)}${S.model ? ' · ' + esc(S.model) : ''}${S.fictional ? ' · fictional' : ''}</div><div><b>Scenes / beats</b>${S.scenes} / ${S.beats}</div><div><b>Browser QA</b>${esc(qaTxt)}</div><div><b>Layout (this pass)</b>${S.layoutErrors} errors · ${S.layoutWarnings} warnings</div><div><b>Console errors / external requests</b>${S.pageErrors} / ${S.externalRequests}</div><div><b>Dense scenes</b>${S.denseScenes.length ? S.denseScenes.join(', ') : 'none'}</div><div><b>Deck</b><a href="${esc(deckHref)}">open the deck</a></div></div>
<h3>Narrative arc</h3><ol class="arc">${arc}</ol>${scenes.map(card).join('')}</main>
<script>(function(){var K='filmdeck-review:'+location.pathname;try{var d=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){d={}}document.querySelectorAll('[data-k]').forEach(function(el){var k=el.dataset.k;if(el.type==='checkbox')el.checked=!!d[k];else el.value=d[k]||'';el.addEventListener('change',function(){d[k]=el.type==='checkbox'?el.checked:el.value;try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}})})})();</script></body></html>`;
}

const results = []; let failed = 0;
for (const d of dirs) { console.log(`reviewing ${d}`); try { results.push(await review(d)); } catch (e) { failed++; console.error('REVIEW FAILED: ' + e.message); } }
if (val('--gallery') && results.length) {
  const g = path.resolve(val('--gallery')); fs.mkdirSync(path.dirname(g), { recursive: true });
  fs.writeFileSync(g, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FilmDeck review gallery</title><style>body{font:15px/1.5 system-ui;margin:0;padding:28px;background:#EEE9E0;color:#06070A}h1{font:800 40px "Arial Narrow",system-ui;text-transform:uppercase}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #C9C2B3;padding:8px;text-align:left;font-size:14px}.bad{color:#B3342B}</style></head><body><h1>Review gallery</h1><p>One report per deck. Open each and judge it yourself.</p><table><tr><th>Deck</th><th>Source</th><th>Mode</th><th>Scenes/beats</th><th>QA</th><th>Layout err/warn</th><th>Dense</th></tr>${results.map(r => `<tr><td><a href="${esc(path.relative(path.dirname(g), path.join(r.out, 'index.html')))}">${esc(r.summary.deck)}</a></td><td>${esc(r.summary.source)}</td><td>${esc(r.summary.mode)}</td><td>${r.summary.scenes}/${r.summary.beats}</td><td>${r.summary.qa ? (r.summary.qa.passed ? 'passed' : '<span class="bad">FAILED</span>') + ' (' + r.summary.qa.mode + ')' : 'n/a'}</td><td class="${r.summary.layoutErrors ? 'bad' : ''}">${r.summary.layoutErrors}/${r.summary.layoutWarnings}</td><td>${r.summary.denseScenes.join(', ') || '-'}</td></tr>`).join('')}</table></body></html>`);
  console.log('gallery: ' + path.relative(process.cwd(), g));
}
process.exit(failed ? 1 : 0);
