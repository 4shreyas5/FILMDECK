#!/usr/bin/env node
// FilmDeck: one command from a source document to a finished, browser-tested HTML deck. Thin wrapper around tools/lib/filmdeck.mjs.
//   node tools/filmdeck.mjs <source.pdf|pptx|docx|txt|md> [--mock | --live] [--mock-fixture <storyboard-fixture.json>]
//        [--qa=fast|full] [--no-qa] [--out <dir>] [--name <project>] [--open] [--fictional] [--max-repairs N] [--model id]
// Exit codes: 0 deck ready; 1 a stage failed; 2 usage; 3 --live without a key.
import path from 'path';
import { runFilmDeck, openFile, VERSION } from './lib/filmdeck.mjs';
const args = process.argv.slice(2); const flag = n => args.includes(n); const val = n => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const VALUE_FLAGS = ['--mock-fixture', '--out', '--name', '--max-repairs', '--model'];
const src = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const usage = `FilmDeck ${VERSION}: turn a document into a cinematic HTML deck.

  node tools/filmdeck.mjs <file.pdf|pptx|docx|txt|md> [options]

  --mock                  offline mode: use a stored storyboard fixture (never presented as AI output)
  --live                  use Claude (needs ANTHROPIC_API_KEY)
  (default: auto)         live if ANTHROPIC_API_KEY is set, otherwise mock
  --mock-fixture <file>   storyboard fixture for mock mode (default: tests/ai/fixtures/<input name>.json)
  --qa=fast               quick browser safety net, about a minute (default; for iterating)
  --qa=full               the complete release QA suite, about 3 minutes
  --no-qa                 skip browser QA (the deck is then reported as NOT verified)
  --open                  open the finished deck in your browser
  --out <dir>             output folder (default: generated/<project-name>)
  --name <project>        project name (default: from the file name)
  --fictional             mark the document as fictional/demo
  --max-repairs <0-3>     AI repair attempts (live mode)`;
if (flag('--help') || flag('-h')) { console.log(usage); process.exit(0); }
if (!src) { console.error(usage); process.exit(2); }
if (flag('--mock') && flag('--live')) { console.error('Choose one of --mock or --live (or neither for auto).'); process.exit(2); }
const qaArg = args.find(a => a.startsWith('--qa=')); const qaMode = flag('--no-qa') ? 'none' : qaArg ? qaArg.slice(5) : 'fast';
if (!['fast', 'full', 'none'].includes(qaMode)) { console.error('--qa must be fast or full'); process.exit(2); }

console.log(`FilmDeck ${VERSION}\n────────────────────────`);
const icon = { ok: '✓', warn: '!', info: '…', mode: '' };
const res = await runFilmDeck({ inputPath: src, outputDir: val('--out'), name: val('--name'), mode: flag('--mock') ? 'mock' : flag('--live') ? 'live' : 'auto', mockFixture: val('--mock-fixture'), qaMode,
  fictional: flag('--fictional'), maxRepairs: val('--max-repairs') !== undefined ? Number(val('--max-repairs')) : undefined, model: val('--model'),
  onEvent: e => console.log(e.type === 'mode' ? e.message : e.type === 'warn' ? `  ${icon.warn} ${e.message}` : `${icon[e.type] || ''} ${e.message}`) });
if (!res.ok) {
  if (res.stage === 'usage') { console.error(res.reason); process.exit(res.exitCode); }
  console.error(`\n✗ ${res.title}\nReason:\n${res.reason}\n\nNo deck was produced.${res.outputDir ? ` Intermediate files are in ${path.relative(process.cwd(), res.outputDir) || '.'}` : ''}`); process.exit(res.exitCode);
}
console.log(`\nOutput:\n  ${path.relative(process.cwd(), res.indexHtml) || res.indexHtml}\n(${(res.durationMs / 1000).toFixed(1)}s)`);
if (flag('--open') && !openFile(res.indexHtml)) console.log(`(could not open a browser automatically; open ${res.indexHtml} yourself)`);
