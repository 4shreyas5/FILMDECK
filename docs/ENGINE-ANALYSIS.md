# FilmDeck engine analysis

Reverse-engineering report on the two reference decks. Analysis only: nothing in `reference/` was changed and no engine, generator or app code was written.

- Files studied: `reference/mba-film.html` (1098 lines, 102,767 bytes), `reference/velcure-film.html` (831 lines, 77,270 bytes), `cto-kickoff-prompt.md` (product spec).
- Method: full read of both files, line-by-line `diff` of the shared regions, then both decks were driven in headless Chromium (Playwright, GSAP 3.12.5 from the CDN) at 1920x1080: every beat forward, every beat back, rapid-fire clicks, scene jumps, keyboard and mouse input, three viewport sizes, reduced-motion, CDN-blocked and fonts-blocked loads, and screenshots of each scene's final state. The test scripts live in the session scratchpad, not in the repo. Results are in section 15.
- Labels: **[verified]** = observed by running the decks. **[code]** = established by reading the code only. **[uncertain]** = could not be established; stated as such.

---

## 0. Headline findings

1. **The runtime is already extracted, by copy-paste.** Between the two decks the audio, particles, helpers, scene registry, beat engine, stage scaling, HUD, grain, input and boot code are **byte-identical** (`diff` shows only two differences: a one-line `FIG` constant that is Velcure scene data, and the digit-key regex `0-9` vs `1-9`). The CSS from line 1 to 76 (tokens, stage, HUD, intro, help, shared typography) is identical apart from the `<title>`. The HTML shell is identical apart from the intro copy, the list of `<section>` elements and one help line.
2. **Size split.** Runtime is about 29 KB (CSS 5.4 KB, HTML shell 2.2 KB, JS 14.0 KB + 7.1 KB engine/input). Scene code is 61.6 KB (MBA) and 42.9 KB (Velcure), plus about 12.5 KB of scene CSS each. So the runtime is 28% of the MBA file and 38% of the Velcure file, and a generated scene averages roughly 4 to 7 KB of JS plus about 1.3 KB of CSS.
3. **Both decks run clean.** No console errors or page errors in either deck across the whole forward/back walk [verified].
4. **The spec's beat counts do not match the files.** MBA has **50** beats (kickoff says 52); Velcure has **43** (kickoff says 41) [verified via `__deck.SL`]. Treat the files as truth.
5. **The decks are not valid standards-mode HTML.** Neither has a doctype, `<html>`, `<head>`, `<meta charset>` or `<meta viewport>`. `document.compatMode` is `BackCompat` (quirks mode) in both [verified]. It works today but is a risk for the engine (section 12, R1).
6. **GSAP and fonts come from the network.** With the GSAP CDN blocked the deck never starts: the Begin button stays "Loading" and disabled, console shows `gsap is not defined` [verified]. With only Google Fonts blocked it starts after a 3 s fallback and silently uses fallback fonts [verified].
7. **The Scene API in Appendix A is accurate but incomplete.** The decks rely on an optional `exitFx` hook, several implicit globals (`$`, `$$`, `rand`, `lerp`, `clamp`, `pick`, `NOW`, `INSTANT`, `SC`, `RM`, `FX.S`, `FX.gridPoints`, `FX.pulse`), the `this` binding inside `html()`, and a hidden coupling between `def({id})` and a pre-written `<section id>` (section 3).

---

## 1. Shared runtime components (identical in both decks)

Everything below was diffed and is byte-identical unless stated.

| Area | What it is | Where (MBA lines) |
|---|---|---|
| HTML shell | `#viewport > #stage` containing `canvas#fx`, `#world` (one `<section class="slide">` per scene), `#vignette`, `#grain`, two `.bar` letterbox bars, `#tc` timecode, `#hud` (`.chap`, `.dots`), `#flash`. Outside the stage: `#ctl` (Sound/Fullscreen/Keys buttons), `#blackout`, `#help`, `#intro`. | 236-289 |
| CSS | Design tokens, stage, layers, HUD, controls, intro, help overlay, shared typography (`.full .kick .title .w .wi .slot .ch .dsp .serif .mono`), reduced-motion rule | 5-75, 233 |
| Utilities | `$ $$ rand clamp lerp pick`, `RM` (reduced motion), `DISP` font string, `W=1920 H=1080`, `SC` (current scale), `INSTANT` flag, `gsap.defaults({ease:'power3.out'})` | 293-305 |
| Audio `SND` | Web Audio synth: 11 effects plus ambient pad, reverb, compressor, mute | 309-360 |
| Particles `FX` | One 1500-particle canvas with 4 modes plus text/shape targeting | 362-414 |
| Helpers | `splitChars`, `titleHTML`, `prepTitle`, `titleIn`, `shake`, `flash`, `hc`, `NOW` | 416-426 |
| Scene registry | `SL`, `def`, `kill`, `build`, `loop` | 428-433 |
| Beat engine | `hud`, `letterbox`, `runStep`, `finish`, `activate`, `go`, `next`, `prev`, `jumpTo` | 1024-1047 |
| Stage / loop | `fit()` scaling, film-grain frame generator, the single `gsap.ticker` loop (FX update/draw, per-scene `frame()`, timecode) | 1049-1058 |
| Input | Keyboard, pointer/touch, right-click, idle-cursor hide, fullscreen, sound toggle, black screen, help panel, `begin()` | 1060-1091 |
| Boot | `fit(); activate(SL[0])`, font preloading race (3 s cap), enables Begin button, exposes `window.__deck` | 1093-1096 |

`window.__deck = {next, prev, jumpTo, cur, step, SL, begin}` is already a usable test hook; the QA harness for this report was built entirely on it.

---

## 2. Scene-specific components

Per scene (everything inside or alongside one `def({...})`):

- the `def` object itself (id, chapter, letterbox, mood, html, init, enter, frame, exitFx, steps);
- scene constants declared at top level of the shared closure (`S2C`, `R3`, `P5`, `TEAM`, `V1`, `G4`, `EMB5` ...);
- scene-local helper functions (`s3sprout`, `s3update`, `piecePath`, `drawFig`, `gpt`, `garc`, `figs`, `col6`, `starPts`, `fig5`);
- scene CSS (`.s2-*`, `.s3-*` ... in MBA; `.v1-*` ... `.v9-*` in Velcure) plus a number of **unprefixed** scene classes (see R4);
- data and copy (labels, word lists, ticker strings, credits in Velcure `NAMES`);
- scene-owned canvases (`data-r="cv"`) and simulations that run inside `frame()`.

Per-scene inventory [verified from `__deck.SL`]:

**MBA (10 scenes, 50 beats)**

| # | id / chapter | beats | letterbox | `frame()` | notes |
|---|---|---|---|---|---|
| 1 | THE QUESTION | 4 | yes | no | FX-driven word forming, glyph scramble |
| 2 | THE BIGGER PICTURE | 5 | no | yes | SVG camera zoom-out, packets on links; only scene with `exitFx` |
| 3 | DECISIONS | 6 | no | yes | canvas tree simulation, uses `NOW()` and `INSTANT` |
| 4 | PROBLEM SOLVING | 4 | no | no | CSS 3D puzzle pieces, beam |
| 5 | PEOPLE | 5 | no | yes | SVG figures, speech bubbles, jittering conflict lines, packets |
| 6 | LEADERSHIP | 5 | no | yes | DOM shards, canvas pseudo-3D dolly; uses `slot` title morph and `this._tris` |
| 7 | ADAPTABILITY | 4 | no | yes | canvas chaos/order, dot globe, ticker text, glitch slices |
| 8 | THEORY TO REALITY | 4 | no | yes | two stacked "worlds", clip-path seam wipe |
| 9 | THE REAL VALUE | 9 | no | no | 6 orbs + network, vortex, FX text, explosion |
| 10 | MORE THAN A DEGREE | 4 | yes | no | close recipe |

**Velcure (9 scenes, 43 beats)**

| # | id / chapter | beats | letterbox | `frame()` | notes |
|---|---|---|---|---|---|
| 1 | VELCURE LUBRICANTS | 4 | yes | yes | canvas people grid, counter, credits |
| 2 | THE PROBLEM | 5 | no | no | SVG gauge, figure rows, bars |
| 3 | WHY THEY LEAVE | 5 | no | no | SVG range bars on a linear scale |
| 4 | MATCH THE MARKET? | 6 | no | no | SVG people grid + cost meter |
| 5 | CULTURE | 5 | no | yes | three animated emblems (path-follow dots) |
| 6 | RETENTION VS RECRUITMENT | 6 | no | yes | canvas liquid/drip tank simulation |
| 7 | HR STRATEGY | 5 | no | no | clip-path pillars + roof drop |
| 8 | RECOMMENDATION | 4 | no | no | strike-through headline, cards, checklist |
| 9 | REASONS TO STAY | 3 | yes | no | close recipe |

Only five scenes own a canvas (`hc(r.cv)`): MBA 3, 6, 7 and Velcure 1, 6. `fit()` re-creates only one canvas per scene, the one named `cv`.

---

## 3. Scene API as actually implied by the reference decks

Appendix A is correct for what it lists. The complete contract, including what is missing from the appendix:

```js
def({
  id: 's3',              // MUST match a pre-existing <section class="slide" id="s3"> in the HTML shell (hidden coupling)
  chapter: 'DECISIONS',  // HUD text only
  letterbox: false,      // true: bars slide in and the HUD/timecode fade out
  mood: [1, 600],        // [pad level, pad lowpass cutoff Hz]; passed to SND.mood on activate
  html() { return `...` },        // called with `this` = the def object (MBA s6 stashes this._tris); runs on every (re)build
  init(r, s) {},                  // r = {name: element} from data-r; s = the def object; set hidden states, s.ctx = hc(r.cv), s.st = {...}
  enter(r, s) {},                 // reset the shared particle field for this scene
  exitFx(tl, r) {},               // OPTIONAL, not in Appendix A: adds tweens to the outgoing transition (forward only; delays the push by 0.3 s)
  frame(t, dt, r, s) {},          // OPTIONAL: called every ticker frame while s.on; dt is clamped to 0.05 s by the engine
  steps: [ function (tl, r, s) {} ]   // one per beat; a fresh gsap timeline per click
});
```

Fields the runtime adds to the def object: `el` (the section), `tls[]`, `loops[]`, `timers[]`, `r`, `st`, `on`, `ctx`.

**Lifecycle**

1. Boot: `def()` registers; nothing is built until activated.
2. `activate(s, toEnd)`: kill particle tweens, reset `FX.S.gain/streak` only, `build(s)` (kill, `innerHTML = html()`, collect `[data-r]`, reset `st`/`ctx`, `prepTitle`, `init`), mark `.on`, call `enter`, optionally replay all steps instantly, set pad mood, set letterbox.
3. Click: `finish(s)` fast-forwards unfinished timelines, then `runStep(s, step)`.
4. Back within a scene: `kill`, `activate(s,false)`, replay steps `0..step-2` instantly.
5. Leaving a scene: outgoing timeline (zoom-blur push), then `kill(a)`, `innerHTML=''`, `clearProps`.

