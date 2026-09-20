/**
 * The fluid body, as GLSL.
 *
 * `fuxBodyShape` is the silhouette FuX wears before anything is asked of him:
 * a radius multiplier that varies with direction and never stops moving. It is
 * shared by every mesh — core, skin, tendrils, particles — because they all
 * have to agree about where the surface is. A tendril that anchors to a sphere
 * while the core bulges past it is a visible seam, and the skin is worst of
 * all: it would be swallowed the moment the body grew.
 *
 * The numeric constants are interpolated from `src/core/params.js`, so the
 * field the GPU evaluates and the field the tests measure in JS cannot drift
 * apart. `src/render/bodyShape.js` is the JS mirror used for that measuring and
 * for `tools/body-shape-report.mjs`.
 *
 * Cost: three noise samples per evaluation. `fuxBodyNormal` evaluates the
 * field three times for a real gradient, which is what makes the lumps catch
 * light instead of reading as a shaded ball.
 */

import { BODY } from '../../core/params.js';

/** Emit a float literal the way GLSL wants it. */
const f = (value) => (Number.isInteger(value) ? `${value}.0` : String(value));

export const bodyGLSL = /* glsl */ `
// ---------------------------------------------------------------------------
// Body shape. Values mirror src/core/params.js — edit them there.
// ---------------------------------------------------------------------------
const float BODY_WARP_SCALE    = ${f(BODY.warpScale)};
const float BODY_WARP_SPEED    = ${f(BODY.warpSpeed)};
const float BODY_WARP_AMOUNT   = ${f(BODY.warpAmount)};
const float BODY_WARP_LIFT     = ${f(BODY.warpLift)};
const float BODY_BLOB_SCALE    = ${f(BODY.blobScale)};
const float BODY_BLOB_MIX      = ${f(BODY.blobMix)};
const float BODY_BLOTCH_GAIN   = ${f(BODY.blotchGain)};
const float BODY_DRIFT_A       = ${f(BODY.driftA)};
const float BODY_DRIFT_B       = ${f(BODY.driftB)};
const float BODY_BLOTCH_WEIGHT = ${f(BODY.blotchWeight)};
const float BODY_RIPPLE_SCALE  = ${f(BODY.rippleScale)};
const float BODY_RIPPLE_SPEED  = ${f(BODY.rippleSpeed)};
const float BODY_RIPPLE_WEIGHT = ${f(BODY.rippleWeight)};
const float BODY_LOBE_POWER    = ${f(BODY.lobePower)};
const float BODY_LOBE_STRENGTH = ${f(BODY.lobeStrength)};
const float BODY_LOBE_BASELINE = ${f(BODY.lobeBaseline)};
const float BODY_LOBE_WEIGHT   = ${f(BODY.lobeWeight)};
const float BODY_LOBE_SPEED    = ${f(BODY.lobeSpeed)};
const float BODY_LOBE_PHASE    = ${f(BODY.lobePhase)};
const float BODY_DRIP_STRENGTH = ${f(BODY.dripStrength)};
const float BODY_DRIP_WEIGHT   = ${f(BODY.dripWeight)};
const float BODY_SHAPE_LIMIT   = ${f(BODY.shapeLimit)};
const float BODY_MIN_RADIUS    = ${f(BODY.minRadius)};
const float BODY_SKIN_FOLLOW   = ${f(BODY.skinFollow)};
const float BODY_PARTICLE_FOLLOW = ${f(BODY.particleFollow)};

/**
 * How far the silhouette deviates in a given direction, approaching 1.
 *
 * Three fields, at three scales, plus the lobes, and a swirl through all of
 * them. The balance between them is the whole look: a dominant low-frequency
 * blotch reads as a liquid mass, and adding a high-frequency field on top of it
 * reads as a sea urchin — the same amount of deviation, a completely different
 * creature. tools/body-shape-report.mjs measures that difference in four
 * numbers (oscillations, bulges, peak slope, spikiness) and draws it.
 *
 * Two decorrelated fields are summed with fixed weights rather than
 * cross-faded. Cross-fading would flatten every time the two met in the
 * middle, and the body would pulse between lumpy and smooth; a fixed sum
 * keeps its amplitude while the features dissolve through each other, which
 * is what reads as boiling rather than as a texture sliding over a ball.
 */
float fuxBodyShape(vec3 dir, float time) {
  // The swirl. Sampling the fields below through this is what keeps their
  // lumps at odd angles to each other instead of in the noise's own lattice.
  float warp = snoise(dir * BODY_WARP_SCALE
                    + vec3(0.0, time * BODY_WARP_SPEED, -time * BODY_WARP_SPEED * 0.6));
  vec3 swirled = vec3(
    dir.x + dir.y * warp * BODY_WARP_AMOUNT,
    dir.y + dir.z * warp * BODY_WARP_AMOUNT + warp * BODY_WARP_LIFT,
    dir.z + dir.x * warp * BODY_WARP_AMOUNT
  );

  // Slow blotch: the big lumps, drifting as two fields through each other.
  float blotchA = fbm(vec3(swirled.x, swirled.y, swirled.z) * BODY_BLOB_SCALE
                    + vec3(0.0, time * BODY_DRIFT_A, 0.0), 2, 2.0, BODY_BLOTCH_GAIN);
  float blotchB = fbm(swirled.yzx * BODY_BLOB_SCALE
                    + vec3(time * BODY_DRIFT_B, 0.0, 0.0), 2, 2.0, BODY_BLOTCH_GAIN);
  // Divided by the sum of the weights, so the field keeps its amplitude as
  // the two drift apart instead of swelling whenever they agree.
  float blotch = (blotchA + blotchB * BODY_BLOB_MIX) / (1.0 + BODY_BLOB_MIX);

  // A slower, larger ripple keeps the surface working between the lumps.
  float ripple = snoise(swirled * BODY_RIPPLE_SCALE
                      + vec3(0.0, time * BODY_RIPPLE_SPEED, time * 0.11));

  // Lobes: poles orbiting the body, pulling it toward themselves the way a
  // magnet pulls ferrofluid. Between two lobes the surface dips, which is
  // what gives the mass distinct arms instead of an even wobble.
  float lobes = 0.0;
  for (int i = 0; i < ${BODY.lobeCount}; i++) {
    float fi = float(i);
    float phase = time * BODY_LOBE_SPEED + fi * BODY_LOBE_PHASE;
    vec3 axis = normalize(vec3(sin(phase), cos(phase * 0.73) * 0.8, cos(phase + fi * 2.1)));
    lobes += pow(max(dot(dir, axis), 0.0), BODY_LOBE_POWER);
  }
  lobes = lobes * BODY_LOBE_STRENGTH - BODY_LOBE_BASELINE;

  // Gravity: mass collects at the bottom. Uneven, or it reads as a teardrop.
  float drip = -dir.y * BODY_DRIP_STRENGTH * (0.6 + 0.4 * cos(dir.x * 3.3 + dir.z * 2.7 + time * 0.06));

  float shape = blotch * BODY_BLOTCH_WEIGHT
              + ripple * BODY_RIPPLE_WEIGHT
              + lobes * BODY_LOBE_WEIGHT
              + drip * BODY_DRIP_WEIGHT;

  // Soft saturation rather than a clamp: a clamp flattens the tallest swells
  // into facets, which is the difference between a drop and a cut gem. The
  // shape approaches the limit and never arrives, so the radius below can
  // never reach zero and the surface can never turn inside out.
  return BODY_SHAPE_LIMIT * tanh(shape / BODY_SHAPE_LIMIT);
}

/** Radius multiplier, so the silhouette can never invert or spike. */
float fuxBodyRadius(vec3 dir, float time, float amount) {
  return max(BODY_MIN_RADIUS, 1.0 + amount * fuxBodyShape(dir, time));
}

/** A point on the surface of the mass, in a given direction. */
vec3 fuxBodyPoint(vec3 dir, float radius, float time, float amount) {
  return dir * radius * fuxBodyRadius(normalize(dir), time, amount);
}

/**
 * The surface normal of the deformed silhouette.
 *
 * Two forward differences along tangent directions, crossed. This is what
 * makes the lumps read as form rather than as shading noise: without it the
 * lighting is computed for a sphere and the shape disappears.
 */
vec3 fuxBodyNormal(vec3 dir, float time, float amount) {
  vec3 up = abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tangentA = normalize(cross(dir, up));
  vec3 tangentB = cross(dir, tangentA);

  const float e = 0.09;
  vec3 p0 = fuxBodyPoint(dir, 1.0, time, amount);
  vec3 pa = fuxBodyPoint(normalize(dir + tangentA * e), 1.0, time, amount);
  vec3 pb = fuxBodyPoint(normalize(dir + tangentB * e), 1.0, time, amount);

  vec3 n = normalize(cross(pa - p0, pb - p0) + vec3(0.00001));
  return dot(n, dir) < 0.0 ? -n : n;
}
`;
