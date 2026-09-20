# FuX Chaos Lab

An interactive prototype of **FuX**, the living reactive body of the Magic
Mirror Box — running in the browser so the material graph, the Chaos resolver,
and the four moods can be tuned before any engine time is spent.

The reference is `docs/symbiote-entity-ue5-build-kit.pdf`. This is that
blueprint, executable.

```bash
npm install
npm run dev        # http://localhost:5173
```

Click or drag on the mass to touch it, move the pointer to make FuX lean
toward you, and press `3` for the demo signal.

---

## Why this exists

The build kit specifies a single Blueprint actor, one master material, three
Niagara systems, four mood Data Assets, and a universal reaction layer. Every
one of those is a decision that is cheaper to make now than inside UE5:

- **The Chaos resolver is the actual logic**, not a sketch of it. It runs at
  30 Hz with the same priority stack, the same smoothing, and the same clamps
  the actor will use, and it is covered by tests.
- **The material graph is real GLSL.** `Flow = CurlNoise + WaterCurrent`,
  `Pressure = AudioLow + Threat + Touch`, `Spikes = pow(saturate(Noise *
  Pressure), 5)` — written the way the kit writes it, and immediately
  visible.
- **The adapter boundary is real.** A WebSocket packet source stands in for
  MilkDrop-Shake, so the bridge can be proven before the display machine is
  chosen.

What it is **not** is a UE5 substitute. There are no `.uasset` files here. The
value is in the numbers, the timing, and the behaviour, which port directly.

---

## Controls

