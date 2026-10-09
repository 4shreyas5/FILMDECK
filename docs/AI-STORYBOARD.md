# AI storyboard generation (Phase 2, step 1)

Question this step answers: **can an LLM reliably turn real source content into a valid FilmDeck storyboard?**
Scope: source text in, validated storyboard JSON out. No scene code is generated here, the model never touches the repository, and nothing it writes is executed.

> **Status of the evidence.** The Claude integration is implemented and its transport is tested against a local fake server, but **no live Claude result exists yet**: `ANTHROPIC_API_KEY` was not available in the environment where this was built. Every success rate in this repository is a **MOCK** result from hand-written fixtures. Mock numbers say the machinery works; they say nothing about how reliable the model is.

## Pipeline

```
examples/ai-inputs/*.md   (text/markdown, optional front matter: title, fictional: true)
   │  prepareSource: split into paragraph blocks [p1] [p2] ...
   ▼
system prompt  = prompts/storyboard-generator.md
               + storyboard JSON Schema
               + AVAILABLE RECIPES (from engine/recipes/registry.json, parameterised only) with their exact input schemas
               + NOT AVAILABLE list (reference-only recipe ids)
               + one format example (examples/generated-demo/storyboard.json)       ~6.8k tokens, sent as a cacheable block
user message   = the source blocks (+ "FICTIONAL: yes/no")
   ▼  Claude (tools/ai/claude.mjs)         or, with --mock, deterministic fixture responses
raw response
   ▼  GATE (tools/ai/storyboard-lib.mjs: gate)
      1. must be one JSON object (a markdown fence is tolerated and flagged; prose is rejected)
      2. tools/validate-storyboard.mjs  (schema, references, recipe inputs, beat counts, no code/markup, derivations, number provenance)
      3. grounding against the SOURCE (groundCheck): see below
      4. scene count 3..9
   ├─ no errors → save storyboard.json (+ report)  → STOP
   └─ errors → REPAIR: send source + the model's own previous JSON + the exact errors; max 3 repairs
                still invalid → FAIL (exit 1). The last response is kept in *.rejected.txt. Nothing is patched by the program.
```

## Commands

```
node tools/generate-storyboard.mjs examples/ai-inputs/01-saas-churn.md --out generated/storyboards/01.json            # live (needs ANTHROPIC_API_KEY)
node tools/generate-storyboard.mjs examples/ai-inputs/01-saas-churn.md --out generated/storyboards/01.json --mock     # offline fixtures
node tests/ai/evaluate.mjs            # all 10 inputs, MOCK mode (default, no cost)
node tests/ai/evaluate.mjs --live     # all 10 inputs with Claude (refuses to run without a key)
node tests/ai/evaluate.mjs --render [--qa <input-name>]   # also feed valid storyboards to tools/generate-deck.mjs (and browser QA for one)
node tests/ai/pipeline-tests.mjs      # 44 tests of gates, categories, bounded loop, API client (fake server), CLI behaviour
```
Exit codes of `generate-storyboard`: 0 valid storyboard saved, 1 could not produce one, 2 usage, 3 live mode without key. Reports are saved next to the output as `<out>.report.json` (mode, first-pass validity, repairs, errors per attempt, token usage; never the key).

## Model integration (`tools/ai/claude.mjs`)

