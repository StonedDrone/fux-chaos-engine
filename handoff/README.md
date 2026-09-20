# Handoff pack

Everything here is generated from something else in the repository, and every
generator can be re-run. Nothing is a copy that can drift.

| What | Generated from | Rebuild with |
| --- | --- | --- |
| `ENTITY-BUILD-KIT.md` | `docs/symbiote-entity-ue5-build-kit.pdf` | `npm run docs:build-kit` (from `chaos-lab/`) |
| `moods/DA_FuX_Moods.csv` | `chaos-lab/src/core/moods.js` | `npm run docs:moods` (from `chaos-lab/`) |
| `moods/DA_FuX_MoodTuning.csv` | same | same |

The rest of the pack lives in `Content/MirrorBox/FuX/`: the folder scaffold from
page 9, the materials README, and `FuXChaos.ush`, the material graph as HLSL for
Custom nodes.

## What each piece is for

**`ENTITY-BUILD-KIT.md`** — the build kit as searchable, diffable text. The PDF
is the source of truth for every number in this repository; this is the copy you
can grep while you are implementing from it. It carries the document's own title
and date in its header, read from the PDF's metadata.

**`moods/`** — the four mood Data Assets, import-ready. They were tuned in the
browser prototype, where you can watch the entity change as you move a value,
and exported here rather than retyped: twelve numbers per mood is a lot of
opportunity for a transcription error that would only show up as "Ominous feels
wrong". Colours are converted to the linear values an `FLinearColor` column
expects. See `moods/README.md` for the import steps.

**`Content/MirrorBox/FuX/`** — the starter layout from page 9 with the kit's
asset names in place. No `.uasset` files: binary assets cannot be authored
outside the editor, so what is here is the structure, the names, and the notes
for each slot. `Materials/FuXChaos.ush` is the material graph ported from the
prototype's shaders, one function per Custom node; `Materials/README.md` has the
pin wiring, the parameter names, and the shading notes.

## What has been checked

The generators run in `npm run verify`, which fails if either output is stale,
and the test suite checks the artefacts themselves:

- Every word of the PDF appears in the markdown, page for page. This is the
  check that makes the markdown trustworthy: it catches a dropped table cell, a
  sentence spliced into the wrong column, and a word lost to a ligature.
- The pseudocode, the runtime parameter table, the component tree, and the
  performance budgets survive extraction exactly as the kit prints them.
- The mood CSVs match the prototype's mood table field for field, and every
  colour is a linear `FLinearColor` literal.
- The HLSL compiles in the sense that can be checked without a shader compiler:
  balanced braces, no GLSL keywords left in place, every function callable from
  a Custom node on its own, and every variable inside a function either a
  parameter, a local, a `#define`, or an intrinsic.
- The numbers in the HLSL are the kit's start values, asserted against the same
  constants the prototype uses.

## What has not been checked

Worth knowing before you start, and nothing here is hidden behind a green tick:

- **The HLSL has never been compiled.** There is no shader compiler in the
  environment this pack was built in. The structural checks above are the
  substitute; expect to fix small compile errors on the first material save.
- **The CSV import has never been run against Unreal.** The format is the
  documented DataTable format and the values are verified, but the row struct
  is yours to create — start with `moods/README.md`.
- **The mood values are the prototype's, not the engine's.** They were tuned
  against a WebGL approximation of the material graph on ordinary hardware.
  Treat them as a strong starting point that has already been sanity-checked,
  not as values measured in the cube.

The prototype itself is in `chaos-lab/`; `npm run dev` there is the fastest way
to see what these numbers do before opening the editor.
