#!/usr/bin/env node
// Deterministic adapter: normalized source -> the labelled text the storyboard generator reads (and that will later be sent to Claude).
// No AI here. Text is copied verbatim; only labels (location, type) are added around it.
// usage: node tools/source-to-prompt.mjs <normalized.json> [--out prompt.txt] [--max-chars N]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { checkSchema } from './schema-lite.mjs'; import { renderSource } from './ai/storyboard-lib.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_PROMPT_CHARS = 120000; // ~30k tokens: beyond this a single-pass storyboard is not sensible (we never summarise to fit)
const TYPE = { heading: 'heading', paragraph: 'paragraph', list: 'list', table: 'table (first row = column headers)', notes: 'speaker notes' };
export function loadNormalized(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return checkNormalized(doc);
}
export function checkNormalized(doc) {
  const errs = checkSchema(JSON.parse(fs.readFileSync(path.join(root, 'schemas/source.schema.json'), 'utf8')), doc);
  if (errs.length) throw new Error('not a valid normalized source: ' + errs.slice(0, 3).join('; '));
  const ids = new Set(); for (const s of doc.sections) { if (ids.has(s.id)) throw new Error(`duplicate section id "${s.id}"`); ids.add(s.id); }
  return doc;
}
const where = l => `${l.kind} ${l.number}`;
// normalized source -> { name, meta, blocks[{id,text,label}] } (the shape runPipeline already consumes)
export function normalizedToSrc(doc, { maxChars = MAX_PROMPT_CHARS } = {}) {
  const blocks = doc.sections.map(s => ({ id: s.id, text: s.text, label: `${where(s.location)} · ${TYPE[s.type]}`, location: s.location }));
  const total = blocks.reduce((n, b) => n + b.text.length, 0);
  if (total > maxChars) throw new Error(`source text is ${total} characters; the limit for one storyboard is ${maxChars}. Split the document (no automatic summarising is done).`);
  return { name: doc.document.name, meta: { title: doc.document.title, fictional: !!doc.document.fictional }, blocks };
}
export const renderPrompt = (doc, opts) => renderSource(normalizedToSrc(doc, opts));
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const f = a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--out' && a[i - 1] !== '--max-chars');
  if (!f) { console.error('usage: node tools/source-to-prompt.mjs <normalized.json> [--out prompt.txt] [--max-chars N]'); process.exit(2); }
  try {
    const mc = a.includes('--max-chars') ? Number(a[a.indexOf('--max-chars') + 1]) : MAX_PROMPT_CHARS;
    const text = renderPrompt(loadNormalized(f), { maxChars: mc }); const o = a.includes('--out') ? a[a.indexOf('--out') + 1] : null;
    if (o) { fs.mkdirSync(path.dirname(path.resolve(o)), { recursive: true }); fs.writeFileSync(o, text + '\n'); console.log(`wrote ${o} (${text.length} characters)`); } else process.stdout.write(text + '\n');
  } catch (e) { console.error('FAILED: ' + e.message); process.exit(1); }
}
