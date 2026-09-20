/**
 * Shared numeric helpers and default runtime parameters.
 *
 * Values marked "build kit p.X" come straight from
 * docs/symbiote-entity-ue5-build-kit.pdf so the browser prototype and the
 * eventual UE5 actor can be tuned against the same numbers.
 */

/** Clamp a number into [min, max]. */
export function clamp(value, min = 0, max = 1) {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** Clamp into 0..1. */
export function saturate(value) {
  return clamp(value, 0, 1);
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent smoothing, as specified in the build kit (p.5):
 *   Smoothed = Lerp(Previous, Current, 1 - exp(-DeltaTime * Speed))
 * Used for every audio and continuous sensor value before it reaches the
 * material, Niagara, or the cube light.
 */
export function smooth(current, target, dt, speed) {
  return lerp(current, target, 1 - Math.exp(-dt * speed));
}

/** Exponential decay toward zero. */
export function decay(value, dt, halfLife) {
  if (halfLife <= 0) return 0;
  return value * Math.pow(0.5, dt / halfLife);
}

/** Map a value from one range onto another, clamped to the destination. */
export function remap(value, inMin, inMax, outMin, outMax) {
  const t = saturate((value - inMin) / (inMax - inMin || 1));
  return lerp(outMin, outMax, t);
}

/** Deterministic pseudo-random generator so simulated traces are reproducible. */
export function makeRandom(seed = 0x5eed) {
  let state = seed >>> 0 || 1;
  return function random() {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Master material runtime parameters (build kit p.4).
 * These are the values the shader exposes; moods override them at runtime.
 */
export const MATERIAL_DEFAULTS = {
  glow: 8.0,
  breathRate: 0.35,
  displace: 2.0, // centimetres in UE5; normalised to model units in the lab
  flowSpeed: 0.12,
  opacity: 0.68,
  edgeSharpness: 3.5,
};

/** Update rate for visual parameters (build kit p.8): 30 Hz, interpolation smooths it. */
export const UPDATE_HZ = 30;
export const UPDATE_DT = 1 / UPDATE_HZ;

/** Mood crossfade times in seconds (build kit p.7). */
export const BLEND = {
  default: 1.8,
  // Ominous can enter slower; Wild can exit slower so it feels like the
  // energy must settle.
  enterSlow: { ominous: 2.6 },
  exitSlow: { wild: 2.4 },
};

/** Prototype performance budgets (build kit p.10) — Intel UHD 620 class. */
export const BUDGETS = {
  coreVertices: 20000,
  translucencyLayers: 2,
  fluidTendrils: { target: 16, fallback: 8 },
  particles: { target: 500, fallback: 260 },
  dynamicLights: 1,
  parameterHz: UPDATE_HZ,
  parameterHzFallback: 20,
};
