# FilmDeck recipes

`registry.json` is the machine-readable taxonomy of the 19 scene recipes, filled from evidence in the two reference decks (`decks/mba`, `decks/velcure`). It lists, per recipe: purpose, when to use, input fields, typical beat count, reference scenes, determinism, audio and particle use, reuse readiness, and the primitives (`docs/SCENE-PRIMITIVES.md`) it is built from.

## Parameterised recipes (generator-ready)

Five recipes have renderers and are used by `tools/generate-deck.mjs`. Each is three files: `<id>.mjs` (metadata, JSON-Schema for inputs, beat count, semantic checks), `<id>.scene.js` and `<id>.scene.css` (real code adapted from the reference scene; placeholders `__SID__ __P__ __C__ __CHAPTER__ __MOOD__ __LETTERBOX__ __DATA__`). `_lib.mjs` has the shared helpers, `index.mjs` the list.

| Recipe | Adapted from | Beats | Required inputs | Optional |
|---|---|---|---|---|
| `gauge-needle` | Velcure s2 beats 1-3 | 3 | `scale{min,max,majorStep}`, `before{fact}`, `after{fact}`, `labelBefore`, `labelAfter` | `scale.minorStep`, `scale.unit`, `afterTone`, `caption` |
| `range-bar-chart` | Velcure s3 | 3 to 5 | `scale{min,max,majorStep}`, `rows[1-4]{label,value{fact}}`, `verdict{kicker,word,sub}` | `scale.step/unit`, `axisLabel`, `rows[].tone`, `gap{from,to,value{fact},prefix}`, `cards[0-2]` |
| `pillars-roof` | Velcure s7 | 5 | `roofLabel`, `pillars[3]{heading,items[1-3]}` | `pillars[].tone` |
| `strike-three-moves-checklist` | Velcure s8 | 4 | `headlineLead`, `headlineStruck`, `sub{lead,accent}`, `moves[3]{head,text}`, `checklist[3-5]` | none |
| `minimal-close` | Velcure s9 (same as MBA s10) | 3 | `line1`, `line2`, `bigWord` | `variant open\|close`, `emphasis`, `caption`, `thanks` |

Rules every recipe follows:
- **Inputs are declarative data.** Numbers are never typed into inputs: a number the audience sees comes from a storyboard fact, referenced as `{"fact": "id"}`. The renderer receives the resolved fact (`display`, `lo`, `hi`, `v`, `sourceRef`) and never invents a value. Scale declarations (`scale{min,max,...}`) are the only numbers authored inside inputs; they set geometry and the tick labels shown on the axis, and facts must lie inside them.
- **Tones, not colours.** `accent | secondary | neutral | negative | positive`, mapped to design tokens.
- **Text limits** are enforced by the schema so text fits the 1920x1080 layouts that were hand-tuned in the references.
- Beat count is computed from the inputs and must equal the number of storyboard beats.

Example (gauge):
```json
{ "recipe": "gauge-needle", "inputs": {
  "scale": { "min": 0, "max": 15, "majorStep": 5, "minorStep": 1, "unit": "%" },
  "before": { "fact": "churn-before" }, "after": { "fact": "churn-now" },
  "labelBefore": "MONTHLY CHURN · BEFORE", "labelAfter": "MONTHLY CHURN · NOW", "afterTone": "negative" } }
```
A full working storyboard is `examples/generated-demo/storyboard.json`.

Known limitations of the parameterised set:
- `gauge-needle`: 180 degree sweep, one gauge per scene, needle starts at the scale minimum; the "before" band is a fixed-width arc around a single value. The reference layout (gauge on the left with icon rows on the right) is not reproduced: the recipe centres the gauge.
- `range-bar-chart`: 1 to 4 rows; the gap bracket needs two adjacent rows; value labels must fit left of x=1810 (the validator rejects scales that leave no headroom); no negative axis support was tested.
- `pillars-roof`: exactly 3 pillars with 1 to 3 short items each.
- `strike-three-moves-checklist`: fixed 3 moves; the strike-through is a scaled bar (the reference's dashed SVG strike renders as dashes, a defect in the reference deck that was not carried over).
- `minimal-close`: used for both the opening (`variant: open`, particles kept) and the close; very long words need the 16 character limit.
- All five were built for the single `ink-ember` theme and inherit the hand-tuned absolute layouts of the references; text that fits the schema limits fits the layout, but this is verified only on the demo and by schema limits, not by an automatic overflow fitter.

## Honest status

- All 19 recipes are **demonstrated**: a complete working scene exists in a reference deck for each.
- **Five are parameterised** (see above); the other 14 are not. For those, content is hardcoded inside each reference scene. `inputs` in the registry is the list of fields a future recipe template would need, derived by reading each scene's constants and strings. It is not enforced anywhere.
- `implementationStatus` is `parameterised` for the five above and `reference-code-only` for the rest: the "recipe" is the reference scene to copy and adapt.
- Reuse readiness: **high** (10, 11, 12, 13, 17, 18, 19), **medium** (1, 2, 3, 5, 6, 14, 15), **low** (4, 7, 8, 9, 16). Low means bespoke simulation: copy and edit, do not try to parameterise.
- Recipes 11 and 12 live in one reference scene (Velcure s2). Recipe 19 appears in both decks.
- Nothing from the kickoff's 19 was found missing, and nothing was found that is only taxonomy.
- Patterns seen in the references but not in the 19 are in `candidatesNotInTaxonomy`; visual types with no reference at all are in `gapsNoReference`.

## Data rules

See `docs/SCENE-DATA-CONTRACT.md`. In particular MBA recipes 4, 5, 8 and 9 contain invented placeholder numbers; their `inputs` must treat metric strings as optional.

## Where the code is

Scene source: `decks/<deck>/scenes.js` (+ `scenes.css`). The recipe examples are those scenes; nothing was copied or duplicated into this folder.
