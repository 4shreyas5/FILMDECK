# Local workflow: one command from document to deck

(Phase 3 additions: `--qa=fast|full`, fully offline decks, `chunks.json`, evidence quotes, layout checks, the programmatic interface. Background in [LOCAL-PRODUCT.md](LOCAL-PRODUCT.md).)

```
node tools/filmdeck.mjs <your-file>
```

FilmDeck reads the document, plans a storyboard, checks every number against the source, builds the cinematic HTML deck, and tests it in a real browser. One command, one finished `index.html`.

## 1. Prerequisites

- **Node 22.2 or newer.** Nothing to install: the project has no runtime dependencies.
- **For the automatic browser test (quality checks and browser tests):** run `npm run setup:qa` once. It installs `playwright-core` and its Chromium into `.qa-env/` (git-ignored; it is not a dependency of FilmDeck itself; needs internet once). Everything then finds it automatically. Advanced: set `FILMDECK_QA_MODULES` to another folder that contains `node_modules/playwright-core` (and optionally `CHROMIUM_PATH`).
- **For live mode only:** `ANTHROPIC_API_KEY`.

Generated decks are fully offline: GSAP and the three fonts are embedded in `index.html`, so a deck plays with no internet at all.

## 2. Usage

```
node tools/filmdeck.mjs report.pdf            # auto mode
node tools/filmdeck.mjs report.pptx --open    # also open the finished deck
node tools/filmdeck.mjs notes.md --mock --mock-fixture tests/ai/fixtures/arcdesk.json
node tools/filmdeck.mjs report.docx --live
```

Supported inputs: `.pdf .pptx .docx .txt .md` ([SOURCE-INGESTION.md](SOURCE-INGESTION.md)). Options: `--mock`, `--live`, `--mock-fixture <file>`, `--qa=fast|full`, `--no-qa`, `--out <dir>`, `--name <project>`, `--open`, `--fictional`, `--max-repairs 0-3`, `--model <id>`. `npm run filmdeck -- <file>` works too.

Example output:

```
FilmDeck 0.3.0
────────────────────────
MODE: MOCK (auto: no ANTHROPIC_API_KEY). The storyboard comes from a stored fixture (...), NOT from AI.
✓ Source detected: PPTX
✓ Extracted: 11 sections
✓ Storyboard loaded from mock fixture
✓ Storyboard validated
✓ 5 scenes / 18 beats
✓ Deck generated and assembled
✓ Browser QA: 20/20
✓ Presentation ready

Output:
  generated/northwind-q3/index.html
```

## 3. Mock mode (`--mock`)

Offline and deterministic. The storyboard is a stored, hand-written fixture, **not AI output**, and the run says so on screen and in `run.json` (`aiGenerated: false`). The fixture is `--mock-fixture <file>`, or by default `tests/ai/fixtures/<project-name>.json`. If neither exists the run stops: mock mode never makes a storyboard up. The fixture still goes through the whole gate, so a fixture that does not match the document is rejected because its numbers are not in the source. Mock mode never contacts the API, even if a key is set. It exists for developing and testing the pipeline; a mock deck about a document is only meaningful when the fixture was written for that document.

## 4. Live mode (`--live`)

Claude writes the storyboard from the document, with the validator and up to 3 repair rounds ([AI-STORYBOARD.md](AI-STORYBOARD.md)). Requires `ANTHROPIC_API_KEY`; without it the command exits 3 before doing anything. The live path is built and tested against a fake server only; it has not yet run against the real API.

## 5. Auto mode (default)

Key present: live. Key absent: mock. The first line of output always states which one ran.

## 6. Output structure

`generated/<project-name>/` (name from the file name: `MBA_Case.pptx` becomes `mba-case`; only `a-z 0-9 -`, never a path, so it cannot leave `generated/`). Re-running the same name replaces the folder's previous artifacts. Use `--name` when two files would collide.

