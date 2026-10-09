# FilmDeck Scene API (as implemented)

Canonical contract for FilmDeck scenes. It is derived from the code in `engine/film-runtime.js`, `decks/mba/scenes.js` and `decks/velcure/scenes.js`, not from the kickoff document. Where the kickoff (Appendix A/D) differs, the code wins and the difference is noted.

Conventions in this document:
- **[code]** established by reading the runtime or scenes.
- **[verified]** established by running a deck (parity suite or the example deck in `decks/_example/`).
- **UNRESOLVED** not established; do not rely on it.
- Runtime line references are to `engine/film-runtime.js` function names, not line numbers.

---

## 1. Scene lifecycle

A deck is a list of scenes registered with `def({...})`. The runtime owns the lifecycle; a scene never calls its own hooks.

```
page load
  def(...) x N                          registers; builds nothing           (def)
  fit(); activate(SL[0],false)          first scene is built and entered immediately, still blank (step 0)
  user clicks Begin                     audio starts; pad mood set from SL[0].mood

activate(s, toEnd)                      used for first scene, next scene, back-into-scene, rebuilds
  1. gsap.killTweensOf(FX.S); FX.set({gain:1, streak:0})
  2. build(s):  kill(s); s.el.innerHTML = s.html();  s.r = {data-r name -> element}; s.st = {}; s.ctx = null;
                prepTitle(s.el); s.init(s.r, s)
  3. s.el gets class "on"; s.on = true
  4. s.enter(s.r, s)
  5. if toEnd: runStep(s,i,instant=true) for every step i
  6. SND.mood(...s.mood or [1,500]); letterbox(!!s.letterbox)

each ticker frame (gsap.ticker)          FX.update + FX.draw, then s.frame(time, dt, s.r, s) for every scene with s.on

click (next)                            finish(s); then runStep(s, step, false); step++      (or go(next scene) when step == steps.length)
back inside a scene                     kill(s); activate(s,false); runStep(s,i,true) for i < step-1; step = step-1
back from step 0                        go(cur-1, -1, toEnd=true): previous scene built and every step replayed instantly
scene change (go)                       activate(next); outgoing: optional s.exitFx(tl,r) (forward only), zoom-blur push,
                                        then kill(prev), prev.el.innerHTML='' , clearProps
```
[code], and every path above was exercised by the parity suite [verified].

Facts that follow from this:
- A scene is **built from scratch every time it is entered or stepped back inside**. Nothing survives a rebuild except the `def` object's own fields and module-level variables (which are shared, see section 12).
- A scene starts **blank at step 0**. Its first beat conventionally plays `titleIn`.
- During a scene transition both scenes have `on === true`, so both `frame()` hooks run until the outgoing one completes [code].

---

## 2. Scene object structure

```js
def({
  id,        // string
  chapter,   // string
  letterbox, // boolean, optional
  mood,      // [level, cutoffHz], optional
  html,      // () => string
  init,      // (r, s) => void, optional
  enter,     // (r, s) => void, optional
  exitFx,    // (tl, r) => void, optional (not in kickoff Appendix A)
  frame,     // (t, dt, r, s) => void, optional
  steps      // Array<(tl, r, s) => void>
})
```

`def(o)` mutates and returns `o`, adding: `el` (the `<section>`), `tls` (timelines created for this scene), `loops` (infinite tweens), `timers` (interval ids), `r` (named elements), `st` (scene state), `on` (boolean). Scenes get `ctx` by assigning it themselves (`s.ctx = hc(r.cv)`); `build` resets it to `null`. The registration order **is** the presentation order.

All hooks are invoked with `this === s` (the def object) [code]. Only MBA scene 6 relies on this (`html()` stores `this._tris` for later steps); it is a quirk, see section 18.

---

## 3. Required fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | **yes** | string | Must equal the `id` of a `<section class="slide">` present in the shell: `def` does `document.getElementById(o.id)` with no check. The shell receives its sections from `deck.json` `sections`. If no element exists `s.el` is `null` and the first `activate` throws. UNRESOLVED how the page behaves exactly (not tested). |
| `chapter` | **yes** | string | Displayed in the HUD as `NN / total   CHAPTER`. Not escaped (set via `textContent`, so safe). Case is shown as written. |
| `html` | **yes** | function returning string | Called on every build. `s.html()` is called without arguments. |
| `steps` | **yes** | array of functions | One function per beat. `s.steps.length` drives the HUD dots and navigation. An empty array is UNRESOLVED (code suggests the scene is skipped instantly by `next()`; not tested). |

