# FilmDeck local product (Phase 3: hardening and content coverage)

What the local product is, how it is verified, and what it does not do. For the commands see [LOCAL-WORKFLOW.md](LOCAL-WORKFLOW.md); for the pipeline internals see [SOURCE-INGESTION.md](SOURCE-INGESTION.md), [AI-STORYBOARD.md](AI-STORYBOARD.md), [STORYBOARD-SPEC.md](STORYBOARD-SPEC.md).

```
source -> ingest -> normalize -> chunk -> storyboard -> validate -> recipes -> generate -> assemble -> QA
```

## 1. Offline deck architecture

A generated `index.html` is one self-contained file. The reference shell loads three things from the internet (GSAP from cdnjs; Barlow Condensed, Instrument Serif and JetBrains Mono from Google Fonts). For generated decks `tools/build-deck.mjs` (`{ offline: true }`, which `generate-deck` always uses) replaces them with vendored copies from `engine/vendor/`:

| Asset | Embedded as | Size |
|---|---|---|
| GSAP 3.12.5 (the exact version the reference decks use) | inline `<script>` | 72 KB |
| 16 font files (8 faces, latin + latin-ext) | `@font-face` with `data:font/woff2;base64` | about 440 KB |
| `<meta charset="utf-8">` | prepended | |

The result is about 450 KB per deck and needs no network at any time. The reference decks and the parity builds still use the original shell byte for byte (`offline: false`), so MBA and Velcure parity is unchanged.

Findings made on the way:
- **The reference shell declares no character encoding.** Opened from disk, non-ASCII text (the middle dot in captions, the rupee sign, curly quotes) rendered as mojibake (`Â·`). Generated decks now declare UTF-8; QA checks `document.characterSet`. The reference decks were left untouched.
- **Fonts and glyph coverage.** Only the `latin` and `latin-ext` subsets are embedded. Text in other scripts (Devanagari, Cyrillic, CJK) falls back to system fonts. Whether the rupee sign U+20B9 is drawn by Barlow or by a fallback font was not verified glyph by glyph.
- **Licensing** (`engine/vendor/NOTICE.md`): the fonts are SIL OFL 1.1 (embedding allowed, unmodified). GSAP is under GreenSock's "Standard No Charge" license, which restricts use inside tools that compete with Webflow's no-code animation builders. **Review it before a commercial launch.** `tools/vendor/fetch-assets.mjs` re-downloads the assets; the pipeline itself never does.
- **Proof:** `tests/generated/offline-test.mjs` opens a generated deck in a browser with networking switched off and DNS broken, plays every scene to the end, and requires zero requests, GSAP defined, the three font families loaded and no console error. QA additionally blocks every http(s) request in every run and fails if the page tries one.

## 2. QA modes

`node tools/filmdeck.mjs <file> --qa=fast|full` (also `--no-qa`). One QA implementation, `tests/generated/qa.mjs --mode=fast|full`; the modes only select checks.

| | FAST (default, for iterating) | FULL (for the release build) |
|---|---|---|
| Static checks: HTML, runtime once and byte-identical, ids, recipes, number provenance, no code in storyboard, notes and sources survive, no external URL, fonts and GSAP embedded, evidence grounding (when `source.json` exists) | yes | yes |
| Page load, no console errors, no external request, UTF-8, embedded fonts load | yes | yes |
| Walk of every scene and beat with the layout and text-fit probes, rendered numbers traced to facts | yes | yes |
| Forward through every beat, backward to the start, scene rebuild, final scene reachable | yes | yes |
| Full interaction harness: keyboard, mouse, rapid clicks, transitions, HUD, timecode, black screen, help, fullscreen, sound, reduced motion, three viewports | no | yes |
| Typical time | about 50 s | about 3 min |

Use fast while editing storyboards and recipes; run full before handing a deck to anyone. `qa-report.json` records `mode`, `checks`, `layoutWarnings` and `warnings`.

## 3. Safe-area, overflow and text-fit checks

