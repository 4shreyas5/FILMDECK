// Evidence grounding: fact -> cited block -> exact quote. Offline, deterministic. Run: node tests/ai/evidence-tests.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { prepareSource, gate, runPipeline, mockCaller, buildSystemPrompt } from '../../tools/ai/storyboard-lib.mjs';
import { ingestFile } from '../../tools/ingest/index.mjs'; import { normalizedToSrc } from '../../tools/source-to-prompt.mjs'; import { validateStoryboard } from '../../tools/validate-storyboard.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), J = JSON.parse;
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const src = prepareSource(fs.readFileSync(path.join(root, 'examples/ai-inputs/01-saas-churn.md'), 'utf8'), '01');
const raw = J(fs.readFileSync(path.join(root, 'tests/ai/fixtures/01-saas-churn.json'), 'utf8')).responses[0];
const withFact = (id, f) => { const o = J(raw); f(o.facts.find(x => x.id === id), o); return JSON.stringify(o); };
const errs = (txt, opts) => gate(txt, src, opts).errors; const msgs = (txt, o) => errs(txt, o).map(e => e.message).join(' | ');
t('baseline fixture with correct evidence passes', errs(raw).length === 0, msgs(raw));
t('every fact in the fixture carries evidence from its own block', J(raw).facts.filter(f => !f.derivation).every(f => f.evidence));
t('missing evidence is rejected (category evidence)', (() => { const e = errs(withFact('churn-now', f => { delete f.evidence; })); return e.some(x => x.category === 'evidence' && /missing "evidence"/.test(x.message)); })());
t('missing evidence is tolerated only when explicitly switched off (legacy)', errs(withFact('churn-now', f => { delete f.evidence; }), { requireEvidence: false }).length === 0);
t('invented evidence (not in the source) is rejected', /not an exact quote from block p2/.test(msgs(withFact('churn-now', f => { f.evidence = 'Monthly churn was 7% according to the board report.'; }))));
t('paraphrased evidence is rejected', /not an exact quote/.test(msgs(withFact('churn-now', f => { f.evidence = 'Customer churn rose from 3% to 7% across two quarters.'; }))));
t('case-changed evidence is rejected (exact means exact)', /not an exact quote/.test(msgs(withFact('churn-now', f => { f.evidence = f.evidence.toUpperCase(); }))));
t('evidence quoted from ANOTHER block is rejected and names that block', /quoted from block p3, not from its sourceRef p2/.test(msgs(withFact('churn-now', f => { f.evidence = 'Exit surveys show 41% of leaving customers named price as the main reason'; }))));
t('wrong sourceRef (evidence belongs to a different block) is rejected', errs(withFact('price-reason', f => { f.sourceRef = 'p2'; })).some(e => e.category === 'evidence' || e.category === 'ungrounded-fact'));
t('numeric mismatch: real quote from the right block that lacks the number is rejected', /does not contain the number "7"/.test(msgs(withFact('churn-now', f => { f.evidence = 'Monthly customer churn rose from 3%'; }))));
t('numeric mismatch: display number differs from evidence number', errs(withFact('churn-now', f => { f.display = '8%'; f.value = 8; })).length > 0);
t('evidence with only whitespace differences is accepted (runs of whitespace collapse)', errs(withFact('churn-now', f => { f.evidence = 'Monthly customer churn rose from 3% to 7%  over   the last two quarters.'; })).length === 0);
t('evidence may span several sentences of the same block', errs(withFact('price-reason', f => { f.evidence = 'Exit surveys show 41% of leaving customers named price as the main reason, compared with 12% who named missing features.'; })).length === 0);
t('derived facts need no evidence', errs(raw).length === 0 && J(raw).facts.some(f => f.derivation && !f.evidence));
t('schema bounds: evidence over 300 characters is a schema error', validateStoryboard(J(withFact('churn-now', f => { f.evidence = 'x'.repeat(301); }))).errors.some(e => /evidence/.test(e)));
// document sources: evidence from another slide must fail
const deck = ingestFile(path.join(root, 'tests/ingestion/fixtures/deck.pptx'), { fictional: true }); const dsrc = normalizedToSrc(deck);
const draw = J(fs.readFileSync(path.join(root, 'tests/ai/fixtures/deck.json'), 'utf8')).responses[0];
t('pptx baseline with evidence passes', gate(draw, dsrc).errors.length === 0, gate(draw, dsrc).errors.map(e => e.message).join('|'));
const dmut = f => { const o = J(draw); f(o); return JSON.stringify(o); };
t('pptx: evidence taken from another slide is rejected', gate(dmut(o => { o.facts.find(x => x.id === 'north').evidence = 'Revenue reached $4.2 million in Q3'; }), dsrc).errors.some(e => /quoted from block|not an exact quote/.test(e.message)));
t('pptx: evidence from the speaker notes cannot stand in for the slide', gate(dmut(o => { o.facts.find(x => x.id === 'online').evidence = 'Online share is 62%.'; }), dsrc).errors.some(e => e.category === 'evidence' && /slide-2-notes/.test(e.message)));
// repair loop sees evidence errors verbatim
const bad1 = withFact('churn-now', f => { f.evidence = 'made up quote about 7%'; });
let seen = ''; const call = async ({ user, attempt }) => { if (attempt === 0) return { text: bad1 }; seen = user; return { text: raw }; };
const res = await runPipeline({ src, call });
t('repair prompt contains the exact evidence error and the loop recovers', res.valid && res.repairsUsed === 1 && /not an exact quote from block p2/.test(seen));
t('system prompt tells the model about evidence', /evidence/.test(buildSystemPrompt()) && /exact, unbroken quote/.test(buildSystemPrompt()));
console.log(bad ? `\n${bad} FAILED` : '\nALL EVIDENCE TESTS PASSED'); process.exit(bad ? 1 : 0);