`mood` is formally optional (`s.mood || [1,500]` in `activate`) **but `begin()` evaluates `SND.mood(...SL[0].mood)` with no fallback**, so the **first scene must define `mood`** [code]. Every scene in both reference decks defines it; treat it as required.

---

## 4. Optional fields

| Field | Type | Called when | Notes |
|---|---|---|---|
| `letterbox` | boolean | `activate` | `true` slides the 120 px black bars in and hides the HUD and timecode (`hud()` toggles `.quiet`). Used by opening and closing scenes. The bars animate 1.2 s from `activate`, independent of the transition timeline. |
| `mood` | `[level, cutoff]` | `activate` and `begin` | `SND.mood(level, cutoff)`: ambient pad gain = `0.05 * level`, lowpass cutoff in Hz. Values in the references: level 0.5 to 1.2, cutoff 240 to 900. Ramps with time constants 1.2 s and 1.5 s. |
| `init(r, s)` | function | `build`, after `html()` is inserted and `[data-r]` collected | Set initial hidden states (`gsap.set`), create canvas context (`s.ctx = hc(r.cv)`), split text (`splitChars`), build `s.st`, precompute geometry. Runs before `enter`. |
| `enter(r, s)` | function | `activate`, after `.on`, before any replayed step | Configure the shared particle field (`FX.release()`, `FX.set(...)`). May tween `FX.S`. |
| `exitFx(tl, r)` | function | `go()` when this scene is the outgoing one and direction is forward | Adds tweens to the transition timeline `tl`; presence delays the standard push by 0.3 s. Only MBA scene 2 uses it. Not called for backward transitions. |
| `frame(t, dt, r, s)` | function | every ticker frame while `s.on` | `t` = `gsap.ticker.time` seconds, `dt` seconds clamped to 0.05. For canvas drawing and continuous simulation. If it throws, the runtime logs it and sets `s.frame = null` on the def object permanently (until page reload). |

Anything else on the object is ignored by the runtime (scenes may store private fields, e.g. `_tris`).

---

## 5. Beat / step contract

A step is `function (tl, r, s) {}` called as `s.steps[i].call(s, tl, s.r, s)` inside a `try/catch` that only logs `console.error` [code].

- `tl` is a fresh `gsap.timeline` per beat (paused when replaying instantly, running otherwise). The step **adds** tweens and `tl.call(fn, null, position)` callbacks to it and returns. It does not play it.
- Position `0` is the click instant. Typical beat length in the references: 0.5 s to 5 s.
- `r` is the name to element map built from `data-r` attributes; `s.st` is the scene state object.
- Anything a beat changes must be one of:
  1. a tween on `tl` (DOM/SVG attributes, CSS via GSAP, or properties of `s.st`);
  2. a `tl.call(...)` callback (DOM text changes, class changes, `sfx`, `FX.*`, `shake`, `flash`, `loop(...)`, creating elements);
  3. a `tl.set(...)`.
- **Do not** mutate state at step-function top level except to build tweens, and do not use `setTimeout` / `requestAnimationFrame` / event listeners. `setInterval` is allowed only if the id is pushed to `s.timers` (MBA 7 does this) [code]. Infinite tweens must be registered with `loop(s, tween)` or be created in `init`/steps and killed with the scene's own elements (see section 12).
- The number of `steps` must equal the number of storyboard beats. The runtime does not know about the storyboard; the QA stage must check this (kickoff Appendix D rule, still correct).
- Beat `i` may read what earlier beats set (`s.st`, element text, classes); on replay beats `0..i-1` have run to completion before beat `i` is built, so that is safe. A beat must **not** depend on wall-clock time between clicks (MBA 3 does, see section 18).

### Speed of replay
`INSTANT` is a runtime flag true while replaying or fast-forwarding. `sfx`, `shake` and `flash` do nothing when it is true. `FX.burst`, `FX.set`, `FX.targets` and everything else still run, so particle impulses fire during rebuilds (harmless but visible as a brief particle disturbance).

---

## 6. Replay / back-navigation contract

