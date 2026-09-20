/**
 * The body shape, in JavaScript.
 *
 * `body.glsl.js` is what the GPU runs; this is the same field evaluated on the
 * CPU, for the two things that cannot be done from a shader here: measuring
 * the silhouette, and drawing it. There is no browser in this environment, so
 * "does he still look like a ball?" is answered by sampling this function and
 * rendering a silhouette to a PNG (`tools/body-shape-report.mjs`), and by the
 * assertions in `test/body.test.js` — deviation spread, boundedness, motion
 * over time, and that the skin never ends up inside the core.
 *
 * The simplex noise is a direct port of the Ashima/Gustavson implementation in
 * `noise.glsl.js`, matching term for term, so the two agree to within float
 * rounding rather than merely in character.
 */

import { BODY, saturate } from '../core/params.js';

// ---------------------------------------------------------------------------
// Simplex 3D — ported from noise.glsl.js
// ---------------------------------------------------------------------------

const C = [1 / 6, 1 / 3];
const D = [0, 0.5, 1, 2];
const NS = [2 * 0.142857142857, 0.5 * 0.142857142857 - 1, 0.142857142857];

const mod289 = (x) => x - Math.floor(x * (1 / 289)) * 289;
const permute = (x) => mod289((x * 34 + 1) * x);
const taylorInvSqrt = (r) => 1.79284291400159 - 0.85373472095314 * r;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Simplex noise in roughly -1..1. */
export function snoise(v) {
  const s = (v[0] + v[1] + v[2]) * C[1];
  const i = [Math.floor(v[0] + s), Math.floor(v[1] + s), Math.floor(v[2] + s)];
  const t = (i[0] + i[1] + i[2]) * C[0];

  const x0 = [v[0] - i[0] + t, v[1] - i[1] + t, v[2] - i[2] + t];

  // GLSL: g = step(x0.yzx, x0.xyz) — i.e. is this axis the largest so far.
  const g = [x0[1] <= x0[0] ? 1 : 0, x0[2] <= x0[1] ? 1 : 0, x0[0] <= x0[2] ? 1 : 0];
  const l = [1 - g[0], 1 - g[1], 1 - g[2]];
  const i1 = [Math.min(g[0], l[2]), Math.min(g[1], l[0]), Math.min(g[2], l[1])];
  const i2 = [Math.max(g[0], l[2]), Math.max(g[1], l[0]), Math.max(g[2], l[1])];

  const x1 = [x0[0] - i1[0] + C[0], x0[1] - i1[1] + C[0], x0[2] - i1[2] + C[0]];
  const x2 = [x0[0] - i2[0] + C[1], x0[1] - i2[1] + C[1], x0[2] - i2[2] + C[1]];
  const x3 = [x0[0] - D[1], x0[1] - D[1], x0[2] - D[1]];

  const ii = [mod289(i[0]), mod289(i[1]), mod289(i[2])];
  const offsets = [
    [0, i1[2], i2[2], 1],
    [0, i1[1], i2[1], 1],
    [0, i1[0], i2[0], 1],
  ];

  let p = offsets[0].map((o) => permute(ii[2] + o));
  p = p.map((value, k) => permute(value + ii[1] + offsets[1][k]));
  p = p.map((value, k) => permute(value + ii[0] + offsets[2][k]));

  const j = p.map((value) => value - 49 * Math.floor(value * NS[2] * NS[2]));
  const x_ = j.map((value) => Math.floor(value * NS[2]));
  const y_ = j.map((value, k) => Math.floor(value - 7 * x_[k]));
  const x = x_.map((value) => value * NS[0] + NS[1]);
  const y = y_.map((value) => value * NS[0] + NS[1]);
  const h = [0, 1, 2, 3].map((k) => 1 - Math.abs(x[k]) - Math.abs(y[k]));

  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];
  const s0 = b0.map((value) => Math.floor(value) * 2 + 1);
  const s1 = b1.map((value) => Math.floor(value) * 2 + 1);
  const sh = h.map((value) => -(value <= 0 ? 1 : 0));

  const a0 = [b0[0], b0[2], b0[1], b0[3]].map((value, k) => value + [s0[0], s0[2], s0[1], s0[3]][k]
    * [sh[0], sh[0], sh[1], sh[1]][k]);
  const a1 = [b1[0], b1[2], b1[1], b1[3]].map((value, k) => value + [s1[0], s1[2], s1[1], s1[3]][k]
    * [sh[2], sh[2], sh[3], sh[3]][k]);

  const corners = [
    [a0[0], a0[1], h[0]],
    [a0[2], a0[3], h[1]],
    [a1[0], a1[1], h[2]],
    [a1[2], a1[3], h[3]],
  ];
  const xs = [x0, x1, x2, x3];
  const norms = corners.map((corner) => taylorInvSqrt(dot3(corner, corner)));
  const scaled = corners.map((corner, k) => corner.map((value) => value * norms[k]));

  return 42 * [0, 1, 2, 3].reduce((sum, k) => {
    const m = Math.max(0.6 - dot3(xs[k], xs[k]), 0);
    return sum + m * m * m * m * dot3(scaled[k], xs[k]);
  }, 0);
}

