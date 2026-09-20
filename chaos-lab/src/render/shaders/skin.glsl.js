/**
 * WaterSkinMesh — the thin transparent shell (build kit p.4).
 *
 * "Water-like currents travel around the skin. Smoke advects from motion,
 *  then curls back inward. Touch leaves a luminous ripple and fading scar."
 *
 * The skin is deliberately separate from the core: the core owns tension and
 * mass, the skin owns flow and memory. Two translucency layers is the stated
 * prototype limit (p.10), and this is the second one.
 */

import { noiseGLSL } from './noise.glsl.js';
import { bodyGLSL } from './body.glsl.js';

export const skinVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uFlowSpeed;
uniform float uDisplace;        // centimetres, from the mood asset
uniform float uDisplaceScale;  // centimetres -> model units
uniform float uChaos;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uEnergy;
uniform float uBreath;
uniform float uSafety;
uniform float uSkinRadius;

// The core's body deviation, so the skin wraps the shape the core is wearing
// rather than the sphere underneath it.
uniform float uBodyAmount;
uniform vec3  uTouchPoint;
uniform float uTouchStrength;
uniform float uTouchAge;

varying vec3  vNormalW;
varying vec3  vPositionW;
varying float vCurrent;
varying float vRipple;
varying float vScar;
varying float vFlowSpeedVar;

${noiseGLSL}

${bodyGLSL}

void main() {
  vec3 localPos = position;

  // Track the mass. The skin follows most of the core's shape — always less
  // than all of it, so it can never be swallowed by the core it wraps.
  vec3 dir = normalize(localPos);
  vec3 bodyPoint = fuxBodyPoint(dir, length(localPos), uTime, uBodyAmount * BODY_SKIN_FOLLOW);
  vec3 nrm = fuxBodyNormal(dir, uTime, uBodyAmount * BODY_SKIN_FOLLOW);

  // Rotated per-vertex noise basis so vertices never line up into facets.
  vec3 noisePos = localPos * 2.4;

  // Crossing surface waves make currents roll instead of slide.
  float waveA = sin(localPos.y * 3.6 + uTime * uFlowSpeed * 3.0 + snoise(noisePos * 0.8) * 1.6);
  float waveB = sin(localPos.x * 2.7 - uTime * uFlowSpeed * 2.2 + localPos.z * 2.1);
  float waveC = snoise(localPos * 1.6 + vec3(uTime * uFlowSpeed * 0.9, 0.0, 0.0));
  vCurrent = waveA * 0.4 + waveB * 0.35 + waveC * 0.25;
  vFlowSpeedVar = uFlowSpeed;

  // The skin swells slightly with the breath so the two layers stay married.
  float breathSwell = (uBreath - 0.5) * 0.06;

  // Displacement is a fraction of the core's: the skin should lag and ripple,
  // never compete with the mass for attention.
  vec3 curl = curlNoise(noisePos + vec3(0.0, uTime * uFlowSpeed * 0.7, 0.0));
  vec3 displaceVec = curl * (0.1 + uFlowSpeed * 0.55) + nrm * vCurrent * 0.05;
  displaceVec += nrm * breathSwell;
  displaceVec *= (0.55 + uChaos * 0.6) * (0.6 + uAudioMid * 0.5 + uEnergy * 0.3);

  // Touch ripple travels outward across the skin.
  float distToTouch = distance(localPos, uTouchPoint);
  float rippleRadius = uTouchAge * 1.9;
  // Squared by hand — see the note in core.vert.js about pow() and negative
  // bases. The skin rings wider and softer than the core, so it reads as the
  // contact propagating outward through the water layer.
  float ringOffset = (distToTouch - rippleRadius) * 2.2;
  float ring = exp(-ringOffset * ringOffset);
  vRipple = ring * uTouchStrength;
  vScar = exp(-distToTouch * 1.1) * uTouchStrength * (1.0 - clamp(uTouchAge * 0.3, 0.0, 1.0));

  displaceVec += nrm * (vRipple * 0.28 + vScar * 0.16);

  float travel = length(displaceVec);
  if (travel > 0.9) displaceVec *= 0.9 / travel;

  // The skin mesh already sits at its own radius; only the displacement
  // moves it, and always less than the core so it reads as a surface.
  vec3 displaced = bodyPoint + displaceVec * uDisplace * uDisplaceScale * 0.85;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * nrm);
  vPositionW = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const skinFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uChaos;
uniform float uOpacity;
uniform float uEnergy;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uAttention;
uniform float uSafety;
uniform vec3  uColorPrimary;
uniform vec3  uColorSecondary;

varying vec3  vNormalW;
varying vec3  vPositionW;
varying float vCurrent;
varying float vRipple;
varying float vScar;
varying float vFlowSpeedVar;

void main() {
  vec3 nrm = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vPositionW);

  // Grazing angles carry the most color — glass catching FuX's pulse.
  float fresnel = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 2.6);

  // Edge shimmer from the high band: thin filaments along the rim.
  float shimmer = pow(fresnel, 3.0) * uAudioHigh * 1.4;

  // Currents carry color around the body (mid band = color travel).
  float currentColor = clamp(vCurrent * 0.5 + 0.5, 0.0, 1.0);
  float mixAmount = clamp(uAttention * 0.5 + uAudioMid * 0.55 + currentColor * 0.35, 0.0, 1.0);
  vec3 currentTint = mix(uColorPrimary, uColorSecondary, mixAmount);

  // Thin-film iridescence: the skin separates colors the way an oil slick
  // does, which sells the water layer without any texture.
  float thinFilm = 0.5 + 0.5 * sin(vCurrent * 6.28318 + uTime * 0.6 + fresnel * 4.0);
  vec3 iridescence = mix(currentTint, currentTint.gbr, thinFilm * 0.35);

  vec3 color = iridescence * fresnel * (0.5 + uEnergy * 0.9 + uChaos * 0.55);
  color += currentTint * shimmer * 0.6;

  // Touch memory lives on the skin.
  color += (uColorSecondary * 0.7 + vec3(0.3)) * vRipple * 1.9;
  color += (uColorSecondary * 0.5 + vec3(0.2)) * vScar * 1.1;

  // Alpha: the skin must never hide the entity (build kit p.10 QA).
  float alpha = fresnel * uOpacity * (0.30 + uChaos * 0.30) + vRipple * 0.7 + vScar * 0.35;
  alpha = clamp(alpha, 0.0, 0.72);
  alpha *= mix(1.0, 0.62, uSafety);

  float maxLuma = mix(2.2, 0.85, uSafety);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (luma > maxLuma) color *= maxLuma / luma;

  gl_FragColor = vec4(color, alpha);
}
`;
