#!/usr/bin/env node
// Storyboard validator: structure (schemas/storyboard.schema.json), references, recipe inputs, beat counts,
// no-code rule, and number provenance. Usage: node tools/validate-storyboard.mjs <storyboard.json> [--json]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { checkSchema } from './schema-lite.mjs';
import { recipes } from '../engine/recipes/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(root, 'schemas/storyboard.schema.json'), 'utf8'));

const NUM = /\d[\d,.]*/g;
const FORBIDDEN = [[/[<>]/, 'markup characters < or >'], [/`/, 'backtick'], [/\$\{/, 'template placeholder ${'], [/javascript:/i, 'javascript: URL'],
  [/=>/, 'arrow function'], [/\bfunction\s*\(/, 'function expression'], [/\beval\s*\(/, 'eval'], [/\b(document|window)\./, 'DOM access'], [/—/, 'em-dash (product rule)'], [/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/, 'control character']];
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|dozen|hundred|thousand|million|billion|percent|half|double|doubled|triple|tripled|quarter)\b/i;

const clone = o => JSON.parse(JSON.stringify(o));
function* strings(v, p = '$') { if (typeof v === 'string') yield [p, v]; else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${p}[${i}]`); else if (v && typeof v === 'object') for (const k of Object.keys(v)) yield* strings(v[k], `${p}.${k}`); }

// --- facts -----------------------------------------------------------------------------------------------
export function factEdge(facts, ref) {            // 'id', 'id.lo', 'id.hi'
  const [id, edge] = ref.split('.'); const f = facts.get(id); if (!f) return { error: `unknown fact "${id}"` };
  if (f.kind === 'range') { if (edge !== 'lo' && edge !== 'hi') return { error: `fact "${id}" is a range: use "${id}.lo" or "${id}.hi"` }; return { v: f.value[edge] }; }
  if (edge) return { error: `fact "${id}" is a single number: no ".${edge}"` };
  return { v: f.value };
}
export function resolvedFact(f) {
  const lo = f.kind === 'range' ? f.value.lo : f.value, hi = f.kind === 'range' ? f.value.hi : f.value;
  return { id: f.id, kind: f.kind, display: f.display, unit: f.unit || '', sourceRef: f.sourceRef || null, derived: !!f.derivation, lo, hi, v: (lo + hi) / 2 };
}
function replaceFactRefs(node, facts, used, errors, where) {
  if (Array.isArray(node)) return node.map((x, i) => replaceFactRefs(x, facts, used, errors, `${where}[${i}]`));
  if (node && typeof node === 'object') {
    if (typeof node.fact === 'string' && Object.keys(node).length === 1) {
      const f = facts.get(node.fact); if (!f) { errors.push(`${where}: unknown fact "${node.fact}"`); return null; }
      used.add(f.id); return resolvedFact(f);
    }
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, replaceFactRefs(v, facts, used, errors, `${where}.${k}`)]));
  }
  return node;
}
// Used by the generator as well. Returns { inputs, used:Set<factId>, errors }
export function resolveSceneInputs(scene, facts, recipe) {
  const errors = [], used = new Set();
  const inputs = replaceFactRefs(clone(scene.inputs), facts, used, errors, `scenes[${scene.id}].inputs`);
  if (!errors.length && recipe.normalize) recipe.normalize(inputs);
  return { inputs, used, errors };
}

