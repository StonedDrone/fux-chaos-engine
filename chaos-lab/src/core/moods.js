/**
 * Four mood Data Assets (build kit p.7).
 *
 * "A mood is behaviour, not a color filter. Every preset changes at least one
 *  timing value, one shape value, one particle value, and one response bias."
 *
 * These are the same fields as `DA_EntityMood` so they can round-trip to UE5.
 */

/**
 * @typedef {Object} MoodAsset
 * @property {string} id
 * @property {string} label
 * @property {string} motion      Short description of the motion language.
 * @property {string} response    Short description of the color/response bias.
 * @property {number} chaosAnchor Target chaos level this mood settles toward.
 * @property {string} primaryColor
 * @property {string} secondaryColor
 * @property {number} breathRate   Breath cycle speed          (timing)
 * @property {number} flowSpeed    Surface current speed        (timing)
 * @property {number} displaceAmount  World position offset      (shape)
 * @property {number} filamentCount   Active tendrils            (shape)
 * @property {number} spikeBias    Ferrofluid spike readiness    (shape)
 * @property {number} smokeCurl    0 = smoke held close to core, 1 = sheared wide (particle)
 * @property {number} sparkRate    Magnetic spark emission       (particle)
 * @property {number} responseDelay  Seconds before he answers   (bias)
 * @property {number} touchAttraction  +1 approach, -1 recoil    (bias)
 * @property {number} audioGainLow
 * @property {number} audioGainMid
 * @property {number} audioGainHigh
 * @property {number} orbitSpeed   Attention orbit speed
 * @property {number} glow
 * @property {number} opacity
 */

/** @type {Record<string, MoodAsset>} */
export const MOODS = {
  calm: {
    id: 'calm',
    label: 'Calm',
    motion: 'Slow breath; wide orbit',
    response: 'Violet + teal; curious',
    chaosAnchor: 12,
    primaryColor: '#6a2cff', // deep violet
    secondaryColor: '#14e0c8', // teal
    breathRate: 0.28,
    flowSpeed: 0.09,
    displaceAmount: 1.2,
    filamentCount: 8,
    spikeBias: 0.05,
    smokeCurl: 0.25,
    sparkRate: 0.04,
    responseDelay: 0.55,
    touchAttraction: 0.7,
    audioGainLow: 0.9,
    audioGainMid: 1.1,
    audioGainHigh: 0.7,
    orbitSpeed: 0.35,
    glow: 5.5,
    opacity: 0.62,
  },
  joyful: {
    id: 'joyful',
    label: 'Joyful',
    motion: 'Quick lifts; playful sparks',
    response: 'Teal + lime; approaches',
    chaosAnchor: 42,
    primaryColor: '#14e0c8', // teal
    secondaryColor: '#b6ff1a', // acid lime
    breathRate: 0.72,
    flowSpeed: 0.3,
    displaceAmount: 2.4,
    filamentCount: 12,
    spikeBias: 0.22,
    smokeCurl: 0.5,
    sparkRate: 0.55,
    responseDelay: 0.18,
    touchAttraction: 1.0,
    audioGainLow: 1.0,
    audioGainMid: 1.35,
    audioGainHigh: 1.5,
    orbitSpeed: 0.95,
    glow: 9.5,
    opacity: 0.7,
  },
  ominous: {
    id: 'ominous',
    label: 'Ominous',
    motion: 'Dense ferrofluid; smoke held close',
    response: 'Deep violet; watches',
    chaosAnchor: 66,
    primaryColor: '#4b0f8f', // deep violet, low luminance
    secondaryColor: '#8a2bff',
    breathRate: 0.16,
    flowSpeed: 0.06,
    displaceAmount: 3.2,
    filamentCount: 10,
    spikeBias: 0.72,
    smokeCurl: 0.12,
    sparkRate: 0.12,
    responseDelay: 0.9,
    touchAttraction: -0.55,
    audioGainLow: 1.6,
    audioGainMid: 0.8,
    audioGainHigh: 0.45,
    orbitSpeed: 0.2,
    glow: 4.5,
    opacity: 0.82,
  },
  wild: {
    id: 'wild',
    label: 'Wild',
    motion: 'Magnetic spikes; smoke and water shear',
    response: 'Full palette; unpredictable',
    chaosAnchor: 94,
    primaryColor: '#8a2bff', // full palette
    secondaryColor: '#b6ff1a',
    breathRate: 1.15,
    flowSpeed: 0.52,
    displaceAmount: 5.0,
    filamentCount: 16,
    spikeBias: 1.0,
    smokeCurl: 0.95,
    sparkRate: 1.0,
    responseDelay: 0.05,
    touchAttraction: -0.2,
    audioGainLow: 1.25,
    audioGainMid: 1.2,
    audioGainHigh: 1.3,
    orbitSpeed: 1.6,
    glow: 12.0,
    opacity: 0.74,
  },
};

export const MOOD_ORDER = ['calm', 'joyful', 'ominous', 'wild'];

/**
 * Chaos bands (README + spawn-verification.md p.1):
 * calm → stirring → surging → unleashed, mapped onto the four moods.
 */
export const CHAOS_BANDS = [
  { id: 'calm', label: 'calm', min: 0, max: 25, mood: 'calm' },
  { id: 'stirring', label: 'stirring', min: 25, max: 60, mood: 'joyful' },
  { id: 'surging', label: 'surging', min: 60, max: 90, mood: 'ominous' },
  { id: 'unleashed', label: 'unleashed', min: 90, max: 100.0001, mood: 'wild' },
];

/** Which chaos band a level falls into. */
export function bandFor(chaos) {
  for (const band of CHAOS_BANDS) {
    if (chaos >= band.min && chaos < band.max) return band;
  }
  return CHAOS_BANDS[CHAOS_BANDS.length - 1];
}

/** The mood that auto mode would pick for a chaos level. */
export function moodForChaos(chaos) {
  return bandFor(chaos).mood;
}

/**
 * Blend two moods by t. Colors are returned raw so the caller can decide
 * whether to interpolate in linear or sRGB space.
 */
export function blendMoods(a, b, t) {
  const k = clamp01(t);
  const out = { ...a };

  for (const key of Object.keys(a)) {
    if (typeof a[key] === 'number' && typeof b[key] === 'number') {
      // Numeric fields — the whole point of the blend: timing, shape,
      // particle, and response-bias values all crossfade together.
      out[key] = a[key] + (b[key] - a[key]) * k;
    } else if (typeof a[key] === 'string' && typeof b[key] === 'string') {
      // Colors and labels snap at the halfway point. Interpolating colors
      // through a string field would be wrong; the renderer lerps the actual
      // THREE.Color values instead.
      out[key] = k < 0.5 ? a[key] : b[key];
    }
  }

  out.id = k < 0.5 ? a.id : b.id;
  return out;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
