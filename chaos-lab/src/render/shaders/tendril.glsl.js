/**
 * NS_FuX_FluidTendrils — ribbon emitters (build kit p.8).
 *
 * "Ribbon or beam emitters. Spawn from core surface. Curl noise for living
 *  motion. Attractor follows attention target. Audio low controls thickness."
 *
 * The ribbons are built entirely in the vertex shader from a strip grid: each
 * tendril is a (COLUMNS x ROWS) patch, and every vertex knows which tendril it
 * belongs to, how far along it sits (aAlong), and where it sits across the
 * ribbon (aAcross). The curve is evaluated twice per vertex so the tangent is
 * real, which is what lets the ribbon billboard instead of turning edge-on.
 */

import { noiseGLSL } from './noise.glsl.js';
import { bodyGLSL } from './body.glsl.js';

export const tendrilVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uChaos;
uniform float uLength;
uniform float uThickness;
uniform float uCurlAmount;
uniform float uAudioLow;
uniform float uEnergy;
uniform float uSafety;
uniform vec3  uAttentionPoint;
uniform float uAttention;
uniform vec3  uTouchPoint;
uniform float uTouchStrength;
// "Fluid tendrils 8-16 active" (build kit p.10) — tendrils at or beyond this
// index collapse to the surface and are discarded in the fragment stage.
uniform float uActiveCount;

// Where the mass actually is: tendrils have to root in the moving surface, not
// on the sphere the mesh was built from, or they visibly detach from him.
uniform float uBodyAmount;
uniform float uCoreRadius;

attribute float aAlong;     // 0 at the core surface, 1 at the tip
attribute float aAcross;    // -1 .. +1 across the ribbon width
attribute vec3  aDirection; // unit vector from the core surface outward
attribute float aSeed;
attribute float aIndex;     // which tendril this vertex belongs to

varying float vAlong;
varying float vAcross;
varying float vTaper;
varying float vSeed;
varying float vAlive;

${noiseGLSL}

${bodyGLSL}

/** Evaluate one point on a tendril's curve. */
vec3 tendrilPoint(vec3 baseDir, float t, float seed) {
  // Spawn from the surface of the mass, wherever the body has moved it to.
  vec3 surfacePt = fuxBodyPoint(baseDir, uCoreRadius, uTime, uBodyAmount) * (1.0 / uCoreRadius);

  // Length responds to chaos and answers the low band.
  float len = uLength * (0.45 + uChaos * 1.05) * (0.75 + uAudioLow * 0.55);

  // Straight run outward first, so tendrils read as reach rather than fuzz.
  vec3 p = surfacePt + baseDir * len * t;

  // Curl noise for living motion — grows toward the tip, so the base stays
  // anchored in the mass while the end wanders.
  vec3 curl = curlNoise(baseDir * 2.4 + vec3(0.0, uTime * 0.28, 0.0) + seed * 3.1);
  p += curl * len * t * t * uCurlAmount;

  // A slow second octave stops the motion from looping visibly.
  vec3 slow = curlNoise(baseDir * 1.1 - vec3(uTime * 0.09, 0.0, 0.0) + seed);
  p += slow * len * t * t * uCurlAmount * 0.45;

  // Attractor follows attention target.
  vec3 toTarget = uAttentionPoint - p;
  float d = length(toTarget);
  if (d > 0.0001) {
    p += (toTarget / d) * uAttention * min(d, 1.6) * t * t * 0.85;
  }

  // A touch pulls nearby tendrils toward the contact point.
  vec3 toTouch = uTouchPoint - p;
  float td = length(toTouch);
  if (td > 0.0001) {
    p += (toTouch / td) * uTouchStrength * exp(-td * 0.55) * t * 0.6;
  }

  return p;
}

void main() {
  // Budget gate: inactive tendrils are collapsed to a point and discarded.
  float alive = step(aIndex + 0.5, uActiveCount);

  vec3 baseDir = normalize(aDirection);
  float t = aAlong;

  vec3 p = tendrilPoint(baseDir, t, aSeed);
  // An inactive tendril rests on the body surface rather than inside it.
  vec3 restPt = fuxBodyPoint(baseDir, 1.0, uTime, uBodyAmount);
  p = mix(restPt, p, alive);

  // Finite difference for a true curve tangent.
  const float eps = 0.035;
  vec3 pNext = tendrilPoint(baseDir, min(t + eps, 1.0), aSeed);
  vec3 tangent = normalize(pNext - p + vec3(0.00001));

  // Billboard the ribbon against the view so it never turns edge-on.
  vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
  vec3 side = normalize(cross(tangent, viewDir) + vec3(0.00001));

  // Audio low controls thickness. Taper so the tip is thin and the base is
  // rooted in the mass instead of stitched on.
  float taper = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.5, 1.0, t) * 0.85);
  vTaper = taper;

  float thickness = uThickness * (0.55 + uChaos * 0.9) * (0.7 + uAudioLow * 0.7);
  thickness *= mix(1.0, 0.55, uSafety);

  vAlong = t;
  vAcross = aAcross;
  vSeed = aSeed;
  vAlive = alive;

  vec3 displaced = p + side * aAcross * thickness * taper;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const tendrilFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uChaos;
uniform float uEnergy;
uniform float uAudioMid;
uniform float uGlow;
uniform float uSafety;
uniform vec3  uColorPrimary;
uniform vec3  uColorSecondary;

varying float vAlong;
varying float vAcross;
varying float vTaper;
varying float vSeed;
varying float vAlive;

void main() {
  // Soft edge across the ribbon width: a glowing core with falloff, not a
  // hard cut line. This is what makes 16 ribbons read as living filaments.
  float acrossFalloff = pow(1.0 - clamp(abs(vAcross), 0.0, 1.0), 1.8);

  // Color travels violet -> lime along the tendril, driven by mid band.
  float mixAmount = clamp(vAlong * 0.75 + uAudioMid * 0.5, 0.0, 1.0);
  vec3 color = mix(uColorPrimary, uColorSecondary, mixAmount);

  // Brightest where it leaves the mass; the tip fades into the smoke.
  float falloff = pow(vTaper, 1.3) * (1.0 - smoothstep(0.72, 1.0, vAlong));

  float intensity = acrossFalloff * falloff * (uGlow * 0.13) * (0.5 + uChaos * 0.9 + uEnergy * 0.7);
  intensity *= mix(1.0, 0.5, uSafety);

  // A slow tint pulse keeps even resting tendrils alive.
  intensity *= 0.85 + 0.15 * sin(uTime * 1.3 + vSeed * 6.28318);

  vec3 outColor = color * intensity;
  float alpha = clamp(intensity * 1.4 + acrossFalloff * falloff * 0.4, 0.0, 0.95);

  gl_FragColor = vec4(outColor, alpha);
}
`;
