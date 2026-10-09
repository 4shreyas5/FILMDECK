# FilmDeck local web app

A thin browser front end around `runFilmDeck()`. It is a **single-user tool for your own computer**: it listens on `127.0.0.1` only, keeps jobs in memory, has no login, no database and no cloud service. It has two generation modes: **Mock** (default; prepared storyboards, no AI, no key) and **Live** (Claude; needs `ANTHROPIC_API_KEY` on the server, see [LIVE-AI.md](LIVE-AI.md)).

> **Not for public hosting.** Document parsing is not sandboxed, jobs are in memory, there is no authentication and no per-user isolation. Do not expose this server to a network. See "Security model" and "Known limitations".

## Run it (from a clean checkout)

Needs Node 22.2 or newer and internet access once, for `npm install`.

```bash
npm run web:install      # installs Next.js, React and TypeScript (exact versions) into web/node_modules
npm run web:build        # production build
npm run setup:qa         # once: installs playwright-core + Chromium into .qa-env/ (used for the quality checks and the browser tests)
npm run web:start        # http://127.0.0.1:3000
```

Open **http://127.0.0.1:3000**. `npm run web:dev` runs the same at the same address with hot reload. For Live mode set the key in the environment of the process that starts the server (see `.env.example`):

```bash
ANTHROPIC_API_KEY=... npm run web:start
```

Without `npm run setup:qa` the quality-check step fails with a plain message ("playwright-core not found"). Everything else works.

## The journey

1. **Landing page.** One sentence of purpose, the accepted formats (`.pptx .docx .pdf .md .txt`), the size limit (25 MB) and a three-step "how it works".
2. **Your document.** Drop a file or click to choose. A chosen file shows its name and size with **Replace** and **Remove**; dropping another file replaces it. Wrong type, over 25 MB or empty files are refused in the page before any upload.
3. **Mode.** *Mock* (prepared local storyboards, no key). *Live* (Claude analyses your document; greyed out with the reason when the server has no key). The note under the choice states the consequence: Mock builds only the 12 sample documents; Live sends your document text to Anthropic and uses API credit.
4. **Quality check.** *Fast* (about 1 minute: every scene and beat is played in a real browser) or *Full* (about 3 minutes: adds keyboard, mouse, screen-size and motion tests).
5. **Progress.** Real steps from the pipeline with an elapsed timer and an activity log. Live adds "Understanding the story", "Designing scenes" and "Checking the facts", with notes such as "Correcting the plan (round 1 of 3)".
6. **Result.** Document, mode, model (live), scenes, beats, QA result, build time. The deck plays in the page (press **Begin**, then → / Space / ←); **Open full window**, **Download HTML file** (one self-contained offline file), **Make another**, **Delete files**.
7. **Failure.** A plain title and explanation; **Try again** (same file and options, a new job) when the upload is still available, **Try another document**, and for the "no prepared plan" case a **Switch to Live mode** button. A technical-details block appears only for local (non-AI) failures and never contains provider text.

The layout is tested without horizontal scroll at 1440, 1024, 820, 600 and 390 px. Colours and type come from the decks (paper, ink, ember, signal cyan; Barlow Condensed, Instrument Serif, JetBrains Mono, served from `web/public/fonts`).

## Mock mode: what it can and cannot do

Mock always runs `runFilmDeck({ mode: 'mock' })`, even if a key is set; the key is not passed to the child processes. It never invents a storyboard: it loads a hand-planned fixture and still runs every gate. **A document gets a deck only if a prepared storyboard exists for its file name** (`tests/ai/fixtures/` and `tests/corpus/fixtures/`: the 12 documents in `tests/corpus/docs/` and the e2e inputs). Any other document gets "No prepared deck plan for this document". A fixture that does not match the document's content is rejected by the grounding gate.

## Routes

| Route | Purpose |
|---|---|
| `/` | Upload page |
| `/job/<id>` | Progress, failure and result with player |
| `POST /api/generate` | multipart: `file` or `sample`, `qa` = `fast`/`full`, `mode` = `mock`/`live` (default mock). Needs a `Content-Length`. 202 `{id}` or `{error:{title,message}}`. Any other field (model, endpoint, key) is ignored. |
| `GET /api/status/<id>` | job JSON (no server paths; `canRetry`) |
| `DELETE /api/status/<id>` | delete a finished job's files |
| `POST /api/retry/<id>` | new job from a failed job's stored upload |
| `GET /api/config` | `{live:{available, model}}` (booleans and a model name only) |
| `GET /api/samples` | the sample list |
| `GET /deck/<id>` | the finished deck (`?download=1` for an attachment) |