- Back never reverses tweens. It **rebuilds the scene and replays beats `0..step-2` with `timeline.progress(1)`** [code, verified].
- Forward click while a beat is still animating: `finish(s)` calls `progress(1)` on every unfinished timeline of the scene (silently, `INSTANT = true`), then starts the next beat. So **every beat must be safe to jump to its end at any moment**, including its `tl.call` callbacks being executed immediately in order.
- Consequences for scene code:
  - Callbacks must be idempotent with respect to ordering within a beat and must not assume real time passed.
  - Anything that must look "continuous" (loops, simulations) must be started by a `tl.call` or in `frame()` from state, not by elapsed time since the click.
  - `fromTo` start values are applied when the tween is created (the step function runs), so a beat's `from` values override whatever state previous beats left; use `from` values that match the previously-set end state, or accept the jump.
- Cross-scene back: the previous scene is built and **all** its steps are replayed instantly, so entering a scene backwards shows its final state.
- Jumps (`N`, `P`, digits, `Home`, `End`) enter the target scene at step 0 (blank), even when jumping backward [verified].
- Randomness is unseeded: replays are structurally identical (element and text counts matched in every scene [verified]) but not visually identical wherever `Math.random`, `rand` or `pick` is used.

---

## 7. Scene rebuild contract

Because `build(s)` runs on every entry and every in-scene back step:

1. `html()` must be a pure string builder: no side effects, no reading of previous DOM. (Randomness in it is tolerated; MBA 6 and 2 use it.)
2. `init()` must (re)create every piece of scene state; it may assume `s.st` is `{}` and `s.ctx` is `null` and that `r` points at freshly inserted elements.
3. Module-level constants are shared between builds; **never mutate them** (MBA 2's `S2N` and Velcure's `R3` are read-only by convention) [code]. Mutable data lives in `s.st`.
4. `kill(s)` removes: every timeline in `s.tls`, every tween in `s.loops`, every interval in `s.timers`, and all tweens targeting descendants of `s.el`. It does **not** remove tweens targeting objects outside `s.el` (e.g. `FX.S`, `world`), `setTimeout`, or event listeners. Those are handled elsewhere: `activate` kills tweens on `FX.S`; `shake` self-resets `world`.
5. After a scene is left, its `el.innerHTML` is emptied and inline styles cleared (`clearProps:'all'`). Its `st` keeps stale values until the next build.

---

## 8. HTML / SVG / canvas contract

- `html()` returns markup for a 1920 by 1080 coordinate space, inserted into `section#<id>.slide` which is `position:absolute; inset:0`. Elements are positioned with absolute pixel coordinates; SVG layers use `class="full"` plus `viewBox="0 0 1920 1080"`.
- **Named elements:** `data-r="name"` makes the element available as `r.name` (last one wins on duplicates). Names are per-scene. Elements created later (e.g. appended SVG circles) are not in `r` unless the scene adds them itself.
- **Standard title:** `titleHTML(kicker, text, accentWord?)` yields `.kick` and `h2.title[data-r=title]`; `titleIn(tl, s, at)` animates it and plays `hit`. `build` pre-hides the title words (`prepTitle`). Scenes that do not use `titleHTML` (openings, closes) simply do not call `titleIn`.
- **Text effects:** `splitChars(el)` replaces `textContent` with `.ch` spans (inline markup is lost) and returns the spans.
- **SVG:** drawn into inline `<svg>`; draw-on animation uses `pathLength="1"` with `stroke-dasharray:1; stroke-dashoffset:1` (CSS or inline) and tweens `strokeDashoffset` to 0. Camera effects on SVG use `svgOrigin`. Dynamic elements are created with `document.createElementNS`.
- **Canvas:** put `<canvas class="full" data-r="cv">` in `html()` and in `init` call `s.ctx = hc(r.cv)`. `hc` sizes the backing store to `1920 * SC * min(2,DPR)` and applies a transform so all drawing uses 1920 by 1080 coordinates. On window resize the runtime re-creates `s.ctx` **only for the element named `cv`** of each active scene; other canvases would not be resized (UNRESOLVED: no scene has two canvases). Drawing happens in `frame()`; clear it yourself each frame.
- **Do not** access `document` directly: both decks use only `r`, `s.el` and the scoped `$`/`$$` helpers. SVG ids that must be global (`<linearGradient id>`, `<filter id>`, `<path id>` for `textPath`) exist in MBA (`#s5g`, `#s2arc`, `#chalk`); prefix them with the scene id.
- The particle canvas (`#fx`) sits **behind** the scene layer, so scene elements draw over particles.

