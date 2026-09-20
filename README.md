# FuX Chaos Engine


**FuX is the Chaos Engine** — a living symbiote-like energy entity for the
[Magic Mirror Box](https://github.com/StonedDrone/MilkDrop-Shake): a neon-lit
UE5 cube holding a reactive being. New Orleans street magic × digital genie.


## The entity


- One fluid body: **ferrofluid tension + viscous symbiote motion + smoke + water flow**
- Glossy black mass with purple and toxic-lime bioluminescent veins
- Amorphous — no fixed form, always in motion


## Reactive to everything


Sound, touch, movement, proximity, voice, story beats, and system events all
feed one Chaos parameter (0–100): calm → stirring → surging → unleashed.


## Mood pipeline


New in September 2026: the entity's moods are now auditioned and recorded in
**WaveScope Native v1.2.1** (portable Windows build, OpenGL 3.3). The workflow:

1. Point WaveScope at the Cream of the Crop preset pack (9,795 curated `.milk`
   presets) or any external preset folder.
2. Audition presets live — `3` runs a silent demo signal, `1` taps Windows
   system audio, `E` cycles visual engines, `F3` opens the preset browser.
3. Classify what you see into entity moods: **calm, wild, ominous, joyful** —
   these map onto the Chaos parameter's four states (calm → stirring →
   surging → unleashed).
4. Press `R` to record MP4 reference clips of the moods you want the UE5
   entity to reproduce.

The recorded clips become the visual targets for the Niagara/shader work in
the UE5 build kit under `docs/`.


The reactive engine is [MilkDrop-Shake](https://github.com/StonedDrone/MilkDrop-Shake).


## Chaos Lab — the build kit, running

New in September 2026: `chaos-lab/` is the UE5 build kit running as a live
browser prototype, so the material graph, the Chaos resolver, and the four
moods can be tuned before any engine time is spent.

```bash
cd chaos-lab
npm install
npm run dev
```

It implements the kit rather than approximating it — the same eight-step
update order, the same state priority stack (safety → story → system → touch →
music → idle), the same `DA_EntityMood` fields, the same material-graph
clauses, and the same Intel UHD 620 performance budgets, with tests asserting
each one. A dependency-free WebSocket source (`npm run bridge`) stands in for
MilkDrop-Shake so the adapter boundary is proven before the display machine is
chosen, and `R` records a take of the resolved state for export.

That recording is the piece that connects the two halves of this repo: the
mood clips audited in WaveScope are the visual targets, and a Chaos Lab take
is the timing reference for reproducing them.

Press `H` (or the chip in the corner) to clear the chrome and watch the entity
on its own; `3` plays the demo signal if you would rather not grant a
microphone, and the lab will tell you when a preview frame is what is blocking
one.

See `chaos-lab/README.md` for the full mapping back to the build kit.


## The handoff pack

The prototype proves the kit; `handoff/` and `Content/` are what goes back into
the editor.

- `handoff/ENTITY-BUILD-KIT.md` — the build kit PDF as searchable, diffable
  markdown, generated from `docs/` by `npm run docs:build-kit`.
- `handoff/moods/` — the four mood Data Assets as CSV, import-ready for a
  DataTable, generated from the prototype's mood table by `npm run docs:moods`.
- `Content/MirrorBox/FuX/` — the starter folder layout from page 9, with the
  kit's asset names in place and a note on what belongs in each slot.
- `Content/MirrorBox/FuX/Materials/FuXChaos.ush` — the material graph as HLSL
  for Material Expression Custom nodes, ported from the prototype's shaders.

Both generators have a `--check` mode wired into `npm run verify`, so a stale
document or a mood table that has drifted from the values the prototype was
tuned with fails the build instead of shipping.


## Contents


- `docs/` — the UE5 build kit (Blueprint architecture, master materials,
  Niagara tendrils, reaction-packet system, performance targets for
  Intel UHD 620-class hardware)
- `chaos-lab/` — the build kit as a running prototype (interactive entity,
  Chaos resolver, mood system, MilkDrop-Shake bridge, session recorder)
- `handoff/` — the build kit as markdown and the mood tables as CSV, with
  a README explaining what is checked and what is not
- `Content/` — the UE5 folder scaffold and the HLSL for the master material
- `concept-art/` — visual direction renders
- `protocol/` — spawn verification for the ICU ↔ Chaos Engine loop


Built by Stoned Drone LLC. Part of the Stonerverse.
