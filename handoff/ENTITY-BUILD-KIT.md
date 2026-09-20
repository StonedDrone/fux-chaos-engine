<!--
  Generated from docs/symbiote-entity-ue5-build-kit.pdf
  by tools/build-kit-to-markdown.mjs. Do not edit by hand — edit the
  source document and re-run `npm run docs:build-kit`.

  FuX Chaos Engine - Magic Mirror Box UE5 Build Kit
  Dated 2026-09-19.

  The text is machine-extracted, so it is faithful; the structure
  (headings, tables, code blocks) is recovered from the PDF layout.

  Page furniture is not reproduced: the running heads and page numbers,
  and the section number that sits above each title. Display type here is
  tracked out letter by letter, so the cover kicker is reproduced the way
  it is encoded — "M A G I C M I R R O R B O X" — rather than respaced.
-->

<!-- page 1 -->

*M A G I C M I R R O R B O X / U N R E A L E N G I N E 5*

## FuX

## Chaos Engine

A build kit for a living reactive intelligence formed from ferrofluid tension, smoke, and water-like motion.

FuX is the Chaos Engine. He is not an occupant inside the box. He is its reactive body - sensing every connected signal, changing state, and answering through motion.

<!-- page 2 -->

## Build brief

A practical first version can be built from one Blueprint actor, one layered master material, three Niagara systems, four mood presets, and a universal reaction-input layer.

> **Recommended order:** prove FuX's reactive body in native UE5 first. Then connect MilkDrop-Shake through a lightweight adapter. The visual prototype should not wait on the bridge.

### Contents

| Section | Title | Page |
| --- | --- | --- |
| 01 | FuX direction | 02 |
| 02 | Actor architecture | 03 |
| 03 | Master material | 04 |
| 04 | Music and MilkDrop-Shake | 05 |
| 05 | Universal reaction inputs | 06 |
| 06 | Mood system | 07 |
| 07 | Niagara and runtime logic | 08 |
| 08 | Implementation sequence | 09 |
| 09 | Performance and handoff | 10 |

> **Scope:** visual and interaction design for FuX inside the Magic Mirror Box. The first pass accepts simulated inputs; live cameras, microphones, proximity sensors, and voice intelligence connect through the same reaction interface later.

<!-- page 3 -->

## FuX is the Chaos Engine

FuX is the living reactive body of the Mirror Box: part ferrofluid intelligence, part digital genie, part New Orleans street magic.

### What the audience sees

- A black ferrofluid mass that grows magnetic spikes under pressure.
- Viscous tendrils that stretch like a living symbiote without becoming humanoid.
- Smoke peeling from the surface while water-like currents roll underneath.
- The cube's glass and frame catching FuX's purple and toxic-lime pulse.

### What it is not

- Not a fixed humanoid silhouette.
- Not a face pasted onto liquid.
- Not four disconnected effects playing at once.
- Not a copy of an existing comic character.

> **Core rule:** ferrofluid defines tension, water defines flow, smoke defines breath, and viscous tendrils define intent. Personality comes from how FuX transitions between them.

### Success in one sentence

With no explanation, a viewer should feel that FuX sees the room, absorbs what happens, and chooses how his fluid body answers.

---

*Diagram labels: glass shell catches color · living core · smoke + fluid memory trail*

<!-- page 4 -->

## One actor owns the whole performance

Build a single Blueprint actor named BP_FuXChaosEngine. It receives normalized reaction signals, resolves FuX's state, and coordinates every visual layer.

### Component tree

```
BP_FuXChaosEngine
|- SceneRoot
|- FerroCoreMesh
|- WaterSkinMesh
|- NS_SmokeBody
|- NS_FluidTendrils
|- NS_MagneticSparks
|- ReactionVolume
|- PointLight_FuX
|- Audio_Murmur (optional)
```

### Keep the public controls small

| CONTROL | RANGE | JOB |
| --- | --- | --- |
| Intensity | 0-1 | Overall energy |
| Mood blend | 0-1 | Crossfade presets |
| Attention | 0-1 | Pull toward target |
| Story charge | 0-1 | Slow narrative build |
| Reaction strength | 0-1 | Current signal intensity |

Do not expose 40 sliders. Tune complex values inside four mood Data Assets; expose only the controls needed during a live test.

---

### Supporting assets

```
M_FuX_Chaos_Master
MI_FuX_Runtime
NS_FuX_SmokeBody
NS_FuX_FluidTendrils
NS_FuX_MagneticSparks
DA_FuX_Calm / Joyful
DA_FuX_Ominous / Wild
BPI_FuXReactive
ST_FuXReactionPacket
```

*Diagram labels: Any input · signal + strength · Chaos resolver · Fluid layers · mood + memory · visible answer*

<!-- page 5 -->

## One body moves through four fluid states

Use one master material across a deforming black core and a thin transparent skin. The illusion comes from blending physical motion languages, not swapping separate creatures.

### Black ferrofluid core

- Glossy near-black base with metallic response.
- Magnetic spike mask driven by pressure and threat.
- Slow viscous folding for symbiotic weight.
- Purple and lime light trapped beneath the surface.