**Implicit globals a scene may use** (all are just closure variables in the shared IIFE; the generator's prompt must list them or scenes may invent non-existent ones):

`W H $ $$ rand clamp lerp pick RM SC INSTANT NOW() sfx() SND FX FX.S splitChars titleHTML titleIn shake flash hc loop gsap`

and via CSS custom properties: `var(--ink) --paper --ember --signal --alarm --dim ...`.

**Rules that are real constraints of the engine** (enforced only by convention):

- every state change must live in the step timeline or a `tl.call`, because back-navigation replays with `progress(1)`;
- infinite tweens go through `loop(s, tween)`, intervals into `s.timers` (the decks contain no `setTimeout` inside scenes [verified by grep]; `kill` only clears intervals);
- the first click after a scene transition plays `steps[0]`, so every scene opens **empty** (step 0) and conventionally uses beat 1 for `titleIn`.

---

## 4. Shared helper functions

| Helper | Behaviour | Notes |
|---|---|---|
| `titleHTML(kick, text, slot?)` | Standard title: mono kicker plus a word-by-word masked `h2.title`; optional accented `slot` word | Kicker text such as `Scene 02 · ...` is hard-coded by each scene. Does **not** escape HTML. |
| `prepTitle(el)` | Pushes title words below their mask (`yPercent:115`); called by `build()` | |
| `titleIn(tl, s, at)` | Words rise with stagger, kicker fades, plays `hit` | Excludes `.slot` word on purpose (MBA s6 animates it separately) |
| `splitChars(el)` | Replaces `textContent` with one `.ch` span per character | Loses inline markup (MBA s9 hand-rolls around `<em>`) |
| `shake(px, dur)` | Random jitter on `#world`, decays | No-op when reduced-motion or `INSTANT` |
| `flash(alpha, dur)` | White-warm full-screen flash on `#flash` | Same guards |
| `hc(canvas)` | Sizes a canvas to `W*SC*min(2,DPR)` and returns a stage-coordinate 2D context | Called in `init` and re-called by `fit()` on resize |
| `loop(s, tween)` | Registers an infinite tween so `kill()` can remove it | |
| `sfx(name, ...args)` | `SND[name]` unless `INSTANT` | Direct `SND.mood()` calls are not suppressed (intended) |
| `NOW()` | `gsap.ticker.time` | Only MBA s3 uses it |
| `FX.textPoints / gridPoints / targets / burst / explodeFrom / release / set / pulse` | See section 6 | |

Scene-local helpers that are *candidates* for sharing because more than one scene or deck re-implements the same idea: the "slam" tween (scale 2.4, blur 24px, `expo.in`, followed by boom + shake + flash) appears in at least 8 scenes; "draw-on stroke via `pathLength=1` and `strokeDashoffset`" appears in nearly every SVG scene; "packet moving along a path" (MBA s2, s5, Velcure s5); "char-by-char blur-in line" (both closes, MBA s1, s9, s8). See section 14.

---

## 5. Audio architecture

All sound is synthesised; no audio files.

**Signal graph** [code]:

```
osc / noise -> envelope (G) -> bus (gain .6) -> master (gain .85, 0 when muted) -> DynamicsCompressor
                      \-> send(wet) -> ConvolverNode (synthetic 3 s noise-decay IR, gain .35) -> master
pad: 4 oscillators (55, 55.35, 82.41 saw; 110.2 sine) -> lowpass(400) -> padG(0) -> master
     LFO 0.06 Hz, depth 140 Hz on the lowpass cutoff
compressor: threshold -16 dB, knee 12, ratio 5, attack 4 ms, release 250 ms
```

**Effects** (name(args), default): `whoosh(dur=.9, dir=1)` (dir -1 sweeps downward and pans right-to-left), `boom(level)`, `hit(level)`, `tick(freq,level)`, `blip(freq,level)`, `riser(dur,level)`, `glitch()`, `crack()` (noise + `hit` + `boom`), `snap(freq)` (tick + noise), `chime(freq,level)`, **`chalk()`** (used by MBA s8), plus `mood(level, cutoff)` for the pad and `toggle()/isOn()/init()`.

Findings:

- The kickoff lists 10 effects; the code has **11** (`chalk` is the extra). The Stage 2 prompt must list all of them or `chalk` will never be used (and a missing effect name would be silently ignored because `sfx` guards with `SND[n]`).
- The context is created only inside `begin()` / sound toggle, which satisfies the browser autoplay rule.
- The `INSTANT` flag silences every `sfx()` call during replays, so going back is silent. Good design; it relies on scenes calling `sfx`, not `SND.*` directly.
- Level conventions seen in the references: ambient pad `level` 0.5 for open/close, 1 for body, 1.1 to 1.2 for climaxes; cutoff 240 Hz (open/close) up to 900 Hz.
- No master volume control and no ducking exist. "Presenter voice stays dominant" is achieved only through low bus gain (0.6 x 0.85) and the compressor. **[uncertain]**: whether that is quiet enough in a real room; it was not testable headless.
- Audio could not be listened to in this analysis (headless, no output). Verified only that init/toggle run without errors and the button label flips.

---

## 6. Particle architecture

- **One shared singleton** on `canvas#fx` (z-index 1, so it sits **behind** the scene layer `#world`, z-index 2). Particle count: 1500; 700 if the shorter window side is under 600 px; 500 under reduced-motion.
- **Particle**: `x y vx vy tx ty t(targeted) z(depth .25-1) c(color index 0-3) s(size) ph(phase)`.
- **Colour palette is hard-coded** in `FX`: `COL = ['238,233,224','242,162,71','98,196,216','229,84,75']` (paper, ember, signal, alarm). `mix:[a,b,c,d]` gives relative weights and is re-rolled per `FX.set({mix})`.
- **Modes** (`FX.set({mode})`): `drift` (default noise field), `chaos` (flow-field turbulence, wraps edges), `vortex` (spirals into `cx,cy`, respawns on a ring), `flow` (left-to-right stream around `y=sy`).
- **Target mode**: `FX.targets(points)` assigns random particles to points; targeted particles ignore the mode and spring toward their point (`k`, `damp`, `jitter`). `FX.release()` frees them.
- **Point sources**: `textPoints(text,x,y,size,{gap,weight,family})` rasterises text on an offscreen 1920x1080 canvas and `getImageData`s a band; `gridPoints`; `sub` downsamples.
- **Events**: `burst(x,y,power)` (radial impulse), `explodeFrom(points,power)` (reset particles onto the points and fling outward), `pulse(dir)` (used by scene transitions: burst plus a streak tween).
- **Render**: batched by colour x targeted; `lighter` composite; optional trails by painting translucent ink (`rgba(6,7,10,...)` hard-coded); `streak` draws motion lines instead of squares.
- **State parameters** (`FX.S`): `mode alpha alphaT gain trail size speed k damp jitter cx cy streak sy`. Scenes also tween `FX.S` directly (e.g. `to(FX.S,{gain:0})` in the closes).
- **State leakage across scenes**: `activate()` resets only `gain` and `streak`. Each scene's `enter()` sets `mode, alpha, trail, size, speed, mix` (and sometimes `alphaT`), but `k, damp, jitter, cx, cy, sy` persist from whichever scene touched them last. See R8.
- Canvas resolution is `SC * min(2, DPR)`, re-applied on every resize.
- Headless Chromium held 60 fps with 1500 particles plus a heavy canvas scene (MBA s7 chaos) [verified]. That says nothing about low-end projector laptops [uncertain].

---

## 7. Navigation and beat architecture

State: `cur` (scene index), `step` (beats played in this scene), `transTl` (active scene transition), `started`.

**Click semantics** [verified by walking both decks]:

- `next()`: if a transition is running, finish the transition and **do not** advance. Otherwise `finish(s)` (fast-forward whatever is still animating, silently), then play `steps[step]`, `step++`. If the scene is exhausted, `go(cur+1)`.
- `prev()`: if mid-scene, kill + rebuild + replay `0..step-2` instantly. At step 0, `go(cur-1, -1, toEnd=true)` shows the previous scene fully built at its final state.
- `jumpTo(n)` (N/P/digits/Home/End): always lands at **step 0** (blank) of the target scene, even when jumping backwards.

Observed click sequence, Velcure: `0:1 0:2 0:3 0:4 1:0 1:1 ...` (scene:step). So **one extra click per scene boundary** (the transition) and each scene starts blank. Total clicks to finish = beats + scenes - 1 (MBA 59, Velcure 51).

**Transition** (`go`): outgoing scene scales to 1.45 (forward) or 0.72 (back) while blurring to 0 opacity over 0.85 s; incoming scene starts 0.72 or 1.4 scale and eases to 1 over 1.1 s, starting 0.4 s in; plus `whoosh` and `FX.pulse`. Optional `exitFx` on the outgoing scene (forward only).

**HUD**: `NN / total   CHAPTER` bottom-left, one dot per beat bottom-right (`done` class on played beats), timecode top-right (wall-clock since Begin, 24-frame counter, not beat-linked). `letterbox: true` hides HUD and timecode and slides the bars in.

**Input map** [verified by keypresses]:

| Input | Action |
|---|---|
| Click, Right arrow, Down, PageDown, Space, Enter | next beat (and un-black the screen) |
| Left, Up, PageUp, Backspace, right-click | previous beat |
| Touch | left 30% of the screen = previous, otherwise next |
| N / P | next / previous scene |
| 1-9 (and 0 = scene 10 in MBA only) | jump to scene; Home / End = first / last |
| B or `.` | black screen toggle |
| M, F, H or `?`, Esc | sound, fullscreen, help, close help |

Digit jumping cannot reach scene 11 or 12 (R5).

---

## 8. Stage / layout architecture

- Fixed `#stage` 1920x1080 at `transform-origin: 0 0`, positioned by `translate(...) scale(SC)` where `SC = min(vw/1920, vh/1080)`, centred; the surrounding `#viewport` is black so letterboxing is automatic. Verified at 1280x720 (scale 0.6667), 800x1200 (0.4167, vertical offset 375 px) and 2560x1080 (scale 1, horizontal offset 320 px) [verified].
- Z-order: `#fx` 1 < `#world` 2 < `#vignette` 4 < `#grain` 5 < `.bar` 6 < `#hud`/`#tc` 7 < `#flash` 8; outside the stage `#blackout` 20, `#ctl` 25, `#help` 28, `#intro` 30.
- Scenes lay out absolutely in stage pixels. The usable region implied by the HUD is about x 110-1810, y 60-1000 (kicker at y 62, titles at y 90, HUD at the bottom). The Appendix D rule matches that, but the reference decks themselves slightly break it (R22).
- `fit()` also re-creates the active scene's canvas context (`hc`) and resizes the particle canvas.
- Film grain is four pre-generated 256x256 noise PNGs (data URLs) swapped every 70 ms with a random offset on `#grain` (`mix-blend-mode: overlay`). The interval is never cleared. Disabled under reduced-motion.
- Idle cursor hides after 2.2 s; `#ctl` fades with it.

---

## 9. CSS and design-token architecture

Tokens in `:root` (14, not the 5 in the kickoff): `--ink #06070A`, `--ink-2 #0D1016`, `--ink-3 #151A22`, `--line #262C37`, `--paper #EEE9E0`, `--dim #7E8594`, `--ember #F2A247`, `--ember-2 #C9692B`, `--signal #62C4D8`, `--alarm #E5544B`, `--sage #8FBF9A`, `--rose #D98C8C`, `--lilac #B3A4EE`, `--chalk #DCE3D8`; fonts `--f-display`, `--f-serif`, `--f-mono`.

Where the tokens are *not* used (this matters for "more themes later"):

- `FX.COL` holds the four colours as RGB strings and the trail fill hard-codes the ink colour.
- Scene JS and inline SVG hard-code hex values: MBA JS contains 25x `#F2A247`, 12x `#EEE9E0`, 11x `#62C4D8` and more; Velcure similar. Canvas drawing (`frame()`) uses literals like `'rgba(229,84,75,...)'`.
- CSS repeats ember as `rgba(242,162,71,..)` in glows/shadows.
- Canvas fonts are literal strings (`'500 13px "JetBrains Mono",monospace'`, `DISP`).
- `--sage --rose --lilac --chalk` are used by only one or two scenes (MBA s5, s8).

Class naming: MBA `sN-`, Velcure `vN-`, plus unprefixed scene classes (R4). The shared typography classes (`.title .kick .ch .dsp .serif .mono .full`) are the only classes scenes are expected to reuse.

Fonts: Google Fonts `<link>` (Barlow Condensed 500/700/800/900, Instrument Serif regular+italic, JetBrains Mono 400/500). `document.fonts.load` for three faces is raced against a 3 s timeout before Begin is enabled. Canvas text (`FX.textPoints`) depends on the font being loaded, which is why Begin waits.

---

## 10. Reusable scene recipes, mapped to the real reference scenes

All 19 Appendix B recipes were checked against the code and exist as described.

| # | Recipe | Source scene | Core mechanics (so a recipe doc can be parameterised) |
|---|---|---|---|
| 1 | Cold open: word forms from particles, cycles through words, then reveals "not equal" | MBA s1 | `splitChars` slam-in; scramble-then-lock word cycle (`pick` from A-Z set); `FX.explodeFrom(textPoints(...))`; `FX.targets(textPoints(...))`; inline SVG "not equal" sign. Params: question word, 5 cycle words, final word, the "just a ..." phrase. |
| 2 | People grid, some figures turn red and exit, counter ticks | Velcure s1 | Canvas `frame()` draws a grid of figures; random subset gets `red` then `leave` (acceleration + gradient streak); counter text updated in `tl.call`. Params: rows, cols, exit count, counter label. |
| 3 | Ecosystem: centre node, camera pulls out ring by ring, links, packets | MBA s2 | One `<g data-r="cam">` scaled via `svgOrigin`; `pathLength=1` link draw-on; packets as `<circle>` objects moved in `frame()`; `exitFx` spin-out. Params: centre label, ring node lists, link pairs. |
| 4 | Branching decision tree grows, freezes, one path lit, DECIDE / ACT | MBA s3 | Canvas recursive segment sim with lifetimes in `frame()`; `INSTANT` pre-roll of 5 s; freeze flag; leaf-chain highlight; two slam words and a streak. The only scene whose replay is time-dependent. |
| 5 | 3D puzzle pieces scatter then lock, beam runs through 4 stages | MBA s4 | CSS `perspective` + `translateZ/rotate`; per-piece SVG path from `piecePath` (jigsaw tabs); loops killed on lock; beam `strokeDashoffset`; shockwave circles; 4 stage words. |
| 6 | Orbit of people with speech bubbles, conflict zigzags, collaboration curves | MBA s5 | SVG figures; bubbles as DOM; jittering `polyline` conflict lines driven by `st.tension`; quadratic curves with sparks moving by `getPointAtLength`. |
| 7 | Word cracks into 3D shards, becomes new word, camera dolly through a team | MBA s6 | Triangulated mesh, one clipped DOM copy of the word per triangle with randomised 3D flight; the new word flies into the title's `slot`; canvas perspective projection of figures (`drawFig`) with camera `cam` tweened. |
| 8 | Chaos (glitch, flying words, tickers, spinning dot globe) snapped into framework grid | MBA s7 | Canvas multi-series noise, Fibonacci-sphere globe, ticker text, canvas row-shift glitch; words fly via `gsap.set` per frame; `FX.targets(gridPoints)`; framework rows draw on. Uses an interval in `s.timers`. |
| 9 | Light-seam wipe between two worlds | MBA s8 | Two stacked full-slide layers, `clip-path: inset()` driven by a tweened `sx`; seam div follows; per-card micro-animations triggered by seam position `T(i)`. |
| 10 | Orbs network, vortex pulls into one word, which explodes into final word | MBA s9 | Elliptical node layout; incremental `<line>` creation; `FX` vortex mode; `FX.targets(textPoints('CAPABILITY'))` then `explodeFrom(textPoints('IMPACT'))`. |
| 11 | Gauge with needle sweeping before to after | Velcure s2 (beats 1-3) | SVG arc via `garc`/`gpt`, tick marks, needle `rotation` with `svgOrigin`, number counter via tweened object, elastic overshoot. Params: scale max, before/after values and labels. |
| 12 | Icon rows before vs now, then ranked bars | Velcure s2 (beats 4-5) | `figs(n, hollow, colour)` SVG icon rows with stagger; `scaleX` bars from `0% 50%`. |
| 13 | Range bar chart to scale, gap bracket, verdict word | Velcure s3 | One linear scale `X3(v)`, solid + hatched range bars, bracket path, verdict slam. This is the reference for "charts drawn to scale". |
| 14 | Blanket vs targeted: people grid, cost meter vs budget line, scanner | Velcure s4 | 10x6 SVG figure grid, meter bar tweened by `attr`, budget line, scanner `line` sweep that lights chosen figures by column. |
| 15 | Emblem trio: boomerang loop, dot climbing stairs, pulsing star | Velcure s5 | Three SVG emblems; dots follow paths with `getPointAtLength` in `frame()`; rotating rays. Params: three headings, three captions, three emblem types. |
| 16 | Leaking tank | Velcure s6 | Canvas fluid-level simulation with holes, drops and plugs; text columns on each side; inflow rate tweened. Params: hole sizes, plug count, labels. |
| 17 | Pillars rise, roof drops | Velcure s7 | `clip-path` rise per pillar with `--c` colour var; pediment `polygon` drop; burst + crack. Params: pillar headings/items/colours. |
| 18 | Strike-through headline, three moves, checklist | Velcure s8 | `splitChars` slam, SVG strike path with `pathLength`, cards, list with tick-on. |
| 19 | Minimal close: serif lines, giant word with sheen, held | MBA s10 and Velcure s9 | `.s10-*` and `.v9-*` are the same structure with different numbers: radial light, two serif lines (one dimming), a giant word using a moving `background-position` gradient (the "sheen" loop), `FX.S.gain -> 0`, `SND.mood(.22,180)`. **This is the clearest case of duplicated scene code.** |

**Gaps** relative to what a general generator will need (observations, not proposals to build now): no recipe for a plain timeline/roadmap, a side-by-side comparison table, a quote/testimonial, a simple bar/line series chart over time, a map, or a big-number/KPI scene. Recipe 13 is the only chart-to-scale reference. Recipes 1 and 19 are structurally "letterbox + FX" scenes; the rest are mid-deck. Two recurring sub-recipes are not in the appendix: the title `slot` morph (MBA s6) and the dim-the-diagram-then-reveal-a-big-word device (Velcure s3 and s4 end the same way).

---

## 11. What must NOT be duplicated when generating future decks

1. Everything in section 1 (runtime JS, runtime CSS, HTML shell). A fix must ship once and reach every deck.
2. The audio effect definitions and the effect-name list. The scene writer must be given the list, not re-implement a sound.
3. The particle engine and the colour palette; scenes may only configure it via `FX.set`.
4. Title system (`titleHTML`, `prepTitle`, `titleIn`), `splitChars`, `hc`, `shake`, `flash`, `loop`, `sfx`.
5. The input map and the help copy (generate the help text from the engine's own key table).
6. Design tokens: scenes should reference `var(--...)`, and canvas/SVG code should read tokens from one JS object (R9). Never paste hex values.
7. Scene helpers that are already used twice: person glyph (`FIG` in Velcure; `drawFig` and `fig5` in MBA are different figures, so keep both as named glyphs in a shared glyph library), star points, arc/gauge geometry, draw-on-stroke, packet-on-path, slam, char-by-char line.
8. Close-scene markup and CSS (recipe 19).
9. Per-deck copy that is now duplicated inside the shell: intro kicker/title/paragraph, scene count word, and the `1 to 9` help line must come from deck metadata.
10. Fonts and GSAP: one pinned asset set (CDN link in hosted mode, inlined in the offline export), not pasted into scenes.

---

## 12. Architectural problems and risks

Severity: **H** = can break generated decks or the product promise, **M** = will cause defects as scene count and variety grow, **L** = polish.

| # | Sev | Finding | Evidence |
|---|---|---|---|
| R1 | H | **Quirks mode.** No doctype/`<html>`/`<head>`/charset/viewport meta. Works today but behaviour differs from standards mode (box model for some elements, line heights, `height:100%` chains). If the assembler adds a doctype, layouts may shift. Also no `<meta charset>`: the decks contain non-ASCII (arrows, middle dot, en dash, rupee sign), and a server that sends no charset can mangle them. | `document.compatMode === 'BackCompat'` in both decks [verified]; charset was resolved to UTF-8 by Chrome for `file://` only. Visual regression after adding a doctype: **[uncertain]**, not tested. |
| R2 | H | **Network dependency / no graceful failure.** GSAP and fonts load from CDNs. If GSAP fails the deck is dead on "Loading" with no message. Fonts failing degrades silently to Arial Narrow/Georgia, which changes layout and `textPoints`. The offline file promised in the kickoff needs GSAP and woff2 fonts inlined; the size of the inlined fonts is **[uncertain]** (not measured). | CDN-blocked test [verified]. |
| R3 | H | **Scene constants live in one shared closure scope.** Both decks declare top-level names such as `R3`; scene modules merged naively would redeclare `const` (SyntaxError, whole deck dead) or silently share state. Two LLM-written scenes picking `const P = ...` is a realistic collision. | Names listed from both files [code]. |
| R4 | M | **Hidden id coupling and CSS collisions.** `def({id})` needs a matching `<section>` written into the shell. Class prefixes are inconsistent: MBA `sN-`, Velcure `vN-`, and unprefixed `.pc .bub .chip .rc .rc-h .rc-v .rc-f .shard .mg .mg-t .crk .fw-w .e-*` that would collide across scenes. SVG ids (`#s5g`, `#s2arc`, `#chalk`) are global too. | [code] |
| R5 | M | **Digit jump limited to 9 or 10 scenes** and differs between decks (MBA `0` = scene 10). A 12-scene deck cannot jump to 11/12 by digit. | Regex diff; keypress test [verified]. |
| R6 | M | **Rebuild is not deterministic.** Layouts and events use `Math.random` in `html()`/`init`/steps (MBA s3 tree, s5 sparks, s6 shards, s7 series; Velcure s1 picks which 12 figures leave). Going back shows a different random result than the first pass, and QA screenshots are not reproducible. Element/text counts matched after back-then-forward in every scene [verified], so structure is stable; per-frame visuals are not. | 91 and 36 random calls [code]. |
| R7 | M | **Time-dependent state in MBA s3.** Replays rely on `NOW()` and a 5 s simulated pre-roll under `INSTANT`; "frozen" tree and the lit leaf chain depend on when the click happened. Cannot be exactly reproduced, only approximated. | [code] |
| R8 | M | **Particle state leaks between scenes** (`k damp jitter cx cy sy`, sometimes `alphaT`). A scene that forgets to set them inherits another scene's values. LLM-written scenes will forget. | [code] |
| R9 | M | **Colours and fonts are hard-coded in JS/SVG/canvas**, so a second theme cannot be a CSS-only swap. | counts in section 9 |
| R10 | M | **A single `frame()` exception disables that scene's loop permanently.** The ticker does `s.frame = null` on the shared def object, so even rebuilding the scene does not restore it; only a page reload does. A one-off error becomes a frozen visual. | [code] |
| R11 | M | **Errors in timeline callbacks are not caught.** Only the synchronous step-building call is wrapped in `try/catch`. Whether a throw inside a `tl.call` aborts the ticker tick (stopping particle drawing for that frame) is **[uncertain]**; not reproduced. | [code] |
| R12 | M | **LLM-written scene code is arbitrary JavaScript running on your domain.** Prompt injection in an uploaded document could produce scene code that exfiltrates or defaces. Also, any user text interpolated into template literals (`titleHTML`, `html()`) is unescaped, and a backtick or `${` inside source text breaks the scene. Requires: text passed as data (JSON), escaped on output, decks served from an isolated origin or sandboxed iframe, a CSP, and static checks on generated code. | `titleHTML` and scene `html()` [code]; the security model is a **CTO decision**. |
| R13 | M | **QA hooks are thin.** `__deck` has no "animation finished" signal, no `goto(scene, beat)`, no version and no event stream. My harness had to use fixed waits and `gsap.globalTimeline.timeScale(10)`. A generator QA loop needs deterministic settling. | [verified] |
| R14 | M | **No place for speaker notes** in the runtime (the kickoff promises per-beat notes and a later presenter view). Storyboard beats and code beats are linked only by array index. | [code] |
| R15 | M | **Enforcement of conventions is nil.** Nothing stops a scene using `setTimeout`, mutating state outside the timeline, forgetting `loop()`, or having more/fewer `steps` than the storyboard beats. These rules must be checked by the QA stage, not trusted. | [code] |
| R16 | L | **Kickoff counts are off** (MBA 50 not 52, Velcure 43 not 41), the "10 effects" are 11, and tokens are 14 not 5. The spec should be corrected so the generator prompt is accurate. | [verified] |
| R17 | L | **Appendix D safe area is violated by the references themselves**: Velcure s6 closing line ends at y 1018 (limit 1000) and a "ONGOING" chip ends at x 1841 (limit 1810) [verified by a text-range overflow probe]. A strict overflow QA rule would flag the reference decks; it needs a tolerance or the rule should be relaxed to the true HUD-clearance zone. | text-range overflow probe [verified] |
| R18 | L | **Dash handling.** Zero em-dashes (U+2014) in both decks, but en dashes (U+2013) are used for ranges (`4-5`, `35-60%`) and a true minus (U+2212) in tickers. The "no em-dash" content rule needs a precise definition for the checker. | grep [verified] |
| R19 | L | **Performance on weak hardware is untested.** 1500 particles at up to 2x DPR plus a full-screen overlay grain swapped every 70 ms with `mix-blend-mode: overlay` could be heavy on integrated GPUs or 4K projectors. | **[uncertain]**; headless at 1920x1080 held 60 fps [verified]. |
| R20 | L | **Reduced motion is partial** (no shake/flash, grain off, fewer particles) but timeline animation still runs in full. | [code] |
| R21 | L | **Memory/timeline leaks.** Global timeline child counts fluctuated (0, 33, 7, 34, 4, 70, 29) while cycling a scene with loops; no monotonic growth was seen, but the test was not conclusive. | **[uncertain]** |
| R22 | L | **Licensing and fonts need confirming**: GSAP's license terms for a commercial product that bundles GSAP inside customer-downloadable files, and the licenses of Barlow Condensed, Instrument Serif and JetBrains Mono for embedding. I believe the fonts are SIL OFL and that GSAP is currently free for commercial use, but I did not verify either. | **[uncertain]**, verify before launch. |
| R23 | L | **Kicker numbering is hard-coded in each scene** (`Scene 02 · The bigger picture`). Reordering or editing a storyboard leaves wrong numbers. | [code] |

---

## 13. Proposed file structure for the future FilmDeck engine

Proposal only; nothing was created except this report.

```
FILMDECK/
  reference/                      untouched originals (golden masters for parity tests)
  docs/
    ENGINE-ANALYSIS.md            this file
    SCENE-API.md                  the full contract from section 3, versioned
    recipes/                      one folder per recipe (see below)
  engine/
    runtime/
      film-runtime.js             SND, FX, helpers, registry, beat engine, stage, input, boot. No scenes. No deck text.
      film-runtime.css            tokens, stage, HUD, intro, help, shared typography
      shell.html                  document shell with slots (see below)
      themes/
        ink-ember.css             the current :root token block (theme 1)
      VERSION                     runtime version stamped into the output
    kit/                          OPTIONAL later: slam(), drawOn(), charsIn(), packetOnPath(), glyphs (person, star, ...)
    assemble/                     LATER: build a deck from deck.json + scene modules; not part of this step
  scenes/
    mba/    s01-cold-open.js  s01-cold-open.css  ...  (the reference decks re-expressed as modules)
    velcure/ ...
  decks/
    mba.deck.json                 title, intro copy, scene order, per-beat notes
    velcure.deck.json
  tests/
    qa/                           the Playwright harness (promoted from the scratchpad probe)
    golden/                       per-beat screenshots from the reference files
```

**Scene module convention (recommended):** one JS file and one CSS file per scene. The JS file contains the scene's constants, helpers and one `def({...})`, **wrapped in its own function scope** so top-level names cannot collide (fixes R3). CSS classes are prefixed with the scene's slug by the assembler (or authored with a mandatory prefix), and SVG ids get the same prefix (fixes R4). The runtime creates the `<section>` for each registered scene (removes the hidden id coupling).

**Shell slots** (replace the per-deck copy-paste): `{{TITLE}}`, `{{INTRO_KICKER}}`, `{{INTRO_TITLE_HTML}}`, `{{INTRO_PARAGRAPH}}`, `{{THEME_TOKENS}}`, `{{SCENE_CSS}}`, `{{RUNTIME_CSS}}`, `{{GSAP}}` (CDN tag or inline), `{{FONTS}}` (link or inline), `{{RUNTIME_JS}}`, `{{SCENE_JS}}`. Digit-key help text should be generated from the number of scenes.

**Recipe doc format** (per recipe folder): a one-paragraph meaning ("what this visual says"), the parameter list, the beat list with approximate timings, the working reference scene as code, the CSS it needs, the sound moments, the FX settings, and known pitfalls. Start with the 19 in section 10.

---

## 14. Recommendation: what becomes what

**film-runtime.js** (fixed, versioned, never written by a model)

- Everything in section 1 except the deck-specific data: `SND`, `FX`, helpers, `def/kill/build/loop`, beat engine, stage `fit()`, grain, ticker loop, input, boot.
- Treat the first extraction as **verbatim**: take the identical block from the two decks, change nothing, and prove parity by rebuilding both decks on it and comparing every beat against the reference files (the harness already exists). Only after parity is green, ship a **v1.1** with the small fixes the generator needs:
  1. create `<section>` elements from the registry; intro/help text from deck metadata; help digit line derived;
  2. reset the full `FX.S` to defaults in `activate()` (R8);
  3. make a `frame()` failure non-permanent and log the scene id (R10);
  4. wrap timeline callbacks safely or report them to the QA harness (R11);
  5. QA hooks on `__deck`: `version`, `goto(scene, beat)`, `whenIdle()`, and an optional seeded random for deterministic replays (R6, R13);
  6. a `notes` array per scene, readable by `__deck` (R14);
  7. JS-side token object read from the theme CSS (R9);
  8. generic scene jumping beyond 9 scenes (R5).
- Everything else about behaviour stays the same.

**film-runtime.css**

- Lines 5-75 and 233 of the references: tokens (moved into `themes/ink-ember.css`), stage and layers, HUD, controls, intro, help, shared typography (`.full .kick .title .w .wi .slot .ch .dsp .serif .mono`).
- No scene classes.

**Scene modules** (what a model writes, what Stage 2 outputs)

- Exactly the scene-specific items in section 2: the `def` object, constants, helpers, scene CSS. Each module is scoped, prefixed and checked (steps count equals storyboard beats; no `setTimeout`; no hard-coded hex; no globals outside the documented list).
- The 19 reference scenes themselves become the first library of scene modules and the training examples for Stage 2.

**Recipe documentation**

- One entry per recipe from section 10, built from the real scene code, with parameters, meaning, beats and the exact helper calls. Add the missing sub-recipes (title slot morph, dim-then-reveal) and, later, the missing visual types listed in the gaps paragraph.

---

## 15. What was run, and the results

All results are from headless Chromium 1920x1080 against the untouched reference files. GSAP 3.12.5 was loaded from the CDN (network was available).

| Test | MBA | Velcure |
|---|---|---|
| Page loads, Begin enabled | yes (about 0.7 s) | yes |
| Scenes / beats | 10 / 50 | 9 / 43 |
| `compatMode` | BackCompat | BackCompat |
| Console / page errors across full walk | 0 | 0 |
| Forward walk, every beat | ended at scene 10, step 4 (last) | ended at scene 9, step 3 (last) |
| Backward walk to start | ended at 1:0 | ended at 1:0 |
| 40 rapid next-clicks, then 40 rapid prev-clicks | no errors; clicks during a transition are absorbed by design | same |
| Jump to scene 5 then back one beat | landed at scene 4, final step | landed at scene 4, final step |
| Back-then-forward consistency (text length and element count per scene) | identical in all 10 scenes | identical in all 9 scenes |
| Keyboard: Right, Space, PageDown, Left, N, P, 1-9, 0, Home, End, B, H, Esc, M | all behaved as in section 7 | digit regex differs as noted |
| Mouse: left click, right click | next / previous | same code |
| Viewports 1280x720, 800x1200, 2560x1080 | correct scale and centring, no errors | same code |
| Reduced-motion context | grain removed, no errors | same code |
| GSAP CDN blocked | dead on "Loading", `gsap is not defined` | same code |
| Fonts blocked | starts after 3 s fallback | same code |
| Frame rate, MBA s7 chaos scene, real time | 60.7 fps, worst frame 18 ms | n/a |
| Visual spot-check of final-state screenshots (MBA s3, Velcure s6) | rendered correctly | rendered correctly |
| Text outside x 100-1820 / y 50-1010 at scene end | one rotating textPath label (MBA s2, expected) | Velcure s6 (closing line y to 1018, chip x to 1841) |

Not tested: audio output (headless), real fullscreen, touch devices, GPU-limited machines, standards-mode rendering.

---

## 16. Questions for the CTO

1. **Parity first or fixes first?** Recommendation: verbatim runtime extraction, prove both reference decks identical beat-by-beat, only then v1.1 fixes.
2. **Doctype.** Allow the assembler to emit a standards-mode shell (R1), accepting a visual regression check on all 19 recipes? Recommendation: yes.
3. **Scene module convention.** Keep scenes using implicit closure globals (matches Appendix A and the Stage 2 prompt, least change) wrapped in function scope, or pass an explicit API object? Recommendation: wrapped implicit globals for v1.
4. **Security model for generated JavaScript (R12).** Isolated origin or sandboxed iframe for hosted decks, CSP, and static checks. This must be decided before any hosted link goes live.
5. **Source of truth for counts.** Correct the kickoff (50 / 43 beats, 11 effects, 14 tokens) so the prompts the generator receives are accurate?
6. **Scene limit and navigation.** The storyboard allows up to 12 scenes; digit jumping covers 9 or 10. Accept N/P plus a scene picker for the rest?
7. **Offline export and licenses (R2, R22).** Confirm GSAP and the three font families may be embedded and redistributed in customer-downloadable files; measure the inlined size.
8. **Determinism.** Is it acceptable that going back re-randomises some visuals (R6), or should the engine add a seeded RNG so replays and QA screenshots are reproducible?
9. **Mood vocabulary.** Appendix C uses `calm|tense|rising|triumphant|quiet` but the engine takes `[level, cutoff]`. Proposed mapping drawn from the references (a starting point, not final): quiet = [.5, 240], calm = [1, 500], tense = [1, 650], rising = [1.1, 700], triumphant = [1.2, 900].
10. **Speaker notes.** Add a `notes` array to the runtime now (cheap) or wait for the presenter view?

---

# Phase 1 Step 1 — Runtime Extraction

Status: done and tested. Nothing in `reference/` was modified.

## What was extracted

The shared code was cut out of the reference files **verbatim** by line range (no rewriting), after confirming with `diff` that the pieces are identical in both decks.

| File | Contents | Source |
|---|---|---|
| `engine/film-runtime.js` (21,150 B) | The whole shared JS closure: utilities, `SND`, `FX`, helpers, registry (`def/kill/build/loop`), beat engine, stage/ticker/grain, input, boot, `window.__deck` | MBA lines 293-433 (identical to Velcure 292-432) + 1024-1097 |
| `engine/film-runtime.css` (5,485 B) | Tokens, stage and layers, HUD, controls, intro, help, shared typography, reduced-motion rule | lines 6-75 + 233 |
| `engine/film-shell.html` (2,089 B) | Document shell with slots: `TITLE`, `RUNTIME_CSS`, `SCENE_CSS`, `SECTIONS`, `HELP_DIGITS`, `INTRO_KICKER`, `INTRO_TITLE`, `INTRO_PARAGRAPH`, `RUNTIME_JS`; fonts link and GSAP CDN tag stay in the shell | MBA 1-5, 236-292 |

Why one JS file with a splice point: scenes are written against closure variables (`$`, `FX`, `sfx`, `gsap`, `hc`, ...) and must be registered after `def()` exists and before boot runs (`fit(); activate(SL[0])`). Keeping them in the same closure preserves behaviour exactly, so `film-runtime.js` contains a single marker line, `/* @@FILM_SCENES@@ */`, between the registry and the engine, and the assembler replaces it with the deck's scenes. This is deliberately not a plugin system.

## What remains scene-specific (outside the runtime)

Per deck, in `decks/<name>/`:
- `scenes.js`: every scene constant, helper, SVG/canvas drawing and `def({...})`. For Velcure this includes `FIG` and `NAMES` (MBA lines 434-1023, Velcure 433-756).
- `scenes.css`: all scene CSS (lines 77-232).
- `deck.json`: title, intro copy, the list of `<section>` ids, and the help line for digit jumping.

## Assembler

`tests/parity/build.mjs <deck>` splices a deck into the shell and runtime, writing `tests/parity/build/<deck>.html` (git-ignored, temporary). It is a test helper, not the generator. Each build contains exactly one copy of the runtime (verified: one `const SND=`, one `const FX=`, one `function runStep` per build). No doctype was added: both builds still render in quirks mode (`compatMode === 'BackCompat'`, asserted in the parity test).

## Unavoidable / deliberate differences from the references

Comparing each build to its reference with `diff -B` shows exactly these:

1. **Reduced-motion rule moved.** `@media (prefers-reduced-motion){ #grain{display:none} }` now sits at the end of the runtime CSS (before scene CSS) instead of the end of the whole stylesheet. No scene CSS touches `#grain`, so there is no cascade effect (confirmed: `#grain` is `display:none` under reduced motion in both builds).
2. **Digit-key regex unified** (Velcure only). The runtime uses MBA's `/^[0-9]$/ ... k==='0'?9:+k-1`. In a 9-scene deck, `0` calls `jumpTo(9)` which is out of range and does nothing, the same as the original Velcure regex ignoring `0`. Measured: `0` leaves Velcure on the same scene. The help text still differs per deck via the `HELP_DIGITS` slot.
3. Whitespace/blank-line differences around the splice points only.

No other text differs.

## Parity test performed

`tests/parity/parity.mjs` runs an identical scenario against the reference file and its build (headless Chromium, 1920x1080, GSAP 3.12.5 from the CDN) and compares the two records field by field. Per beat: scene/step position, HUD chapter text, number of HUD dots and how many are done, HUD quiet state, timecode format, whether the particle canvas has lit pixels, text length and element count of the active scene, and the number of Web Audio oscillator/buffer-source nodes created (an audio trigger proxy, wrapped via an init script). Scenario:

- intro text, title, Begin label, help text, scene table (id, chapter, beats, letterbox, mood, has `frame`, has `exitFx`), quirks mode;
- Begin click and fullscreen request (stubbed counter);
- every beat forward including each scene boundary, with a final-state screenshot per scene; then every beat back to the start;
- for every scene: jump in, play to the end, step back one, step forward again, and confirm the scene is rebuilt with identical structure and the correct intermediate step;
- 40 rapid next clicks then 40 rapid prev clicks;
- jump to scene 5, step back across the boundary;
- keys: Right, Space, PageDown, Enter, Down, Left, PageUp, Up, Backspace, N, P, 3, 0, 9, End, Home, B, `.`, H, Esc, F, M; buttons: Keys, Fullscreen, Sound; left and right click; touch not tested;
- black screen on/off and cleared by next; help open/close by key, button and click;
- timecode advancing; real-time (1x) pass through the first scene and its transition;
- stage transform at 1280x720, 800x1200 and 2560x1080; reduced-motion context.

Both builds are compared against their reference in the same run, so differences caused by the environment affect both sides equally.

## Test results

| | MBA | Velcure |
|---|---|---|
| Scenes / beats (reference = build) | 10 / 50 | 9 / 43 |
| Page load, Begin enabled | pass | pass |
| Console or page errors (reference / build) | 0 / 0 | 0 / 0 |
| Per-beat structural differences, forward and back (about 125 and 105 snapshots) | 0 | 0 |
| Forward end / backward end position | 10:4 / 1:0 (both sides) | 9:3 / 1:0 (both sides) |
| Scene rebuild after stepping back (all scenes) | pass | pass |
| Audio node creation per beat (tolerance 3) | no differences | no differences |
| Keyboard, mouse, black screen, help, fullscreen, sound, timecode, rapid clicking, jump-then-back, real-time, scaling, reduced motion | identical between reference and build | identical |

Results are saved by the script in the output directory (`/tmp/filmdeck-parity/*-parity.json` plus per-scene screenshots).

## Parity limits (what this does not prove)

- Pixels were not compared. Both decks use `Math.random` in particles and several scenes (per the analysis), so frame-exact comparison is not possible until deterministic QA exists. Visual parity rests on code identity (only the differences listed above) plus the structural and canvas-activity checks.
- Audio was compared by node-creation counts, not by listening.
- Real fullscreen, touch input and slow hardware were not tested.

## Limitations recorded, not changed (per instructions)

- Digit navigation reaches scenes 1-9, and 10 only via `0`; no way to jump to scene 11+ by digit.
- Each scene opens blank and a scene change costs one extra click.
- No doctype, no `<meta charset>`, no viewport meta (quirks mode kept).
- GSAP and fonts still load from CDNs; the deck does not start if GSAP is blocked.
- Scene constants share one closure scope, so scene modules can still collide on names.
- Particle state (`k`, `damp`, `jitter`, `cx`, `cy`, `sy`) still leaks between scenes; `frame()` errors still disable a scene's loop permanently.
- Randomness is unseeded.

## Deferred to later steps

Standards-mode shell, offline inlining, scene scoping and prefixing, `FX.S` reset, safer `frame()` errors, QA hooks (`goto`, `whenIdle`, `version`), seeded RNG, speaker notes, theme tokens in JS, navigation beyond 9 scenes, recipe library, generator.

## How to rerun

```
node tests/parity/build.mjs mba && node tests/parity/build.mjs velcure
FILMDECK_QA_MODULES=<dir with node_modules/playwright-core> \
  node tests/parity/parity.mjs mba reference/mba-film.html tests/parity/build/mba.html /tmp/filmdeck-parity
```
The repository has no `package.json` and no dependencies; the test imports `playwright-core` from `FILMDECK_QA_MODULES`.

---

# Phase 1 Step 2 — Scene API + Recipe Extraction

Status: done. Specification and inventory only. `engine/film-runtime.js`, `engine/film-runtime.css`, `engine/film-shell.html`, `decks/mba/*`, `decks/velcure/*` and `reference/*` were **not modified** (reference and runtime SHA-256 checked before and after).

## Deliverables

| File | Purpose |
|---|---|
| `docs/SCENE-API.md` | Canonical scene contract: lifecycle, fields, beat/replay/rebuild contract, HTML/SVG/canvas/CSS/audio/particle/state/coordinate/naming rules, forbidden patterns, two validated examples, quirks, unresolved items |
| `docs/SCENE-PRIMITIVES.md` | 34 recurring primitives with evidence from both decks, reuse boundary and limits, primitive to recipe map |
| `docs/SCENE-DATA-CONTRACT.md` | Where data enters scenes, eight value classes, per-scene inventory, storyboard-provided vs recipe-provided, validation rules, minimum input shape |
| `engine/recipes/registry.json` | Machine-readable registry of the 19 recipes with evidence |
| `engine/recipes/README.md` | How to read the registry; honest status |
| `decks/_example/` | Two-scene example deck (minimal + complete) that exercises the documented API; built and run through the same harness |

## Actual scene API discovered

`def({ id, chapter, html, steps })` required; `letterbox`, `mood`, `init(r,s)`, `enter(r,s)`, `exitFx(tl,r)`, `frame(t,dt,r,s)` optional. All hooks run with `this === s`. Corrections to the kickoff's Appendix A:
- `exitFx` exists and is not documented there (MBA scene 2 only).
- `mood` is formally optional but the first scene must define it (`begin()` has no fallback).
- `id` is bound to a pre-written `<section>`, and MBA has one CSS rule keyed on a section id (`#s2 svg text`).
- Scenes receive many implicit globals (`$ $$ rand lerp clamp pick NOW INSTANT SC RM W H FX FX.S`); the Appendix lists only some.
- The runtime adds `el tls loops timers r st on` to the def object; `ctx` is assigned by scenes.

## Lifecycle discovered

Register at load; first scene built blank; `activate` = kill particle tweens, rebuild (`html`, collect `data-r`, reset `st`/`ctx`, `init`), mark on, `enter`, optional instant replay of all beats, set pad mood, set letterbox. A click plays `steps[step]` after fast-forwarding unfinished beats silently. Back within a scene rebuilds and replays `0..step-2` instantly; back from step 0 rebuilds the previous scene at its final state. Jumps enter at step 0. During a transition both scenes' `frame()` run. Details and replay rules are in SCENE-API.md sections 1, 5, 6, 7.

## Primitive inventory

34 primitives (P1 to P34) in six groups: text and typography (7), charts (7), people and relationships (4), networks and structure (6), space/metaphor (7), atmosphere (3), plus the cross-reference to recipes. Cheapest to extract first: P1 (already runtime), P2 slam word (about 8 copies), P3 character lines, P8 draw-on strokes, P6 close (identical in both decks), P21 pillars. Hardest/bespoke: P20 tree, P18 team dolly, P25 tank, P14 cards.

## Recipe inventory and status

All 19 are **demonstrated**: a complete working scene exists in a reference deck. **None is parameterised**; all are `reference-code-only`. Reuse readiness: **high** 10, 11, 12, 13, 17, 18, 19; **medium** 1, 2, 3, 5, 6, 14, 15; **low** 4, 7, 8, 9, 16 (bespoke simulations: copy and edit). Recipes 11 and 12 share one scene (Velcure s2), and recipe 19 appears in both decks. Nothing in the taxonomy is missing from the references and nothing is taxonomy-only. Two patterns exist outside the 19 (title-slot morph, dim-then-reveal) and six visual types have no reference at all (timeline, comparison table, quote, KPI number, time-series chart, map).

## Data boundary findings

- There is no data layer; text and numbers are interleaved with rendering in template literals, constants and step bodies.
- **Invented numbers exist in the MBA reference**: scene 4 (six metrics such as `NPS 31`, `₹4,200 CR TAM`), scene 7 (16 ticker strings with figures), scene 8 (card figures such as `+12.4% QoQ`, `CSAT 4.6`, `BUDGET ₹18 CR`). They are illustrations in a conceptual deck, but they violate the product's no-invented-numbers rule if copied, so recipes 5, 8 and 9 must treat such text as optional.
- Velcure v2 and v3 show the correct pattern: a numeric value for geometry next to a separately typed display string ("7-8%"). Recipes should require both.
- Some visuals look quantitative but are pixel metaphors (Velcure v4 meter heights, v6 hole sizes, v2 rank bar lengths).
- Speaker notes do not exist anywhere in the code.
- Class list: narrative text, source numbers (displayed and geometric), derived numbers, structural counts, layout constants, decorative numbers (forbidden), randomness. Storyboard supplies text, source numbers with references, roles and lists; recipes supply geometry, layout, timing, sound, particles and state.

## Recommended future generator interface

Smallest interface the evidence supports, with no new classes or plugin system:

```
storyboard.json (Appendix C, plus per scene: recipe id, inputs object, beats[], dataUsed[])
   -> pick reference scene for the recipe id (registry.json -> decks/<deck>/scenes.js)
   -> model adapts that scene's code to the inputs     [Stage 2]
   -> output = decks/<name>/{scenes.js, scenes.css, deck.json}
   -> tests/parity/build.mjs  ->  one HTML file
   -> QA harness (parity.mjs-style walk) on the built file
```

That is: the unit of generation is exactly the three files in a deck folder, the assembler already exists, and the validation rules in SCENE-DATA-CONTRACT.md section 5C (every number traces to the storyboard; steps count equals beats; no forbidden patterns) can run as a static check before the browser test. Recipes stay "reference scene plus registry entry" for the MVP; parameterising them is optional later work for the high-readiness ones only.

## Parity test results

Run after all Step 2 files were created, against untouched runtime and deck sources.

| | MBA | Velcure | Example deck |
|---|---|---|---|
| Scenes / beats | 10 / 50 | 9 / 43 | 2 / 6 |
| Structural differences (reference vs build) | 0 | 0 | n/a (single file run twice) |
| Console / page errors | 0 / 0 | 0 / 0 | 0 / 0 |
| Forward and back walks end correctly | yes | yes | yes |
| Scene rebuild after stepping back | all pass | all pass | all pass |
| Audio node counts per beat | equal | equal | n/a |
| Share of snapshots with lit particles (ref / build) | 0.968 / 0.968 | 0.963 / 0.963 | n/a |

Also confirmed: one copy of the runtime in each build (`const SND=` count 1); `reference/*.html` and `engine/film-runtime.js` hashes unchanged; no `package.json`, no new dependencies; no generator, app or API code.

**Test harness change (not a runtime change):** the first Step 2 runs showed one "difference" each time in the particle-canvas check (a different beat in MBA and in Velcure on different runs, both in the closing scene whose last beats fade the particle field to near-zero). The per-beat "particles lit" comparison sampled sparse pixels of a random, faint field, so it was a coin flip rather than a behavioural difference (code is identical apart from the two documented lines). I replaced it with a denser sample compared in aggregate (share of snapshots with lit particles must agree within 10 points). All other checks are per-beat as before. This is recorded here so the earlier "0 differences" claim of Step 1 is read with that metric's flakiness in mind: structure, HUD, positions, text, element counts, audio-node counts and errors were never affected.

## Unresolved questions

1. Behaviour of an exception thrown inside a `tl.call` callback (carried from Step 1).
2. A scene with an empty `steps` array, or an id with no `<section>`.
3. Two canvases in one scene (only `cv` is resized).
4. More than 10 scenes or about 12 beats per scene (HUD and navigation unverified).
5. HTML escaping policy for source text in `html()`.
6. Where speaker notes live at runtime.
7. How to split recipes 11 and 12 (one scene, two recipes) and whether the recipe unit is a scene or a beat range.
8. How to treat decorative visuals that read as data (meter heights, hole sizes) in sourced decks.
9. Safe-area fitting of arbitrary text lengths (references are hand-tuned).
10. Theming of inline hex colours in SVG/canvas.

## Intentionally deferred

All Step 1 deferrals remain (standards-mode shell, CDN/offline, scene scoping and prefixing enforcement, `FX.S` reset, `frame()` error handling, QA hooks, seeded RNG, navigation beyond 9 scenes, theme tokens in JS). Not started: recipe templates or any extraction of reference scenes into parameterised code, the validator, the storyboard schema file, the generator, any AI call, the web app.

---

# Phase 1 — Engine + Generation Foundation COMPLETE

Status: the local core loop works and was run end to end: **storyboard JSON → validator → recipe renderers → scenes.js / scenes.css / deck.json → assembler → one HTML file → automated QA**. No AI call is involved yet; storyboards are hand-authored. `reference/*`, `engine/film-runtime.js` (SHA-256 `c2a754da…`), `engine/film-runtime.css` and `engine/film-shell.html` are unchanged; the runtime is still shared and appears once in every output.

## Generator architecture

```
examples/generated-demo/storyboard.json
        │  tools/validate-storyboard.mjs   (schema + references + recipe inputs + beat counts + no-code + number provenance)
        ▼
tools/generate-deck.mjs
   per scene: resolve {fact} refs → recipe.normalize → recipe.check → fill <recipe>.scene.js/.css templates
        ▼
generated/<deck>/  storyboard.json  deck.json  scenes.js  scenes.css  index.html  qa-report.json
        │  tools/build-deck.mjs   (same assembler tests use: engine runtime + shell + deck folder)
        ▼
tests/generated/qa.mjs  →  tests/parity/parity.mjs (single-file mode)
```

Command: `node tools/generate-deck.mjs examples/generated-demo/storyboard.json --out generated/examples-demo` (add `--no-qa` to skip the browser run; QA needs `FILMDECK_QA_MODULES` pointing at a `node_modules` containing `playwright-core`). An invalid storyboard exits 1 and writes nothing; failing QA exits 1 with the output left in place for inspection.

Files added: `schemas/storyboard.schema.json`, `tools/{schema-lite,validate-storyboard,build-deck,generate-deck}.mjs`, `engine/recipes/{_lib,index,<5 recipes>}.mjs` plus `.scene.js/.scene.css` templates, `tests/generated/{qa,validator-tests}.mjs`, `examples/generated-demo/storyboard.json`, `generated/examples-demo/`, `docs/STORYBOARD-SPEC.md`. Changed: `tests/parity/build.mjs` (now a wrapper over `tools/build-deck.mjs`; same output), `tests/parity/parity.mjs` (single-file mode, exit code, assertions), `engine/recipes/{registry.json,README.md}`. No dependency was added: the JSON-Schema subset checker is 40 lines (`tools/schema-lite.mjs`); `playwright-core` stays outside the repo as before.

## Storyboard contract

Declarative JSON only: deck metadata, sources, facts, scenes (chapter, kicker, title, recipe, mood, letterbox intent, visual direction, recipe inputs) and beats with speaker notes. The schema forbids unknown keys, so scene code, HTML or CSS cannot be smuggled in under any key name; strings with markup characters, backticks, `${`, arrow functions, `eval(`, `document.` and em-dashes are rejected. Full reference: `docs/STORYBOARD-SPEC.md`.

## Number provenance

A number shown or spoken must be (a) a **fact** (`id`, raw value, exact `display`, `sourceRef`), referenced from recipe inputs as `{"fact": id}`, or (b) a **derived fact** whose value the validator recomputes (`diff`, `ratio`, `sum` of other facts or range edges), or (c) a declared axis tick or generated structural label (`Scene 02`, `PILLAR 01`). Checks:

1. storyboard validator: every digit sequence in on-screen text and speaker notes must equal a whole numeric token inside some fact display (a first version used substring matching and wrongly accepted "3" because of "30%"; the negative tests caught it and it was fixed);
2. recipe checks: facts must lie inside the declared scale; a chart gap must equal the drawn distance between its two edges; labels must fit;
3. QA re-reads the **rendered DOM** at the end of every scene and requires each visible number to trace to a fact display, a tick or a declared structural label (this found the generator's own "Scene 02 / PILLAR 01 / MOVE 01" labels; recipes now declare them explicitly).

36 negative tests (`tests/generated/validator-tests.mjs`) mutate the demo storyboard (invented numbers in titles, labels, cards, notes and captions; missing and unknown sources; wrong derivations; out-of-scale values; HTML, backticks, `${`, arrow functions, em-dashes; `js`/`html`/`css`/`onclick` keys; unknown recipes; beat count and numbering errors; missing inputs; fictional-labelling rules) and all are rejected or warned as intended.

## Recipe system and the five parameterised recipes

Each recipe = metadata and an inputs JSON-Schema (`<id>.mjs`) + a scene template and CSS template written as real, `node --check`-able code adapted from the reference scene. Selected on reuse readiness and coverage of an opening-to-closing story: **gauge-needle** (Velcure s2), **range-bar-chart** (Velcure s3), **pillars-roof** (Velcure s7), **strike-three-moves-checklist** (Velcure s8), **minimal-close** (Velcure s9 / MBA s10; `variant: open` also serves as the opening). Inputs, beat counts, limitations: `engine/recipes/README.md` and `registry.json` (`parameterised: true`). The other 14 stay reference-code-only.

Deliberate deviations from the reference scenes (the references are untouched):
- gauge: centred instead of left-aligned (there are no icon rows beside it); band width for a single value is a layout constant; needle angle and counter come from the declared scale and the fact.
- range chart: rows, axis and gap derive from one linear scale and the facts; the reference's hard-coded 0-60 axis and annotation strings are gone.
- strike-through: **the reference deck draws it as dashes** (`vector-effect: non-scaling-stroke` defeats the `pathLength` dash trick; visible in the Velcure screenshot). The recipe uses a scaled bar, so the generated deck shows a continuous strike. Found by looking at the rendered output, not by a test.
- pillars, close: logic and CSS copied; text comes from data and is HTML-escaped.

## Generated deck structure

`generated/<deck>/`: `scenes.js` (an escape helper, the six scene modules with positional prefixes `S1…`/`s1-…`, and `window.__filmdeckMeta`), `scenes.css`, `deck.json` (intro copy, sections, help line, plus generator version, storyboard SHA-256, sources, facts, per-scene recipe/mood/letterbox, beats with speaker notes, `sourceRefs`, `allowedNumberStrings`), `storyboard.json` (the input, copied) and `index.html`. Speaker notes and source references are machine-readable in `deck.json` and in the page as `window.__filmdeckMeta`; they are never displayed. Generation is reproducible: two runs gave byte-identical `scenes.js`, `scenes.css` and `index.html`.

## QA

`tests/generated/qa.mjs` (20 checks on the demo, all passed): HTML exists; runtime appears once and is byte-identical to `engine/film-runtime.js`, scenes spliced at the marker; unique scene and section ids; valid recipe ids; storyboard number provenance; no code or markup in the storyboard; planned and live step counts equal storyboard beats; chapters match; notes and source references survive; `window.__filmdeckMeta` present; every visible number in the rendered DOM traced; no console errors while opening and walking every scene; then the full interaction harness in single-file mode: forward through every beat, back to the start, scene rebuild after stepping back (all scenes), 40 rapid clicks each way, jump then back, Right/Space/PageDown/Enter/Down/Left/PageUp/Up/Backspace/N/P/digits/Home/End, mouse left/right, black screen, help (key, button, click), fullscreen request (key, button, Begin), sound toggle, timecode, reduced motion, viewports 1280x720, 800x1200 and 2560x1080, final scene reachable.

## Demo result

`examples/generated-demo/storyboard.json` (fictional "Harbor Bikes", labelled fictional in the subtitle, intro and every caption; 5 facts from one `fictional` source, one derived): 6 scenes, 23 beats (3, 3, 5, 5, 4, 3): opening, problem (gauge), cause (range chart with a derived gap), framework (pillars), solution (strike-through, moves, checklist), close. Generated to `generated/examples-demo/index.html` (64 KB). Final-state and intermediate screenshots were inspected by eye: layouts fit, the range chart shows 20-30% against 8-10% with a bracket labelled from the derived fact ("GAP OF 10 POINTS"), the strike is continuous.

## Regression

| | MBA | Velcure |
|---|---|---|
| Scenes / beats | 10 / 50 | 9 / 43 |
| Structural differences vs reference | 0 | 0 |
| Console / page errors | 0 / 0 | 0 / 0 |
| Forward / back ends | 10:4 / 1:0 | 9:3 / 1:0 |
| Rebuild after back, audio node counts, particle share | pass / equal / equal | pass / equal / equal |

Run after all generator work, against the shared assembler. Reference and runtime hashes unchanged; one runtime copy in every build; no `package.json` or `node_modules` in the repository.

## Defects and holes found and fixed during this phase

1. Validator substring match let an invented "3" through (fixed: whole-token match; regression test added).
2. Generator's own structural labels tripped the rendered-DOM scan (fixed: recipes declare `structuralLabels`).
3. Reference strike-through renders as dashes (fixed in the recipe only).
4. A demo example in `decks/_example` earlier hard-coded a made-up figure (removed in a previous step); the new demo contains only fact-backed numbers.

## Remaining limitations

- **Only 5 of 19 recipes are parameterised** and each is rigid (fixed pillar count, 3 moves, 1-4 chart rows, 3-beat gauge). The demo storyline is shaped by that.
- **No AI generation.** Storyboards are hand-written. How well a model can fill the schema, and how often it needs repair, is untested.
- **The number check is digit-based.** It cannot judge claims written in words ("nearly doubled" is only a warning on "doubled"), and `sourceRef`s are labels: nothing verifies them against an uploaded document because no document parsing exists.
- **No automatic overflow/overlap detector.** Text fit relies on schema length limits and the hand-tuned reference layouts; I verified the demo visually. The kickoff's overflow QA is still to be built (the reference decks themselves exceed the Appendix D safe area slightly, see R17).
- **Generated-deck QA runs one file against expectations**, not against a reference. It proves the generated deck behaves like the references (same runtime) but not that the visuals are right.
- **Inherited runtime limitations unchanged:** quirks-mode shell, GSAP and fonts from CDNs (no offline file yet), unseeded randomness, particle state leakage between scenes, digit keys to scene 9 only, `frame()` failure permanent. Generated decks therefore need network for the first load.
- `playwright-core` must be provided outside the repo (`FILMDECK_QA_MODULES`); the generator's QA step fails if it is missing.
- Mood to pad-level mapping, tone to token mapping and the `open` variant of `minimal-close` are proposals derived from the references, not validated by listening or by a designer.
- Security: generated scene code comes only from trusted templates plus JSON-embedded, escaped data, which is the safest position for the model-in-the-loop step; it has not been penetration tested and hosted-deck isolation is still undecided.

## Recommended next steps

1. Parameterise the next high-readiness recipes (icon rows / ranked bars, orbs network, a KPI big-number and a comparison scene) so a storyboard can cover more story shapes.
2. Add an automated overflow/overlap and safe-area check to the QA stage using DOM text ranges (the probe from Phase 0 already did this).
3. Build the AI step against the existing contract: model writes a storyboard against `schemas/storyboard.schema.json`; the validator is the gate; failures go back as error text. Measure pass rate on 10 varied inputs before anything else.
4. Add document parsing so `sourceRef` can carry a real page/slide locator and numbers can be checked against extracted text.
5. Runtime v1.1 fixes already listed (standards-mode shell, inlined GSAP/fonts for the offline file, `FX.S` reset, seeded RNG, `frame()` error handling).

---

# Phase 2 Step 1 — AI Storyboard Generation

Full pipeline description: `docs/AI-STORYBOARD.md`. Scope: source text → Claude → storyboard JSON → validator gate → bounded repair loop → stop. No scene code is generated by the model, nothing it writes is executed, and no reference or runtime file changed.

## ⚠ What was and was not measured

**No live Claude result exists.** `ANTHROPIC_API_KEY` was not set in this environment, so the live path was implemented and tested only against a local fake HTTP server (this tests our client, request shape, retries, key handling, CLI and repair loop, not the model). **Everything labelled MOCK below comes from hand-written fixture responses** (`tests/ai/fixtures/`, each marked `"mock": true`). Their pass rates were designed by me and are **not evidence of model reliability**. The first real number is one command away: `ANTHROPIC_API_KEY=... node tests/ai/evaluate.mjs --live`.

## Model integration

`tools/ai/claude.mjs`: about 30 lines, `fetch` to `/v1/messages`, no SDK or dependency, key from the environment only (never logged, never written to reports), retry on 429/5xx, cacheable system block. Default model `claude-opus-5-5` from the project's environment notes (**unverified against the live API**; override with `FILMDECK_MODEL`). No multi-provider layer.

## Prompt architecture

`prompts/storyboard-generator.md` is the canonical instruction. The program appends the storyboard schema, the five available recipes with their exact input schemas and beat rules (generated from `registry.json` so they cannot drift), the list of NOT AVAILABLE reference-only recipes, and one format example (the fictional demo). About 6.8k tokens, sent once as a cacheable system block; the per-input user message is only the source text. Repair messages add the model's previous JSON and the exact validator errors (no repository files are ever sent).

## Input format

Plain text or markdown, optional front matter (`title:`, `fictional: true`). The source is split into paragraph blocks labelled `[p1]`, `[p2]`, ...; the model must cite blocks as its sources.

## Validator gate (4 stages) and the new grounding check

Parse (single JSON object only) → existing storyboard validator → **grounding against the source** → scene count 3 to 9. The grounding check is new: every non-derived fact's number must literally appear in the source block it cites, source ids must be real block ids, a fact's value must be the number in its display, and a source marked fictional forces `deck.fictional`. The existing validator only proved internal consistency; without grounding a model could have invented `"47%"` with a plausible `sourceRef`. No program ever edits the storyboard.

## Repair loop

At most 3 repairs (hard cap; the CLI option can only lower it), verified by test: a model that never corrects itself is called exactly 4 times, the run exits 1, the last response is kept as `*.rejected.txt` and no valid storyboard file is written. A repair carries source, the model's own previous output and up to 50 categorised errors. Run reports record first-pass validity, repairs used, final validity and errors per category per attempt.

## Available recipes

Only the five parameterised recipes are offered. Reference-only ids are listed as forbidden and rejected as `unsupported-recipe` (an id not in the registry at all is `unknown-recipe`).

## Test corpus

Ten fictional, labelled inputs in `examples/ai-inputs/`: SaaS churn, marketing results, customer research (counts inside sentences, a quote), startup strategy (currency ranges), operations, HR, product launch (dates and a distractor ticket id), financial case (₹ lakh, decimals), a qualitative story with **no digits**, and a dense report with 14 usable numbers and a phone-like distractor. 

## Evaluation results

### LIVE CLAUDE RESULTS
**None.** Not run (no API key). Do not quote any rate in this document as a Claude result.

### MOCK RESULTS (fixtures, not an AI)
`node tests/ai/evaluate.mjs`:

| Input | First pass | Repairs | Final | Fixture's first-response fault |
|---|---|---|---|---|
| 01 saas-churn | valid | 0 | valid | none |
| 02 marketing | invalid | 1 | valid | invented number "89%" in a title (`number-provenance`) |
| 03 customer research | valid | 0 | valid | valid JSON in a markdown fence (tolerated, flagged) |
| 04 startup | invalid | 1 | valid | reference-only recipe `decision-tree` (`unsupported-recipe`) |
| 05 ops | valid | 0 | valid | none |
| 06 hr | valid | 0 | valid | none |
| 07 launch | invalid | 1 | valid | prose before the JSON (`json-parse`) |
| 08 financial | valid | 0 | valid | none |
| 09 qualitative | valid | 0 | valid | none (no facts, no numeric recipes) |
| 10 many numbers | invalid | 2 | valid | ungrounded fact "47%" + wrong beat count; then a fact without `sourceRef` |

Mock summary: 10/10 final valid, **first-pass 6/10**, repairs required 4/10, **average repairs 0.5 per input (1.25 per input that needed repair)**. Failure categories seen (counts over all attempts): number-provenance 1, unsupported-recipe 1, json-parse 1, beat-count 1, recipe-input 2, ungrounded-fact 1, source-reference 1. Inputs with an unknown recipe: 0; unsupported recipe: 1; number-provenance or ungrounded failure: 2; schema or recipe-input failure: 1; source-reference failure: 1; beat-limit failure: 1; JSON-parse failure: 1. These counts reflect the faults I chose to inject.

### One genuine data point from authoring the fixtures
While hand-writing the 10 "model" responses I made unplanned first-draft mistakes that the gates caught: **6 of 10** drafts had a big word longer than the 16-character limit and **5 of 10** had a wrong beat count (the range chart's beat count depends on rows, gap and cards). Anecdotal (one author, which was me acting as the model, n=10), but it suggests the two constraints a real model is most likely to fail first are **text length limits** and **recipe beat arithmetic**, not numbers.

### Pipeline test suite (`tests/ai/pipeline-tests.mjs`): 44 of 44 pass
Prompt contents (five recipes present, reference-only listed as unavailable, forbids code and invented numbers, under 9k tokens, no credentials, no reference HTML); gate categories (prose, truncation, fence, unknown and unsupported recipe, invented number in text and in speaker notes, ungrounded fact, wrong block, invented source id, missing sourceRef, wrong beat count, too many scenes, injected `<img onerror>`, smuggled `js` key, fictional label, over-length text); number-free source (invented facts rejected; the clean fixture has no facts and no digits in any visible or spoken text); bounded loop; repair message content; output is exactly the model's JSON; API client (headers, pinned API version, cacheable system block, usage, 429 retry, no retry on 400, key not in errors); CLI live path against the fake server; no key → exit 3 and nothing written; `evaluate --live` without key refuses; mock failure → exit 1 after exactly 3 repairs.

### Number provenance
Tested with sources containing percentages, currency, counts in sentences (`14 of the 20`), dates, ranges, ratios and decimals (`2.4 years`), thousand separators, a source with no digits, and distractor numbers (`#4471`, `555-0142`). Mutation tests show invented numbers are rejected in titles, labels, cards, captions and speaker notes, and facts absent from the cited block are rejected. In the mock storyboards, distractor numbers are correctly left out. This proves the **gates**; whether Claude respects the rule is unmeasured.

### Rendering the mock storyboards (not AI evidence)
All 10 valid mock storyboards rendered through the existing generator, and the 8-scene deck for input 10 passed the full browser QA (20 checks). Two layouts were inspected visually (three-row chart, gauge with a non-zero minimum): fine. This shows the recipes handle currency/decimal/negative-scale cases from realistic sources; it does not show a model can produce them.

## Existing regression (after all changes)

MBA 10 scenes / 50 beats, 0 structural differences, 0 console or page errors. Velcure 9 / 43, 0, 0. Generated demo: QA OK, 20 of 20 checks. Storyboard validator tests: 36 of 36. Reference and engine files unchanged (SHA-256 identical to before); no dependency added.

## Unresolved problems

1. **Real reliability is unknown.** Run `--live` before drawing any conclusion; decide the acceptance bar (the target of 10/10 final valid is reasonable; first-pass rate and average repairs show cost).
2. **Grounding is lexical.** A real number attached to the wrong meaning (3% called "after" when the source means "before") passes every gate. Needs either a stricter fact schema (a short quoted `evidence` snippet per fact checked against the block) or a second review pass.
3. **Claims in words are unchecked** (causes, recommendations, "price is the main issue"). The prompt forbids inventing them; nothing verifies it. Pillar and move contents in real use will be interpretation; the mock fixtures stay close to the source on purpose.
4. **Recipe expressiveness is the ceiling.** Five rigid recipes force similar story shapes and some bending (target vs actual as before/after; one-row range charts used as "big number" scenes; unit symbols only as suffixes).
5. **Text-fit relies on schema limits**, which may be too tight for natural phrasing and cause avoidable repair rounds. Measure which limits are hit live, then tune limits or recipes.
6. **Output size:** a full storyboard is several thousand tokens; `max_tokens` is 16000. Truncation shows up as `json-parse`; the repair prompt resends the truncated text. Unverified live.
7. The default model id and the prompt-cache behaviour were not exercised against the real API.
8. Sources are plain text paragraphs only (no PPTX/PDF/DOCX, no images, no tables).

## Recommendation for Phase 2 Step 2

1. Run the live evaluation (10 inputs, then a second run to measure variance) and record first-pass rate, repairs, tokens and cost per storyboard. Add 10 more inputs written by someone else, including ones with messy structure.
2. Tune from the real failure categories: relax or reword the limits that fail most, improve the prompt's beat-arithmetic guidance, and consider returning limits as a compact table.
3. Close the grounding gap with a required `evidence` quote per fact (checked as a substring of the cited block).
4. Only after live reliability is acceptable, add document parsing (PPTX/PDF) to feed the same blocks interface, then the 2-stage QA loop and the remaining recipes.

---

# Phase 2 Step 2 — Source Ingestion

Full reference: [SOURCE-INGESTION.md](SOURCE-INGESTION.md). This step adds the front of the pipeline, with no AI and no key needed:

```
PDF / PPTX / DOCX / TXT / MD -> tools/ingest-source.mjs -> normalized source (schemas/source.schema.json)
                              -> tools/source-to-prompt.mjs -> labelled blocks
                              -> tools/generate-storyboard.mjs (mock today, Claude later) -> validator -> recipes -> deck -> QA
```

**What was built.** `tools/ingest/{zip,xml,common,text,docx,pptx,pdf,index}.mjs`, the CLIs `tools/ingest-source.mjs` and `tools/source-to-prompt.mjs`, `schemas/source.schema.json`, 18 fixture files (all fictional or deliberately broken) in `tests/ingestion/fixtures/`, and `tests/ingestion/ingestion-tests.mjs` (114 deterministic checks). **No dependency was added**: PPTX/DOCX use a ZIP reader on `node:zlib` and a small XML reader; the PDF reader is project code.

**Source locations.** Every section keeps a unique, citable id and a `location` (`page-14`, `slide-7`, paragraph number plus file line for text). Ids fit the storyboard id pattern, so the existing grounding gate works unchanged: a fact must still appear literally in the cited section, which now means in the cited *slide* or *page block*.

**Changes to existing files** (behaviour of the plain-text workflow is unchanged, verified by the old tests and a CLI test): `tools/ai/storyboard-lib.mjs` (blocks may carry an optional location label; the "valid ids" hint lists real ids), `tools/generate-storyboard.mjs` (also accepts normalized source JSON and PDF/PPTX/DOCX, plus `--fictional`), `prompts/storyboard-generator.md` (block ids may look like `slide-4-b1`; `kind` slide/page/table).

**Findings.**
- The environment had no PDF capability (no poppler, mutool, PyMuPDF, pypdf), so the PDF reader is ours. It was checked on Chromium-printed PDFs (Type0 fonts with ToUnicode, compressed streams), hand-built PDFs, object streams, and real documents found on the machine (a 2,900-section manual). A real groff-made PDF exposed fonts with no usable text mapping on pages 2+; those pages are reported in `document.pagesWithoutText` and skipped, never guessed.
- A bug found while testing on real files: a list line with several cells could loop forever in the layout pass. Fixed, and the loop now always advances.
- Provenance caught a real problem in my own mock storyboard: a title "Q3 review." was rejected because the digit 3 is not a fact.

**Verification (all run).** Ingestion tests: all pass. Ingested `deck.pptx` -> mock storyboard (valid, 0 repairs) -> generated deck -> browser QA 20/20. AI mock pipeline tests: 44/44, mock evaluation unchanged (10/10 final valid, 6/10 first pass). Validator tests 36/36. MBA parity: 10 scenes / 50 beats, 0 structural differences, 0 errors. Velcure parity: 9 scenes / 43 beats, 0 differences, 0 errors. Reference files and runtime hashes unchanged.

**Open limits.** PDF layout reading is heuristic (multi-column pages, rotated pages, multi-line table cells, borderless tables). Fonts without Unicode data are not readable (no OCR, no CFF glyph-name decoding). DOCX has no page numbers; footnotes, headers/footers, text boxes and images are not extracted; PPTX charts and SmartArt are not extracted. Repeated headers, footers and page numbers are kept as ordinary text.

---

# Phase 2 Step 3 — Unified Local Workflow

Reference: [LOCAL-WORKFLOW.md](LOCAL-WORKFLOW.md). One command now covers the whole local pipeline:

```
node tools/filmdeck.mjs <file.pdf|pptx|docx|txt|md> [--mock|--live] [--mock-fixture f] [--out dir] [--name n] [--open] [--no-qa]
   ingest -> normalized source -> storyboard (mock fixture or Claude + repair loop) -> validate -> generate -> assemble -> browser QA
```

**Design.** `tools/filmdeck.mjs` is an orchestrator only. It runs the existing tools as separate processes (`ingest-source`, `generate-storyboard`, `validate-storyboard`, `generate-deck --no-qa`, `tests/generated/qa.mjs`) and reads their output files; none of their logic is copied. Each stage failure prints `✗ <STAGE> FAILED / Reason:`, records `failedStage` in `run.json`, exits 1 and leaves no finished deck (a QA failure renames `index.html` to `index.failed-qa.html`). Output: `generated/<safe-name>/` with `source.json, storyboard.json (+ .report.json), deck.json, scenes.js, scenes.css, index.html, qa-report.json, run.json, qa-output/`. Names are reduced to `a-z 0-9 -` from the base file name only, so nothing can leave `generated/`.

**Modes.** `--mock` never touches the network and says so; `--live` exits 3 without `ANTHROPIC_API_KEY`; the default auto mode picks live only when a key exists. Mock mode takes `--mock-fixture` or `tests/ai/fixtures/<name>.json` and refuses to invent a storyboard when none exists. A fixture that does not belong to the document is rejected by the existing grounding gate (its numbers are not in the source), so a mock deck can never silently misrepresent a document.

**Changes to existing tools.** `generate-deck.mjs` now replaces only its own output files instead of deleting the whole output folder (so `source.json` and `run.json` survive). `tests/generated/qa.mjs` writes a richer `qa-report.json` (`passed, checks{total,passed,failed}, sceneCount, beatCount, consoleErrors, durationMs`, plus the previous `ok` and `results`) and also writes a report when Playwright is missing. Minimal `package.json` added (Node `>=22.2`, `filmdeck` script, `npm test`); no dependencies.

**Finding: QA depended on a slow CDN.** Mid-step, cdnjs began taking 24 to 40 seconds per request; browser QA then timed out on page load (first seen as a spurious MBA parity timeout, then as two E2E failures with an unchanged storyboard). `tests/support/gsap-cache.mjs` now makes the *test browser* serve that one GSAP 3.12.5 URL from `~/.cache/filmdeck/` (filled from the CDN on first use). Generated decks and reference decks are untouched and still load GSAP from the CDN for real viewers. This makes QA faster and offline-capable; it means QA no longer detects a CDN outage. Product risk remains: a deck needs internet for GSAP (see Open limits).

**Verification.** Full pipeline run on a PPTX with no key: ingest, mock storyboard, validate, generate, assemble, browser QA 20/20, ready. `tests/e2e/e2e.mjs`: Markdown, TXT, PPTX, DOCX and PDF each run the whole pipeline with real browser QA (all pass, 20/20, 0 console errors, about 3 minutes each); `tests/e2e/cli-tests.mjs` (33 checks, no browser): naming and traversal, modes, key never written or used in mock, determinism (byte-identical artifacts), SOURCE_DATE_EPOCH, failure stages, stale-file clearing, `--open` (stubbed opener).

**Open limits.** Decks still load GSAP from a CDN at view time. Live mode has only been run against a fake server. Mock fixtures exist only for the sample documents. Browser QA takes about 3 minutes per deck.

---

# Phase 3 — Local Product Hardening + Content Coverage

Reference: [LOCAL-PRODUCT.md](LOCAL-PRODUCT.md) (architecture, QA modes, checks, security, performance), [LOCAL-WORKFLOW.md](LOCAL-WORKFLOW.md) (commands). Goal: remove the biggest known risks before a web layer, locally, offline and without an API key.

**Built.** (1) Generated decks are fully offline: GSAP 3.12.5 and the three fonts from `engine/vendor/` are embedded by `build-deck.mjs --offline`; reference decks and the parity builds still use the original shell, whose hash is unchanged. (2) QA has two modes on one implementation: `--qa=fast` (about 39 s) and `--qa=full` (about 176 s). (3) Layout QA: stage bounds, clipping, safe area, overlap, oversize (bounding boxes only), plus recipe text zones for text fit; errors fail, warnings are reported. (4) Evidence snippets: each non-derived fact must carry an exact quote from the cited section. (5) Deterministic, lossless, number-safe chunking (`tools/chunk-source.mjs`). (6) Three more parameterised recipes (`icon-rows-ranked-bars`, `big-number`, `comparison`) and `capabilities` metadata for all eight, synced into `registry.json` by `tools/sync-registry.mjs`. (7) A 12-document fictional corpus with mock storyboards and a runner. (8) `run.json` with hashes, versions, mode, QA and timings. (9) `tools/lib/filmdeck.mjs`, a programmatic entry point the CLI now wraps. (10) A security pass with tests, and measured performance.

**Findings that changed the work.**
- The reference shell has no `<meta charset>`: opened from disk, `·`, `₹` and curly quotes became mojibake. Generated decks now declare UTF-8 (reference decks untouched). Found because the new layout probe printed "Â·".
- Text extents must come from text ranges, not element boxes (a centred full-width block is 1920 px wide, its text is not), and glyph boxes taller than a tight line-height must be reduced to the line box, or masks look "clipped". Both were false positives on the first draft of the probe; tests now check real defects fail and legitimate decks pass.
- A rewritten line counter was needed for mixed-size text (a 22 px label next to a 34 px number counted as two lines).
- A strict evidence rule exposes sources where a displayed figure spans two sentences (`6 of 20` came from "14 of the 20 ..." and "6 said ..."): the quote may span adjacent sentences of the same section.
- The product's own text rules caught my corpus fixtures: a deck intro containing "source document." tripped the `document.` DOM-access ban; a title "Q3 review." had a digit that is not a fact; an over-long roof label. This is the intended behaviour, and also a reminder that these bans will cost the model repair rounds.
- Fixed while auditing: a PDF Flate stream could expand without limit (now capped at 64 MB, tested with a 100 MB bomb); `--out` could previously delete a user's own `index.html` or `source.json` (now a folder with foreign files is refused); stage timeouts added.
- During this phase the CDN was slow (24 to 40 s per request); with the embedded assets the product no longer cares.

**Verification (all run in this phase, no API key, mock mode only).**

| Check | Result |
|---|---|
| Validator tests | 36 / 36 |
| Recipe tests (capabilities, registry sync, 3 new recipes, negative cases) | 56 / 56 |
| AI mock pipeline tests | 44 / 44; mock evaluation unchanged (10/10 final valid, 6/10 first pass, 0.5 repairs) |
| Evidence tests | 20 / 20 |
| Ingestion tests | 115 / 115 (one more than before: PDF bomb) |
| Chunking tests | 18 / 18 |
| CLI tests | 37 / 37 |
| API (library) tests | 16 / 16 |
| Layout tests (6 deliberately damaged or clean decks) | 6 / 6 |
| Offline test (network off, DNS broken) | passed: 0 requests, all scenes play, fonts load |
| Generated demo, full QA | 29 / 29 (195 s); fast QA 28 / 28 (49 s) |
| Corpus, 12 documents (fast QA; full on 3) | 12 / 12 pass, 0 console errors, 0 layout warnings |
| E2E, 5 formats (MD, TXT, PPTX, DOCX, PDF), full QA each | 40 / 40, each deck 30 / 30 checks, 0 console errors (about 3 min each) |
| MBA parity | 10 scenes / 50 beats, 0 structural differences, 0 errors |
| Velcure parity | 9 scenes / 43 beats, 0 structural differences, 0 errors |
| Reference HTML, runtime JS/CSS and shell hashes | unchanged |

**Corpus (mock, hand-planned storyboards, not AI).** Sections / tables / chunks / facts / scenes / beats: consulting PPTX 14/1/1/6/6/21; dense PPTX 16/1/1/8/6/20; annual-report PDF 13/1/1/8/5/15; two-column PDF 17/1/1/6/5/15; text-heavy DOCX 15/0/1/4/5/17; DOCX with tables 10/2/1/8/6/19; financial MD 11/1/1/10/6/19; marketing TXT 7/0/1/6/6/19; HR DOCX 12/0/1/10/6/19; qualitative MD 11/0/1/0/4/15 (no digits in the source, no facts); long report 322/40/8/2/3/9 (178,000 characters, eight chunks); messy DOCX 14/1/1/5/5/16.

**Open limits.** Fixture storyboards use only hand-picked, easy text; the corpus shows the recipes survive realistic document shapes, not that a model will choose them well. The two-column PDF is read line by line across columns (the extraction heuristic, documented), so a human would find the order wrong even though numbers ground correctly. `big-number` and `comparison` have no single reference scene and need a designer's review. Icon rows draw person figures whatever the unit. Layout QA is bounding-box based: it cannot see low contrast, overlapping graphics or ugly spacing, and the three new recipes' layouts were checked by eye on screenshots only for a few cases. Multi-chunk storyboard generation does not exist yet. GSAP's license needs a decision before commercial use.


## Phase 4 — Local web product

A Next.js app in `web/` wraps `runFilmDeck()` (details in [WEB-APP.md](WEB-APP.md)): upload page with drag-and-drop, fast/full QA choice, in-process job queue, `/api/generate` and `/api/status/[id]`, real progress from `onEvent`, a result page that plays the generated deck in a sandboxed iframe, and a CSP-locked `/deck/[id]` route. The engine, recipes, runtime and reference decks were not changed. Mock mode only: no Anthropic call, no key, no database, no auth.


## Phase 5 — Live Claude storyboard generation

Live mode for arbitrary documents (single call up to 60,000 characters, map/digest/design above, 300,000 limit), typed provider errors with bounded retries, an untrusted-source prompt rule with per-run fences, per-run call/token/time accounting in `run.json`, Live in the web UI, and a cost-bearing evaluation harness (`npm run test:live`). Verified offline against a fake Anthropic endpoint; **real-Claude quality is unmeasured** (no key was available). Details and the call budget: [LIVE-AI.md](LIVE-AI.md).


## Phase 6 — Pre-validation completion (no real-model calls)

**Scope.** Everything needed before the first real-Claude evaluation, with no real provider call, no payments, no hosting. Real-model results: **NOT RUN**.

**Changes.** Visual-review workflow (`tools/review-deck.mjs`, `scripts/review-samples.mjs`); recipe defect fix (`icon-rows-ranked-bars` `icon` input, neutral `block` default); cost accounting from API-reported tokens and configured prices; `callBudget` and a tested call ceiling; long-document hardening (duplicate candidates, digest bound); `maxRepairs` NaN bug fixed; web journey redesign in the decks' palette and type; web hardening (loopback Host check, 411 for unbounded bodies, symlink escape, retry, delete, retention, orphan cleanup, queue counts waiting jobs only); upload deleted after success; exact-pinned web dependencies, `.env.example`, `npm run setup:qa`, README.

**Verified in this phase (executed, results):**

| Check | Result |
|---|---|
| `npm test` (12 offline suites incl. fake-provider live path, adversarial, long-document) | 496 checks, 0 failures |
| Layout tests (broken decks must fail) | 6/6 |
| Review tool tests | 16/16 |
| Mock web E2E, Full QA chosen in the browser | 90/90 |
| Fake-provider live web E2E | 41/41 |
| Hardening web E2E (fake provider) | 49/49 |
| Generated demo Full QA / offline playback | 29/29 / pass |
| MBA parity (fresh build) | 10 scenes, 50 beats, 0 structural differences |
| Velcure parity (fresh build) | 9 scenes, 43 beats, 0 structural differences |
| Corpus (12 documents) | 25/25 |
| Five-format end-to-end, Full QA | 40/40 |
| Production build / typecheck | pass |
| Reference HTML, shell and runtime hashes | unchanged |

**Test-suite corrections made on the way (not weakened):** the mock web suite expected the uploaded original to remain after success and the server to refuse a `.exe`; both are now different by design (original deleted on success, wrong types refused in the page), and the tests assert the new behaviour. The first regression run's parity build step was called without a deck name (my script); both parity checks were rerun on fresh builds.

**Observed instability.** Full QA normally takes about 3 minutes. Once, with heavy macOS background load (system daemons at 90% CPU, load average about 9), a Full QA run inside the web server hit the 20-minute QA stage timeout, and the same deck run directly took 16 minutes 40 seconds at 10% CPU (waiting, not computing) yet passed 30/30. On a quiet machine the same suite passed 90/90. Treat Full QA duration as machine-dependent; the web test's 7-minute wait is tight on a loaded machine.

**Not exercised by a test:** the per-stage process timeouts (only the provider timeout is tested), TLS/auth (out of scope), parser sandboxing (not implemented).
