# FilmDeck scene data contract

Rule that drives this document: **the generator must never invent numbers.** The reference scenes were written by hand, so content, data and rendering are interleaved in the same source. This document records where data actually enters each scene, which of it a storyboard must supply, and which of it a recipe supplies. It describes the existing decks; it does not change them.

Evidence: `decks/mba/scenes.js`, `decks/velcure/scenes.js`, their CSS, and the feature scan in this step. Scene ids: MBA `m1..m10`, Velcure `v1..v9`.

---

## 1. Classes of value found in a scene

Every literal in a scene falls into one of these classes. The class decides who owns it.

| Class | Meaning | Owner | Must carry a source reference? |
|---|---|---|---|
| **C1 Narrative text** | words the audience reads (titles, captions, labels, quotes, credits) | storyboard | for facts and names: yes |
| **C2 Source number (displayed)** | a figure shown to the audience, e.g. "7-8%", "35-60%", "4-5 exits" | storyboard (`dataUsed`) | **yes** |
| **C3 Source number (geometry)** | the numeric form of C2 that sets a size or position, e.g. a bar from 35 to 60 on a 0-60 axis | derived by the recipe from C2 | inherits C2 |
| **C4 Derived number** | computed from C2 (a difference, a ratio, a rotation angle from a value) | recipe computes, marks "derived" | inherits C2 |
| **C5 Structural count** | how many items exist (6 nodes, 3 pillars, 5 rows). Becomes data if it depicts a count in the source | storyboard if it means something, else recipe | if it depicts a source count: yes |
| **C6 Layout/animation constant** | pixel positions, durations, easings, particle settings, sound levels, colours, fonts | recipe | no |
| **C7 Decorative number** | a number shown for atmosphere that is not in the source (placeholder metrics, tickers) | **forbidden for sourced decks** | n/a |
| **C8 Randomness** | which items are picked/jittered/moved | recipe (but see section 4) | no |

The two "never" rules:
1. C2, C3, C4 never originate in generated scene code; they arrive as inputs.
2. C7 must not occur in generated decks. The references contain C7 (section 3).

---

## 2. Where data enters a scene in the current code

There is no data layer. Data appears in five forms:

1. **Template literals in `html()`**: text and attribute values typed inline (v4 `BLANKET 35–60% RAISE FOR EVERYONE`).
2. **Module-level constants** above `def`: arrays/objects holding labels and numbers (MBA `FW`, `TICK`, `S4.names`, `V9`; Velcure `R3`, `P7`, `L8`, `G2`, `NAMES`, `Q9`).
3. **Constants used for geometry** that silently embed data semantics: Velcure `X3(v)=620+v*18.5` (axis 0 to 60), `gpt(v)` angle = `v/15*PI`.
4. **Step bodies**: numbers and strings inside beat functions (v2 `to(o,{v:7.5})`, `r.rn.textContent='7–8%'`, `rotation:7.5*12`).
5. **`init`** populating hidden state and computed placement (v4 `PICK4` indexes).

A recipe-based scene must move 1 to 4 into an explicit `inputs` object (JSON-serialisable) and keep geometry formulas in the recipe.

---

## 3. Inventory by scene

"Provide" = what a storyboard would have to supply; "Recipe" = what stays in implementation.

### MBA

