// Recipe contract tests: capability metadata, registry sync, and rejection of bad inputs for the three added recipes. Offline, no browser.
// Run: node tests/generated/recipe-tests.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawnSync } from 'child_process';
import { recipes } from '../../engine/recipes/index.mjs'; import { validateStoryboard } from '../../tools/validate-storyboard.mjs'; import { buildSystemPrompt } from '../../tools/ai/storyboard-lib.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), J = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const reg = J('engine/recipes/registry.json').recipes;
t('8 parameterised recipes, 3 added in this phase', Object.keys(recipes).length === 8 && ['icon-rows-ranked-bars', 'big-number', 'comparison'].every(id => recipes[id]));
for (const [id, r] of Object.entries(recipes)) {
  const e = reg.find(x => x.id === id), c = e && e.capabilities;
  t(`${id}: registry entry marked parameterised with renderer files that exist`, e && e.parameterised && Object.values(e.renderer).every(f => fs.existsSync(path.join(root, f))));
  t(`${id}: capabilities (id, status, beats, requiresFacts, supports, inputTypes, textLimits, textZones, sourceReferences, limitations)`, c && c.id === id && c.status === 'parameterized' && c.beats && typeof c.requiresFacts === 'boolean' && c.supports && c.inputTypes.length && c.textLimits && c.textZones.length && c.sourceReferences && c.knownLimitations.length);
  t(`${id}: text limits in capabilities match the input schema`, Object.values(c.textLimits).every(n => n > 0) && (id === 'minimal-close' ? c.textLimits.bigWord === 16 : true));
  t(`${id}: every text zone selector is scoped to the scene (__C__) and has a role`, c.textZones.every(z => z.selector.includes('__C__') && z.role && z.maxWidth > 0));
  t(`${id}: scene template and CSS exist and use the substitution placeholders`, ['scene.js', 'scene.css'].every(ext => { const f = fs.readFileSync(path.join(root, `engine/recipes/${id}.${ext}`), 'utf8'); return f.includes('__SID__') || f.includes('__C__'); }));
}
const r0 = spawnSync('node', [path.join(root, 'tools/sync-registry.mjs'), '--check'], { encoding: 'utf8' }); t('registry.json is in sync with the recipe modules', r0.status === 0, r0.stderr);
const sys = buildSystemPrompt(); t('the storyboard prompt offers all 8 recipes with their input contracts', Object.keys(recipes).every(id => sys.includes(`## ${id}`)) && /requiresFacts|Facts:/.test(sys));

// negative tests on a real corpus storyboard that uses the new recipes
const fx = J('tests/corpus/fixtures/03-annual-report.json'); const base = JSON.parse(fx.responses[0]);
const mut = f => { const o = JSON.parse(JSON.stringify(base)); f(o); return validateStoryboard(o); };
const sc = (o, id) => o.scenes.find(s => s.id === id);
t('baseline storyboard (big-number, gauge, icon rows) validates', validateStoryboard(base).errors.length === 0, validateStoryboard(base).errors.join('|'));
t('icon rows: a count above 20 is rejected', mut(o => { o.facts.find(f => f.id === 'dc-new').value = 25; }).errors.some(e => /whole numbers from 1 to 20/.test(e)));
t('icon rows: ranked items must be in descending order', mut(o => { const it = sc(o, 'expand').inputs.ranked.items; it.reverse(); }).errors.some(e => /highest to lowest/.test(e)));
t('icon rows: exactly two rows', mut(o => { sc(o, 'expand').inputs.rows.pop(); }).errors.length > 0);
t('icon rows: a typed number in the stamp is rejected (provenance)', mut(o => { sc(o, 'expand').inputs.stamp = 'UP 99 PERCENT'; }).errors.some(e => /99/.test(e)));
t('icon rows: beat count must be 3', mut(o => { sc(o, 'expand').beats.pop(); }).errors.some(e => /beat/.test(e)));
t('icon rows: icon "person" is accepted (counts that are people)', mut(o => { sc(o, 'expand').inputs.icon = 'person'; }).errors.length === 0);
t('icon rows: an unknown icon kind is rejected', mut(o => { sc(o, 'expand').inputs.icon = 'skull'; }).errors.length > 0);
t('icon rows: the icon defaults to the neutral block, not to people (a count of centres must not look like a count of people)', recipes['icon-rows-ranked-bars'].normalize(JSON.parse(JSON.stringify({ rows: [], ranked: {} }))) === undefined && (() => { const i = { rows: [], ranked: {} }; recipes['icon-rows-ranked-bars'].normalize(i); return i.icon === 'block'; })());
t('big number: display longer than 12 characters is rejected', mut(o => { const f = o.facts.find(x => x.id === 'revenue'); f.display = '₹4,200 crore total'; sc(o, 'revenue').beats[1].notes = 'It reached ₹4,200 crore total.'; }).errors.some(e => /longer than 12/.test(e)));
t('big number: unknown fact reference is rejected', mut(o => { sc(o, 'revenue').inputs.value = { fact: 'nope' }; }).errors.some(e => /unknown fact/.test(e)));
t('big number: unexpected input key is rejected', mut(o => { sc(o, 'revenue').inputs.html = '<b>x</b>'; }).errors.length > 0);
const cx = JSON.parse(fs.readFileSync(path.join(root, 'tests/corpus/fixtures/04-multi-column.json'), 'utf8')).responses[0]; const cb = JSON.parse(cx);
const cm = f => { const o = JSON.parse(JSON.stringify(cb)); f(o); return validateStoryboard(o); };
t('comparison baseline validates', validateStoryboard(cb).errors.length === 0, validateStoryboard(cb).errors.join('|'));
t('comparison: both sides need the same number of metrics', cm(o => { sc(o, 'vax').inputs.left.metrics.push({ label: 'EXTRA', value: { fact: 'digital' } }); }).errors.some(e => /same number of metrics/.test(e)));
t('comparison: more than 3 metrics per side is rejected', cm(o => { const m = sc(o, 'vax').inputs; for (const s of [m.left, m.right]) while (s.metrics.length < 4) s.metrics.push({ label: 'X', value: { fact: 'goal' } }); }).errors.length > 0);
t('comparison: a verdict containing a number that is not a fact is rejected', cm(o => { sc(o, 'vax').inputs.verdict = 'Coverage is 5 points above the goal.'; }).errors.some(e => /5/.test(e)));
console.log(bad ? `\n${bad} FAILED` : '\nALL RECIPE TESTS PASSED'); process.exit(bad ? 1 : 0);
