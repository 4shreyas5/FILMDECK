// Batch evaluation of storyboard generation over examples/ai-inputs/*.md.
//   node tests/ai/evaluate.mjs            MOCK mode (deterministic fixtures, NOT an AI result). Default; never spends money.
//   node tests/ai/evaluate.mjs --live     LIVE mode: real Claude calls. Requires ANTHROPIC_API_KEY; refuses to run without it.
// Options: --render  also run every valid storyboard through tools/generate-deck.mjs --no-qa (renders scenes, assembles HTML)
//          --qa <input-name>  also run the full browser QA for that one generated deck   --only <substring>  filter inputs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawnSync } from 'child_process';
import { prepareSource, runPipeline, mockCaller } from '../../tools/ai/storyboard-lib.mjs';
import { callClaude, hasKey, DEFAULT_MODEL } from '../../tools/ai/claude.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), flag = n => args.includes(n), val = n => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const live = flag('--live'); const model = process.env.FILMDECK_MODEL || DEFAULT_MODEL;
if (live && !hasKey()) { console.error('REFUSING: --live needs ANTHROPIC_API_KEY in the environment. No results were produced or invented.'); process.exit(3); }
const mode = live ? 'live' : 'mock', outDir = path.join(root, 'generated/ai-eval', mode); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const banner = live ? `LIVE CLAUDE RESULTS (${model})` : 'MOCK RESULTS: deterministic hand-written fixtures. NOT an AI result and NOT evidence of model reliability.';
console.log('='.repeat(banner.length) + '\n' + banner + '\n' + '='.repeat(banner.length));

const inputs = fs.readdirSync(path.join(root, 'examples/ai-inputs')).filter(f => f.endsWith('.md') && (!val('--only') || f.includes(val('--only')))).sort();
const rows = [];
for (const f of inputs) {
  const name = f.replace(/\.md$/, ''), src = prepareSource(fs.readFileSync(path.join(root, 'examples/ai-inputs', f), 'utf8'), f);
  const call = live ? ({ system, user }) => callClaude({ system, messages: [{ role: 'user', content: user }], model }) : mockCaller(path.join(root, 'tests/ai/fixtures', name + '.json'));
  let res, fatal = null; try { res = await runPipeline({ src, call }); } catch (e) { fatal = e.message; }
  if (fatal) { rows.push({ name, generated: false, fatal, finalValid: false, firstPassValid: false, repairs: 0, cats: {} }); console.log(`${name}: FATAL ${fatal}`); continue; }
  const cats = {}; res.attempts.forEach(a => a.errors.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; }));
  const row = { name, generated: true, firstPassValid: res.firstPassValid, repairRequired: !res.firstPassValid, repairs: res.repairsUsed, finalValid: res.valid, fenced: res.attempts.some(a => a.fenced), cats, attempts: res.attempts.map(a => ({ valid: a.valid, categories: [...new Set(a.errors.map(e => e.category))] })), usage: res.usage };
  rows.push(row);
  fs.writeFileSync(path.join(outDir, name + '.report.json'), JSON.stringify({ mode, ...row, attempts: res.attempts }, null, 2));
  if (res.valid) fs.writeFileSync(path.join(outDir, name + '.storyboard.json'), JSON.stringify(res.storyboard, null, 2)); else fs.writeFileSync(path.join(outDir, name + '.rejected.txt'), res.lastText);
  console.log(`${name.padEnd(26)} first-pass ${res.firstPassValid ? 'valid  ' : 'INVALID'}  repairs ${res.repairsUsed}  final ${res.valid ? 'VALID' : 'FAILED'}  ${Object.keys(cats).length ? '[' + Object.entries(cats).map(([k, v]) => `${k}:${v}`).join(' ') + ']' : ''}`);
}
const n = rows.length, sum = f => rows.filter(f).length, catTotal = k => rows.reduce((a, r) => a + (r.cats[k] || 0), 0);
const repaired = rows.filter(r => r.repairRequired);
const summary = {
  mode, model: live ? model : null, label: banner, inputs: n, generated: sum(r => r.generated), firstPassValid: sum(r => r.firstPassValid), finalValid: sum(r => r.finalValid),
  firstPassRate: +(sum(r => r.firstPassValid) / n).toFixed(2), finalRate: +(sum(r => r.finalValid) / n).toFixed(2),
  repairRequired: repaired.length, avgRepairsAllInputs: +(rows.reduce((a, r) => a + r.repairs, 0) / n).toFixed(2), avgRepairsWhenRepaired: repaired.length ? +(repaired.reduce((a, r) => a + r.repairs, 0) / repaired.length).toFixed(2) : 0,
  inputsWithUnknownRecipe: sum(r => r.cats['unknown-recipe']), inputsWithUnsupportedRecipe: sum(r => r.cats['unsupported-recipe']),
  inputsWithNumberProvenanceFailure: sum(r => r.cats['number-provenance'] || r.cats['ungrounded-fact']), inputsWithSchemaFailure: sum(r => r.cats['schema'] || r.cats['recipe-input']),
  inputsWithSourceRefFailure: sum(r => r.cats['source-reference']), inputsWithBeatLimitFailure: sum(r => r.cats['beat-count'] || r.cats['scene-limit']), inputsWithJsonParseFailure: sum(r => r.cats['json-parse']),
  errorsByCategory: Object.fromEntries([...new Set(rows.flatMap(r => Object.keys(r.cats)))].map(k => [k, catTotal(k)])),
  tokens: rows.reduce((a, r) => ({ input: a.input + (r.usage?.input || 0), output: a.output + (r.usage?.output || 0), cacheRead: a.cacheRead + (r.usage?.cacheRead || 0), cacheWrite: a.cacheWrite + (r.usage?.cacheWrite || 0) }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  rows: rows.map(r => ({ name: r.name, firstPassValid: r.firstPassValid, repairs: r.repairs, finalValid: r.finalValid, categories: r.cats }))
};
console.log('\n' + banner + '\n' + JSON.stringify({ ...summary, rows: undefined, label: undefined }, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

// optional: render valid storyboards with the existing generator (no AI involved here)
if (flag('--render') || val('--qa')) {
  console.log('\nRendering valid storyboards through tools/generate-deck.mjs (' + mode + ' storyboards):');
  for (const r of rows.filter(r => r.finalValid)) {
    const sbFile = path.join(outDir, r.name + '.storyboard.json'), deckDir = path.join(outDir, 'decks', r.name), withQa = val('--qa') === r.name;
    const p = spawnSync(process.execPath, [path.join(root, 'tools/generate-deck.mjs'), sbFile, '--out', deckDir, ...(withQa ? [] : ['--no-qa'])], { encoding: 'utf8', env: process.env });
    r.rendered = p.status === 0; console.log(`  ${r.name.padEnd(26)} ${p.status === 0 ? 'rendered' + (withQa ? ' + browser QA passed' : '') : 'FAILED'}`);
    if (p.status !== 0) console.log((p.stdout + p.stderr).split('\n').filter(l => /ERROR|FAIL|Error/.test(l)).slice(0, 5).map(l => '     ' + l).join('\n'));
  }
  summary.rendered = rows.filter(r => r.rendered).length; fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
}
process.exit(summary.finalValid === n ? 0 : 1);