`tests/support/layout-probe.mjs` runs inside the page for the active scene after every beat (animations settled), using bounding boxes only (DOM `getBoundingClientRect` and text ranges, SVG `<text>` and shapes; no pixels). Geometry is converted to 1920x1080 stage coordinates. Intended content area: x 110 to 1810, y 60 to 1000.

| Finding | Severity |
|---|---|
| visible text partly outside the stage | **error** (fails QA, check 7c) |
| text cut off by its own or an ancestor's `overflow:hidden` | **error** (7c) |
| a recipe text zone wider than its declared `maxWidth` or wrapping to more than `maxLines` | **error** (7d) |
| text outside the safe area but inside the stage | warning |
| very large text; SVG graphics well beyond the stage; two text elements overlapping by more than 35% of the smaller | warning |

Details that matter: text extents come from the text itself (a centred full-width block is not "1920 px wide"); a glyph box taller than a tight `line-height` is reduced to the line box (what a mask clips); invisible or fading elements (effective opacity under 0.3) are ignored. Warnings go to `qa-report.json` and `run.json` and never fail a run. `tests/generated/layout-tests.mjs` damages a good deck on purpose (text pushed off-stage, a clipping container, an oversized headline, forced wrapping, a safe-area-only violation) and requires QA to fail, or only warn, accordingly.

**Text fit.** Each recipe declares `capabilities.textZones` (selector with the `__C__` scene prefix, role, `maxLines`, `maxWidth`). The generator writes the concrete selectors per scene into `deck.json`, and QA measures them in the browser with the real embedded fonts. This replaces trusting character limits alone (the limits stay as the first, cheap defence in the input schemas). Limits of the approach: line counts for display fonts with very tight line-height can be undercounted, and the zones are the author's judgement of where each recipe can safely hold text.

## 4. Evidence grounding

Fact -> source section -> exact quote. Every non-derived fact carries `evidence`, an unbroken quote from the section named by `sourceRef`. The gate checks that the quote is a substring of that section (whitespace runs collapse; case and wording must match), contains every number of the fact's `display`, and reports a quote that exists only in another section. Missing evidence is an error (category `evidence`) and goes into the repair prompt verbatim. Nothing in the program writes evidence for the model. It is still lexical: it shows where a number came from, not that it means what the storyboard says. See [STORYBOARD-SPEC.md](STORYBOARD-SPEC.md) and [AI-STORYBOARD.md](AI-STORYBOARD.md).

## 5. Chunking

`tools/chunk-source.mjs`: deterministic, lossless, number-safe splitting of a normalized source into chunks of at most 24,000 characters; details in [SOURCE-INGESTION.md](SOURCE-INGESTION.md). `filmdeck` writes `chunks.json` every run. Generating one storyboard from several chunks is not built (a live call still refuses over 120,000 characters).

## 6. Recipe capabilities

Eight parameterised recipes. Each module in `engine/recipes/` declares `capabilities` (purpose, `requiresFacts`, supported item counts, input types, known limitations, text zones); `node tools/sync-registry.mjs` merges them into `engine/recipes/registry.json` together with beat contract, text limits derived from the input schema and source-reference rules (`--check` fails when out of sync; a test runs it). The storyboard prompt is built from the registry, so a new recipe becomes available to the model by being registered.

| Recipe | Purpose | Beats | Facts | Added |
|---|---|---|---|---|
| `gauge-needle` | one rate, before to after | 3 | 2 | Phase 1 |
| `range-bar-chart` | 1 to 4 values or ranges on one scale, gap, cards, verdict | 3 to 5 | 1 to 4 | Phase 1 |
| `pillars-roof` | three supports under one idea | 5 | none | Phase 1 |
| `strike-three-moves-checklist` | reject an approach, three moves, checklist | 4 | none | Phase 1 |
| `minimal-close` | open or close the deck | 3 | none | Phase 1 |
| `icon-rows-ranked-bars` | change in a count as icon rows, then ranked bars | 3 | 2 + 2 to 3 | Phase 3 |
| `big-number` | one hero KPI that counts up, context, optional comparison | 3 | 1 to 2 | Phase 3 |
| `comparison` | two options side by side on 1 to 3 matching metrics, verdict | 3 | 2 to 6 | Phase 3 |