| File | What |
|---|---|
| `source.json` | normalized source (every section with its page/slide/paragraph) |
| `chunks.json` | the source split into model-sized chunks (lossless, number-safe) |
| `storyboard.json`, `storyboard.report.json` | the validated storyboard; attempts and repairs |
| `deck.json`, `scenes.js`, `scenes.css` | generated scenes, speaker notes, source references |
| `index.html` | **the finished deck**, one self-contained file |
| `qa-report.json` | every QA check, `passed`, `checks`, `sceneCount`, `beatCount`, `consoleErrors`, `durationMs` |
| `run.json` | manifest: FilmDeck version, source file/type/sha256, mode, fixture or model, timestamp, scenes, beats, recipes, QA result. No keys or secrets |
| `qa-output/` | screenshots and traces from the browser test |

## 7. Failure handling

Each stage stops the run, prints `✗ <STAGE> FAILED` with the reason, writes `run.json` with `status: failed` and `failedStage`, and exits 1. No finished deck is left behind: if browser QA fails, `index.html` is renamed `index.failed-qa.html` for debugging.

| Stage | Message |
|---|---|
| ingest | `INGESTION FAILED` (unsupported, corrupt, scanned PDF, empty...) |
| storyboard | `STORYBOARD GENERATION FAILED` (invalid after the repair budget, or numbers not in the source) |
| validate | `STORYBOARD VALIDATION FAILED` |
| generate | `GENERATION FAILED` |
| QA | `BROWSER QA FAILED` with the failed checks |

Exit codes: 0 ready, 1 stage failed, 2 usage, 3 `--live` without a key.

## 8. QA

**Two modes, one implementation.** `--qa=fast` (the default, about a minute) is the iteration check; `--qa=full` (about 3 minutes) is the release check. Use fast while developing and full for the build you hand over. `--no-qa` skips the browser and labels the deck not verified.


The same QA as every generated deck (`tests/generated/qa.mjs`): static checks (runtime intact, ids, recipes, no code in the storyboard, number provenance), a browser walk of every scene with every visible number traced to a source fact, and the full interaction harness (forward/back, keys, mouse, rapid clicks, viewports, reduced motion). The full suite adds the interaction harness (keyboard, mouse, rapid clicks, viewports, reduced motion...). Both modes also check offline behaviour, UTF-8, embedded fonts, safe-area and overflow (errors fail, warnings are listed in `qa-report.json`), recipe text fit, forward/back/rebuild navigation and, when `source.json` is present, that every fact has an exact evidence quote in its source section. See [LOCAL-PRODUCT.md](LOCAL-PRODUCT.md).

## 9. Opening the deck

`index.html` is a single file; double-click it or run with `--open` (uses `open` on macOS, `xdg-open` on Linux, `start` on Windows; nothing is opened without the flag, so CI and headless runs are fine). In the deck: click or arrow keys to advance, `H` for help, `F` fullscreen.

## Reproducibility

Same source + same fixture + same options give byte-identical `source.json`, `storyboard.json`, `deck.json`, `scenes.*` and `index.html`. Only `run.json`'s timestamp (set `SOURCE_DATE_EPOCH` to fix it) and QA timings differ. Particle effects inside the deck remain random at playback, as in the reference decks.

## Testing the product

Three kinds of test, never mixed. `npm test` runs **only the first kind**.

| Kind | Command | What | Time |
|---|---|---|---|
| **Offline** (no network, no key, no browser) | `npm test` | validator, recipes, AI pipeline (mock), evidence, ingestion, chunking, long-document machinery, CLI, API, **fake-provider live path**, adversarial gates, harness self-test | about 2 minutes |
| Offline + browser | `npm run setup:qa` once, then `node tests/generated/layout-tests.mjs`, `node tests/review/review-tests.mjs`, `node tests/e2e/e2e.mjs`, `node tests/corpus/corpus.mjs` | layout failures are caught, the review report, five formats end to end, the 12-document corpus | 6 / 3 / 15 / 25 minutes |
| Offline + browser (parity) | `node tests/parity/build.mjs`, then `node tests/parity/parity.mjs mba <abs path to reference/mba-film.html> <abs path to tests/parity/build/mba.html> /tmp/p` (same for velcure) | the reference decks and their rebuilds behave identically | about 5 minutes each |
| **Fake provider** (a local script stands in for Anthropic) | `npm run test:web:mock`, `npm run test:web:fake-live`, `node tests/web/web-hardening-e2e.mjs` | the web app in a real browser: mock journey, live journey, hardening. Plumbing only, nothing about real Claude | 6 / 3 / 3 minutes |
| **Real provider** (costs money, needs a key) | `npm run test:live -- --yes` | the live evaluation of real Claude on realistic documents. **Not run by anything else.** See [LIVE-AI.md](LIVE-AI.md) | depends |

