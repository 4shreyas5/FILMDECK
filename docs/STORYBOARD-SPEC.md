# FilmDeck storyboard specification

A storyboard is a **declarative JSON document**: text, facts and recipe inputs. It never contains JavaScript, HTML, CSS or any scene implementation. The generator turns it into a deck; the validator decides whether it is allowed to.

- Schema: `schemas/storyboard.schema.json` (JSON Schema, keyword subset implemented by `tools/schema-lite.mjs`, no dependencies).
- Validator: `node tools/validate-storyboard.mjs <storyboard.json>` (exit code 1 on any error).
- Generator: `node tools/generate-deck.mjs <storyboard.json>`.
- Working example: `examples/generated-demo/storyboard.json` (a fictional, labelled demo).

## Shape

```
{ storyboardVersion: 1,
  deck:    { id, title, titleAccent?, subtitle, intro, audience?, credits?[], language?, theme?, fictional?, properNouns?[] },
  sources: [ { id, kind, label, locator? } ],
  facts:   [ { id, kind: "number"|"range", value: number | {lo,hi}, display, unit?, sourceRef?, evidence?, derivation?{op,of[]} } ],
  scenes:  [ { id, chapter, kicker, title?, idea?, visualDirection?, recipe, mood, letterbox?, inputs{}, beats:[ {n, notes, summary?} ] } ] }
```

| Field | Meaning |
|---|---|
| `deck.title / subtitle / intro` | Intro screen copy. `titleAccent` is a word inside the title shown in the accent colour. |
| `deck.fictional` | Must be `true` if any source has `kind: "fictional"`; then subtitle or intro must say "fictional" or "demo". |
| `deck.properNouns` | Names that contain digits (for example a team name). They are exempt from the number scan and must appear verbatim elsewhere. |
| `sources` | What facts come from: `slide`, `page`, `document`, `table`, `note`, `brief`, `fictional`. |
| `scene.id` | Storyboard id (unique). The generated deck uses positional section ids `s1..sN`; the mapping is stored in `deck.json`. |
| `scene.chapter` | HUD label, e.g. "THE PROBLEM". `kicker` is the small line above the title ("Scene 02 · The problem" is generated). |
| `scene.recipe` | A parameterised recipe id (see `engine/recipes/registry.json`, `parameterised: true`). |
| `scene.mood` | `quiet | calm | tense | rising | triumphant`, mapped to pad level and cutoff: quiet [0.5, 240], calm [1, 500], tense [1, 650], rising [1.1, 700], triumphant [1.2, 900] (a proposal derived from the references). |
| `scene.letterbox` | Optional intent override; default is the recipe's (`minimal-close` is letterboxed). |
| `scene.idea / visualDirection / beat.summary` | Author-facing intent. Never displayed. Numbers in them only produce warnings. |
| `beats[].notes` | **Speaker notes** (required for every beat). Never displayed; preserved in `deck.json` and `window.__filmdeckMeta`. |
| `scene.inputs` | The recipe's declarative inputs; validated against the recipe's own schema. |

The number of `beats` must equal what the recipe produces for the given inputs (for example `gauge-needle` always 3, `range-bar-chart` 3 to 5 depending on rows, gap and cards).

## Number provenance (hard rule)

> The generator never invents factual numbers.

1. A number shown or spoken to the audience exists exactly once, as a **fact**: `{ id, kind, value, display, sourceRef }`. `display` is the exact string shown (`"72%"`, `"20–30%"`).
2. Recipe inputs refer to facts with `{ "fact": "id" }`. Inputs have no numeric fields for business values; the recipe receives the resolved fact. Missing or unknown facts fail validation, and no recipe fabricates a placeholder.
3. **Derived facts** (a gap, a ratio, a sum) carry `derivation: { op: diff|ratio|sum, of: [factIds, or "id.lo"/"id.hi" for range edges] }`. The validator recomputes the value and fails on mismatch. A derived fact does not need its own `sourceRef`; its sources are those of its inputs. A derived fact cannot derive from another derived fact.
4. Every fact needs a `sourceRef` that exists in `sources`, unless derived.
5. **Evidence (Phase 3).** Every non-derived fact also carries `evidence`: an exact, unbroken quote (3 to 300 characters) from the source section named by `sourceRef`, containing the fact's number. The AI pipeline gate (`groundCheck`, with a source) enforces: the quote is a substring of that section (runs of whitespace collapse on both sides, nothing else; case and wording must match), it contains every number of `display`, and a quote found only in another section is reported as such. Nothing generates the quote on the model's behalf. `validate-storyboard.mjs` alone has no source and only checks the schema bounds; the full check runs in `generate-storyboard`, in `filmdeck` and in browser QA (when `source.json` is present). This is still lexical grounding: it proves where the number came from, not that the sentence means what the slide claims.
5. `display` must visibly carry the value (a warning otherwise).
6. **Scale declarations** (`scale { min, max, majorStep, ... }` in chart recipes) are layout geometry authored in the storyboard. The tick labels they produce are the only generated numbers the audience sees besides facts, kicker numbering (`Scene 02`) and recipe index labels (`PILLAR 01`, `MOVE 01`). Facts must lie inside the declared scale.
7. **Number scan.** Every digit sequence in on-screen text (deck copy, chapter, kicker, title, every string in `inputs`) **and in speaker notes** must be a whole numeric token that appears in some fact `display` (so "3" is not accepted because "30%" exists). Violations are errors. In `idea`, `visualDirection` and `beat.summary` they are warnings. Number words ("three", "double", "percent", ...) produce warnings so a human can confirm they are structural or sourced.
8. After generation, QA re-checks the **rendered DOM** at the end of every scene: each visible number must trace to a fact display, a declared axis tick, a kicker or a recipe index label (`deck.json.allowedNumberStrings`).

## No code in a storyboard

The schema forbids unknown keys (so `html`, `js`, `css`, `style`, `onclick` and similar are rejected wherever they appear) and the validator rejects strings containing `<` or `>`, backticks, `${`, `javascript:`, arrow functions, `function(`, `eval(`, `document.` or `window.`, control characters, and the em-dash (product rule). Generated scene code embeds all text as JSON data and HTML-escapes it at render time.

## Traceability in the generated deck

`generated/<deck>/deck.json` and `window.__filmdeckMeta` (inside the deck, not displayed) contain, per scene: recipe, mood, letterbox, every beat's `notes` and `summary`, `sourceRefs` (each fact used, its display and `sourceRef`, plus `derivedFrom`), and the sources involved. `deck.json.generator.storyboardSha256` ties a deck to the exact storyboard.

## Limits and known gaps

- Only the five parameterised recipes can be used.
- The no-invented-numbers check is digit-based. A false claim written in words ("most riders", "nearly doubled") cannot be verified by the validator; it only warns on number words.
- `sources` are labels. The validator does not check them against an uploaded document (no parsing exists yet).
- Text length is limited by schema maximums per field. There is no automatic text fitting.
- Up to 12 scenes; digit keys jump only to scenes 1 to 9 (N and P work for all).
