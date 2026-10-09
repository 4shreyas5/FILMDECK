// Shared helpers for parameterised recipes. Recipes are data: a metadata module (<id>.mjs) plus a scene template
// (<id>.scene.js) and CSS template (<id>.scene.css) written as real code adapted from the reference scenes.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

export const TONES = ['accent', 'secondary', 'neutral', 'negative', 'positive'];
export const MOODS = { quiet: [0.5, 240], calm: [1, 500], tense: [1, 650], rising: [1.1, 700], triumphant: [1.2, 900] };
export const text = (max, min = 1) => ({ type: 'string', minLength: min, maxLength: max });
export const factRef = { type: 'object', additionalProperties: false, required: ['fact'], properties: { fact: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,40}$' } } };
export const tone = { enum: TONES };
export const scaleSchema = { type: 'object', additionalProperties: false, required: ['min', 'max', 'majorStep'],
  properties: { min: { type: 'number' }, max: { type: 'number' }, minorStep: { type: 'number', minimum: 0.000001 }, majorStep: { type: 'number', minimum: 0.000001 }, step: { type: 'number', minimum: 0.000001 }, unit: { type: 'string', maxLength: 6 } } };

// JSON that is safe to embed in a <script> body and in JS source
export const jsonData = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
// text for HTML
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loadTemplates(id) {
  return { js: fs.readFileSync(path.join(here, `${id}.scene.js`), 'utf8'), css: fs.readFileSync(path.join(here, `${id}.scene.css`), 'utf8') };
}
// ctx: { sid, P, C, chapter, mood:[level,cutoff], data }
export function renderTemplates(id, ctx) {
  const { js, css } = loadTemplates(id);
  const sub = s => s.split('__SID__').join(ctx.sid).split('__P__').join(ctx.P).split('__C__').join(ctx.C)
    .split('__CHAPTER__').join(jsonData(ctx.chapter)).split('__MOOD__').join(JSON.stringify(ctx.mood)).split('__LETTERBOX__').join(String(!!ctx.letterbox))
    .split('__DATA__').join(jsonData(ctx.data));
  return { js: sub(js), css: sub(css) };
}
// numeric helpers used by recipe checks
export const frac = (v, s) => (v - s.min) / (s.max - s.min);
export function scaleErrors(s, where) {
  const e = [];
  if (!(s.max > s.min)) e.push(`${where}: scale.max must be greater than scale.min`);
  return e;
}