| Key | Action |
|---|---|
| `1` | Audio input — microphone (WaveScope's system-audio tap, where the browser allows it) |
| `3` | Demo signal — the calibrated loop |
| `S` | Silence · `Shift+S` toggles low-stimulation mode |
| `A` | Mood back to auto |
| `C` `J` `O` `W` | Story cue: Calm · Joyful · Ominous · Wild |
| `T` `P` `X` `V` | Inject Touch · Proximity · System spike · Voice |
| `R` | Record a take · `E` to export |
| `Q` | Cycle quality tier |
| `M` | Settings menu — every control, over the stage · `Esc` closes it |
| `H` | Hide the chrome: panels → everything → back · `Space` pause |

The keyboard shortcuts deliberately echo the WaveScope workflow in the README,
so the lab and the audition tool feel like one pipeline: `3` for the silent
demo signal, `1` to tap audio, `R` to record a reference take.

### The chrome, and the settings menu

The page opens with almost nothing on it: FuX, the live readout, and one button
in the corner. Every control lives in the settings sheet behind that button
(`M`, or `Esc` to close it), so the entity is not competing with a wall of
sliders — which is the same argument the build kit makes about the actor's own
public controls.

| Where | What |
|---|---|
| Corner button / `M` | the settings sheet: on-screen toggles, signal source, bridge, moods, signals, observer, entity, safety, quality, take |
| Readout's × | closes the readout; the sheet's **Live readout** box brings it back |
| `H` | cycles the presets: everything → panels hidden → just FuX → back |

The sheet's "On screen" group is the same state the `H` key drives, rendered as
checkboxes, so the ticks always describe the page you are looking at. **Just
FuX** clears the masthead, the readout and the message bar in one press;
**Show all** puts them back. The launcher stays visible in every mode on
purpose — a view mode you can only leave by remembering a keystroke is a trap,
not a feature.

### Hearing the room (`1`)

The microphone has to be granted by the page that owns the tab, so a lab
running inside a preview frame usually never gets a permission prompt — the
browser declines on your behalf before the app is consulted. The lab checks
which situation it is in and says so rather than repeating "allow microphone
access" at somebody who was never asked:

- **In its own tab**, `1` prompts normally, and FuX listens.
- **In a preview frame**, the deck explains that the frame is the blocker and
  offers a link that opens the same URL in a new tab, where the prompt works.
- **Either way**, if the input stays unavailable the demo signal keeps the body
  moving, and the message says that is what is happening — a still entity and a
  silent failure would be worse than an honest fallback.

`Shift+S` (low-stimulation) and the demo signal both work regardless of any of
this; nothing in the lab depends on the microphone.

---

## What is running

### The update order (build kit p.8)

`src/engine.js` implements the eight-step loop exactly as specified — gather
packets, normalise, resolve priority/mood/memory, smooth, decay, clamp, apply,
store the trace — with visual parameters at 30 Hz while the render loop runs
free.

### The priority stack (p.7)

```
1. Safety override   clamp flash and displacement
2. Story cue         directs the mood
3. System event      urgent spike
4. Touch / contact   short foreground response
5. Music             continuous motion
6. Idle              breath and awareness
```

The readout names the level that produced each frame's answer, so the stack is
observable rather than assumed.

### The four moods (p.7)

Stored exactly as `DA_EntityMood` fields in `src/core/moods.js`. Each mood
changes a timing value, a shape value, a particle value, and a response bias —
a test asserts that, so a mood can never quietly become a colour filter.

Ominous enters over 2.6 s and Wild exits over 2.4 s, per the kit's note that
"the energy must settle".

### The chaos bands

| Chaos | Band | Mood | Hunt behaviour (spawn-verification.md) |
|---|---|---|---|
| 0–25 | calm | Calm | Shards near familiar zones, generous windows |
| 25–60 | stirring | Joyful | Shards spread wider, tighter windows |
| 60–90 | surging | Ominous | New zones unlock, harder checks |
| 90–100 | unleashed | Wild | Mythic shard placements, chaos drops |

No single sense can pin the meter at 100. Full-tilt music tops out just short
of it, so the last stretch of the range is reserved for layering — the kit's
point that "music is one sense, not the whole brain" (p.6), expressed as a
test.

---

## Source map

```
src/
  engine.js              the actor: scene, 30 Hz update loop, input, stats
  core/
    chaosResolver.js     the priority stack, chaos, mood blending, safety
    moods.js             the four Data Assets + band definitions
    reaction.js          reaction packets, impulse bank, memory trace
    params.js            smoothing, budgets, shared constants
    recorder.js          session capture and export
  render/
    entity.js            BP_FuXChaosEngine — the component tree
    quality.js           tiers and the performance guard
    shaders/             core, skin, tendrils, particles, shared noise
  audio/
    analysis.js          demo signal, live analyser, bridge receiver
  ui/                    readout, control deck, styles
tools/
  bridge-demo.mjs        MilkDrop-Shake packet source (no dependencies)
  glsl-lint.mjs          parses every shader without a GL context
test/                    140 tests
```

### Component tree

The build kit's tree, one-to-one:

```
BP_FuXChaosEngine
|- SceneRoot
|- FerroCoreMesh       custom ferrofluid shader
|- WaterSkinMesh       thin transparent skin
|- NS_SmokeBody        curl-advected, pulled back inward
|- NS_FluidTendrils    vertex-built ribbons
|- NS_MagneticSparks   high-band driven discharges
|- ReactionVolume      the invisible input volume
|- PointLight_FuX      one unshadowed light
```

Triangle counts, particle populations, tendril counts, and the single-light
rule are all asserted against the budget table on p.10.

---

## The MilkDrop-Shake bridge

The kit describes a two-stage integration; this is stage two, made concrete.
The bridge sends one compact packet:

```json
{
  "energy": 0.42, "low": 0.48, "mid": 0.31, "high": 0.32,
  "beat": false, "presetId": "crystal-tide", "moodHint": "calm"
}
```

Any transport that can deliver that shape works. A dependency-free demo source
is included:

```bash
npm run bridge                     # ws://127.0.0.1:8765
npm run bridge -- 9000             # custom port
```

Then paste the URL into the bridge field in the control deck and press
Connect. The demo cycles four presets with real temperament — a calm tide, a
joyful swarm, an ominous hymn, a wild bloom.

Bridge values are clamped, unknown fields are ignored, and losing the
connection decays the entity back to idle rather than freezing it mid-flare.

> **Run the bridge on the same machine as the browser.** A `ws://127.0.0.1`
> URL always means the machine the browser is on, so the bridge is a
> local-development and installation-time tool — the hosted preview cannot
> reach it.

---

## Recording a take

`R` records the resolved state at 30 Hz: chaos, band, mood, every material
parameter, the audio bands, and every reaction packet with its timestamp.
`E` exports it as `fux-chaos-session/1.0` JSON with a summary — peak and mean
chaos, seconds spent in each band, seconds in each mood, and an event count.

That is the artifact the kit's `R`-to-record workflow is really for: a take
captures not a video but the timing, which is what a Niagara or material
artist needs to match the reference.

---

## Performance

Quality tiers map onto the p.10 budget for Intel UHD 620-class hardware, and
the engine degrades by itself under load. The guard uses the 90th-percentile
frame time rather than the mean, so a single hitch never drops the quality out
from under a performance, and it will not raise the tier again until there is
sustained headroom.

| Tier | Core verts | Particles | Tendrils | Bloom |
|---|---|---|---|---|
| High | 17,340 | 470 | 16 | on |
| Medium | 10,122 | 310 | 12 | on |
| Low | 4,922 | 180 | 8 | off |

Press `Q` to pin a tier manually; auto-scaling switches off when you do.

---

## Verifying

```bash
npm run verify     # GLSL parse check, the doc freshness checks, then the tests
npm run docs:build-kit   # regenerate handoff/ENTITY-BUILD-KIT.md from the PDF
npm run docs:moods       # regenerate handoff/moods/*.csv from src/core/moods.js
```

There is no GL context in CI, so the shaders are validated by parsing them
against a real GLSL grammar, and a contract test asserts that every uniform
declared in GLSL exists in the material's uniform map, that varyings match
across stages, and that every custom attribute is supplied by the geometry.
Those are the failure modes that otherwise show up only as a black canvas.

The 211 tests cover the chaos bands, mood blending, the priority stack, the
reaction packet lifecycle, the safety clamps, the prototype budgets, bridge
handling and failure, the recorder, the performance guard, the panel modes and
the microphone environment checks, and the handoff pack. The interface itself
is exercised as real DOM in `test/ui-dom.test.js` — the deck's checkboxes, the
readout's close button, and the dialog's focus handling — because that is the
part a shader contract test can never see.

### The handoff pack

Two generators keep the artefacts that leave this repository in step with the
code that established them, and both are checked rather than trusted:

`tools/build-kit-to-markdown.mjs` converts `docs/symbiote-entity-ue5-build-kit.pdf`
into `handoff/ENTITY-BUILD-KIT.md`. It recovers structure from the PDF's own
geometry — font, height, and x position — because the document is laid out on a
grid: monospace is code, a stable column grid is a table, a horizontal gutter
splits a page into two streams, and the "OK" badges are the checklist items.
`test/docs.test.js` then asserts the passages the prototype is built from
survived the trip, including the words the PDF builds from ligature glyph runs.

`tools/moods-to-csv.mjs` writes the four moods out for UE5 DataTable import,
converting the prototype's sRGB hex to the linear values an `FLinearColor`
column reads. `test/handoff.test.js` checks the CSVs against the mood table
they were generated from, and checks the HLSL in `Content/MirrorBox/FuX/` for
the mistakes that only a shader compiler would otherwise catch: GLSL keywords
left in place, a call to a helper that is not in the same Custom node, a
centimetre conversion applied twice.

---

## Mapping back to the build kit

| Build kit | Here |
|---|---|
| `BP_FuXChaosEngine` (p.3) | `src/render/entity.js` |
| Component tree (p.3) | asserted in `test/shaders.test.js` |
| Material graph + parameters (p.4) | `src/render/shaders/core.*`, `params.js` |
| Reaction packet (p.6) | `src/core/reaction.js` |
| State priority stack (p.7) | `ChaosResolver.resolvePriority` |
| `DA_EntityMood` (p.7) | `src/core/moods.js` |
| Update order (p.8) | `FuXEngine.step` |
| Performance budgets (p.10) | `src/render/quality.js`, asserted in tests |
| Starter folder layout (p.9) | `Content/MirrorBox/FuX/` |
| Material graph as HLSL (p.4) | `Content/MirrorBox/FuX/Materials/FuXChaos.ush` |
| The kit as markdown | `handoff/ENTITY-BUILD-KIT.md`, generated |

Built by Stoned Drone LLC. Part of the Stonerverse.
