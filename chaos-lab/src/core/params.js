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

/**
 * The body's own shape — the fluid silhouette, independent of any reaction.
 *
 * FuX is ferrofluid, not a sphere. The build kit's material graph displaces a
 * sphere by a few centimetres, which is the right budget for *response*
 * (pressure, touch, audio) but leaves the base form reading as a ball with a
 * texture on it. This layer is the missing half: a silhouette that is already
 * uneven, always moving, and not the same shape twice.
 *
 * It is a radius multiplier applied in the vertex stage — a function of
 * direction, not of the vertex — so the same field can be evaluated by the
 * core, the skin, the tendrils and the particles. That is the whole reason it
 * lives in one place: if the tendrils anchored to a sphere while the core
 * bulged past them, the seams would show immediately.
 *
 * `amount` is the fraction of the radius the silhouette deviates by, so 0.24
 * means the mass ranges from 76% to 124% of its base radius. The proportions
 * below were measured with `tools/body-shape-report.mjs`, which evaluates the
 * same field in JS.
 */
export const BODY = {
  /** Silhouette deviation at rest, as a fraction of the radius. */
  amount: 0.32,
  /** Extra deviation at full chaos: the mass loses its shape as it excites. */
  chaosAmount: 0.16,
  /** How much of the deviation low-stimulation mode removes (safety first). */
  calmSafety: 0.65,

  /**
   * A slow swirl through everything below it.
   *
   * Without it, two noise fields added together sit in a lattice and the body
   * reads as a golf ball: evenly spaced dents, all the same size. Shearing the
   * sample position by a third field breaks that up, so the lumps land at odd
   * angles to each other and read as one liquid mass.
   */
  warpScale: 0.6,
  warpSpeed: 0.13,
  warpAmount: 0.3,
  /** The shear is mostly horizontal; this lifts it slightly, for asymmetry. */
  warpLift: 0.22,

  /**
   * The big lumps: one noise field drifting through a second copy of itself.
   * At this scale the body carries about four of them.
   */
  blobScale: 0.6,
  /** The blotch is two decorrelated fields summed; this weights the second. */
  blobMix: 1.0,
  /** Detail within the blotch. Kept low: high gain is what makes a sponge. */
  blotchGain: 0.42,
  /** Drift speeds (field units per second) for those two fields. */
  driftA: 0.17,
  driftB: 0.12,
  /** How much of the silhouette the blotch accounts for. */
  blotchWeight: 0.86,

  /** A slower, larger ripple so the surface never reads as frozen. */
  rippleScale: 1.2,
  rippleSpeed: 0.3,
  rippleWeight: 0.13,

  /**
   * Lobes: poles that pull the mass toward themselves, like a magnet does.
   * Rounded on purpose — a high power turns each one into a cone, and four
   * cones on a sphere is a sea urchin.
   */
  lobeCount: 4,
  lobePower: 2.5,
  lobeStrength: 1.0,
  /**
   * Subtracted so a lobe bulges out and the space between them dips in. It is
   * the mean of the lobe term over the sphere — 1 / (2 * (power + 1)) per lobe,
   * so 0.571 of four — nudged a little above it, which spends the difference
   * on deeper valleys rather than on a fatter body.
   */
  lobeBaseline: 0.62,
  lobeWeight: 0.55,
  /** Radians per second the lobes orbit. */
  lobeSpeed: 0.22,
  /** Each lobe's orbit is offset; a fixed spread keeps them from bunching. */
  lobePhase: 1.7,

  /** Gravity: the mass hangs heavy at the bottom, unevenly. */
  dripStrength: 0.15,
  dripWeight: 0.24,

  /**
   * The shape stops just short of ±this, and gets there by tanh rather than
   * by clamp: a clamp flattens the tallest swells into facets, which is the
   * difference between a drop and a cut gem. Bounded by construction, so
   * `minRadius` can never be reached and the surface can never invert.
   */
  shapeLimit: 1.0,
  /**
   * How much of the core's shape the water skin follows. Below 1 so the skin
   * lags the mass slightly, and — because the skin's base radius is larger to
   * begin with — so it can never end up inside the core it wraps.
   */
  skinFollow: 0.9,
  /** How much of the shape the smoke and sparks inherit as they peel off. */
  particleFollow: 0.85,
  /** The radius multiplier never drops below this, whatever the input. */
  minRadius: 0.45,
};

/**
 * How far the silhouette deviates right now.
 *
 * Never returns zero: the body keeps its own shape and its own motion when
 * every sensor in the room is quiet, which is what "silence still feels alive"
 * means (build kit p.10). Low-stimulation mode calms it without stilling it.
 */
export function bodyAmount({ chaos = 0, safety = 0 } = {}) {
  const animated = BODY.amount + BODY.chaosAmount * saturate(chaos);
  return animated * (1 - BODY.calmSafety * saturate(safety));
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
