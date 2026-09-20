# Mood tables

Import-ready values for the four mood Data Assets on build kit page 7.

| File | Rows | Import as |
| --- | --- | --- |
| `DA_FuX_Moods.csv` | Calm, Joyful, Ominous, Wild | DataTable with row struct `FEntityMood`, whose fields are the twelve `DA_EntityMood` fields |
| `DA_FuX_MoodTuning.csv` | same four rows | the prototype-only values the kit's struct does not carry yet |

Both are **generated** from the browser prototype's mood table
(`chaos-lab/src/core/moods.js`) by `npm run docs:moods`. Do not hand-edit them:
edit the prototype's moods, which you can actually watch, and re-run the script.
`npm run verify` fails if the CSVs are stale.

## Importing

1. Add the struct. Create a User Defined Struct named `ST_FuXEntityMood` (or a
   C++ `FEntityMood`) with the twelve fields listed below, in that order.
2. Import `DA_FuX_Moods.csv` as a DataTable, choosing the struct as the row
   struct. Unreal takes the first column (`Name`) as the row name, so the rows
   land as `Calm`, `Joyful`, `Ominous`, `Wild`.
3. Create the four Data Assets `DA_FuX_Calm`, `DA_FuX_Joyful`,
   `DA_FuX_Ominous`, `DA_FuX_Wild` and copy each row into its asset. The
   prototype keeps one struct per asset rather than a lookup table because the
   kit's mood blend crossfades two assets by reference.
4. If you want the tuning values in the engine as well, add the six
   `DA_FuX_MoodTuning.csv` fields to the same struct and re-import both files;
   the row names match.

## The twelve `DA_EntityMood` fields

`PrimaryColor`, `SecondaryColor`, `BreathRate`, `FlowSpeed`, `DisplaceAmount`,
`FilamentCount`, `SparkRate`, `ResponseDelay`, `TouchAttraction`,
`AudioGainLow`, `AudioGainMid`, `AudioGainHigh`.

Every mood changes at least one timing value, one shape value, one particle
value, and one response bias — that is the kit's rule for keeping four moods
from becoming four paint jobs, and it is why `BreathRate`, `FilamentCount`,
`SparkRate`, and `TouchAttraction` are all present rather than colour alone.

## Colors are linear

`PrimaryColor` and `SecondaryColor` are written as `(R=,G=,B=,A=)` literals,
which is what an `FLinearColor` column reads. The values are the prototype's
sRGB hex, converted with the sRGB transfer function. Pasting the hex numbers
straight in would make every mood render washed out next to the prototype.

| Mood | Primary | Secondary | Kit description |
| --- | --- | --- | --- |
| Calm | deep violet | teal | Violet + teal; curious |
| Joyful | teal | acid lime | Teal + lime; approaches |
| Ominous | near-black violet | violet | Deep violet; watches |
| Wild | violet | acid lime | Full palette; unpredictable |

## Values the kit does not carry

`ChaosAnchor` is the chaos level the mood settles toward (0–100), which is the
seam between the mood system and the Chaos parameter:

| Mood | ChaosAnchor | Band |
| --- | --- | --- |
| Calm | 12 | 0–25 calm |
| Joyful | 42 | 25–60 stirring |
| Ominous | 66 | 60–90 surging |
| Wild | 94 | 90–100 unleashed |

`SpikeBias`, `SmokeCurl`, `OrbitSpeed`, `Glow`, and `Opacity` are the rest of
what the prototype drives; the kit's struct does not have columns for them yet.
