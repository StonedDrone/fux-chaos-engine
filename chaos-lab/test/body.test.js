/**
 * The body: that it is liquid, and that the GPU draws what was measured.
 *
 * FuX's silhouette is a radius as a function of direction, and it exists in two
 * places: `body.glsl.js` for the GPU and `bodyShape.js` for anything that has
 * to measure it. This file holds them together and holds the *look* to account.
 *
 * The look is the reason the field was rebuilt once already. The first version
 * deviated just as far from a sphere, and looked like a sea urchin: ten evenly
 * spaced bumps, each with a visible tip. Deviation alone cannot tell a drop of
 * ferrofluid from a chestnut, so the numbers below describe the *shape* of the
 * deviation — how many swells there are, and how sharp — and they are the ones
 * `tools/body-shape-report.mjs` prints and draws.
 *
 * What is checked here, and what is not: the constants are checked exactly, in
 * both directions. The expression structure is mirrored by hand and is *not*
 * machine-checked — the recorded silhouette at the bottom of this file is the
 * guard there, since any edit to the field that is not also made to the GLSL
 * still has to reproduce those numbers.
 */

import { describe, expect, it } from 'vitest';
import { BODY, bodyAmount } from '../src/core/params.js';
import { bodyGLSL } from '../src/render/shaders/body.glsl.js';
import { FuXEntity } from '../src/render/entity.js';
import { coreVertexShader } from '../src/render/shaders/core.vert.js';
import { skinVertexShader } from '../src/render/shaders/skin.glsl.js';
import { tendrilVertexShader } from '../src/render/shaders/tendril.glsl.js';
import { particleVertexShader } from '../src/render/shaders/particles.glsl.js';
import {
  bodyLiquidity,
  fuxBodyNormal,
  fuxBodyPoint,
  fuxBodyRadius,
  fuxBodyShape,
  normalize,
  silhouetteChange,
  silhouetteSpread,
  sphereDirections,
} from '../src/render/bodyShape.js';

const REST = bodyAmount();
const CHAOS = bodyAmount({ chaos: 1 });
const CALM = bodyAmount({ chaos: 1, safety: 1 });

