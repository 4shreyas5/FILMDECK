#!/usr/bin/env node
// Assembler: engine runtime + shell + a deck folder (deck.json, scenes.js, scenes.css) -> one HTML file.
// usage: node tools/build-deck.mjs <deck-dir> [out.html] [--offline]   (--offline embeds GSAP and the fonts, as the generator does)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARK = '/* @@FILM_SCENES@@ */\n';
// offline: replace the three external dependencies of the shell (Google Fonts stylesheet + preconnects, GSAP from cdnjs) with the
// vendored copies embedded in the page, so the file needs no network. Reference parity builds keep offline=false (byte-for-byte shell).
const EXTERNAL = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*">\n/;
const GSAP_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>';
export function vendoredFontsCss() {
  const dir = path.join(root, 'engine/vendor');
  return fs.readFileSync(path.join(dir, 'fonts.css'), 'utf8').replace(/url\(fonts\/([^)]+)\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'fonts', f)).toString('base64')})`);
}
export function buildDeck(deckDir, outFile, { offline = false } = {}) {
  const rd = f => fs.readFileSync(f, 'utf8'), eng = f => rd(path.join(root, 'engine', f));
  const deck = JSON.parse(rd(path.join(deckDir, 'deck.json')));
  const runtimeJs = eng('film-runtime.js'); if (!runtimeJs.includes(MARK)) throw new Error('scene marker missing in runtime');
  const slots = {
    TITLE: deck.title, RUNTIME_CSS: eng('film-runtime.css'), SCENE_CSS: rd(path.join(deckDir, 'scenes.css')),
    SECTIONS: deck.sections.map(id => `      <section class="slide" id="${id}"></section>`).join('\n'),
    HELP_DIGITS: deck.helpDigits, INTRO_KICKER: deck.introKicker, INTRO_TITLE: deck.introTitle, INTRO_PARAGRAPH: deck.introParagraph,
    RUNTIME_JS: runtimeJs.replace(MARK, () => rd(path.join(deckDir, 'scenes.js'))),
  };
  // function replacer: scene code contains "$" sequences that must not be interpreted
  let shell = eng('film-shell.html');
  if (offline) {
    shell = '<meta charset="utf-8">\n' + shell; // the reference shell declares no encoding; opened from disk, non-ASCII text (middle dots, rupee, quotes) would show as mojibake
    if (!EXTERNAL.test(shell) || !shell.includes(GSAP_TAG)) throw new Error('shell external dependencies not found; offline build cannot proceed');
    shell = shell.replace(EXTERNAL, () => `<style>\n${vendoredFontsCss()}</style>\n`).replace(GSAP_TAG, () => `<script>${fs.readFileSync(path.join(root, 'engine/vendor/gsap.min.js'), 'utf8')}</script>`);
  }
  const html = shell.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => { if (!(k in slots)) throw new Error('unknown slot ' + k); return slots[k]; });
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, html);
  return { outFile, bytes: html.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv.slice(2).find(a => !a.startsWith('--')); if (!dir) { console.error('usage: node tools/build-deck.mjs <deck-dir> [out.html]'); process.exit(2); }
  const pos = process.argv.slice(2).filter(a => !a.startsWith('--')); const r = buildDeck(path.resolve(dir), path.resolve(pos[1] || path.join(dir, 'index.html')), { offline: process.argv.includes('--offline') }); console.log('built', r.outFile, r.bytes, 'bytes');
}