| Scene | Narrative text (C1) | Numbers | Notes |
|---|---|---|---|
| m1 | "Why MBA?", cycle words BUSINESS STRATEGY PEOPLE DECISIONS LEADERSHIP, "JUST A DEGREE", "So what is it really about?", particle words LEADERSHIP and MBA | none | all content words are inputs; the "not equal" sign is a recipe element |
| m2 | title; 6 node names (CUSTOMER centre, PRODUCT, MARKETING, OPERATIONS, FINANCE, PEOPLE), ring label STRATEGY, figure label, caption | none (radii and link lists are layout) | link pairs `S2L1/L2/L3` encode which parts connect: semantic, should be an input or recipe default |
| m3 | title; question "Should we launch?"; 5 branch labels; YES/NO; 16 micro labels; DECIDE./ACT.; caption | none | which branch is chosen (seed 1 = MARKET?) is a hardcoded narrative choice |
| m4 | title; stage words PROBLEM INSIGHT STRATEGY ACTION and their sublabels; 6 piece names | **C7**: `12,480 ROWS`, `NPS 31`, `+14% YOY`, `3 NEW ENTRANTS`, `ATTRITION 18%`, `₹4,200 CR TAM` | invented placeholder metrics; for a sourced deck each must be replaced by a source value or removed |
| m5 | title; 6 roles with colours and quotes; chip words (DISCUSSION NEGOTIATION CONFLICT; COLLABORATION LEADERSHIP PRESENTATION); equation text | none | which actors conflict (`P5T` pairs) is a narrative choice |
| m6 | title with accent "LEAD."; MANAGE; 4 labels VISION DECISION EXECUTION ACCOUNTABILITY; final lines | team size 12 (C6) | |
| m7 | title; 5 forces (AI, GLOBALISATION, NEW BUSINESS MODELS, ECONOMIC SHIFTS, CUSTOMER BEHAVIOUR) mapped to 5 lenses; THINK. ADAPT. RESPOND. | **C7**: 16 ticker strings (`AI ADOPTION +72%`, `TARIFF +25%`, `USD/INR 83.9`, `CAC ×2.1`, `MARGIN −6.4%`, `D2C +38%`, `GIG WORK +22%`, `EV SHARE 18%`, `RATE CUT −25BPS`, `CHURN 9.3%`, `UPI 13B TXNS`, `DEMAND −11%`, `QUICK COMMERCE ×4`, ...) | decorative noise with realistic-looking numbers |
| m8 | title; classroom stages (Case study, Discussion, Decision, Execution); 5 real-world cards (MARKET ANALYSIS, STRATEGY MEETING, PRODUCT DECISION, CUSTOMER, BOARD PRESENTATION); caption | **C7**: `+12.4% QoQ`, `TIER-2 DEMAND`, `Q3 plan`, `5 OF 6 AGREE`, `LAUNCH: OFF/ON`, `PILOT · 3 CITIES`, `CSAT 4.6`, `412 RESPONSES`, `Approved`, `BUDGET ₹18 CR`; bar heights `[48,72,96,128]`; chart series random | invented placeholder figures |
| m9 | question; 6 orb names; final words CAPABILITY, IMPACT | note frequencies (C6) | |
| m10 | 2 lines; THINK. ADAPT. LEAD.; MBA; MORE THAN A DEGREE. | none | |

**Finding:** MBA is a conceptual deck, so its fake figures are illustrations. Three recipes (4, 8, 9) currently embed C7 values. The recipe inputs must make those fields explicit (`metric` strings are optional and default to none) so a sourced deck cannot ship placeholder numbers.

### Velcure

| Scene | Narrative text (C1) | Source numbers (C2) | Geometry/derived | Notes |
|---|---|---|---|---|
| v1 | kicker, 3 title lines, "HRM CASE STUDY · GROUP 7", 9 names, counter label "EXITS IN A SINGLE MONTH" | counter ends at **12** (chosen: `idx.length<12`) | grid 15 x 7 = 105 figures (C5/C6) | the 12 is consistent with the "10 to 12 exits" figure in v2 but is **not tied to it in code**: a storyboard must feed it |
| v2 | title; labels BEFORE/NOW; "MORE THAN DOUBLED"; "FUNCTIONS IMPACTED"; SALES #1 HIGHEST EXITS; MANUFACTURING #2 SECOND HIGHEST; source note | "7–8%" (before rate), "~10%" (now rate), "4–5 exits a month", "10–12 exits a month" | scale 0 to 15 (C6); needle rotation `7.5*12`, `10*12` (C4: degrees = value x 12); icon rows `figs(5,1)` and `figs(12,2)`: n and hollow count are C5 tied to the ranges | "more than doubled" is a derived claim (C4) that the code states as text |
| v3 | title; 3 row labels; annotations; 2 cards; PRIMARY ISSUE / COMPENSATION / "Pay competitiveness. Not culture." | ranges **35–60**, **15–20**, **8–10** (percent); "GAP OF 15+ POINTS" | `X3(v)=620+v*18.5` on 0 to 60; gap bracket from 20 to 35 | "15+" is derived (35 - 20); the 20 and 35 are the range edges; the label is hand-typed |
| v4 | title; NO.; "Not universally."; "BLANKET 35–60% RAISE FOR EVERYONE"; tags; 3 levers; GOAL text | 35 to 60 (C2) | grid 10 x 6 = 60 (C6); `PICK4` 9 highlighted (C5, not data); meter heights 300 (budget), 210 (current), 530 (blanket), 512, 262 (targeted) are **pixel metaphors** | bar heights imply relative cost with no source numbers: they read as data. Treat as C7-like unless labelled qualitative |
| v5 | title; 3 headings; 3 captions; evidence line | none | | |
| v6 | title; two columns with items, chips; closing lines | none | hole heights `.62 .44 .28 .13`, inflow rates are C6 | the leak sizes visually rank exit causes but carry no source data |
| v7 | title; 3 pillars with 3 items each; roof label | none | | |
| v8 | headline; sub; 3 moves; 5 checklist items | "35–60%" inside a list item | | |
| v9 | 2 serif lines (+ highlighted range), REASONS TO STAY., credits, "Thank you." | none | | |

