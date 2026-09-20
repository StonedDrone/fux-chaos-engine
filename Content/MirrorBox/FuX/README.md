# Content/MirrorBox/FuX

The starter folder layout from build kit page 9, with the folders in place and
named. Nothing here is a `.uasset`: binary Unreal assets cannot be authored
outside the editor, so what this scaffold provides is the structure, the exact
asset names, and the notes for what belongs in each slot.

```
Content/MirrorBox/FuX/
  Blueprints/     BP_FuXChaosEngine
  Materials/      M_FuX_Chaos_Master, MI_FuX_Runtime   (FuXChaos.ush is here)
  Niagara/        NS_FuX_SmokeBody, NS_FuX_FluidTendrils, NS_FuX_MagneticSparks
  Moods/          DA_FuX_Calm, DA_FuX_Joyful, DA_FuX_Ominous, DA_FuX_Wild
  Reactions/      BPI_FuXReactive, ST_FuXReactionPacket
  Audio/          the music submix and its analyser
  Meshes/         the deforming core and the water skin
  Maps/TestLab/   the test map with the cube, the shell, and the frame
```

## What goes where

| Folder | Contents | Kit page |
| --- | --- | --- |
| `Blueprints/` | `BP_FuXChaosEngine`, a single actor that owns the whole performance: it receives normalised reaction signals, resolves state, and drives every visual layer | 4 |
| `Materials/` | `M_FuX_Chaos_Master` and `MI_FuX_Runtime`; see the README in that folder for the Custom node wiring | 4 |
| `Niagara/` | three systems: smoke body, fluid tendrils, magnetic sparks. Smoke first, tendrils second, sparks last, and the silhouette test runs with all three off | 9 |
| `Moods/` | the four mood Data Assets, filled from `handoff/moods/DA_FuX_Moods.csv` | 7 |
| `Reactions/` | `BPI_FuXReactive` and the `ST_FuXReactionPacket` struct: Type, Strength, Point, Direction, MoodHint, Urgency, DecayTime | 6 |
| `Audio/` | the dedicated music submix, its envelope follower, and — when the analyzer is ready — the Synesthesia band values | 5 |
| `Meshes/` | one deforming core mesh and one thin skin mesh. One mesh, 20k vertices at most: a dense effect that stutters reads as less alive than a restrained one that does not | 10 |
| `Maps/TestLab/` | the test map. The kit names it `TestLab`; block the cube first, before any material work | 9 |

## The actor

`BP_FuXChaosEngine` takes five public controls and nothing else — proving the
whole thing can be driven from a single row of sliders is part of the point:

| Control | Range | Job |
| --- | --- | --- |
| Intensity | 0–1 | overall energy |
| Mood blend | 0–1 | crossfade presets |
| Attention | 0–1 | pull toward target |
| Story charge | 0–1 | slow narrative build |
| Reaction strength | 0–1 | current signal intensity |

Its component tree, in order: `SceneRoot`, `FerroCoreMesh`, `WaterSkinMesh`,
`NS_SmokeBody`, `NS_FluidTendrils`, `NS_MagneticSparks`, `ReactionVolume`,
`PointLight_FuX`, `Audio_Murmur (optional)`.

## Order of work

Page 9 of the kit, and worth following because each pass is testable on its own:

1. Block the cube — frame, transparent shell, one deforming black core.
2. Build `M_FuX_Chaos_Master`.
3. Create `BP_FuXChaosEngine` with the component tree and the reaction resolver.
4. Audio: envelope first, frequency bands when the analyser is ready.
5. The four mood Data Assets, starting from `handoff/moods/`.
6. The reaction interface, with all five simulated input kinds calling one function.
7. Niagara: smoke, then tendrils, then sparks.
8. The silhouette test: particles off, core should still feel alive.

The browser prototype in `chaos-lab/` is the same order already executed —
`npm run dev` there is the version of steps 1–8 you can watch before you open
the editor.

## Reference

- `handoff/ENTITY-BUILD-KIT.md` — the build kit as searchable markdown.
- `handoff/moods/` — the mood values, import-ready.
- `chaos-lab/README.md` — what the prototype established and how to run it.