Plain `fetch` to `POST /v1/messages`; no SDK, no dependency, no provider abstraction. Key from `ANTHROPIC_API_KEY` only; model from `FILMDECK_MODEL` or the default `claude-opus-5-5` (taken from the project's environment notes; **not verified against the live API**). The system prompt is sent as one block with `cache_control: ephemeral`, so the repair calls and later inputs reuse it. Retries 429 and 5xx twice with backoff; other errors fail immediately; error messages never include the key. `ANTHROPIC_BASE_URL` exists only so the client can be tested against a local server.

## Prompt architecture

`prompts/storyboard-generator.md` (about 1,000 words) is the canonical instruction; code appends only what must stay in sync with the repository: the schema, the available recipes and their input schemas, the not-available list and a format example. Key rules in the prompt, each also enforced by a gate:
- Output is exactly one JSON object. No code, HTML, CSS, markdown.
- Narrative process: extract the real story, find the central tension, build tension → argument → resolution, one idea per scene, data as visuals, no slide-by-slide transcription.
- **Numbers:** never invent; every number is a fact copied exactly from a source block, with `sourceRef` = that block id; derived numbers only via `derivation`; recipe inputs reference facts; if a recipe needs a number the source lacks, choose a non-numeric recipe; a source without numbers gets `"facts": []`.
- **Claims and sources:** no invented claims, quotes, names or sources; interpretation stays qualitative; `sources` ids must be real block ids; fictional input must be labelled fictional.
- **Recipes:** only the five available ones; reference-only ones are listed as forbidden; beat counts must equal the recipe's rule.
- 5 to 8 scenes (max 9), opener and closer are `minimal-close` with letterbox.

## Gates and what each catches

| Gate | Catches | Error category |
|---|---|---|
| parse | prose around JSON, truncation, invalid JSON | `json-parse` |
| schema | unknown keys (so no `js`/`html`/`css`), wrong types, over-length text | `schema` |
| recipe | id not in registry / reference-only recipe | `unknown-recipe` / `unsupported-recipe` |
| recipe inputs | missing/extra inputs, text over limits, value outside scale, label would overflow | `recipe-input` |
| beats | beat count differs from recipe rule, bad numbering | `beat-count` |
| numbers in text | any digit sequence (on screen or in speaker notes) that is not inside a fact `display` | `number-provenance` |
| **grounding** | a fact whose number is not literally in the source block it cites; a source id that is not a real block; a fact value that is not the number displayed | `ungrounded-fact`, `source-reference` |
| facts/sources | missing `sourceRef`, unknown fact or source, derivation that does not recompute | `source-reference`, `derivation` |
| forbidden content | markup, backticks, `${`, arrow functions, em-dash | `forbidden-content` |
| fictional | fictional source/deck labelled wrongly | `fictional-label` |
| limits | more than 9 or fewer than 3 scenes | `scene-limit` |

The grounding gate is the important addition for this step: the existing validator proves numbers are consistent *inside* the storyboard, but a model could write a fact `"47%"` with a plausible `sourceRef` and pass it. Grounding ties facts to the actual source text. It cannot tell whether the model attached a real number to the **right meaning** (for example calling the 3% in the source "after" when it means "before"): see limitations.

### Evidence gate (Phase 3)
`evidenceErrors` in `tools/ai/storyboard-lib.mjs`: every non-derived fact must carry `evidence`, an exact quote from the block named by `sourceRef` that contains the fact's number. Errors are category `evidence`: missing quote, quote not in the source, quote taken from a different block (named in the message), quote without the number. They go to the model verbatim like every other error. The 14 mock fixtures were given evidence by `tools/dev/add-evidence.mjs`, an authoring aid for fixtures that the pipeline never runs. Tests: `tests/ai/evidence-tests.mjs`.

## Repair loop

At most 3 repairs (hard-coded cap; `--max-repairs` can only lower it). Each repair message contains: the source blocks, the model's previous output verbatim (capped at 60k characters), up to 50 exact errors with categories, and the instruction to return the complete corrected JSON only, without inventing numbers or sources. The model repairs its own output; the program never edits it. Per run the report records: first-pass validity, repairs used, final validity, errors by category per attempt, token usage.

## Available vs reference-only recipes

Available (parameterised): `gauge-needle`, `range-bar-chart`, `pillars-roof`, `strike-three-moves-checklist`, `minimal-close`. The other 14 registry recipes appear only in the NOT AVAILABLE list. A response that uses one is rejected with `unsupported-recipe` (distinct from `unknown-recipe`, an id that is not in the registry at all) and the model is told to pick an available recipe.

## Test corpus (`examples/ai-inputs/`, all fictional and labelled so)

| # | Input | Shape | Numbers / difficulty |
|---|---|---|---|
| 01 | saas-churn | business problem | percentages, ranges, a derived gap |
| 02 | marketing-campaign | results | decimals, currency (`$12`), thousands separator (`5,200`), `$40,000` present but unused |
| 03 | customer-research | qualitative-ish | counts embedded in sentences ("14 of the 20"), a quote |
| 04 | startup-strategy | strategy | currency ranges, "3 years", target count; three options to compare |
| 05 | ops-problem | operations | hours, a share, a multiple ("3 times") |
| 06 | hr-people | people | percentages, a day number, plain scores |
| 07 | product-launch | launch | **dates** ("January 15", "March 4"), a distractor ticket id (`#4471`) that must not become a fact |
| 08 | financial-case | business case | ₹ lakh amounts, decimals, a year payback, a loan rate |
| 09 | qualitative-story | story | **no digits at all**; the model must not introduce any |
| 10 | many-numbers | dense report | 14 usable numbers, a phone-like distractor (`555-0142`), ratios and decimals |

## Results

See `docs/ENGINE-ANALYSIS.md`, "Phase 2 Step 1", for the numbers. **LIVE CLAUDE RESULTS: none (no key).** MOCK results: 10/10 final valid, 6/10 first-pass valid, 0.5 repairs on average, by construction of the fixtures.

## Limitations to keep in mind

- **No live measurement.** Reliability is unknown until `node tests/ai/evaluate.mjs --live` is run with a key.
- **Grounding is lexical.** It checks that the digits exist in the cited paragraph, not what they mean. A true number attached to the wrong concept passes. Claims in words ("price is the main issue") are not verifiable.
- **Only paragraph-level sources** from text/markdown. No PPTX/PDF/DOCX parsing, no images.
- **Recipe rigidity limits storytelling.** Five recipes, fixed shapes (3 pillars, 3 moves, 3-beat gauge), unit symbols only as suffixes (currency ticks need `unit: ""` plus an axis label), `before`/`after` semantics of the gauge may be bent (target vs actual).
- **Text limits are tight** and are enforced by the schema; models will often exceed them on the first try (see the categories).
- Narrative quality, wording and cinematic pacing are not scored by any gate.


## Phase 5: live generation for arbitrary documents

The live path no longer needs a fixture and no longer refuses long documents: sources up to 60,000 characters use one call, longer ones use a map/digest/design strategy, and everything still passes the same validator, grounding and evidence gates with at most 3 repairs. The system prompt gained an **untrusted-source rule** and a **digest rule**; the source is fenced with a random per-run marker. The Claude client now has typed errors (auth, rate limit, server, network, timeout, context, client), a 300 s request timeout and bounded retries. Full description, call budget, security notes and the live evaluation harness: [LIVE-AI.md](LIVE-AI.md). Real-Claude results are not yet measured (no API key was available).


### Phase 6 notes

`runPipeline` now treats a non-numeric or out-of-range `maxRepairs` safely (default 3, never above 3; a bug where `NaN` produced zero attempts was found by the new tests and fixed). The documented call budget, the cost accounting and the adversarial tests are in [LIVE-AI.md](LIVE-AI.md). The prompt was not changed in this phase: no real-model failure justified it yet.
