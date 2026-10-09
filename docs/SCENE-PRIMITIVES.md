# FilmDeck scene primitives

Recurring visual and motion building blocks found by comparing `decks/mba/scenes.js` and `decks/velcure/scenes.js`. A **primitive** is smaller than a recipe: recipes (see `engine/recipes/registry.json`) are whole scenes built from several primitives.

Nothing here is implemented as new code. Evidence is by scene id (MBA `m1..m10`, Velcure `v1..v9`) and was found by reading the code; counts of scenes using each primitive come from the feature scan in this step.

Legend for "boundary": **runtime** = would be shared helper code later; **recipe** = lives inside a recipe; **pattern** = copied idiom, no shared code yet. "Becomes recipe?" refers to the 19-recipe taxonomy.

---

## A. Text and typography

### P1. Kinetic title (kicker + masked word title)
- **Says:** "this scene's idea" in one line.
- **MBA:** m2 to m9 (via `titleHTML` + `titleIn`). **Velcure:** v2 to v7.
- **Inputs:** kicker text, title text, optional accent word (`slot`).
- **Boundary:** already runtime (`titleHTML`, `prepTitle`, `titleIn`).
- **Recipe?** No, universal. **Limits:** kicker numbering is typed by hand; no HTML escaping; the accent `slot` is used by one scene (m6).

### P2. Slam word (scale 2.4 and blur 24 px to rest, `expo.in`, then boom + shake + flash)
- **Says:** a verdict or decisive word. Used on the climax of a beat.
- **MBA:** m3 DECIDE/ACT, m4 ACT, m7 THINK/ADAPT/RESPOND, m10 THINK/ADAPT/LEAD. **Velcure:** v3 COMPENSATION, v4 NO., v8 SALARY WAR, v6 closing line.
- **Inputs:** word, colour, position, size, sound level.
- **Boundary:** pattern (about 8 copies of the same tween). Strong candidate for a runtime helper later.
- **Recipe?** No. **Limits:** the helper would need a stable way to pass `ease` and shake size.

### P3. Character-by-character line (`splitChars` then blurred fade-in with stagger)
- **Says:** a quiet spoken line or caption.
- **MBA:** m1, m8 caption, m9 question, m10 lines. **Velcure:** v1 title, v8 headline, v9 lines.
- **Inputs:** text, stagger, per-character emphasis range (v9 highlights "reasons to stay").
- **Boundary:** `splitChars` is runtime; the tween is a pattern. **Limits:** `splitChars` drops inline markup; m9 and v9 hand-patch around it.

### P4. Word scramble and lock
- **Says:** a concept resolving from noise.
- **MBA:** m1 (cycle of 5 words). **Velcure:** none.
- **Boundary:** pattern, one scene. Becomes part of recipe 1.

### P5. Title morph into the title slot
- **Says:** a word becomes part of the headline.
- **MBA:** m6 (LEAD. flies into the title). **Velcure:** none.
- **Boundary:** pattern, one scene, depends on `getBoundingClientRect` and `SC`. Not in the 19; candidate sub-recipe.

### P6. Serif quiet line / closing shimmer word
- **Says:** the takeaway; stillness.
- **MBA:** m10. **Velcure:** v9.
- **Inputs:** two lines, giant word, caption(s), optional emphasis range, sound notes.
- **Boundary:** identical structure in both decks. Becomes recipe 19. **Limits:** radial light, shimmer gradient (`background-position` loop), `FX.S.gain -> 0` and `SND.mood(.22,180)` are all part of it.

### P7. Counter / number readout tweened from 0
- **Says:** a quantity growing or arriving.
- **Velcure:** v1 (integer exits counter, set in `tl.call`), v2 (needle readout, tweened object, final text replaced by the source string "7-8%", "~10%"). **MBA:** none (m4 and m8 show static metric strings).
- **Inputs:** target value(s), display string(s), label.
- **Boundary:** pattern. **Limits:** v2 separates the animated number from the quoted display text, which matters for the data contract.

---

## B. Charts and quantitative visuals

### P8. Draw-on stroke (`pathLength=1`, `strokeDashoffset` to 0)
- **Says:** a connection or path being established.
- **MBA:** m2, m3, m4, m5, m7, m8, m9. **Velcure:** v2, v5, v8. Nearly every SVG scene.
- **Boundary:** pattern, trivial; a one-line helper later.

### P9. Gauge (arc, ticks, needle, readout)
- **Says:** a rate moving from a before value to an after value.
- **Velcure:** v2 (scale 0 to 15, needle `rotation = value * 12`). **MBA:** none.
- **Inputs:** scale min/max, tick spacing, before/after values, band regions, display strings, label, colour change on "after".
- **Boundary:** recipe 11. **Limits:** needle angle formula assumes a 180 degree sweep and a 0-based scale.