## Architecture

```
browser ──multipart──▶ POST /api/generate → validate → store upload → job registry (FIFO, one at a time)
browser ──poll 700ms─▶ GET  /api/status/<id>
browser ──iframe────▶ GET  /deck/<id>        the one finished index.html under a locked-down CSP
                         │ web/src/lib/jobs.ts: await engine().runFilmDeck({... onEvent})
                         ▼
             tools/lib/filmdeck.mjs  (unchanged boundary: child processes, argument arrays, no shell)
```

Jobs live in memory. Files live in `generated/web/<job id>/` (`upload/`, `deck/` with the usual artifacts and `run.json`), git-ignored. The uploaded original is deleted when a job succeeds; a failed job keeps it so **Try again** works. `Delete files` removes everything of a job. Orphaned job folders from an earlier server run are removed on the first new job (only folders named like job ids). The last 20 finished jobs are kept.

Limits (set in code, never by a request): 25 MB per upload, one running job, a waiting queue of 5 (`FILMDECK_MAX_QUEUED`, 1 to 20, server owner only), 20 finished jobs kept, per-stage process timeouts (ingest 5 min, storyboard 25 min, QA 20 min, others 2 min), 300 s per provider request.

## Security model

For a local, single-user tool; **not hardened for the open internet**.

- **Loopback only**: `npm start` binds `127.0.0.1`; tested to refuse the LAN address.
- **Host and origin checks** on every request that changes anything (upload, retry, delete): the Host header must be `127.0.0.1`, `localhost` or `[::1]` (defeats DNS rebinding) and a cross-origin `Origin` or `Sec-Fetch-Site: cross-site` is refused. Use the same name in the address bar and the Host (`127.0.0.1` or `localhost`).
- **No client path or option reaches the shell or the provider.** Ids are 128-bit random hex validated before lookup; stored file names are rebuilt (lowercase ASCII, digits, dashes); samples are matched against a fixed list; model, endpoint and key come only from the server environment; mode and QA are validated enums; QA `none` cannot be chosen from the web.
- **Upload checks**: extension allow-list, content sniffing (zip header for Office files, `%PDF-` for PDF, no NUL bytes for text), 25 MB limit enforced before the body is read (a request with no `Content-Length` is refused with 411), empty files refused.
- **Deck isolation**: `iframe sandbox="allow-scripts"` (no same-origin) and a CSP of `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; … sandbox allow-scripts allow-downloads`, plus `nosniff` and `no-store`. The route serves exactly one file of a finished job and refuses a symlink that leaves the job folder.
- **No leakage**: errors are mapped to plain text; provider text is never stored or shown; absolute paths are scrubbed; the key is never read by web code and appears in no file, response or log (tested with canary keys).
- **Not covered**: authentication, per-user isolation, rate limiting beyond the queue cap, a sandbox around document parsing (the PDF reader and Office unpacker run as child processes with timeouts and size caps, in the server's own user account), TLS.

## Tests

```bash
npm run setup:qa                         # once
npm run test:web:mock                    # mock journey + ~50 hostile requests, Full QA run in the browser (about 6 min); --skip-full about 2 min
npm run test:web:fake-live               # Live journey in the browser against a LOCAL FAKE Anthropic endpoint (about 3 min)
node tests/web/web-hardening-e2e.mjs     # replace/remove, responsive widths, retry, delete, queue/concurrency, symlink, Host check, 411 (about 3 min)
```

All three build `web/` if needed, start their own server on a test port (3199, 3198/3197, 3196) and clean up `generated/web/`. The live and hardening suites use a fake provider: they prove the plumbing, not the behaviour of real Claude.

## Known limitations

- Mock only knows the sample documents; Live is implemented but **not yet validated against real Claude**.
- Jobs are in memory (a restart forgets them), one at a time, progress is polled.
- Single user, single machine; do not expose it. Hosting would need authentication, isolation per user, a sandbox or container for parsing, persistence and a queue outside the web process.
- The Begin button asks the browser for full screen; inside the embedded player a browser may refuse. **Open full window** always works.
- `next build` prints a harmless file-tracing note because the server reads the engine folder at runtime.