export function validateStoryboard(sb) {
  const errors = [], warnings = [], info = []; const E = m => errors.push(m), W = m => warnings.push(m);
  // 1. structure
  checkSchema(SCHEMA, sb).forEach(E);
  if (errors.length) return { errors, warnings, info };
  // 2. no code, markup or em-dash anywhere
  for (const [p, s] of strings(sb)) for (const [re, what] of FORBIDDEN) if (re.test(s)) E(`${p}: contains ${what}`);
  // 3. ids
  const dup = (arr, what) => { const seen = new Set(); for (const x of arr) { if (seen.has(x)) E(`duplicate ${what} id "${x}"`); seen.add(x); } return seen; };
  const sourceIds = dup(sb.sources.map(s => s.id), 'source'); dup(sb.facts.map(f => f.id), 'fact'); dup(sb.scenes.map(s => s.id), 'scene');
  const facts = new Map(sb.facts.map(f => [f.id, f]));
  // 4. facts
  for (const f of sb.facts) {
    const w = `facts[${f.id}]`;
    if (f.kind === 'number' && typeof f.value !== 'number') E(`${w}: kind number needs a numeric value`);
    if (f.kind === 'range') { const v = f.value; if (!v || typeof v !== 'object' || typeof v.lo !== 'number' || typeof v.hi !== 'number') E(`${w}: kind range needs value {lo, hi}`); else if (v.lo > v.hi) E(`${w}: lo is above hi`); }
    if (!f.derivation && !f.sourceRef) E(`${w}: needs a sourceRef (or a derivation from sourced facts)`);
    if (f.sourceRef && !sourceIds.has(f.sourceRef)) E(`${w}: sourceRef "${f.sourceRef}" is not in sources`);
    if (f.derivation && f.kind !== 'number') E(`${w}: a derived fact must be kind number`);
    if (f.derivation) {
      const vals = f.derivation.of.map(r => { const x = factEdge(facts, r); if (x.error) E(`${w}.derivation: ${x.error}`); else if (facts.get(r.split('.')[0]).derivation) E(`${w}.derivation: "${r}" is itself derived (not allowed)`); return x.v; });
      if (vals.every(v => typeof v === 'number') && typeof f.value === 'number') {
        const [a, b] = vals; const calc = f.derivation.op === 'diff' ? a - b : f.derivation.op === 'ratio' ? a / b : vals.reduce((x, y) => x + y, 0);
        if (f.derivation.op !== 'sum' && vals.length !== 2) E(`${w}.derivation: ${f.derivation.op} takes exactly two inputs`);
        else if (!Number.isFinite(calc) || Math.abs(calc - f.value) > 1e-9 * Math.max(1, Math.abs(calc))) E(`${w}: value ${f.value} does not equal ${f.derivation.op}(${f.derivation.of.join(', ')}) = ${calc}`);
        else info.push(`${w}: derivation ${f.derivation.op}(${f.derivation.of.join(', ')}) = ${calc} verified`);
      }
    }
    // display must visibly carry the value
    const toks = (f.display.match(NUM) || []).map(t => parseFloat(t.replace(/,/g, '')));
    if (f.kind === 'number' && typeof f.value === 'number' && !toks.some(t => Math.abs(t - Math.abs(f.value)) < 1e-9)) W(`${w}: display "${f.display}" does not contain the number ${f.value}`);
    if (f.kind === 'range' && f.value && !(toks.some(t => t === f.value.lo) && toks.some(t => t === f.value.hi))) W(`${w}: display "${f.display}" does not contain both ${f.value.lo} and ${f.value.hi}`);
  }
  // 5. scenes
  const usedFacts = new Set(); const allowDisplays = sb.facts.map(f => f.display);
  sb.scenes.forEach((sc, idx) => {
    const w = `scenes[${sc.id}]`; const recipe = recipes[sc.recipe];
    if (!recipe) { E(`${w}: unknown or not-yet-parameterised recipe "${sc.recipe}" (available: ${Object.keys(recipes).join(', ')})`); return; }
    if (recipe.titleRequired && !sc.title) E(`${w}: recipe ${recipe.id} needs a title`);
    if (!recipe.titleRequired && sc.title) W(`${w}: recipe ${recipe.id} does not display a title; it will be ignored`);
    if (sc.title && sc.title.trim().split(/\s+/).length > 8) E(`${w}: title longer than 8 words`);
    const before = errors.length;
    checkSchema(recipe.inputsSchema, sc.inputs, `${w}.inputs`).forEach(E);
    if (errors.length > before) return;
    const { inputs, used, errors: refErrs } = resolveSceneInputs(sc, facts, recipe); refErrs.forEach(E);
    used.forEach(u => usedFacts.add(u));
    if (!refErrs.length) {
      recipe.check(inputs).forEach(m => E(`${w}.inputs: ${m}`));
      const want = recipe.beatCount(inputs);
      if (sc.beats.length !== want) E(`${w}: recipe ${recipe.id} produces ${want} beats for these inputs but the scene lists ${sc.beats.length}`);
    }
    sc.beats.forEach((b, k) => { if (b.n !== k + 1) E(`${w}.beats[${k}]: n must be ${k + 1}`); });
    if (sc.letterbox === true && idx !== 0 && idx !== sb.scenes.length - 1) W(`${w}: letterbox is meant for the opening and closing scenes`);
  });
  if (sb.scenes.length > 9) W(`${sb.scenes.length} scenes: digit keys only jump to scenes 1-9 (N/P still work)`);
  for (const f of sb.facts) if (!usedFacts.has(f.id) && !sb.facts.some(g => g.derivation && g.derivation.of.some(r => r.split('.')[0] === f.id))) W(`fact "${f.id}" is not used by any scene`);
  // 6. fictional labelling
  const fictionalSrc = sb.sources.some(s => s.kind === 'fictional');
  if (fictionalSrc && !sb.deck.fictional) E('a source has kind "fictional" but deck.fictional is not true');
  if (sb.deck.fictional && !/fictional|demo/i.test(`${sb.deck.subtitle} ${sb.deck.intro}`)) E('deck.fictional is true: subtitle or intro must say the content is fictional or a demo');
  // 7. number provenance: every digit sequence the audience can read or hear must sit inside a fact display
  let shown = [...strings({ title: sb.deck.title, subtitle: sb.deck.subtitle, intro: sb.deck.intro, credits: sb.deck.credits || [] }, 'deck')];
  const spoken = [], internal = [];
  sb.scenes.forEach(sc => {
    for (const k of ['chapter', 'kicker', 'title']) if (sc[k]) shown.push([`scenes[${sc.id}].${k}`, sc[k]]);
    for (const [p, s] of strings(sc.inputs, `scenes[${sc.id}].inputs`)) if (!/\.fact$/.test(p) && !/\.(tone|variant|op|edge)$/.test(p)) shown.push([p, s]);
    sc.beats.forEach((b, i) => spoken.push([`scenes[${sc.id}].beats[${i}].notes`, b.notes]));
    for (const k of ['idea', 'visualDirection']) if (sc[k]) internal.push([`scenes[${sc.id}].${k}`, sc[k]]);
    sc.beats.forEach((b, i) => { if (b.summary) internal.push([`scenes[${sc.id}].beats[${i}].summary`, b.summary]); });
  });
  const nouns = sb.deck.properNouns || [];
  const all = JSON.stringify(sb); nouns.forEach(n => { if (!JSON.stringify(sb.deck.credits || []).includes(n) && !all.replace(JSON.stringify(sb.deck.properNouns), '').includes(n)) W(`properNoun "${n}" does not appear anywhere else in the storyboard`); });
  const strip = s => nouns.reduce((t, n) => t.split(n).join(' '), s);
  // whole-token match: "3" must not be accepted because some display contains "30%"
  const allowedTokens = new Set(allowDisplays.flatMap(d => (d.match(NUM) || []).map(t => t.replace(/[.,]+$/, ''))));
  const traced = tok => allowedTokens.has(tok);
  const scan = (list, level, label) => list.forEach(([p, s]) => { for (let tok of strip(s).match(NUM) || []) { tok = tok.replace(/[.,]+$/, ''); if (tok && !traced(tok)) level(`${p}: number "${tok}" is not in any fact display (${label})`); }
    if (NUMBER_WORDS.test(s)) warnings.push(`${p}: contains a number word ("${s.match(NUMBER_WORDS)[0]}"); make sure it is a sourced claim or a structural count`); });
  scan(shown, E, 'on-screen'); scan(spoken, E, 'speaker notes'); scan(internal, W, 'internal note');
  info.push(`${sb.facts.length} facts, ${sb.scenes.length} scenes, ${sb.scenes.reduce((a, s) => a + s.beats.length, 0)} beats`);
  return { errors, warnings, info };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]; if (!file) { console.error('usage: node tools/validate-storyboard.mjs <storyboard.json> [--json]'); process.exit(2); }
  let sb; try { sb = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('cannot read storyboard:', e.message); process.exit(2); }
  const r = validateStoryboard(sb);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else { r.errors.forEach(m => console.log('ERROR  ', m)); r.warnings.forEach(m => console.log('warning', m)); r.info.forEach(m => console.log('info   ', m)); console.log(r.errors.length ? `FAILED: ${r.errors.length} error(s)` : 'storyboard valid'); }
  process.exit(r.errors.length ? 1 : 0);
}
