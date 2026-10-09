# FilmDeck

Turns a document (PDF, PPTX, DOCX, TXT, Markdown) into a cinematic, presenter-controlled, **fully offline** HTML presentation, with every number tied to a quote from the source.

**Status:** runs locally as a single-user tool. Mock mode (prepared storyboards, no AI) is complete and tested. Live mode (Claude writes the storyboard for any document) is implemented and tested against a local fake provider but **has not been validated against real Claude yet**. No payments, accounts or hosting. Not safe to expose to a network.

## Quick start (Node 22.2 or newer)

```bash
npm run web:install && npm run web:build     # once: the web app (Next.js, exact-pinned)
npm run setup:qa                             # once: browser-test tooling (playwright-core + Chromium) into .qa-env/
npm run web:start                            # open http://127.0.0.1:3000 and drop in a document
```

Mock mode works only for the 12 sample documents in `tests/corpus/docs/` (try `01-consulting-deck.pptx`). Command line, no browser UI:

```bash
node tools/filmdeck.mjs tests/corpus/docs/01-consulting-deck.pptx --mock-fixture tests/corpus/fixtures/01-consulting-deck.json --fictional --open
```

Live mode (any document; costs money; sends the text to Anthropic): copy `.env.example`, set `ANTHROPIC_API_KEY` in the environment of the server or command, then pick Live in the page or add `--live`. See [docs/LIVE-AI.md](docs/LIVE-AI.md).

## Checks

```bash
npm test                      # all offline tests (no network, no key, no browser), about 2 minutes
npm run test:web:mock         # browser journey, mock mode
npm run test:web:fake-live    # browser journey, live mode against a FAKE provider
npm run test:live             # REAL Claude evaluation. Costs money. Never run by anything else.
node tools/review-deck.mjs generated/<deck>   # visual review report for a human
```

## Documentation

[docs/LOCAL-WORKFLOW.md](docs/LOCAL-WORKFLOW.md) (commands, tests, review, cost) · [docs/WEB-APP.md](docs/WEB-APP.md) · [docs/LIVE-AI.md](docs/LIVE-AI.md) · [docs/AI-STORYBOARD.md](docs/AI-STORYBOARD.md) · [docs/LOCAL-PRODUCT.md](docs/LOCAL-PRODUCT.md) · [docs/ENGINE-ANALYSIS.md](docs/ENGINE-ANALYSIS.md) · [docs/SOURCE-INGESTION.md](docs/SOURCE-INGESTION.md) · [docs/STORYBOARD-SPEC.md](docs/STORYBOARD-SPEC.md)