---

## 9. CSS contract

- Scene CSS is concatenated into one global stylesheet after the runtime CSS; **nothing is scoped by the runtime**.
- Required convention: every class a scene defines starts with a prefix unique to the scene (`s3-`, `v4-`). Verified state of the references: MBA uses `sN-`, Velcure `vN-`, but **MBA has 12 unprefixed scene classes** (`.bub .chip .crk .fw-w .mg .mg-t .pc .rc .rc-f .rc-h .rc-v .shard`) and **Velcure has 6** (`.e-dot .e-dr .e-rays .e-star .e-tx .fg`). These work only because the two decks never share a page. A generated deck must not do this.
- Prefix numbers are positional in the references (`s5-` is the fifth scene). Reordering scenes does not break anything functionally, only the naming meaning.
- One reference rule is tied to a section id: MBA `#s2 svg text{...}`. Avoid id selectors; use the scene prefix.
- Shared classes a scene may use without defining: `.full .kick .title .w .wi .slot .ch .dsp .serif .mono`.
- Use the design tokens (`var(--ember)` etc.) in CSS. The references also hard-code hex and `rgba()` in inline SVG and canvas; that is current behaviour (UNRESOLVED how theming will treat it; see SCENE-DATA-CONTRACT.md).
- Fonts: only the three loaded families (Barlow Condensed 500/700/800/900, Instrument Serif regular/italic, JetBrains Mono 400/500). In canvas use the exact family names.

---

## 10. Audio contract

