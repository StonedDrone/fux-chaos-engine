/**
 * NS_FuX_SmokeBody + NS_FuX_MagneticSparks (build kit p.8).
 *
 * "Use particles as evidence of intent, not as fog. The core must stay
 *  readable from across the room."
 *
 *   Smoke:  thin around the silhouette, curl noise pulls vapour back toward
 *           the core, distance fade avoids glass clutter.
 *   Sparks: high-band audio triggers short magnetic discharges, brightest at
 *           the moment of release.
 *
 * Both systems share one pipeline: a static attribute buffer of per-particle
 * seeds, and motion solved analytically in the vertex shader from `uTime` and
 * a per-particle birth offset. Nothing is simulated on the CPU, so the whole
 * particle budget costs one draw call each.
 */

import { noiseGLSL } from './noise.glsl.js';

export const particleVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uMode;        // 0 = smoke, 1 = sparks
uniform float uChaos;
uniform float uEnergy;
uniform float uAudioLow;
uniform float uAudioHigh;
uniform float uSmokeCurl;   // 0 = held close, 1 = sheared wide
uniform float uSparkRate;
uniform float uSafety;
uniform float uSize;
uniform vec3  uAttentionPoint;
uniform float uAttention;
uniform vec3  uTouchPoint;
uniform float uTouchStrength;
uniform float uBeat;

attribute vec3  aSeed;      // direction + seed in one
attribute float aBirth;     // birth offset, 0..1
attribute float aScale;

varying float vLife;        // 0..1 through the particle's life
varying float vSeed;
varying float vBright;
varying float vIsSpark;

${noiseGLSL}

void main() {
  float isSpark = step(0.5, uMode);

  // ------------------------------------------------------------------
  // Life cycle. Each particle has its own phase so the population does not
  // pulse in lockstep.
  // ------------------------------------------------------------------
  float span = mix(3.6, 0.5, isSpark);
  float life = fract(aBirth + uTime / span);
  vLife = life;

  vec3 dir = normalize(aSeed + vec3(0.0001));
  float seed = fract(aSeed.x * 12.9898 + aSeed.y * 78.233 + aSeed.z * 37.719);

  // ------------------------------------------------------------------
  // Smoke: peels off the surface, then curls back inward.
  // ------------------------------------------------------------------
  float rise = pow(life, 0.7);
  float smokeReach = mix(0.9, 2.5, uSmokeCurl) * (0.55 + uChaos * 0.7) * (0.7 + uAudioLow * 0.4);

  vec3 smokePos = dir * (1.02 + rise * smokeReach);

  // Curl advection: the vapour is carried by its own field.
  vec3 curl = curlNoise(dir * 1.6 + vec3(0.0, uTime * 0.16, 0.0));
  smokePos += curl * rise * (0.35 + uSmokeCurl * 0.75);

  // "Curl noise pulls vapor back toward the core" — a late-life inward pull
  // so smoke advects outward and then returns rather than drifting away.
  float returnPull = smoothstep(0.45, 1.0, life);
  smokePos -= dir * returnPull * 0.55 * mix(0.6, 1.0, uSmokeCurl);

  // ------------------------------------------------------------------
  // Sparks: short magnetic discharges along the surface.
  // ------------------------------------------------------------------
  float sparkLife = pow(1.0 - life, 0.5);
  vec3 sparkPos = dir * (1.0 + life * 0.75 * (0.6 + uChaos * 0.8));
  sparkPos += curl * life * 0.22;

  vec3 pos = mix(smokePos, sparkPos, isSpark);

  // Attention and touch both bias nearby particles.
  vec3 toTarget = uAttentionPoint - pos;
  float td = length(toTarget);
  if (td > 0.0001) {
    pos += (toTarget / td) * uAttention * min(td, 1.2) * 0.28 * (1.0 - isSpark);
  }

  vec3 toTouch = uTouchPoint - pos;
  float tcd = length(toTouch);
  if (tcd > 0.0001) {
    pos += (toTouch / tcd) * uTouchStrength * exp(-tcd * 0.7) * 0.45;
  }

  // ------------------------------------------------------------------
  // Size + brightness.
  // ------------------------------------------------------------------
  float smokeSize = uSize * aScale * (0.6 + life * 1.5);
  float sparkSize = uSize * aScale * 0.35 * (0.4 + sparkLife);
  float size = mix(smokeSize, sparkSize, isSpark);

  vSeed = seed;

  // Smoke is faint and diffuse; sparks are bright and brief.
  float smokeBright = (0.10 + uChaos * 0.22) * (1.0 - life) * (1.0 - smoothstep(0.7, 1.0, life));
  float sparkBright = uAudioHigh * (0.5 + uSparkRate * 0.9) * sparkLife;
  sparkBright += uBeat * 0.5 * sparkLife;
  // Sparks only exist when there is something to discharge.
  sparkBright *= smoothstep(0.05, 0.35, uAudioHigh + uChaos * 0.35 + uBeat * 0.3);
  vBright = mix(smokeBright, sparkBright, isSpark);
  vIsSpark = isSpark;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Perspective-correct point size, clamped for the UHD 620 budget.
  gl_PointSize = clamp(size * (300.0 / -mvPosition.z), 1.0, mix(90.0, 34.0, isSpark));
}
`;

export const particleFragmentShader = /* glsl */ `
precision highp float;

uniform float uChaos;
uniform float uAudioMid;
uniform float uAttention;
uniform float uSafety;
uniform vec3  uColorPrimary;
uniform vec3  uColorSecondary;

varying float vLife;
varying float vSeed;
varying float vBright;
varying float vIsSpark;

void main() {
  // Round, soft-edged sprite.
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  float edge = pow(1.0 - d * 2.0, 1.9);

  // Smoke takes the identity color and cools as it thins; sparks take the
  // secondary "answer" color. That separation is what keeps the two systems
  // legible as different intentions rather than one fog.
  vec3 smokeColor = mix(uColorPrimary, vec3(0.42, 0.40, 0.5), vLife * 0.7);
  vec3 sparkColor = uColorSecondary;

  vec3 color = mix(smokeColor, sparkColor, vIsSpark);

  float intensity = vBright * edge * 1.5 * (0.9 + 0.2 * fract(vSeed * 7.31));
  intensity *= mix(1.0, 0.45, uSafety);

  gl_FragColor = vec4(color * intensity, clamp(intensity, 0.0, 1.0));
}
`;