/** The source of a named GLSL function, opening brace to matching close. */
function glslFunction(source, name) {
  const start = source.indexOf(`${name}(`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

// ---------------------------------------------------------------------------
// One field, two languages
// ---------------------------------------------------------------------------

describe('the body field is mirrored in GLSL', () => {
  const declarations = new Map();
  for (const [, name, value] of bodyGLSL.matchAll(/const\s+float\s+(BODY_\w+)\s*=\s*([-\d.]+)\s*;/g)) {
    declarations.set(name, Number(value));
  }

  const constantsUsedByTheField = [
    'warpScale', 'warpSpeed', 'warpAmount', 'warpLift',
    'blobScale', 'blobMix', 'blotchGain', 'driftA', 'driftB', 'blotchWeight',
    'rippleScale', 'rippleSpeed', 'rippleWeight',
    'lobePower', 'lobeStrength', 'lobeBaseline', 'lobeWeight', 'lobeSpeed', 'lobePhase',
    'dripStrength', 'dripWeight', 'shapeLimit', 'minRadius',
  ];

  it('declares every constant the field uses', () => {
    for (const key of constantsUsedByTheField) {
      const name = `BODY_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
      expect(declarations.has(name), `${name} is missing from body.glsl.js`).toBe(true);
    }
  });

  it('takes every declared constant from params.js, unchanged', () => {
    expect(declarations.size).toBeGreaterThan(20);
    for (const [name, value] of declarations) {
      const key = name
        .replace(/^BODY_/, '')
        .toLowerCase()
        .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      expect(BODY, `${name} has no counterpart in params.js`).toHaveProperty(key);
      expect(value, `${name} disagrees with BODY.${key}`).toBe(BODY[key]);
    }
  });

  it('runs the lobe loop as many times as params.js says', () => {
    expect(glslFunction(bodyGLSL, 'float fuxBodyShape')).toContain(`i < ${BODY.lobeCount};`);
  });

  it('soft-saturates instead of clamping, in both languages', () => {
    const glslBody = glslFunction(bodyGLSL, 'float fuxBodyShape');
    expect(glslBody).toContain('tanh(');
    expect(glslBody).not.toContain('clamp(');
    expect(fuxBodyShape.toString()).toContain('Math.tanh');
    expect(fuxBodyShape.toString()).not.toMatch(/\bclamp\(/);
  });

  it('is the shape every mesh in the body agrees on', () => {
    // A tendril anchored to a sphere while the core bulges past it is a seam,
    // and the skin is the worst case: it would be swallowed by its own core.
    for (const [name, source] of [
      ['core', coreVertexShader],
      ['skin', skinVertexShader],
      ['tendril', tendrilVertexShader],
      ['particles', particleVertexShader],
    ]) {
      expect(source, `the ${name} shader does not use the body field`).toMatch(/fuxBody(Point|Radius|Normal)\(/);
    }
  });

  it('never lets the skin fall inside the core it wraps', () => {
    // The skin follows 90% of the core's shape from a larger radius, which is
    // the whole reason it can lag without being swallowed. That is a claim
    // about two numbers in two different files, so it is checked with the
    // radii the meshes are actually built at.
    const entity = new FuXEntity({ quality: 'high' });
    const skinBase = entity.skin.geometry.attributes.position.getY(0);
    const coreBase = entity.core.geometry.attributes.position.getY(0);
    expect(skinBase).toBeGreaterThan(coreBase);

    for (const time of [0, 7, 31]) {
      for (const dir of sphereDirections(400)) {
        const shape = fuxBodyShape(dir, time);
        const core = coreBase * (1 + REST * shape);
        const skin = skinBase * (1 + REST * BODY.skinFollow * shape);
        expect(skin).toBeGreaterThan(core);
      }
      // And the same must hold at full chaos, where the core is at its widest.
      const dir = sphereDirections(400).reduce((widest, d) => (
        fuxBodyShape(d, time) > fuxBodyShape(widest, time) ? d : widest
      ));
      const peak = fuxBodyShape(dir, time);
      expect(skinBase * (1 + CHAOS * BODY.skinFollow * peak))
        .toBeGreaterThan(coreBase * (1 + CHAOS * peak));
    }
  });
});

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------

describe('the body is a liquid mass, not a sphere', () => {
  it('is nowhere near spherical at rest', () => {
    const spread = silhouetteSpread(6, REST);
    expect(spread.std).toBeGreaterThan(0.06);
    expect(spread.max - spread.min).toBeGreaterThan(0.3);
    expect(spread.mean).toBeCloseTo(1, 1);
  });

  it('carries a handful of round swells rather than a field of bumps', () => {
    const look = bodyLiquidity(REST);
    // Four or five swells around the body. The sea-urchin version of this field
    // measured ten, with a peak slope of 2.0 — it deviated just as far from a
    // sphere as this one does and read as a completely different creature.
    expect(look.bulges).toBeGreaterThanOrEqual(3);
    expect(look.bulges).toBeLessThanOrEqual(7);
    expect(look.oscillations).toBeLessThanOrEqual(3.2);
    expect(look.peakSlope).toBeLessThan(1.6);
  });

  it('never turns inside out', () => {
    for (const amount of [REST, CHAOS, CALM]) {
      for (const dir of sphereDirections(600)) {
        const radius = fuxBodyRadius(dir, 12, amount);
        expect(radius).toBeGreaterThan(BODY.minRadius);
        expect(radius).toBeLessThan(1 + amount);
      }
    }
  });

  it('stays inside its limit by construction, without flattening against it', () => {
    let peak = 0;
    for (const time of [0, 3.5, 11, 27, 44]) {
      for (const dir of sphereDirections(2000)) {
        peak = Math.max(peak, Math.abs(fuxBodyShape(dir, time)));
      }
    }
    // Inside the limit, with room to spare — if this approached 1 the swells
    // would be spending their tops against the ceiling and going flat.
    expect(peak).toBeLessThan(0.99);
    expect(peak).toBeGreaterThan(0.8);
  });

  it('gets wilder with chaos, and smaller with the low-stimulation guard', () => {
    const rest = silhouetteSpread(6, REST).std;
    const chaos = silhouetteSpread(6, CHAOS).std;
    const calm = silhouetteSpread(6, CALM).std;
    expect(chaos).toBeGreaterThan(rest * 1.3);
    expect(calm).toBeLessThan(rest * 0.75);
    // Even guarded, it is not a sphere.
    expect(calm).toBeGreaterThan(0.03);
  });
});

// ---------------------------------------------------------------------------
// The motion
// ---------------------------------------------------------------------------

describe('the body never settles', () => {
  it('is still moving after an hour', () => {
    const early = silhouetteChange(0, 0.5, REST);
    expect(early).toBeGreaterThan(0.02);
    // The drift is not a transient that runs out: the same half-second moves
    // the surface about as much at t+1h as it did at the start.
    for (const start of [30, 120, 600, 3600]) {
      const later = silhouetteChange(start, start + 0.5, REST);
      expect(later).toBeGreaterThan(early * 0.6);
      expect(later).toBeLessThan(early * 1.6);
    }
  });

  it('keeps moving in the low-stimulation mode too', () => {
    expect(silhouetteChange(0, 0.5, CALM)).toBeGreaterThan(0.008);
  });

  it('flows at the speed of a liquid, not of a breath', () => {
    // How far the mean radius travels, against the width of the silhouette:
    // a fifth of it inside four seconds is a surface that is visibly working,
    // rather than one that only breathes.
    const spread = silhouetteSpread(6, REST);
    const range = spread.max - spread.min;
    expect(silhouetteChange(0, 4, REST) / range).toBeGreaterThan(0.15);
    expect(silhouetteChange(0, 1, REST)).toBeGreaterThan(0.04);
  });
});

// ---------------------------------------------------------------------------
// The recorded field
// ---------------------------------------------------------------------------

describe('the field is deterministic', () => {
  it('returns the same shape for the same direction and time', () => {
    const dir = normalize([0.31, -0.62, 0.72]);
    expect(fuxBodyShape(dir, 9.25)).toBe(fuxBodyShape(dir, 9.25));
    expect(fuxBodyShape([...dir], 9.25)).toBe(fuxBodyShape(dir, 9.25));
    expect(fuxBodyShape(dir, 9.25)).not.toBe(fuxBodyShape(dir, 9.26));
  });

  it('reproduces the silhouette that was measured and drawn', () => {
    // Recorded from the run that produced reference/body-shape.png. These
    // numbers are the contract with the GPU: body.glsl.js is the same field,
    // written out longhand, and the picture in reference/ is these samples.
    const directions = [
      [0, 1, 0],
      [1, 0, 0],
      [0.5773502692, 0.5773502692, 0.5773502692],
      [-0.5, 0.3, 0.81],
      [0.2, -0.9, 0.39],
    ].map(normalize);

    const expected = {
      0: [-0.056828, -0.503871, 0.128279, 0.133716, 0.389096],
      7.5: [-0.701638, -0.253125, 0.547454, -0.067581, 0.352193],
    };

    for (const [time, values] of Object.entries(expected)) {
      directions.forEach((dir, index) => {
        expect(fuxBodyShape(dir, Number(time))).toBeCloseTo(values[index], 6);
      });
    }
  });

  it('puts the surface where the radius says it is, with an outward normal', () => {
    const dir = normalize([0.31, -0.62, 0.72]);
    const radius = fuxBodyRadius(dir, 4, REST);
    const point = fuxBodyPoint(dir, 1, 4, REST);
    expect(Math.hypot(...point)).toBeCloseTo(radius, 10);

    const normal = fuxBodyNormal(dir, 4, REST);
    expect(Math.hypot(...normal)).toBeCloseTo(1, 10);
    expect(normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2]).toBeGreaterThan(0);
  });
});