Visual review of generated decks: `node tools/review-deck.mjs <deck-dir>` (one deck) or `npm run review -- <deck-dir>...`, or `node scripts/review-samples.mjs --only 01,03` to build and review samples. Output: `<deck-dir>/review/index.html`. See "Reviewing a deck" below.

Parity and the browser suites are CPU heavy: run them one at a time (Chromium timeouts under CPU starvation look like real failures).

## Reviewing a deck (is it any good?)

Passing QA proves a deck plays, its numbers trace to quotes and nothing overflows. It does **not** prove the story is clear or the slides are beautiful. `tools/review-deck.mjs` makes the human review easy and local (no network, no AI, no key):

```bash
node tools/review-deck.mjs generated/flagship                       # writes generated/flagship/review/index.html
node tools/review-deck.mjs generated/flagship --sizes 1280x720,800x1200,2560x1080   # also the final state of every scene at other screen sizes
node scripts/review-samples.mjs --only 01,03,05 --fast              # build mock decks of samples and review them, plus a gallery page
```

The report shows the source document, mode and model, QA result, scene and beat counts, the narrative arc, and for every scene: a frame while the scene enters (transition caught mid-flight), the settled frame and a frame after every beat; what the audience reads; the speaker notes; each figure with its source quote highlighted inside the cited section; text density (a rough word-count heuristic); layout findings; and a reviewer checklist whose answers stay in your browser. Nothing is scored automatically.

## Measuring API cost

Every live run records the token counts the API reported (`run.json` → `generation.usage`, `calls`, `httpAttempts`). It never invents a cost. To see one, set your own prices (USD per million tokens) before the run: `FILMDECK_PRICE_IN_PER_MTOK`, `FILMDECK_PRICE_OUT_PER_MTOK` and optionally `FILMDECK_PRICE_CACHE_READ_PER_MTOK` / `FILMDECK_PRICE_CACHE_WRITE_PER_MTOK`. Then `generation.cost` appears in `run.json` (labelled as computed from actual usage and your prices; cache tokens without a configured price are listed as unpriced) and in the live evaluation report. No prices are built in.

## package.json

The root `package.json` has **no dependencies** (it pins the Node version and defines scripts). The web app has its own `web/package.json` with exact-pinned Next.js, React and TypeScript. The browser-test tooling lives in `.qa-env/` (`npm run setup:qa`). Scripts: `npm test`, `npm run test:web:mock`, `test:web:fake-live`, `test:live`, `test:corpus`, `test:layout`, `test:e2e`, `review`, `web:install`, `web:build`, `web:start`, `web:dev`, `setup:qa`.

## Web app (Phase 4)

The same pipeline is available in a browser: see [WEB-APP.md](WEB-APP.md). `npm run web:install && npm run web:build && npm run web:start`, then open http://127.0.0.1:3000.

## Live mode (Phase 5)

`ANTHROPIC_API_KEY=... node tools/filmdeck.mjs any-document.pptx --live` generates the storyboard with Claude (any document, long ones via map/digest/design); the web app offers the same as the "Live" mode. It costs money and sends the document text to Anthropic. See [LIVE-AI.md](LIVE-AI.md); the real-Claude evaluation is `npm run test:live` (never part of `npm test`).