/** Fractal noise, matching the GLSL `fbm` term for term. */
export function fbm(p, octaves, lacunarity, gain) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let point = [...p];
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * snoise(point);
    norm += amp;
    point = point.map((value) => value * lacunarity);
    amp *= gain;
  }
  return sum / Math.max(norm, 0.0001);
}

// ---------------------------------------------------------------------------
// The shape
// ---------------------------------------------------------------------------

/**
 * Silhouette deviation in a direction, in -1..1.
 *
 * Term for term the same as `fuxBodyShape` in body.glsl.js. If you change one,
 * change the other: `test/body.test.js` checks that every constant the GLSL
 * uses is one of the values in `params.js`, so the numbers cannot drift, but
 * the expression structure is mirrored by hand and this comment is the
 * contract.
 */
export function fuxBodyShape(dir, time) {
  const [dx, dy, dz] = dir;

  // A slow swirl through the fields below, so their lumps sit at odd angles to
  // each other instead of in the lattice the noise would otherwise repeat.
  const warp = snoise([
    dx * BODY.warpScale,
    dy * BODY.warpScale + time * BODY.warpSpeed,
    dz * BODY.warpScale - time * BODY.warpSpeed * 0.6,
  ]);
  const swirled = [
    dx + dy * warp * BODY.warpAmount,
    dy + dz * warp * BODY.warpAmount + warp * BODY.warpLift,
    dz + dx * warp * BODY.warpAmount,
  ];
  const [wx, wy, wz] = swirled;

  const blotchA = fbm(
    [wx * BODY.blobScale, wy * BODY.blobScale + time * BODY.driftA, wz * BODY.blobScale],
    2, 2, BODY.blotchGain,
  );
  const blotchB = fbm(
    [wy * BODY.blobScale + time * BODY.driftB, wz * BODY.blobScale, wx * BODY.blobScale],
    2, 2, BODY.blotchGain,
  );
  const blotch = (blotchA + blotchB * BODY.blobMix) / (1 + BODY.blobMix);

  const ripple = snoise([
    wx * BODY.rippleScale,
    wy * BODY.rippleScale + time * BODY.rippleSpeed,
    wz * BODY.rippleScale + time * 0.11,
  ]);

  let lobes = 0;
  for (let i = 0; i < BODY.lobeCount; i += 1) {
    const phase = time * BODY.lobeSpeed + i * BODY.lobePhase;
    const axis = normalize([
      Math.sin(phase),
      Math.cos(phase * 0.73) * 0.8,
      Math.cos(phase + i * 2.1),
    ]);
    const alignment = Math.max(dir[0] * axis[0] + dir[1] * axis[1] + dir[2] * axis[2], 0);
    lobes += alignment ** BODY.lobePower;
  }
  lobes = lobes * BODY.lobeStrength - BODY.lobeBaseline;

  const drip = -dy * BODY.dripStrength
    * (0.6 + 0.4 * Math.cos(dx * 3.3 + dz * 2.7 + time * 0.06));

  // Soft saturation, not a clamp: a clamp would flatten the tallest swells
  // into facets. This way the shape approaches the limit without arriving.
  return BODY.shapeLimit * Math.tanh((
    blotch * BODY.blotchWeight
    + ripple * BODY.rippleWeight
    + lobes * BODY.lobeWeight
    + drip * BODY.dripWeight
  ) / BODY.shapeLimit);
}

/** Radius multiplier: never collapses, never inverts. */
export function fuxBodyRadius(dir, time, amount) {
  return Math.max(BODY.minRadius, 1 + amount * fuxBodyShape(normalize(dir), time));
}

/** A point on the surface of the mass. */
export function fuxBodyPoint(dir, radius, time, amount) {
  const unit = normalize(dir);
  const r = radius * fuxBodyRadius(unit, time, amount);
  return [unit[0] * r, unit[1] * r, unit[2] * r];
}