### Water, smoke, and memory

- Water-like currents travel around the skin.
- Smoke advects from motion, then curls back inward.
- Touch leaves a luminous ripple and fading scar.

### Runtime parameters

| PARAMETER | START | DRIVEN BY |
| --- | --- | --- |
| Glow | 8.0 | Overall energy |
| BreathRate | 0.35 | Mood |
| Displace | 2.0 cm | Pressure + touch |
| FlowSpeed | 0.12 | Mood + movement |
| Opacity | 0.68 | Story charge |
| EdgeSharpness | 3.5 | Ominous mood |

---

### Material graph logic

```
Flow = CurlNoise + WaterCurrent
Pressure = AudioLow + Threat + Touch
Spikes = pow(saturate(Noise * Pressure), 5)
Breath = sin(Time * BreathRate) * BreathAmount
WPO = VertexNormal * (Flow + Spikes) * (BasePulse + ReactionStrength)
Emissive = lerp(Purple, ToxicLime, Attention + AudioMid) * Glow
```

Pseudocode: recreate with ordinary material nodes.

*Diagram labels: Deep violet / identity · Teal / attention · Acid lime / answer*

<!-- page 6 -->

## Music gives the entity a nervous system

Music is one sense, not the whole brain. Frequency bands give FuX rhythm; the reaction interface lets the same body answer the rest of the room.

### UE-native first pass

1. Route music to a dedicated submix.
2. Read its envelope for overall energy.
3. If available, use Audio Synesthesia for low, mid, and high-band values.
4. Smooth every value before sending it to the material and Niagara.

```
Smoothed = Lerp(Previous, Current, 1 - exp(-DeltaTime * Speed))
LowHit  -> radial body compression
MidRise -> color rotates violet to teal
HighHit -> short spark burst
Silence -> slow breath; never fully stops
```

MilkDrop-Shake is the reactive soul. Use its presets to define motion personality and mood. It is not assumed to be a drop-in Unreal plugin.

### Two-stage integration

| STAGE | METHOD | RESULT |
| --- | --- | --- |
| Prototype | UE audio analysis | Working entity now |
| Bridge | Adapter sends preset data | MilkDrop-led behavior |

> **Adapter boundary:** the bridge can pass a compact packet - energy, low, mid, high, preset ID, and beat trigger - into UE5 through Open Sound Control, WebSocket, or a local plugin. Pick one transport after confirming the final hardware setup.

---

### Behavior map

- **Low:** body scale, displacement, heavy tendrils.
- **Mid:** color travel, orbit speed, gaze.
- **High:** sparks, thin filaments, edge shimmer.
- **Envelope:** total brightness and light intensity.

<!-- page 7 -->

## Everything reaches FuX through one

## reaction packet

| Sound | Contact | Attention |
| --- | --- | --- |
| Music, voice, and room noise | Touch and proximity bend the | Movement, gaze, and story |
| shape rhythm, pressure, and | mass toward or away from a | cues change where FuX looks |
| brightness. | point. | and how long he remembers. |

### Touch response sequence

Contact point › Surface ripple › Core turns › Memory scar fades

```
OnReaction(Packet)
// Type, Strength, Point, Direction, // MoodHint, Urgency, DecayTime
Packet.Strength = Clamp(Packet.Strength, 0, 1)
ReactionQueue.Add(Packet)
AttentionTarget = Packet.Point
ChaosResolver chooses fluid state + response
Store short memory; decay by Packet.DecayTime
```

### Any source sends the same small packet

| SIGNAL | PACKET DATA | FUX RESPONSE |
| --- | --- | --- |
| Music / noise | Energy + bands | Flow, pulse, smoke |
| Person moves | Target + speed | Track and lean |
| Touch / proximity | Point + strength | Ripple, attract, recoil |
| Voice / story | Mood + charge | Shift state and color |
| System event | Type + urgency | Spike, bloom, or settle |

> **Personality rule:** the same signal should not always get the same answer. Mood, recent memory, and competing inputs change FuX's timing, but the response remains readable.

<!-- page 8 -->

## Four moods make the Chaos Engine

## directable

Store each mood in a Primary Data Asset. The actor blends between the current and target mood over time instead of snapping.

| MOOD | MOTION | COLOR / RESPONSE |
| --- | --- | --- |
| Calm | Slow breath; wide orbit | Violet + teal; curious |
| Joyful | Quick lifts; playful sparks | Teal + lime; approaches |
| Ominous | Dense ferrofluid; smoke held close | Deep violet; watches |
| Wild | Magnetic spikes; smoke and water shear | Full palette; unpredictable |

### DA_EntityMood fields

```
PrimaryColor
SecondaryColor
BreathRate
FlowSpeed
DisplaceAmount
FilamentCount
SparkRate
ResponseDelay
TouchAttraction
AudioGainLow
AudioGainMid
AudioGainHigh
```

### A mood is behavior, not a color filter

Every preset changes at least one timing value, one shape value, one particle value, and one response bias. That keeps four moods from becoming four paint jobs on the same animation.