`icon-rows-ranked-bars` is adapted from Velcure scene 2 (beats 4 and 5). `big-number` and `comparison` have no single reference scene: they are composites of the references' counter/readout timing and two-column layouts, built from the same design tokens, fonts, sounds and primitives. They are the least "proven by a reference" recipes and should get a designer's eye. Rank numbers are deliberately not drawn on the ranked bars (they would be unsourced digits).

## 7. Corpus testing

`tests/corpus/` holds 12 fictional documents shaped like real ones (consulting PPTX, dense corporate PPTX, annual-report PDF, two-column PDF, text-heavy DOCX, DOCX with tables, financial report with many numbers, marketing case, HR case, a narrative with no numbers, a 178,000-character report that needs chunking, a messy mixed DOCX) and a mock storyboard for each. `node tests/corpus/corpus.mjs` runs every document through the whole pipeline (fast QA; full QA for three representative ones) and writes `generated/corpus/summary.json`. These are MOCK results: the storyboards are hand-planned, so the corpus measures ingestion, grounding, recipes, generation and QA, **not** Claude. `tests/corpus/make-corpus.mjs` and `make-fixtures.mjs` rebuild documents and fixtures; fixture sourceRefs and evidence are located mechanically in what ingestion extracted.

## 8. Programmatic interface

`tools/lib/filmdeck.mjs` exports `runFilmDeck({ inputPath, outputDir, name, mode, mockFixture, qaMode, fictional, maxRepairs, model, onEvent, env })` and returns a plain object: `{ ok, exitCode, status, outputDir, indexHtml, manifest, durationMs }` or `{ ok: false, exitCode, stage, title, reason, outputDir }`. It never calls `process.exit`, reads no stdin, reports progress through `onEvent({ type, message })`, and passes everything to the existing tools as argument arrays (no shell). `tools/filmdeck.mjs` is a 40-line wrapper. A future server would call the same function once per job, giving each job its own output folder (parallel runs are tested). Not built, on purpose: HTTP, queues, storage, authentication.

`run.json` records filmdeck version, source name/type/size/sha256, normalized-source, storyboard and deck hashes, generation mode (`aiGenerated`, `apiUsed`, fixture or model), generator version, runtime id (`film-runtime.js@<hash>`), embedded GSAP/fonts, section/chunk/scene/beat counts, recipe ids, QA mode and result, warnings, per-stage timings. It never contains keys or source text.

## 9. Security

Threat model: source documents are untrusted; the storyboard (even from a model) is data; generated scene code is trusted only because it is produced from fixed recipe templates plus escaped data.

Audited and tested:
- **Path traversal and file names.** The project name comes from the base name only and is reduced to `a-z 0-9 -` (tests: `../../etc/passwd.md`, backslashes, unicode, dots, 200 characters). `--name ../../x` cannot leave `generated/`. An explicit `--out` may point anywhere the user chooses, but a folder that holds files FilmDeck did not create is refused, so a run can never delete the user's files.
- **Shell injection.** No stage uses a shell: every child process gets an argument array. A source called ``x $(touch PWNED) `touch PWNED2` ;touch PWNED3;.md`` is processed inertly (tested).
- **Code execution from documents.** Nothing is executed: no macros, scripts, PDF JavaScript, DOCX/PPTX external links or embedded objects are read. Text from documents stays plain data in `source.json`. Storyboard strings are rejected if they contain `< > \` ${ => function( eval( document. window.` or control characters, are HTML-escaped when rendered and JSON-escaped (`<`, `>`, U+2028/9) when embedded in scripts, so a source or model cannot inject markup or script into a deck. The source text itself never enters the deck HTML; only storyboard strings do.
- **Resource exhaustion.** ZIP: 5,000 entries, 64 MB per entry, 256 MB total. PDF: Flate streams capped at 64 MB, structure nesting capped, files over 100 MB refused. XML: no DTD or external entity expansion. Stage timeouts: ingestion 5 min, QA 20 min, other stages 2 min (the process is killed).
- **Secrets.** The API key is read only from the environment inside `tools/ai/claude.mjs`; it is not logged, not in errors, not in `run.json`, reports or artifacts (tests set a fake key and scan every output). Mock mode never contacts the API.
- **Network.** Ingestion, chunking, mock generation, assembly and QA make no network calls. The only outbound call in the product is the live Claude request. Generated decks make none.
- **Temporary files.** The pipeline writes only into its output folder. Playwright's own browser profile is created by Playwright in the system temp area and removed by it; the tests use `mkdtemp` folders and delete them.

