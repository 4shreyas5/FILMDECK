// Shared helpers for every extractor. Extraction only: whitespace/line-ending normalisation, never any change to words or numbers.
export { IngestError } from './zip.mjs';
const SPACES = /[   -   　]/g, INVISIBLE = /[​-‍⁠﻿]/g, CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Normalise one run of text. Line breaks are kept (as \n); spaces are collapsed; blank-line runs shrink to one blank line.
export function normText(s) {
  return String(s).replace(/\r\n?/g, '\n').replace(CTRL, '').replace(INVISIBLE, '').replace(SPACES, ' ').replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Single-line variant (cells, titles, list items).
export const normLine = s => normText(s).replace(/\n+/g, ' ');
export const tableText = (headers, rows) => [headers, ...rows].filter(r => r && r.length).map(r => r.join(' | ')).join('\n');
export function newDoc({ name, type, title }) {
  return { sourceVersion: 1, document: { id: '', name, type, title: title || '' }, sections: [], warnings: [] };
}
// Stable document id: lowercase slug of the file base name (no hashing, so output is reproducible).
export const slug = n => n.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'document';