---

### State priority

1. **Safety override:** clamp flash and displacement.
2. **Story cue:** directs mood.
3. **Touch impulse:** short foreground response.
4. **Music:** continuous motion.
5. **Idle:** breath and awareness.

> **Blend time:** start at 1.8 seconds. Ominous can enter slower; Wild can exit slower so it feels like the energy must settle.

<!-- page 9 -->

## Niagara gives smoke, reach, and magnetic

## discharge

Use particles as evidence of intent, not as fog. The core must stay readable from across the room.

### NS_FuX_FluidTendrils

Ribbon or beam emitters. Spawn from core surface. Curl noise for living motion. Attractor follows attention target. Audio low controls thickness.

### Entity update order

```
Event Tick (or 30 Hz timer)
1. Gather queued reaction packets
2. Normalize strength, target, and urgency
3. Resolve priority, mood, and recent memory
4. Smooth audio and continuous sensor values
5. Decay touch, story, and system impulses
6. Apply safety clamps
7. Update material, Niagara, and cube light
8. Store a short reaction-memory trace
```

### One shared parameter collection

| NAME | TYPE | CONSUMERS |
| --- | --- | --- |
| FuXEnergy | Scalar | Core, glass, frame |
| FuXColorA/B | Vector | Core, smoke, light |
| ReactionVector | Vector | Core, tendrils |
| ReactionPoint | Vector | Core, ripples |
| FlowState | Vector | Water, smoke, spikes |

> **Update rate:** start visual parameters at 30 Hz and let interpolation smooth them. This cuts needless work while remaining responsive.

---

### NS_FuX_SmokeBody + Sparks

- Smoke volume stays thin around the silhouette.
- Curl noise pulls vapor back toward the core.
- High-band audio triggers short magnetic sparks.
- Story reveal adds one controlled smoke bloom.
- Distance fade avoids glass clutter.

<!-- page 10 -->

## Build the first visible version in two passes

### Pass 1 - native UE prototype

1. Block the cube. Create the frame, transparent shell, and one deforming black ferrofluid core.
2. Build M_FuX_Chaos_Master. Add liquid flow, pressure spikes, subsurface glow, and restrained world-position offset.
3. Create BP_FuXChaosEngine. Add the component tree, reaction resolver, and dynamic material instance.
4. Add audio response. Feed envelope first; add frequency bands when the analyzer is ready.
5. Add four mood Data Assets. Start with the values on page 7.
6. Add the reaction interface. Simulated touch, proximity, movement, voice, and story events all call the same function.
7. Add Niagara. Smoke first, fluid tendrils second, magnetic sparks last.
8. Run the silhouette test. Turn particles off; the core should still feel alive.

### Pass 2 - MilkDrop-Shake bridge

1. Choose the local data transport after the display machine is confirmed.
2. Send only energy, three frequency bands, beat, and preset identity first.
3. Map a small set of MilkDrop presets to the four moods.
4. Record a 60-second test and tune smoothing before adding more data.

### Starter folder layout

```
Content/MirrorBox/FuX/
Blueprints/
Materials/
Niagara/
Moods/
Reactions/
Audio/
Meshes/
Maps/TestLab/
```

---

### Definition of done

- OK Breath works in silence
- OK Ferrofluid, water, and smoke read as one body
- OK Every test signal gets a visible answer
- OK Four moods read differently
- OK Frame shares FuX's pulse
- OK Performance stays stable

<!-- page 11 -->

## Performance limits protect the illusion

Start conservative on the Intel UHD 620. A stable, intentional FuX looks more alive than a dense effect that stutters.

| AREA | PROTOTYPE LIMIT | FALLBACK |
| --- | --- | --- |
| Core mesh | One deforming mesh | Lower vertices |
| Translucency | Two main layers | Dithered opaque shell |
| Fluid tendrils | 8-16 active | 4-8 active |
| Smoke / sparks | Under 500 visible | Lower count, shorter life |
| Dynamic lights | One unshadowed | Emissive only |
| Parameter updates | 30 Hz | 20 Hz |
| Post-process | Light bloom only | Disable local effects |

These are starting budgets, not measured guarantees. Profile the actual cube scene and adjust from the result.

### Visual QA

- OK Core reads at room distance
- OK Glass never hides the entity
- OK No all-white blown highlights
- OK Touch points land correctly
- OK Silence still feels alive
- OK Moods differ without labels

> **Flash safety:** cap peak brightness and rapid contrast changes. Add a low-stimulation mode before any public showing.

### The identity is locked

FuX is the Chaos Engine. Every future sensor, voice layer, MilkDrop preset, and story cue connects to this same reactive body. No separate creature is added inside the box.

First target: a 60-second scene where FuX breathes in silence, shifts from water-flow calm to ferrofluid spikes, trails smoke toward a moving person, answers one touch, and changes mood on a story cue.

---

### Technical QA

- OK No shader compile warnings
- OK No runaway particle counts
- OK Frame time stays steady
- OK Values clamp between 0 and 1
- OK Bridge loss returns to idle
- OK Preset swaps do not pop