### P10. Range bar on a shared linear scale (solid floor + hatched range, value label)
- **Says:** values compared to scale, including uncertainty ranges.
- **Velcure:** v3 (`X3(v)=620+v*18.5`). **MBA:** none.
- **Inputs:** axis min/max, per-row label, low, high, colour, annotations (gap bracket between two values).
- **Boundary:** recipe 13. The only reference for "charts drawn to scale". **Limits:** one scale per chart; hatching shows a range, not an error bar.

### P11. Bar meter against a budget line
- **Says:** cost or quantity vs a limit.
- **Velcure:** v4 (bar up to a "sustainable budget" line, overshoots, then settles under it).
- **Inputs:** bar values, limit, labels. **Limits:** pixel heights in the reference are metaphor values (see data contract).
- **Boundary:** part of recipe 14.

### P12. Ranked horizontal bars (full-width, labelled)
- **Says:** rank order only.
- **Velcure:** v2 beat 5 ("functions impacted": SALES #1, MANUFACTURING #2, bar lengths not data).
- **Boundary:** part of recipe 12. **Limits:** bar length is decorative; only rank is data.

### P13. Live noise series (scrolling polyline)
- **Says:** market noise or a live dashboard.
- **MBA:** m7 (5 series), m8 (market chart card).
- **Boundary:** pattern inside two recipes; random-walk driven.

### P14. Mini dashboard cards (header, small visual, big figure)
- **Says:** "real world" artefacts: analysis, meeting, decision toggle, feedback, board.
- **MBA:** m8 (5 cards).
- **Boundary:** part of recipe 9. **Limits:** card figures are placeholders (see data contract).

---

## C. People and relationship visuals

### P15. People grid (rows of figure glyphs; some highlighted or removed)
- **Says:** a workforce; attrition; targeting.
- **Velcure:** v1 (canvas 15 x 7, 12 exit), v4 (SVG 10 x 6, scanner picks 9). **MBA:** none (m5 and m6 draw figures but not as a grid).
- **Inputs:** rows, columns, which cells change state, state colours, counter label.
- **Boundary:** two implementations (canvas, SVG) of the same idea; recipes 2 and 14.
- **Limits:** counts imply data (see contract); glyph is `FIG` in Velcure.

### P16. Icon row (n figures, k hollow)
- **Says:** a count with a hollow part, a range like "4 to 5".
- **Velcure:** v2 beat 4 (`figs(5,1)`, `figs(12,2)`). 
- **Boundary:** recipe 12. **Limits:** hollow figures encode the lower bound of a range; n is a semantic number.

### P17. Orbit of characters with speech bubbles
- **Says:** perspectives around a decision-maker.
- **MBA:** m5 (6 roles plus YOU, bubbles, conflict zigzags, collaboration curves with sparks).
- **Boundary:** recipe 6. **Limits:** positions are hand-placed; six actors fixed.

### P18. Walking team and camera dolly
- **Says:** a team following a leader.
- **MBA:** m6 (canvas pseudo-3D, 12 followers, leader lit).
- **Boundary:** part of recipe 7; bespoke canvas projection.

---

## D. Networks, trees and structure

### P19. Node network (centre + rings + links + packets)
- **Says:** a system whose parts connect.
- **MBA:** m2 (6 nodes, 3 link sets, packets along links), m9 (6 orbs connecting one by one).
- **Inputs:** node labels, ring assignment, link pairs, centre label, caption.
- **Boundary:** recipe 3 (m2) and recipe 10 (m9); shared pieces: SVG link draw-on, packet circles moved in `frame()`.
- **Limits:** coordinates are precomputed from radii and angles per scene.

### P20. Branching tree simulation
- **Says:** a growing decision space.
- **MBA:** m3 (canvas sim with segment lifetimes; ends in one lit path).
- **Boundary:** recipe 4; bespoke, time-dependent (uses `NOW()` and an `INSTANT` pre-roll).

### P21. Pillars + roof
- **Says:** a strategy supported by parts.
- **Velcure:** v7 (3 pillars rise by clip-path, pediment drops).
- **Inputs:** pillar headings, 3 items each, colours, roof label.
- **Boundary:** recipe 17; simplest recipe in the set (about 2 KB of JS).

### P22. Emblem trio (three animated symbols with caption)
- **Says:** three qualities, each with a metaphor icon.
- **Velcure:** v5 (boomerang loop, stairs climb, pulsing star).
- **Boundary:** recipe 15. **Limits:** the three emblems are bespoke SVG; swapping them needs new art.

### P23. Framework grid (rows of force and lens, drawn on)
- **Says:** order replacing chaos.
- **MBA:** m7 final beat.
- **Boundary:** part of recipe 8.

### P24. Interlocking puzzle pieces
- **Says:** disparate parts forming a whole, then a process.
- **MBA:** m4 (6 pieces, CSS 3D scatter then lock, beam through PROBLEM/INSIGHT/STRATEGY/ACTION).
- **Boundary:** recipe 5; `piecePath` generates jigsaw tabs.

---

## E. Space, transitions inside a scene and metaphors

### P25. Leaking tank
- **Says:** exits drain, retention plugs, recruitment refills.
- **Velcure:** v6 (canvas fluid level, holes, plugs, inflow).
- **Boundary:** recipe 16; bespoke simulation.

### P26. Two-world wipe (light seam)
- **Says:** change of context.
- **MBA:** m8 (clip-path inset on two layers).
- **Boundary:** recipe 9.

### P27. Camera zoom on SVG group
- **Says:** the picture getting bigger.
- **MBA:** m2 (scale 3.2 to 1 around the centre, `svgOrigin`), m4 (group scales to fit).
- **Boundary:** pattern.

### P28. Shatter and reform
- **Says:** old idea broken, new idea emerges.
- **MBA:** m6 (word cut into 36 triangles, random 3D flight).
- **Boundary:** part of recipe 7.

### P29. Strike-through headline
- **Says:** rejecting an idea.
- **Velcure:** v8 (SVG strike path draws across the words).
- **Boundary:** recipe 18.

### P30. Checklist that ticks off
- **Says:** the recommendation list.
- **Velcure:** v8 beat 4 (5 rows, bullet fills with `snap` sound).
- **Boundary:** part of recipe 18.

### P31. Dim the diagram, reveal one big word
- **Says:** the conclusion of an analysis.
- **Velcure:** v3 (diagram to 7 percent opacity, COMPENSATION slams in), v4 (GOAL statement). **MBA:** m3 (tree to 28 percent, DECIDE).
- **Boundary:** pattern; recurring beat shape, not in the 19.

---

## F. Atmosphere

### P32. Shared particle field with per-scene mood
- **Says:** the world around the scene; also forms text and explodes.
- **MBA and Velcure:** every scene (`enter` sets mode and mix). Active uses: text forming (m1, m9), vortex (m9), chaos (m7), flow (m4, m8, v3), grid targets (m7), bursts on impacts (m1, m2, m4, m6, m9, v1, v5, v7).
- **Boundary:** runtime (`FX`). **Limits:** state leakage across scenes; unseeded.

### P33. Letterbox open/close
- **Says:** film opening and ending.
- **MBA:** m1, m10. **Velcure:** v1, v9.
- **Boundary:** runtime flag `letterbox`.

### P34. Sound motifs
- **Says:** consistency of feel.
- **Pattern in references:** boom plus shake plus flash for an impact; chimes at 220 to 523 Hz for a reflective line; riser before a build; `snap` on lock/tick-off; `blip` rising pitch per node/figure; `tick` rising pitch per list item.
- **Boundary:** pattern; documentation in the recipes.

---

## Primitive to recipe map

| Primitive | Recipes it appears in |
|---|---|
| P1 title, P2 slam, P3 chars, P33, P32, P34 | all |
| P4 scramble | 1 |
| P5 title slot morph | 7 |
| P6 close | 19 |
| P7 counter | 2, 11 |
| P8 draw-on | 3, 4, 5, 6, 8, 9, 10, 11, 15, 18 |
| P9 gauge | 11 |
| P10 range bars | 13 |
| P11 meter vs budget | 14 |
| P12, P16 | 12 |
| P13 noise series | 8, 9 |
| P14 cards | 9 |
| P15 people grid | 2, 14 |
| P17 orbit | 6 |
| P18, P28 | 7 |
| P19 network | 3, 10 |
| P20 tree | 4 |
| P21 pillars | 17 |
| P22 emblems | 15 |
| P23 framework | 8 |
| P24 puzzle | 5 |
| P25 tank | 16 |
| P26 wipe | 9 |
| P27 camera zoom | 3, 5 |
| P29, P30 | 18 |
| P31 dim and reveal | not in the 19 (appears in 4, 13, 14) |

## Observations

1. **Cheapest to extract first:** P2 slam, P3 character lines, P8 draw-on, P6 close (identical in both decks), P21 pillars, P1 title (already runtime).
2. **Hardest and most bespoke:** P20 tree, P18 team dolly, P25 tank, P14 cards; these are one-off simulations and should stay "reference code to adapt", not parameterised recipes.
3. **Missing from the library** (no reference exists): timeline/roadmap, side-by-side comparison, quote/testimonial, KPI big number, general time-series line chart, map. These are gaps, not tasks for this step.
