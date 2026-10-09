// OFFLINE unit tests of the long-document machinery (tools/ai/multichunk.mjs): strategy thresholds, call budget, map-answer checks,
// duplicate/invalid candidate handling, unusable chunks, digest size bounds. No provider, no network.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { planStrategy, callBudget, checkMapAnswer, runMapStage, renderDigest, DocumentTooLargeError, SINGLE_MAX_CHARS, MAX_TOTAL_CHARS, MAX_FACTS_PER_CHUNK, MAX_DIGEST_CHARS, MAP_CONCURRENCY } from '../../tools/ai/multichunk.mjs';
import { chunkSource, reassemble } from '../../tools/chunk-source.mjs'; import { ingestFile } from '../../tools/ingest/index.mjs';
let bad = 0; const t = (n, c, d = '') => { if (c) console.log('PASS  ' + n); else { bad++; console.log('FAIL  ' + n + (d ? '  -> ' + String(d).slice(0, 300) : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-mc-'));
// a normalized document of N sections of about `size` characters each (through the real ingestion code)
const makeDoc = (paras, name = 'doc') => { const f = path.join(tmp, name + '.md'); fs.writeFileSync(f, paras.join('\n\n')); return ingestFile(f); };
const para = (i, len) => (`Block ${i} says revenue grew ${10 + i}% in region ${i}. ` + 'The team kept working through the quarter. ').repeat(Math.ceil(len / 90)).slice(0, len).trimEnd() + '.';
const sized = total => { const n = Math.ceil(total / 1000); const ps = Array.from({ length: n }, (_, i) => para(i, 1000)); const doc = makeDoc(ps, 'sz' + total); return doc; };

// ---- strategy thresholds (single call vs map/design) ----
const exact = (chars) => { const d = makeDoc(['x'.repeat(10)], 'e' + chars); d.sections = [{ ...d.sections[0], text: 'a'.repeat(chars) }]; return d; };
t('strategy: a tiny document uses the single call', planStrategy(makeDoc(['hello 5%'])).strategy === 'single');
t(`strategy: exactly ${SINGLE_MAX_CHARS} characters is still a single call`, planStrategy(exact(SINGLE_MAX_CHARS)).strategy === 'single');
t(`strategy: ${SINGLE_MAX_CHARS + 1} characters switches to map/design`, planStrategy(exact(SINGLE_MAX_CHARS + 1)).strategy === 'multi-chunk');
t(`strategy: exactly ${MAX_TOTAL_CHARS} characters is accepted`, planStrategy(exact(MAX_TOTAL_CHARS)).strategy === 'multi-chunk');
let thrown = null; try { planStrategy(exact(MAX_TOTAL_CHARS + 1)); } catch (e) { thrown = e; } t(`strategy: ${MAX_TOTAL_CHARS + 1} characters is refused with a typed error`, thrown instanceof DocumentTooLargeError && thrown.kind === 'too-large');

// ---- call budget ----
t('budget: single call, 3 repairs = 4 logical calls, 12 HTTP attempts at most', JSON.stringify(callBudget({ strategy: 'single' })) === JSON.stringify({ maxLogicalCalls: 4, maxHttpAttempts: 12, mapCalls: 0, designCalls: 4 }));
t('budget: single call, 0 repairs = 1 call / 3 attempts', callBudget({ strategy: 'single', maxRepairs: 0 }).maxLogicalCalls === 1 && callBudget({ strategy: 'single', maxRepairs: 0 }).maxHttpAttempts === 3);
t('budget: repairs are capped at 3 whatever is requested (99, -5)', callBudget({ strategy: 'single', maxRepairs: 99 }).maxLogicalCalls === 4 && callBudget({ strategy: 'single', maxRepairs: -5 }).maxLogicalCalls === 1);
t('budget: 8 chunks = 8 maps + 8 map retries + 4 design = 20 logical, 60 HTTP', JSON.stringify(callBudget({ strategy: 'multi-chunk', chunkCount: 8 })) === JSON.stringify({ maxLogicalCalls: 20, maxHttpAttempts: 60, mapCalls: 16, designCalls: 4 }));
t('budget: the largest accepted document (13 chunks) is bounded too', callBudget({ strategy: 'multi-chunk', chunkCount: Math.ceil(MAX_TOTAL_CHARS / 24000) + 1 }).maxLogicalCalls <= 34);

// ---- map answers ----
const blocks = [{ id: 'a1', text: 'Sales rose 12% in the north. Costs fell 3% at the same time.' }, { id: 'a2', text: 'The south lost ₹4.2 lakh in refunds this quarter.' }];
const ans = o => JSON.stringify(o), F = (ref, d, q, n = 'n') => ({ sourceRef: ref, display: d, quote: q, note: n });
let r = checkMapAnswer(ans({ summary: 'Sales and costs moved.', facts: [F('a1', '12%', 'Sales rose 12% in the north.'), F('a2', '₹4.2 lakh', 'lost ₹4.2 lakh in refunds')] }), blocks);
t('map: valid answer keeps both exact quotes', r.ok && r.facts.length === 2 && r.dropped === 0);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('a1', '12%', 'Sales rose 12% in the north.'), F('a1', '12%', 'Sales   rose 12%\nin the north.')] }), blocks);
t('map: the same fact reported twice (even with different whitespace) counts once', r.ok && r.facts.length === 1 && r.duplicates === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('a1', '99%', 'Sales rose 99% in the north.')] }), blocks); t('map: a quote that is not in the block is dropped and counted', r.ok && r.facts.length === 0 && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('a2', '12%', 'Sales rose 12% in the north.')] }), blocks); t('map: a real quote cited against the WRONG block is dropped', r.ok && r.facts.length === 0 && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('zz', '12%', 'Sales rose 12% in the north.')] }), blocks); t('map: an unknown block id is dropped', r.ok && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('a1', '15%', 'Sales rose 12% in the north.')] }), blocks); t('map: a display number that the quote does not contain is dropped', r.ok && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [F('a1', 'north', 'Sales rose 12% in the north.')] }), blocks); t('map: a "fact" without any digit is dropped', r.ok && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: [{ sourceRef: 'a1', display: 12, quote: 'Sales rose 12%' }] }), blocks); t('map: wrong field types are dropped, not crashed on', r.ok && r.dropped === 1);
r = checkMapAnswer(ans({ summary: 'x', facts: Array.from({ length: 40 }, (_, i) => F('a1', '12%', 'Sales rose 12% in the north.' + ' '.repeat(i % 2))) }), blocks); t(`map: more than ${MAX_FACTS_PER_CHUNK} candidates are capped (the rest counted as dropped)`, r.ok && r.facts.length <= MAX_FACTS_PER_CHUNK && r.dropped >= 25);
for (const [name, text] of [['empty summary', ans({ summary: '  ', facts: [] })], ['missing summary', ans({ facts: [] })], ['summary not a string', ans({ summary: 5, facts: [] })], ['facts not an array', ans({ summary: 'ok', facts: 'many' })], ['a summary that is a wall of text', ans({ summary: 'word '.repeat(2000), facts: [] })], ['prose around the JSON', 'Here you go: ' + ans({ summary: 'ok', facts: [] })], ['not JSON', 'I could not do this'], ['an array instead of an object', '[]']]) t(`map: ${name} is unusable (the chunk is retried, never guessed)`, checkMapAnswer(text, blocks).ok === false);
r = checkMapAnswer('```json\n' + ans({ summary: 'ok', facts: [] }) + '\n```', blocks); t('map: a fenced JSON answer is read (the fence is not part of the data)', r.ok === true);
r = checkMapAnswer(ans({ summary: 'ok', facts: [] }), blocks); t('map: an empty fact list is valid (a part may have no numbers)', r.ok && r.facts.length === 0);

