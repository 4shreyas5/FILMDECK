#!/usr/bin/env node
// Deterministic chunking of a normalized source into ordered, size-bounded chunks for a future model call. No summarising, no information loss:
// every character of every section appears in exactly one chunk (sections larger than a chunk are split into parts at sentence/line/space
// boundaries, never between a number and its neighbouring symbol, and the parts concatenate back to the original text).
// usage: node tools/chunk-source.mjs <normalized.json> [--out chunks.json] [--max-chars 24000]
import fs from 'fs'; import path from 'path';
import { checkNormalized } from './source-to-prompt.mjs';
export const DEFAULT_MAX_CHARS = 24000; // about 6-7k tokens of source per chunk
export const tokenEstimate = chars => Math.ceil(chars / 3.6);
const TYPE = { heading: 'heading', paragraph: 'paragraph', list: 'list', table: 'table (first row = column headers)', notes: 'speaker notes' };
const label = s => `${s.location.kind} ${s.location.number} · ${TYPE[s.type]}`;
const NUMISH = /[0-9₹$€£¥%.,+\-−–]/; // a split next to one of these could separate a number from its unit/context

// Largest end position <= max (and >= 30% of max, so parts are not tiny) of a regex match in `win` that satisfies ok(startIndex, endIndex).
function lastEnd(win, re, max, ok = () => true) {
  let best = -1, m; re.lastIndex = 0;
  while ((m = re.exec(win))) { const end = m.index + m[0].length; if (end > max) break; if (end >= max * 0.3 && ok(m.index, end)) best = end; if (!m[0].length) re.lastIndex++; }
  return best;
}
// Split text into parts of at most `max` characters. Preference: end of sentence, then newline, then a space that does not touch a number-ish
// character on either side (so "$ 4,200" or "12 %" are never separated). Parts concatenate back to the exact original text.
export function splitText(text, max) {
  const parts = []; let rest = text;
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = lastEnd(win, /[.!?]["')\]]?\s+/g, max);
    if (cut < 0) cut = lastEnd(win, /\n+/g, max);
    if (cut < 0) cut = lastEnd(win, /\s+/g, max, (i, end) => !NUMISH.test(win[i - 1] || '') && !NUMISH.test(win[end] || ''));
    if (cut < 0) cut = max; // pathological: one gigantic token with no boundary
    parts.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts;
}

export function chunkSource(doc, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  checkNormalized(doc);
  const units = []; // one unit per section, or per part of an oversized section
  for (const s of doc.sections) {
    const parts = splitText(s.text, Math.max(200, maxChars - 200)); // leave room for the block header line
    parts.forEach((text, i) => units.push({ id: s.id, part: parts.length > 1 ? { index: i + 1, of: parts.length } : null, text, label: label(s) + (parts.length > 1 ? ` · part ${i + 1}/${parts.length}` : ''), location: s.location }));
  }
  const render = u => `[${u.id}] (${u.label})\n${u.text}`;
  const chunks = []; let cur = null;
  const close = () => { if (cur) { cur.text = cur.units.map(render).join('\n\n'); cur.chars = cur.text.length; cur.tokenEstimate = tokenEstimate(cur.chars); delete cur.units; chunks.push(cur); cur = null; } };
  for (const u of units) {
    const add = render(u).length + 2;
    if (cur && cur.size + add > maxChars) close();
    if (!cur) cur = { id: `chunk-${chunks.length + 1}`, size: 0, units: [], sectionIds: [], first: null, last: null };
    cur.units.push(u); cur.size += add; if (!cur.sectionIds.includes(u.id)) cur.sectionIds.push(u.id);
    cur.first ||= { sectionId: u.id, location: u.location.id }; cur.last = { sectionId: u.id, location: u.location.id };
  }
  close(); chunks.forEach(c => delete c.size);
  return { chunkVersion: 1, document: doc.document.id, maxChars, chunkCount: chunks.length, totalChars: doc.sections.reduce((n, s) => n + s.text.length, 0), chunks };
}
// Reassemble each section's text from the chunks (tests use it to prove nothing was lost, duplicated or reordered).
export function reassemble(result) {
  const out = new Map();
  for (const c of result.chunks) for (const b of c.text.split(/\n\n(?=\[[a-z0-9-]+\] \()/)) { const m = b.match(/^\[([a-z0-9-]+)\] \(([^\n]*)\)\n([\s\S]*)$/); out.set(m[1], (out.get(m[1]) || '') + m[3]); }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), f = a.find((x, i) => !x.startsWith('--') && !['--out', '--max-chars'].includes(a[i - 1]));
  if (!f) { console.error('usage: node tools/chunk-source.mjs <normalized.json> [--out chunks.json] [--max-chars N]'); process.exit(2); }
  try {
    const r = chunkSource(JSON.parse(fs.readFileSync(f, 'utf8')), { maxChars: a.includes('--max-chars') ? Number(a[a.indexOf('--max-chars') + 1]) : DEFAULT_MAX_CHARS });
    const o = a.includes('--out') ? a[a.indexOf('--out') + 1] : null;
    if (o) { fs.mkdirSync(path.dirname(path.resolve(o)), { recursive: true }); fs.writeFileSync(o, JSON.stringify(r, null, 2) + '\n'); console.log(`${r.chunkCount} chunk(s), ${r.totalChars} characters -> ${o}`); } else console.log(JSON.stringify(r, null, 2));
  } catch (e) { console.error('CHUNKING FAILED: ' + e.message); process.exit(1); }
}
