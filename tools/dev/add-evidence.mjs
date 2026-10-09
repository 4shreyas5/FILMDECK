#!/usr/bin/env node
// Fixture authoring aid (NOT part of the pipeline, never run by it): adds an "evidence" quote to the facts of hand-written mock fixtures.
// For each non-derived fact it copies the shortest sentence/line of the cited source block that contains the fact's number(s). The validator
// itself never does this; a fixture whose fact has no matching sentence is left without evidence (and then fails the evidence gate on purpose).
// usage: node tools/dev/add-evidence.mjs <fixture.json> <source file (.md|.txt|.pdf|.pptx|.docx)> [--fictional]
import fs from 'fs'; import path from 'path';
import { prepareSource } from '../ai/storyboard-lib.mjs'; import { ingestFile } from '../ingest/index.mjs'; import { normalizedToSrc } from '../source-to-prompt.mjs';
const [fx, srcFile] = process.argv.slice(2); const ext = path.extname(srcFile).toLowerCase();
const src = ext === '.md' || ext === '.txt' ? prepareSource(fs.readFileSync(srcFile, 'utf8'), path.basename(srcFile)) : normalizedToSrc(ingestFile(srcFile, { fictional: process.argv.includes('--fictional') }), { maxChars: 1e9 });
const toks = s => (String(s).match(/\d[\d,.]*/g) || []).map(t => t.replace(/[.,]+$/, '').replace(/,/g, ''));
const J = JSON.parse(fs.readFileSync(fx, 'utf8')); let added = 0;
J.responses = J.responses.map(r => {
  const a = r.indexOf('{'), b = r.lastIndexOf('}'); let o; try { o = JSON.parse(r.slice(a, b + 1)); } catch { return r; }
  for (const f of o.facts || []) {
    if (f.derivation || !f.sourceRef || f.evidence) continue; const blk = src.blocks.find(x => x.id === f.sourceRef); if (!blk) continue;
    const want = toks(f.display); const cands = blk.text.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(x => x && want.every(t => toks(x).includes(t)));
    if (cands.length) { f.evidence = cands.sort((x, y) => x.length - y.length)[0].slice(0, 300); added++; }
  }
  return r.slice(0, a) + JSON.stringify(o) + r.slice(b + 1);
});
fs.writeFileSync(fx, JSON.stringify(J, null, 1)); console.log(`${path.basename(fx)}: evidence added to ${added} fact(s)`);