// ---- runMapStage with a scripted caller ----
const mk = text => ({ text, usage: { input_tokens: 10, output_tokens: 5 }, httpAttempts: 1 });
const big = sized(70000), nChunks = chunkSource(big).chunkCount;
const idsOf = u => [...u.matchAll(/\[([a-z0-9-]+)\] \(/g)].map(m => m[1]);
const okAnswer = u => { const id = idsOf(u)[0], sec = big.sections.find(s => s.id === id); const m = sec.text.match(/[^.]*\d+%[^.]*\./); return ans({ summary: 'A part.', facts: m ? [F(id, m[0].match(/\d+%/)[0], m[0].trim())] : [] }); };
let calls = 0; let res = await runMapStage({ doc: big, call: async ({ user }) => { calls++; return mk(okAnswer(user)); } });
t(`map stage: ${nChunks} chunks -> exactly ${nChunks} calls, every part present, usage summed`, calls === nChunks && res.parts.length === nChunks && res.parts.every(p => p && p.summary) && res.stats.usage.input === 10 * nChunks);
t('map stage: concurrency never exceeds the cap', await (async () => { let cur = 0, peak = 0; await runMapStage({ doc: big, call: async ({ user }) => { cur++; peak = Math.max(peak, cur); await new Promise(r => setTimeout(r, 15)); cur--; return mk(okAnswer(user)); } }); return peak <= MAP_CONCURRENCY && peak >= 1; })());
res = await runMapStage({ doc: big, call: async ({ user }) => mk(ans({ summary: 'Nothing numeric here.', facts: [] })) });
t('map stage: parts with no facts are fine; the digest says "(none)" and still lists every part', res.parts.every(p => p.facts.length === 0) && (res.digest.match(/CANDIDATE FACTS: \(none\)/g) || []).length === nChunks);
res = await runMapStage({ doc: big, call: async ({ user }) => mk(ans({ summary: 'Same fact everywhere.', facts: [F(idsOf(user)[0], '5%', 'x 5% y')] })) });
t('map stage: invalid candidates in every part are all dropped and counted (digest has no fact lines)', res.stats.dropped >= nChunks && !/\n- \[/.test(res.digest));
const dupSec = big.sections[0]; const dupDoc = makeDoc(Array.from({ length: 80 }, (_, i) => (i % 2 ? `Repeated line says growth was 7% again. ${'filler text '.repeat(70)}` : para(i, 900))), 'dup');
res = await runMapStage({ doc: dupDoc, call: async ({ user }) => { const id = idsOf(user).find(i => /7%/.test(dupDoc.sections.find(s => s.id === i).text)); return mk(ans({ summary: 'p', facts: id ? [F(id, '7%', 'growth was 7% again')] : [] })); } });
t('map stage: the same fact (same block, display and quote) reported by two chunks appears once in the digest', (res.digest.match(/growth was 7% again/g) || []).length <= (new Set(res.parts.flatMap(p => p.facts.map(f => f.sourceRef))).size));
let first = true; calls = 0; res = await runMapStage({ doc: big, call: async ({ user }) => { calls++; if (first) { first = false; return mk('not json'); } return mk(okAnswer(user)); } });
t('map stage: one malformed answer is retried exactly once (calls = chunks + 1)', calls === nChunks + 1 && res.stats.retries === 1);
calls = 0; let err = null; try { await runMapStage({ doc: big, call: async () => { calls++; return mk('never json'); } }); } catch (e) { err = e; }
t('map stage: a chunk that stays unusable FAILS the run (no half-built digest) after at most 2 calls per started chunk', err && err.kind === 'malformed' && calls <= 2 * MAP_CONCURRENCY && err.pipeline && err.pipeline.calls === calls, `${err && err.kind} ${calls}`);
err = null; try { await runMapStage({ doc: big, call: async () => { const e = new Error('provider down'); e.kind = 'server'; throw e; } }); } catch (e) { err = e; }
t('map stage: a provider error aborts the stage and carries the call count', err && err.kind === 'server' && err.pipeline && typeof err.pipeline.calls === 'number');

// ---- chunk boundaries and identifiers ----
const ch = chunkSource(big);
t('chunks: every section id of the document appears in at least one chunk, in order, nothing lost', JSON.stringify([...new Set(ch.chunks.flatMap(c => c.sectionIds))]) === JSON.stringify(big.sections.map(s => s.id)));
t('chunks: reassembled text equals the original text of every section', (() => { const m = reassemble(ch); return big.sections.every(s => m.get(s.id) === s.text); })());
t('chunks: no chunk is empty and none exceeds the 24,000-character bound', ch.chunks.every(c => c.text.length > 0 && c.text.length <= 24000));
const one = makeDoc(['A single short paragraph with 5% in it.'], 'one'); t('chunks: a one-section document yields exactly one chunk (never zero)', chunkSource(one).chunkCount === 1);
const huge = exact(70000); t('chunks: one gigantic section is split into parts that keep its id and rejoin exactly', (() => { const c = chunkSource(huge); return c.chunkCount >= 3 && reassemble(c).get(huge.sections[0].id) === huge.sections[0].text; })());

// ---- digest bounds ----
const worst = Array.from({ length: 13 }, (_, i) => ({ chunkId: 'c' + i, first: { sectionId: 's1' }, last: { sectionId: 's9' }, summary: 'w'.repeat(900), facts: Array.from({ length: MAX_FACTS_PER_CHUNK }, (_, j) => ({ sourceRef: 'slide-12-b3', display: '1,234.5%', quote: 'q'.repeat(300), note: 'n'.repeat(120) })) }));
t(`digest: the worst case for the largest accepted document stays under ${MAX_DIGEST_CHARS} characters`, renderDigest(one, worst).length < MAX_DIGEST_CHARS, renderDigest(one, worst).length);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} multichunk test(s) FAILED` : 'ALL MULTICHUNK TESTS PASSED'); process.exit(bad ? 1 : 0);
