#!/usr/bin/env node
// Keeps engine/recipes/registry.json in step with the recipe modules (the source of truth for parameterised recipes):
// for every parameterised recipe it writes status flags, renderer paths, inputContract and a `capabilities` block (beats, facts, supported item
// counts, text limits derived from the input schema, text zones, limitations). `--check` exits 1 if the file would change.
// usage: node tools/sync-registry.mjs [--check]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { recipes } from '../engine/recipes/index.mjs';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../engine/recipes/registry.json');
const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
function limits(schema, p = '', out = {}) { // maxLength of every text field in the inputs schema, by path
  if (!schema || typeof schema !== 'object') return out;
  if (schema.type === 'string' && schema.maxLength) out[p || '$'] = schema.maxLength;
  for (const [k, v] of Object.entries(schema.properties || {})) limits(v, p ? `${p}.${k}` : k, out);
  if (schema.items) limits(schema.items, p + '[]', out);
  return out;
}
const beatsOf = r => { const probe = r.beatCount; const fix = (() => { try { return probe({ rows: [{}], cards: [], gap: null }); } catch { return null; } })(); return fix; };
const EXTRA = { // registry fields for recipes first added after the original taxonomy
  'big-number': { order: 20, visualPurpose: 'Make one figure the whole point of the scene', whenToUse: 'A single headline KPI, optionally against a previous value', inputs: ['label', 'value{fact}', 'context', 'compare{label,value{fact}}'], typicalBeats: 3, sceneExamples: [], deterministic: 'yes', usesAudio: true, audioNotes: 'riser, boom, chime', usesParticles: false, usesCanvas: false, status: 'partial', reuseReadiness: 'high', primitives: ['P1', 'P7'], notes: 'Composite of Velcure counter/readout timing; no single reference scene.',
    inputContract: { beats: '3 (fixed)', required: ['label', 'value{fact}', 'context'], optional: ['tone', 'compare{label,value{fact}}'], facts: 'value and compare.value: number or range facts; display up to 12 characters' } },
  comparison: { order: 21, visualPurpose: 'Put two options side by side on matching metrics', whenToUse: 'Two groups, periods or options compared on 1 to 3 measures', inputs: ['left{heading,metrics[]}', 'right{heading,metrics[]}', 'verdict'], typicalBeats: 3, sceneExamples: [], deterministic: 'yes', usesAudio: true, audioNotes: 'hit, tick, boom, chime', usesParticles: false, usesCanvas: false, status: 'partial', reuseReadiness: 'high', primitives: ['P1', 'P7'], notes: 'Two-column layout language of Velcure scenes 2 and 4; no single reference scene.',
    inputContract: { beats: '3 (fixed)', required: ['left{heading,metrics[1-3]{label,value{fact}}}', 'right{...same count}', 'verdict'], optional: ['left.tone', 'right.tone'], facts: 'metric values: number or range facts; display up to 14 characters' } },
  'icon-rows-ranked-bars': { inputContract: { beats: '3 (fixed)', required: ['rows[2]{head,text,count{fact}}', 'ranked{kicker,items[2-3]{label,value{fact},tag}}'], optional: ['rows[].tone', 'stamp', 'ranked.note'], facts: 'row counts: whole-number facts 1 to 20 (a range shows uncertain icons hollow); bar values: number or range facts listed in descending order, display up to 8 characters' } }
};
for (const r of Object.values(recipes)) {
  let e = reg.recipes.find(x => x.id === r.id);
  if (!e) { e = { id: r.id, name: r.name, ...EXTRA[r.id] }; reg.recipes.push(e); }
  Object.assign(e, EXTRA[r.id] || {}, { id: r.id, parameterised: true, implementationStatus: 'parameterised', renderer: { metadata: `engine/recipes/${r.id}.mjs`, sceneTemplate: `engine/recipes/${r.id}.scene.js`, cssTemplate: `engine/recipes/${r.id}.scene.css` } });
  if (r.id === 'icon-rows-ranked-bars') { e.name = r.name; e.status = 'demonstrated'; e.typicalBeats = 3; e.reuseReadiness = 'high'; }
  const c = r.capabilities;
  e.capabilities = { id: r.id, name: r.name, status: 'parameterized', beats: e.inputContract?.beats || null, requiresFacts: c.requiresFacts, supports: c.supports, inputTypes: c.inputTypes, textLimits: limits(r.inputsSchema), textZones: c.textZones, sourceReferences: c.requiresFacts ? 'every fact used needs sourceRef and an exact evidence quote' : 'none required (text only; digits in text are rejected unless they are fact displays)', purpose: c.purpose, knownLimitations: c.knownLimitations };
}
reg.recipes.sort((a, b) => a.order - b.order);
reg.description = reg.description.replace(/Five recipes are parameterised[^.]*\./, `${Object.keys(recipes).length} recipes are parameterised (generator-ready); the others are reference-code-only.`);
const out = JSON.stringify(reg, null, 2) + '\n';
if (process.argv.includes('--check')) { if (fs.readFileSync(file, 'utf8') !== out) { console.error('registry.json is out of sync with the recipe modules: run node tools/sync-registry.mjs'); process.exit(1); } console.log('registry in sync'); }
else { fs.writeFileSync(file, out); console.log(`registry updated (${Object.keys(recipes).length} parameterised recipes)`); }
