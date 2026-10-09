// Tests of the AI storyboard pipeline machinery. No real model is called: transport tests use a local fake HTTP server
// (they test OUR client and loop, not Claude). Run: node tests/ai/pipeline-tests.mjs
import fs from 'fs'; import path from 'path'; import http from 'http'; import { fileURLToPath } from 'url'; import { spawnSync, spawn } from 'child_process';
const run = (cmd, a, env) => new Promise(r => { const c = spawn(cmd, a, { env }); let o = '', e = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => e += d); c.on('close', status => r({ status, stdout: o, stderr: e })); }); import os from 'os';
import { prepareSource, buildSystemPrompt, gate, runPipeline, categorize, groundCheck, MAX_REPAIRS } from '../../tools/ai/storyboard-lib.mjs';
import { callClaude, MissingKeyError } from '../../tools/ai/claude.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8'), J = JSON.parse;
let bad = 0; const t = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  (' + detail + ')'}`); if (!ok) bad++; };
const src = n => prepareSource(rd(`examples/ai-inputs/${n}.md`), n + '.md');
const fx = n => J(rd(`tests/ai/fixtures/${n}.json`)).responses;
const good01 = fx('01-saas-churn')[0], s01 = src('01-saas-churn');

// ---- prompt ----
const sys = buildSystemPrompt();
t('prompt lists the five available recipes', ['gauge-needle', 'range-bar-chart', 'pillars-roof', 'strike-three-moves-checklist', 'minimal-close'].every(id => sys.includes(`## ${id}`)));
t('prompt marks reference-only recipes as NOT AVAILABLE', /NOT AVAILABLE[^\n]*\n[^\n]*decision-tree/.test(sys) && !/## decision-tree/.test(sys));
t('prompt forbids code, invented numbers, invented recipes', /NEVER invent a number/.test(sys) && /Never invent a recipe id/.test(sys) && /No HTML, no CSS, no JavaScript/.test(sys));
t('prompt is token-disciplined (under ~9k tokens, no reference HTML)', sys.length / 3.6 < 9000 && !sys.includes('<canvas') && !sys.includes('gsap'), `${Math.round(sys.length / 3.6)} tokens`);
t('prompt contains no credential-looking text', !/sk-ant|api[_-]?key\s*[:=]/i.test(sys));

// ---- gate + categories ----
t('valid storyboard passes all gates', gate(good01, s01).errors.length === 0);
t('prose outside JSON rejected as json-parse', gate('Sure! ' + good01, s01).errors[0]?.category === 'json-parse');
t('truncated JSON rejected as json-parse', gate(good01.slice(0, 500), s01).errors[0]?.category === 'json-parse');
t('markdown fence tolerated and flagged', (() => { const g = gate('```json\n' + good01 + '\n```', s01); return g.errors.length === 0 && g.fenced; })());
const mut = (f, n = '01-saas-churn') => { const o = J(fx(n)[0]); f(o); return JSON.stringify(o); };
const cat = (txt, s = s01) => [...new Set(gate(txt, s).errors.map(e => e.category))];
t('unknown recipe id -> unknown-recipe', cat(mut(o => { o.scenes[1].recipe = 'rocket-launch'; })).includes('unknown-recipe'));
t('reference-only recipe -> unsupported-recipe', cat(mut(o => { o.scenes[1].recipe = 'decision-tree'; })).includes('unsupported-recipe'));
t('invented number in text -> number-provenance', cat(mut(o => { o.scenes[1].title = 'Churn up 300%.'; })).includes('number-provenance'));
t('invented number in speaker notes -> number-provenance', cat(mut(o => { o.scenes[1].beats[0].notes = 'We lost 88 customers.'; })).includes('number-provenance'));
t('fact not present in its source block -> ungrounded-fact', cat(mut(o => { o.facts[0].display = '4%'; o.facts[0].value = 4; })).includes('ungrounded-fact'));
t('fact cites a block that does not contain it -> ungrounded-fact', cat(mut(o => { o.facts[2].sourceRef = 'p2'; })).includes('ungrounded-fact'));
t('invented source id -> source-reference', cat(mut(o => { o.sources.push({ id: 'slide-9', kind: 'document', label: 'x' }); })).includes('source-reference'));
t('fact without sourceRef -> source-reference', cat(mut(o => { delete o.facts[0].sourceRef; })).includes('source-reference'));
t('wrong beat count -> beat-count', cat(mut(o => { o.scenes[1].beats.pop(); })).includes('beat-count'));
t('too many scenes -> scene-limit', cat(mut(o => { while (o.scenes.length < 10) o.scenes.push(JSON.parse(JSON.stringify(o.scenes[4]))); o.scenes.forEach((s, i) => { s.id = 'sc' + 'abcdefghijk'[i]; }); })).includes('scene-limit'));
t('script/HTML in text -> forbidden-content', cat(mut(o => { o.scenes[1].inputs.caption = '<img src=x onerror=alert(1)>'; })).includes('forbidden-content'));
t('code key smuggled in -> schema', cat(mut(o => { o.scenes[1].js = 'alert(1)'; })).includes('schema'));
t('fictional source not flagged fictional -> fictional-label', cat(mut(o => { o.deck.fictional = false; })).includes('fictional-label'));
t('recipe input over length limit -> recipe-input', cat(mut(o => { o.scenes[0].inputs.bigWord = 'THIS WORD IS FAR TOO LONG FOR THE SCREEN'; })).includes('recipe-input'));
// number-free source: nothing numeric may be introduced
const s09 = src('09-qualitative-story');
t('no-number source: storyboard with invented facts is rejected', gate(JSON.stringify({ ...J(fx('09-qualitative-story')[0]), facts: [{ id: 'x', kind: 'number', value: 40, display: '40%', sourceRef: 'p1' }] }), s09).errors.some(e => e.category === 'ungrounded-fact'));
t('no-number source: the clean fixture has zero facts and zero digits', (() => { const o = J(fx('09-qualitative-story')[0]); const texts = [o.deck.title, o.deck.subtitle, o.deck.intro, ...o.scenes.flatMap(sc => [sc.chapter, sc.kicker, sc.title || '', ...Object.values(sc.inputs).flatMap(v => JSON.stringify(v)), ...sc.beats.map(b => b.notes)])].join(' '); return o.facts.length === 0 && !/\d/.test(texts); })());
t('derived facts need no source block (diff of sourced facts)', gate(good01, s01).errors.length === 0 && J(good01).facts.some(f => f.derivation));

// ---- bounded repair loop ----
let calls = 0; const alwaysBad = async () => { calls++; return { text: mut(o => { o.scenes[1].title = 'Churn up 300%.'; }), usage: {} }; };
const bounded = await runPipeline({ src: s01, call: alwaysBad, maxRepairs: 99 });
t('repair loop is bounded: 1 generation + 3 repairs, then FAIL', !bounded.valid && calls === 1 + MAX_REPAIRS && bounded.repairsUsed === MAX_REPAIRS, `calls=${calls}`);
t('failed run keeps the last (unpatched) model output', bounded.lastText.includes('Churn up 300%'));
let seen = []; const learns = async ({ user, attempt }) => { seen.push(user); return { text: attempt === 0 ? mut(o => { o.scenes[1].title = 'Churn up 300%.'; }) : good01, usage: { input_tokens: 10, output_tokens: 5 } }; };
const rep = await runPipeline({ src: s01, call: learns });
t('repair succeeds when the model corrects itself', rep.valid && rep.repairsUsed === 1 && !rep.firstPassValid);
t('repair request carries source, previous storyboard and exact validator errors', seen[1].includes('[p2]') && seen[1].includes('Churn up 300%') && seen[1].includes('is not in any fact display') && /number-provenance/.test(seen[1]));
t('repair request does not ship repository files', !seen[1].includes('gsap') && seen[1].length < 40000, `${seen[1].length} chars`);
t('the pipeline never patches output itself (valid result is exactly the model JSON)', JSON.stringify(rep.storyboard) === JSON.stringify(J(good01)));
t('token usage accumulated', rep.usage.input === 20 && rep.usage.output === 10);

// ---- Claude client transport (fake server) ----
const seenReq = []; let mode = 'ok'; let n429 = 0;
const server = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
  seenReq.push({ headers: req.headers, url: req.url, body: b ? J(b) : null });
  if (mode === 'retry' && n429++ < 1) { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'rate limited' } })); }
  if (mode === 'bad') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'bad request' } })); }
  const reply = good01; res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ model: 'fake', content: [{ type: 'text', text: reply }], stop_reason: 'end_turn', usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 5 } })); }); });