- Call `sfx(name, ...args)`. It is a no-op while `INSTANT`. Calling `SND.x` directly bypasses that guard (only `SND.mood` is called directly, by design).
- Names and arguments (defaults in parentheses): `whoosh(dur .9, dir 1)` (dir -1 reverses), `boom(level 1)`, `hit(level .6)`, `tick(freq 1500, level .1)`, `blip(freq 880, level .16)`, `riser(dur 1.6, level .45)`, `glitch()`, `crack()`, `snap(freq 2200)`, `chime(freq 440, level .2)`, `chalk()`. Unknown names are silently ignored.
- Trigger sound from `tl.call(...)` at the matching animation position, never from the step function body (it would play at build time and during replays' build).
- Convention in the references: sound on major moments only (impact, reveal, end of a build); `hit` with the title (`titleIn` does it).
- Pad: `mood: [level, cutoff]` per scene; the close scenes also call `SND.mood(.22,180)` in their last beat to fade it.
- Sound state (`on`) and the audio context are global; scenes must not create their own `AudioContext`.
- Audio is untestable headless except by node-creation counts (done in the parity suite).

---

## 11. Particle contract

`FX` is one shared field of 1500 particles behind the scene layer. A scene configures it; it does not own it.

- In `enter()` call `FX.release()` (drop text targets) and `FX.set({...})`. Settings used: `mode` (`drift|chaos|vortex|flow`), `alpha`, `alphaT`, `trail`, `size`, `speed`, `gain`, `mix:[paper,ember,signal,alarm]` (relative weights), and for targets `k damp jitter`, for vortex `cx cy`, for flow `sy`.
- Beats may change them with `tl.call(()=>FX.set(...))` or tween `FX.S` properties (`alpha`, `gain`, `trail`).
- Text/shape morph: `FX.targets(FX.textPoints(text,x,y,size,{gap}))`, `FX.targets(FX.gridPoints(x0,y0,x1,y1,step))`; impulses `FX.burst(x,y,power)`; `FX.explodeFrom(points,power)`; `FX.pulse(dir)` is reserved for the runtime's transition.
- **Leakage:** `activate` resets only `gain` and `streak`. `k damp jitter cx cy sy alphaT` keep the previous scene's values unless the new scene sets them. A scene that uses targets or modes must set every parameter it relies on. UNRESOLVED whether the runtime should reset the rest (it is not done in this step).
- Particles are non-deterministic; any scene using `FX` is visually non-deterministic.
- Closing scenes fade the field with `to(FX.S,{gain:0})` and `enter()` re-fades with `to(FX.S,{alpha:.08})`.

---

## 12. State management rules

- `s.st` is the only place for mutable scene state. It is reset to `{}` by `build`, then initialised in `init` (or lazily in a step, as MBA 2 does with `s.st.pk=[]`).
- State that animations drive (counters, `tension`, `chaos`, `vis`, `cam`) is a plain property of `s.st` tweened on `tl`, then read in `frame()`.
- Module-level `const`/`function` declarations are shared across scenes in the same closure. **Names must be unique across a deck.** The references use positional prefixes (`S2C`, `R3`, `P5`, `V1`, `G4`); `R3` appears in both decks (never together). Until scene modules are wrapped in their own scope, generated constants must carry the scene prefix.
- Never store references to DOM elements outside `s.r`/`s.st`; elements are destroyed on rebuild.
- Infinite animations: `loop(s, tween)`. Intervals: push to `s.timers`. Both are killed with the scene.
- `s.tls` accumulates one timeline per beat and is only emptied by `kill`; this is bounded by the number of beats.
- A scene must work if its beats are replayed in order any number of times.

---

## 13. Coordinate / stage rules

- Space is 1920 by 1080, origin top-left, independent of the screen (the runtime scales the stage). Scenes must not read `innerWidth`, `devicePixelRatio` etc. (`SC` is exposed only for `getBoundingClientRect` conversions, as MBA 6 does).
- Layout zones: kicker at y = 62, title top at y = 90 (84 px type, one line ends near y 180), HUD bottom 80 px (labels near y 1040). Kickoff Appendix D keeps content inside x 110 to 1810 and y 60 to 1000. The references themselves exceed this by up to about 20 px (Velcure scene 6 closing line to y 1018, a chip to x 1841) [verified], so a checker needs a tolerance.
- Letterbox scenes hide the HUD; bars cover y 0 to 120 and 960 to 1080 when active, so content in letterbox scenes stays between y 120 and 960.
- Z-order inside the stage: particles < scene < vignette < grain < bars < HUD < flash. Scene content cannot appear above the vignette/grain.
- Fonts use pixel sizes in stage units (e.g. 84 px title, 300 to 460 px closing words).

---

## 14. Naming rules

- Scene `id`: any string unique in the deck and equal to its `<section id>`. References use `s1..sN`. Hard rule: **ids are referenced in the shell (`deck.json` `sections`)**.
- Registration order = presentation order; the HUD number is the array index + 1.
- `data-r` names: short lower-case words; numbered siblings use a suffix (`n0`, `p3_1`, `bar2`). Unique within the scene.
- Prefix every CSS class, SVG id and top-level JS constant with the scene prefix (MBA `S2…`, Velcure `V1…`, `G4…`). Constants shared between a scene's functions are upper-case.
- Kicker text in the references is `Scene NN · Topic` written by hand. UNRESOLVED whether the runtime should generate the number.

---

## 15. Forbidden patterns

1. `setTimeout`, `requestAnimationFrame`, `addEventListener` inside scenes; `setInterval` without `s.timers` [none present in the references except one registered interval].
2. State changes outside the timeline (step function top level, other than building tweens).
3. Changing module-level constants or relying on state surviving a rebuild.
4. Wall-clock dependence between clicks.
5. Unprefixed CSS classes, global SVG ids, id selectors in CSS.
6. Hard-coding colours/fonts that exist as tokens (current references do it in canvas and SVG; do not copy).
7. Writing to `world`, `#stage`, `#hud`, `#fx` or other runtime elements directly (`shake`/`flash` exist for that).
8. Calling `SND.*` instead of `sfx`; creating audio contexts.
9. Using `document` directly; two canvases; resizing canvases manually.
10. Inserting source text into template literals unescaped, or text containing a backtick or `${` (UNRESOLVED escaping policy; the runtime does not escape).
11. Em-dashes in any on-screen text (product rule).
12. Invented numbers (product rule; see SCENE-DATA-CONTRACT.md).
13. More than one `def` per id, or ids with no section.
14. Depending on `Math.random` results for meaning (which item is highlighted) without a stored choice: replays re-roll.

---

## 16. Minimal example scene

Validated by running (`decks/_example/`, scene `s1`):

```js
def({id:'s1',chapter:'HELLO',letterbox:false,mood:[1,500],
  html:()=>`${titleHTML('Scene 01 · Example','ONE IDEA PER SCENE.')}
    <div class="ex1-word" data-r="word">HELLO</div>`,
  init(r){ gsap.set(r.word,{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.2,.3,0]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0) },
    function(tl,r){
      tl.fromTo(r.word,{opacity:0,scale:2.4,filter:'blur(24px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.42,ease:'expo.in'},0)
        .call(()=>{ sfx('boom',1); shake(14); flash(.2) },null,.42) }
  ]});
```
with CSS `.ex1-word{position:absolute;left:0;right:0;top:420px;text-align:center;font:900 300px/1 var(--f-display);}`.

---

## 17. Complete example using the actual API

`decks/_example/scenes.js`, scene `s2`, exercises: data-driven SVG chart drawn to scale from constants, a canvas with `frame()` driven by tweened `s.st`, `loop()`, particle text morph with `FX.textPoints/targets`, several sounds, and replay safety. See the file for the full source (about 45 lines); the structure:

```js
const EX2_DATA=[{k:'BEFORE',v:4},{k:'NOW',v:11}], EX2_MAX=12;           // content provided by a storyboard
def({id:'s2',chapter:'EXAMPLE',mood:[1,600],
  html:()=>`${titleHTML(...)} <svg class="full" viewBox="0 0 1920 1080">...bars from EX2_DATA...</svg>
            <canvas class="full" data-r="cv"></canvas>`,
  init(r,s){ s.ctx=hc(r.cv); s.st={fill:0}; gsap.set(...) },
  enter(){ FX.release(); FX.set({...}) },
  frame(t,dt,r,s){ const c=s.ctx; if(!c) return; c.clearRect(0,0,W,H); /* draw from s.st.fill */ },
  steps:[ function(tl,r,s){ titleIn(tl,s,0) }, /* bars scaleX */, /* tween s.st.fill + loop pulse */, /* FX text morph */ ]});
```

The example deck passes the same harness as the references: forward and back through all beats, rebuild checks, rapid clicking, zero console errors (see ENGINE-ANALYSIS.md, Phase 1 Step 2).

---

## 18. Known quirks that must remain compatible with the current runtime

1. **Blank step 0 and the extra click per scene change** (section 6).
2. **`this` binding:** hooks run with `this === s`; MBA 6 depends on `this._tris` created in `html()` and read in a step.
3. **`exitFx`** exists but is absent from Appendix A; forward transitions only.
4. **Digit navigation:** `1..9`, and `0` jumps to scene 10 only if it exists; scenes 11+ unreachable by digit. `N`/`P`/`Home`/`End` work for any count.
5. **Jump lands on step 0** even backward; only `prev()` from step 0 lands at the previous scene's end.
6. **`mood` effectively required on scene 1** (section 3).
7. **`frame()` failure is permanent** until reload, and `activate` does not restore it.
8. **`INSTANT` pre-roll in MBA 3:** a step calls `s3update` in a loop under `INSTANT` to fake 5 s of tree growth; the lit path depends on click timing.
9. **Closing scenes** start their own `FX.S` tweens in `enter()` outside the timeline (killed by `activate`'s `gsap.killTweensOf(FX.S)` on the next scene).
10. **Random replays:** MBA 2 packets, 3 tree, 5 sparks, 6 shards/team jitter, 7 data series; Velcure 1 (which figures leave), 6 (drop positions) differ on replay.
11. **Timecode** shows wall-clock since Begin, not progress through the deck.
12. **Unprefixed CSS** and global SVG ids described above.
13. **Quirks mode:** the shell has no doctype; scene CSS was authored against that. Adding a doctype is deferred and untested.
14. **GSAP defaults:** `gsap.defaults({ease:'power3.out'})`; steps that omit `ease` use it.
15. **`gsap.set` targets in `init`** use element arrays; filtering with `$$` on `s.el` descendants is the norm.

### UNRESOLVED (do not rely on)
- U1 Behaviour of an exception thrown inside a `tl.call` callback.
- U2 Scene with an empty `steps` array, or a missing `<section>` for an id.
- U3 Two canvases in one scene (only `cv` is resized on window resize).
- U4 Many beats (HUD dots beyond about 12) or more than 10 scenes: layout/navigation unverified; the references have at most 9 dots.
- U5 Escaping policy for source text in `html()`.
- U6 Whether `mood` ranges outside 0.5 to 1.2 / 240 to 900 Hz sound acceptable.
- U7 Theme behaviour of inline hex colours.