**Finding:** Velcure shows the right pattern for C2/C3/C4 in v2 and v3: a numeric used for geometry next to a separately typed display string. The recipe interface should require both (`value` and `display`).

---

## 4. Colours, timing, sound, notes

- **Colours:** tokens in CSS plus hard-coded hex/`rgba` in SVG, canvas and `FX`. Per-item colours (pillar colours `P7`, role colours `P5`, force colours `FWC`) are chosen by hand: C6, but *meaningful* colour (alarm red for negatives, ember accent, signal teal secondary) follows the kickoff palette semantics. A recipe input should accept a **semantic** colour (`accent | secondary | negative | neutral`) rather than hex.
- **Timing:** all durations, staggers and positions are literals in step functions (C6). They stay in the recipe.
- **Sound:** `sfx` calls with frequencies/levels are literals (C6). Notes used as pitch are musical, not data (m9 `NOTES`, v5 chimes).
- **Beat text / speaker notes:** **none exist in the code.** The kickoff storyboard has `notes` per beat; the runtime has no field for it. UNRESOLVED where notes live at runtime.
- **Randomness:** C8 values (which figures leave in v1, tree growth in m3, ticker words in m7) are re-rolled on replay. A narrative choice made by chance (which 12 figures leave) is harmless; a choice that carries meaning (m3 branch index) is hard-coded, which is correct.

---

## 5. What a storyboard must provide vs what a recipe provides

### A. Storyboard provides (content and data)

1. Deck: title, subtitle, credits, intro paragraph, theme id (only one exists), scene order, language.
2. Per scene: `id`, `chapter`, `recipe` id, `letterbox`, `mood` (mapped to `[level, cutoff]`), title/kicker text.
3. Per beat: on-screen strings (labels, captions), speaker notes, sound intent if non-default.
4. All **source numbers** with `sourceRef`, each displayed form (C2), and flags `derived: true` for C4. This is exactly Appendix C `dataUsed`.
5. Semantic roles for items (which is "negative", which is "accent").
6. Lists the recipe iterates over (nodes, pillars, rows, cards, roles) and any relation lists (link pairs, conflict pairs, mappings).
7. Choices with narrative meaning (which branch is chosen, which items are highlighted and why).

### B. Recipe provides (implementation)

1. All geometry and scales (one linear scale per axis, tick placement, needle angle).
2. Layout coordinates, font sizes, safe-area fitting for the given text lengths (UNRESOLVED: the references hand-tune; fitting is not implemented).
3. Animation timelines, easing, stagger, durations, number of beats per item count.
4. Sound design (which `sfx`, which level), particle mode and mix, `mood`.
5. State handling (`s.st`), `frame()` simulation, `loop()` registration, replay safety.
6. Defaults for C7-prone slots (omit when not supplied).

### C. Validation a generator pipeline can apply without understanding the scene

- Every digit sequence in the generated JS, CSS and HTML must trace to a storyboard value, a documented C6 constant of the recipe, or a layout number. (A static scan for digits near the characters `%`, `×`, `+`, `₹`, `$`, `,` followed by digits would have caught every C7 item above.)
- Every string shown on screen must be present in the storyboard (`onScreen`) or a recipe constant.
- Number of `steps` equals number of storyboard beats.
- UNRESOLVED: how to treat decorative counts that look like data (v4 meter heights, v6 hole sizes, v2 bar lengths). Proposed rule for the next step: such visuals are only used when the storyboard marks the idea qualitative, and never labelled with numbers.

---

## 6. Minimum per-recipe input shape

Not implemented. This is the smallest shape the evidence supports; each recipe's real inputs are listed in `engine/recipes/registry.json`.

```json
{
  "scene": {
    "id": "s3", "chapter": "WHY THEY LEAVE", "recipe": "range-bar-chart",
    "letterbox": false, "mood": "tense",
    "title": { "kicker": "Scene 03 · The cause", "text": "WHY ARE EMPLOYEES LEAVING?" },
    "inputs": {
      "axis": { "min": 0, "max": 60, "unit": "%", "ticks": [0,10,20,30,40,50,60] },
      "rows": [ { "label": "SWITCH TO A COMPETITOR", "lo": 35, "hi": 60, "role": "negative", "display": "35–60%" } ],
      "verdict": { "word": "COMPENSATION", "sub": "Pay competitiveness. Not culture." }
    },
    "beats": [ { "n": 1, "onScreen": [], "notes": "..." } ],
    "dataUsed": [ { "value": "35–60%", "sourceRef": "p.3", "derived": false } ]
  }
}
```