Remaining limitations (not fixed):
- **Prompt injection through documents.** A document can contain instructions aimed at the model. The gates stop code, invented numbers and ungrounded facts, but a manipulated model can still produce a valid storyboard with misleading wording.
- **Evidence is lexical** (see 4).
- **The PDF reader is hand-written** and has had little adversarial testing; limits stop memory and time blowups but not every parser bug. Run ingestion of untrusted files in a sandbox (container, low privileges) when a service is built.
- **Evidence and other strings containing `<` or backticks are rejected** by the no-markup rule, so a fact whose only supporting sentence contains such a character must be quoted from a part of the sentence without it.
- **No size or rate limits at the product level yet** (a service needs them), and `--out` follows symlinks.
- **Dependencies of the QA machine** (Playwright and Chromium) are outside the repo and unaudited here.

## 10. Performance

Measured on the development Mac, mock mode, from the 12-document corpus (`generated/corpus/summary.json`, `run.json.timingsMs`):

| Stage | Time |
|---|---|
| ingest (PDF/PPTX/DOCX/MD, 1 KB to 180 KB; a 540 KB, 2,900-section PDF takes 0.23 s) | 43 to 100 ms |
| chunk | about 40 ms |
| storyboard (mock fixture + all gates) | about 43 ms |
| validate | about 39 ms |
| generate + assemble | about 48 ms |
| **browser QA, fast** | **about 39 s** (23 to 47 s) |
| **browser QA, full** | **about 176 s** (158 to 189 s) |

Each stage figure is mostly Node start-up (a stage is a separate process, about 35 ms). Everything except QA together is under half a second, so the only bottleneck is the browser. Within QA, the interaction harness that FULL adds costs about 135 s of the 176 s; fast keeps the checks with the best failure-finding value for about 22 percent of the time. If QA time matters later: reuse one browser across the walk and the navigation checks, shorten the fixed waits (they assume GSAP at 10x), or run the harness only on the first deck of a batch. Not done: nothing here justified optimizing yet. Deck size: about 440 to 450 KB each (400 KB of that is the embedded fonts and GSAP). In live mode the Claude call will dominate and is unmeasured.

## 11. Verified results

See the Phase 3 section of [ENGINE-ANALYSIS.md](ENGINE-ANALYSIS.md) for the run log of this phase (all tests, parity, corpus, end-to-end).


## Phase 6 additions (pre-validation completion)

Visual review (`tools/review-deck.mjs`, see [LOCAL-WORKFLOW.md](LOCAL-WORKFLOW.md)); a real defect found by it and fixed (`icon-rows-ranked-bars` drew person icons for non-person counts, now an `icon` input with a neutral `block` default); cost accounting with configurable prices; a documented and tested call budget; long-document hardening (duplicate candidate facts collapsed, digest size bound); a redesigned web journey in the decks' own palette and type; web hardening (Host-header check against DNS rebinding, unbounded bodies refused, symlink escape refused, retry and delete, retention, orphan cleanup); exact-pinned web dependencies, `.env.example`, `npm run setup:qa` (no external environment variable needed). Details: [WEB-APP.md](WEB-APP.md), [LIVE-AI.md](LIVE-AI.md).
