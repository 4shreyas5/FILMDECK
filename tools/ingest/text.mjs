// .txt and .md -> sections. Section ids are p1..pN in document order (same ids the plain-text storyboard pipeline uses).
import { normText, normLine, tableText, newDoc, IngestError } from './common.mjs';
const BULLET = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+(.*)$/, ORDERED = /^\s*\d{1,3}[.)]\s+/;
const splitRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => normLine(c));
export function ingestText(buf, { name, type }) {
  let raw = buf.toString('utf8');
  if (raw.includes('\u0000')) throw new IngestError('corrupt', 'file contains binary data and cannot be read as text');
  raw = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const doc = newDoc({ name, type }); const meta = {}; let fmLines = 0;
  if (type === 'markdown') {
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (fm) { fmLines = fm[0].split('\n').length - 1; raw = raw.slice(fm[0].length); fm[1].split('\n').forEach(l => { const m = l.match(/^([a-zA-Z_]+):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim(); }); }
  }
  const lines = raw.split('\n'); let i = 0, n = 0; const path = [];
  // location.line = 1-based line in the original file
  const push = (sec, startLine) => { n++; doc.sections.push({ id: `p${n}`, ...sec, location: { id: `p${n}`, kind: 'paragraph', number: n, line: startLine + fmLines }, ...(path.length ? { headingPath: path.map(p => p.text) } : {}) }); };
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const start = i + 1, l = lines[i];
    const h = type === 'markdown' && l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length, text = normLine(h[2]); while (path.length && path[path.length - 1].level >= level) path.pop();
      path.push({ level, text }); const sec = { type: 'heading', level, text }; // heading's own path includes itself
      n++; doc.sections.push({ id: `p${n}`, ...sec, location: { id: `p${n}`, kind: 'paragraph', number: n, line: start + fmLines }, headingPath: path.map(p => p.text) }); i++; continue;
    }
    if (type === 'markdown' && /^\s*```/.test(l)) { // fenced code: kept as plain text data, never interpreted
      const buf2 = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) buf2.push(lines[i++]); i++;
      const text = buf2.join('\n').trim(); if (text) push({ type: 'paragraph', text }, start); continue;
    }
    if (type === 'markdown' && /\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const headers = splitRow(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim() && /\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      push({ type: 'table', text: tableText(headers, rows), headers, rows }, start); continue;
    }
    // a paragraph / list = consecutive non-blank lines (markdown headings and fences end it)
    const blk = [];
    while (i < lines.length && lines[i].trim() && !(type === 'markdown' && (/^#{1,6}\s+/.test(lines[i]) || /^\s*```/.test(lines[i])) && blk.length)) blk.push(lines[i++]);
    if (blk.every(x => BULLET.test(x))) {
      const items = blk.map(x => normLine(x.match(BULLET)[1])); push({ type: 'list', text: items.map(x => '- ' + x).join('\n'), items, ordered: ORDERED.test(blk[0]) }, start);
    } else push({ type: 'paragraph', text: normText(blk.join('\n')) }, start);
  }
  if (!doc.sections.length) throw new IngestError('empty', 'the document contains no text');
  doc.document.title = meta.title || (doc.sections.find(s => s.type === 'heading')?.text) || '';
  if (/^(true|yes)$/i.test(meta.fictional || '')) doc.document.fictional = true;
  return doc;
}
