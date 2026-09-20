# Materials

`FuXChaos.ush` holds the Custom node bodies for `M_FuX_Chaos_Master`. Every
function in it is written to be pasted whole into one Material Expression
Custom node, and each is named after the line of the graph it implements.

The numeric source of truth is `handoff/ENTITY-BUILD-KIT.md` (page 4 for the
graph and the runtime parameters). The mood values that drive these inputs come
from `handoff/moods/DA_FuX_Moods.csv`.

## Assets in this folder

| Asset | What it is |
| --- | --- |
| `M_FuX_Chaos_Master` | the layered master material: near-black core plus thin translucent skin |
| `MI_FuX_Runtime` | the single runtime instance `BP_FuXChaosEngine` drives |
| `FuXChaos.ush` | Custom node bodies (HLSL), plus the start values from the kit |

There is exactly one instance at runtime. The four moods are values, not
materials: swapping materials is what makes a mood read as a paint job, which
is the thing the kit warns against on page 7.

## Scalars

Create these as Scalar Parameters on `M_FuX_Chaos_Master`, with the kit's start
values. The values themselves live in `MoodAsset` and are pushed per frame, so
these defaults exist only so the material looks right before anything drives it.

| Parameter | Start | Driven by | Used at |
| --- | --- | --- | --- |
| `Glow` | 8.0 | overall energy | Emissive |
| `BreathRate` | 0.35 | mood | Breath |
| `Displace` | 2.0 | pressure + touch | WPO, in centimetres |
| `FlowSpeed` | 0.12 | mood + movement | Flow |
| `Opacity` | 0.68 | story charge | skin opacity |
| `EdgeSharpness` | 3.5 | ominous mood | spike shading |

## The collection

One Material Parameter Collection — `MPC_FuX` — carries the shared values, so
`NS_*`, the light, and the glass frame all read the same numbers the material
does. These are the names on build kit page 8.

| Name | Type | Consumers |
| --- | --- | --- |
| `FuXEnergy` | Scalar | core, glass, frame |
| `FuXColorA` / `FuXColorB` | Vector | core, smoke, light |
| `FuXReactionVector` | Vector | core, tendrils |
| `FuXReactionPoint` | Vector | core, ripples |
| `FuXFlowState` | Vector | water, smoke, spikes |

Update it from `BP_FuXChaosEngine` at 30 Hz and let the material interpolate:
the kit asks for 30 Hz parameter updates with a 20 Hz fallback, and a vertex
shader that is already smoothing will hide the difference.

## Custom nodes

| Node | Function in `FuXChaos.ush` | Pins in | Pins out |
| --- | --- | --- | --- |
| `FuX Flow` | `FuXFlowField` | `LocalPosition` (float3), `Time`, `FlowSpeed` | `Flow` (float3) |
| `FuX Pressure` | `FuXPressure` | `AudioLow`, `Threat`, `Touch` | `Pressure` |
| `FuX Spikes` | `FuXSpikeField` + `FuXSpikeSharpness` | `LocalPosition`, `Time`, `Pressure`, `SpikeBias`, `EdgeSharpness` | `Spikes` |
| `FuX Breath` | `FuXBreath` | `Time`, `BreathRate`, `BreathAmount` | `Breath` |
| `FuX WPO` | `FuXWorldPositionOffset` | `VertexNormal`, `Flow`, `Spikes`, `Breath`, `BreathAmount`, `ReactionStrength`, `DisplaceCm` | `Offset` (float3) |
| `FuX Emissive` | `FuXEmissive` | `Purple`, `ToxicLime`, `Attention`, `AudioMid`, `Glow` | `Emissive` (float3) |
| `FuX Safety` | `FuXApplySafety`, `FuXClampTravel` | `In` (float3), `Safety` | float3 |

Two details that are easy to get wrong when wiring them by hand:

- `Time` must be the material's `Time` node, in seconds. A frame counter or a
  delta-time accumulator makes BreathRate and FlowSpeed mean something else.
- `VertexNormal` for the WPO node is `VertexNormalWS`, not the interpolated
  `Normal`. The offset is what shapes the silhouette, so it has to be the
  geometry normal, not the shading one.

## Shading

The core is near-black with a metallic response, and the light lives *inside*
it: the emissive is multiplied by a vein mask so the mass stays dark fluid with
something moving under the surface, rather than a glowing ball. Purple is
identity, teal is attention, acid lime is the answer.

The skin is translucent and never hides the entity. `FuXSkinOpacity` thins it at
the spikes and at a touch ripple, and the kit's fallback for a machine that
cannot afford two translucency layers is a dithered opaque shell — the same
silhouette at the cost of the softness.

Bloom only, no other post-process: the kit allows light bloom and disables local
effects on the fallback machine. `FUX_BLOOM_HEADROOM` in the header is the
factor the prototype feeds `Glow` through so a lamp-bright core does not clip to
white, and it is the first number to move if the bloom in the engine reads
hotter than the prototype.

## Safety

`FuXApplySafety` and `FuXClampTravel` implement priority one on the state
stack: clamp flash and displacement. Cap peak brightness, keep the travel
clamp, and add the low-stimulation mode before any public showing.