/** Outward normal, by the same two finite differences the shader uses. */
export function fuxBodyNormal(dir, time, amount) {
  const unit = normalize(dir);
  const up = Math.abs(unit[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const tangentA = normalize(cross(unit, up));
  const tangentB = cross(unit, tangentA);

  const e = 0.09;
  const p0 = fuxBodyPoint(unit, 1, time, amount);
  const pa = fuxBodyPoint(add(unit, scale(tangentA, e)), 1, time, amount);
  const pb = fuxBodyPoint(add(unit, scale(tangentB, e)), 1, time, amount);

  const n = normalize(cross(sub(pa, p0), sub(pb, p0)));
  return dot3(n, unit) < 0 ? scale(n, -1) : n;
}

// ---------------------------------------------------------------------------
// Small vector helpers
// ---------------------------------------------------------------------------

export function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

/**
 * Directions spread evenly over the sphere, by the Fibonacci spiral. The same
 * sampling is used by the report tool and the tests, so what is measured is
 * what is drawn.
 */
export function sphereDirections(count) {
  const directions = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    directions.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return directions;
}

/**
 * How spherical the silhouette is: the spread of the radius over the whole
 * surface, as a fraction of the mean. A sphere scores 0; this is the number
 * that says whether FuX reads as a ball.
 */
export function silhouetteSpread(time, amount, count = 1200) {
  const radii = sphereDirections(count).map((dir) => fuxBodyRadius(dir, time, amount));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length;
  return { mean, min: Math.min(...radii), max: Math.max(...radii), std: Math.sqrt(variance) };
}

/** How much the silhouette moves between two moments, as a mean change. */
export function silhouetteChange(timeA, timeB, amount, count = 800) {
  const directions = sphereDirections(count);
  let total = 0;
  for (const dir of directions) {
    total += Math.abs(fuxBodyRadius(dir, timeB, amount) - fuxBodyRadius(dir, timeA, amount));
  }
  return total / count;
}

/**
 * The silhouette itself, walked around a great circle.
 *
 * `silhouetteSpread` says how far the surface wanders; this says what the
 * wander looks like. A ball reads as a flat line, a sea urchin reads as a comb,
 * and a drop of ferrofluid reads as a few smooth swells — three different
 * shapes that spread alone cannot tell apart. Returned in radius units.
 */
export function silhouetteProfile(time, amount, count = 256, normal = [0, 1, 0]) {
  const unit = normalize(normal);
  const up = Math.abs(unit[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const tangentA = normalize(cross(unit, up));
  const tangentB = cross(unit, tangentA);

  const radii = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    radii.push(fuxBodyRadius([
      tangentA[0] * c + tangentB[0] * s,
      tangentA[1] * c + tangentB[1] * s,
      tangentA[2] * c + tangentB[2] * s,
    ], time, amount));
  }
  return radii;
}

/**
 * How liquid a silhouette looks, in four numbers.
 *
 * - `oscillations` is the total variation divided by twice the radius range:
 *   the count of swells and dips around the body. A handful is a liquid mass;
 *   a dozen is a texture.
 * - `bulges` counts the swells that rise above the mean.
 * - `peakSlope` is the steepest rate of change in radius per radian, against
 *   the mean radius. High values are spikes, low values are swells.
 * - `spikiness` is the share of all the change that happens in the steepest
 *   5% of the walk. Even waves spread their change out and score near 0.05;
 *   needles concentrate it and score several times higher.
 *
 * The picture those four numbers describe is in `reference/body-shape.png`,
 * rendered by `tools/body-shape-report.mjs` from this same field.
 */
export function silhouetteRoughness(time, amount, count = 256, normal = [0, 1, 0]) {
  const radii = silhouetteProfile(time, amount, count, normal);
  const mean = radii.reduce((a, b) => a + b, 0) / count;
  const min = Math.min(...radii);
  const max = Math.max(...radii);
  const range = Math.max(max - min, 1e-9);

  const steps = [];
  let variation = 0;
  for (let i = 0; i < count; i += 1) {
    const delta = Math.abs(radii[(i + 1) % count] - radii[i]);
    steps.push(delta);
    variation += delta;
  }

  let peaks = 0;
  for (let i = 0; i < count; i += 1) {
    const previous = radii[(i + count - 1) % count];
    const next = radii[(i + 1) % count];
    if (radii[i] > previous && radii[i] >= next && radii[i] > mean) peaks += 1;
  }

  const sorted = [...steps].sort((a, b) => b - a);
  const steepest = sorted.slice(0, Math.max(1, Math.round(count * 0.05)));
  const angularStep = (Math.PI * 2) / count;

  return {
    mean,
    range,
    oscillations: variation / (2 * range),
    bulges: peaks,
    peakSlope: sorted[0] / angularStep / mean,
    spikiness: steepest.reduce((a, b) => a + b, 0) / Math.max(variation, 1e-9),
  };
}

/**
 * The same verdict averaged over several cuts through the body and several
 * moments, so a single unlucky slice cannot flatter the numbers.
 */
export function bodyLiquidity(amount, { times = [0, 6.5, 19], count = 192 } = {}) {
  const planes = [[0, 1, 0], [1, 0, 0], [0.4, 0.7, 0.6], [-0.6, 0.5, 0.62]];
  const totals = { oscillations: 0, bulges: 0, peakSlope: 0, spikiness: 0, range: 0 };
  let samples = 0;
  for (const time of times) {
    for (const plane of planes) {
      const r = silhouetteRoughness(time, amount, count, plane);
      for (const key of Object.keys(totals)) totals[key] += r[key];
      samples += 1;
    }
  }
  for (const key of Object.keys(totals)) totals[key] /= samples;
  return totals;
}

export { saturate };
