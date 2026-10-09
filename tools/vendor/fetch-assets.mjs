#!/usr/bin/env node
// One-off maintenance script (NOT part of generation): downloads the third-party assets that generated decks embed, into engine/vendor/.
//   GSAP 3.12.5 (the version the reference decks load) and the Google Fonts the reference decks use (latin + latin-ext subsets only).
// Run only to refresh the vendored copies; the pipeline itself never touches the network.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const V = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../engine/vendor'); fs.mkdirSync(path.join(V, 'fonts'), { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async (u, o = {}) => { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(u + ' ' + r.status); return o.text ? r.text() : Buffer.from(await r.arrayBuffer()); };
fs.writeFileSync(path.join(V, 'gsap.min.js'), await get('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'));
const css = await get('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;800;900&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap', { text: true });
let out = '';
for (const m of css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[^}]*\})/g)) {
  if (!['latin', 'latin-ext'].includes(m[1])) continue;
  const fam = m[2].match(/font-family: '([^']+)'/)[1], style = m[2].match(/font-style: (\w+)/)[1], wt = m[2].match(/font-weight: (\d+)/)[1];
  const file = `${fam.toLowerCase().replace(/ /g, '-')}-${wt}${style === 'italic' ? 'i' : ''}-${m[1]}.woff2`;
  fs.writeFileSync(path.join(V, 'fonts', file), await get(m[2].match(/url\((https:[^)]+)\)/)[1]));
  out += `/* ${m[1]} */\n` + m[2].replace(/src: url\([^)]+\) format\('woff2'\)/, `src: url(fonts/${file}) format('woff2')`) + '\n';
}
fs.writeFileSync(path.join(V, 'fonts.css'), out);
console.log('vendored gsap + ' + fs.readdirSync(path.join(V, 'fonts')).length + ' font files');