await new Promise(r => server.listen(0, r)); const port = server.address().port;
const env = { ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_API_KEY: 'test-key-not-real' }; Object.assign(process.env, env);
const r1 = await callClaude({ system: 'SYS', messages: [{ role: 'user', content: 'hi' }], model: 'm-test' });
const q = seenReq[0];
t('client sends key in header, pinned API version, model, cacheable system block, messages', q.headers['x-api-key'] === 'test-key-not-real' && q.headers['anthropic-version'] === '2023-06-01' && q.url === '/v1/messages' && q.body.model === 'm-test' && q.body.system[0].cache_control.type === 'ephemeral' && q.body.messages[0].content === 'hi');
t('client returns text and usage', r1.text === good01 && r1.usage.input_tokens === 7);
mode = 'retry'; n429 = 0; const before = seenReq.length; const r2 = await callClaude({ system: 'S', messages: [{ role: 'user', content: 'x' }], retries: 2 });
t('client retries a 429 and then succeeds', r2.text === good01 && seenReq.length - before === 2);
mode = 'bad'; let msg = ''; try { await callClaude({ system: 'S', messages: [{ role: 'user', content: 'x' }] }); } catch (e) { msg = e.message; }
t('client does not retry a 400 and reports the error without the key', /400/.test(msg) && !msg.includes('test-key-not-real'));
mode = 'ok';
// full CLI against the fake server: live code path, but the "model" is the fake server (TRANSPORT TEST, not an AI result)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-')); const outF = path.join(tmp, 'sb.json');
const cli = await run(process.execPath, [path.join(root, 'tools/generate-storyboard.mjs'), path.join(root, 'examples/ai-inputs/01-saas-churn.md'), '--out', outF], { ...process.env, ...env });
t('CLI live path (fake server): valid storyboard saved with report', cli.status === 0 && fs.existsSync(outF) && J(fs.readFileSync(outF, 'utf8')).deck.id === 'arcdesk-renewals' && J(fs.readFileSync(outF.replace('.json', '.report.json'), 'utf8')).mode === 'live', cli.stderr.slice(0, 200));
t('saved report never contains the API key', !fs.readFileSync(outF.replace('.json', '.report.json'), 'utf8').includes('test-key-not-real'));
server.close();
// no key -> refuses, exit 3, nothing invented
const noKeyEnv = { ...process.env }; delete noKeyEnv.ANTHROPIC_API_KEY; delete noKeyEnv.ANTHROPIC_BASE_URL;
const nk = spawnSync(process.execPath, [path.join(root, 'tools/generate-storyboard.mjs'), path.join(root, 'examples/ai-inputs/01-saas-churn.md'), '--out', path.join(tmp, 'nk.json')], { encoding: 'utf8', env: noKeyEnv });
t('CLI live mode without ANTHROPIC_API_KEY exits 3 and writes nothing', nk.status === 3 && !fs.existsSync(path.join(tmp, 'nk.json')));
const ev = spawnSync(process.execPath, [path.join(root, 'tests/ai/evaluate.mjs'), '--live', '--only', '01'], { encoding: 'utf8', env: noKeyEnv });
t('evaluate --live without a key refuses', ev.status === 3 && /REFUSING/.test(ev.stderr));
let missing = false; delete process.env.ANTHROPIC_API_KEY; try { await callClaude({ system: 'S', messages: [] }); } catch (e) { missing = e instanceof MissingKeyError; }
t('callClaude without a key throws MissingKeyError', missing);
// mock CLI: failing fixture exits 1, saves nothing as the storyboard, keeps the rejected text
const failFx = path.join(tmp, 'fail.json'); fs.writeFileSync(failFx, JSON.stringify({ mock: true, responses: Array(4).fill(mut(o => { o.scenes[1].title = 'Churn up 300%.'; })) }));
const mf = spawnSync(process.execPath, [path.join(root, 'tools/generate-storyboard.mjs'), path.join(root, 'examples/ai-inputs/01-saas-churn.md'), '--mock', '--fixture', failFx, '--out', path.join(tmp, 'f.json')], { encoding: 'utf8' });
t('mock CLI: persistent failure exits 1 after exactly 3 repairs, nothing saved as valid', mf.status === 1 && !fs.existsSync(path.join(tmp, 'f.json')) && fs.existsSync(path.join(tmp, 'f.rejected.txt')) && /after 3 repair/.test(mf.stderr));
t('mock CLI announces MOCK mode', /MODE: MOCK/.test(mf.stdout));
console.log(bad ? `${bad} pipeline test(s) FAILED` : 'all pipeline tests passed'); process.exit(bad ? 1 : 0);
