/**
 * Ferrofluid core — vertex stage.
 *
 * WPO = VertexNormal * (Flow + Spikes) * (BasePulse + ReactionStrength)
 *
 * Every displacement term answers a different sense so the four moods stay
 * readable without a label (build kit p.10, visual QA):
 *   - magnetic spikes only grow when pressure is high  (threat / touch / bass)
 *   - water currents always travel, faster with mid band
 *   - viscous folding gives the body symbiotic weight
 *   - touch leaves a localised luminous ripple and a fading scar
 */

import { noiseGLSL } from './noise.glsl.js';

export const coreVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDisplace;        // centimetres, from the mood asset
uniform float uDisplaceScale;  // centimetres -> model units

// Material runtime parameters (build kit p.4).
uniform float uBreathRate;
uniform float uFlowSpeed;
uniform float uEdgeSharpness;

// Resolved chaos state.
uniform float uChaos;
uniform float uPressure;
uniform float uSpikeBias;
uniform float uBreath;
uniform float uEnergy;
uniform float uAudioLow;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uSafety;

// Touch + attention.
uniform vec3  uTouchPoint;
uniform float uTouchStrength;
uniform float uTouchAge;      // seconds since contact, 0 = just now
uniform vec3  uAttentionPoint;
uniform float uAttention;

varying vec3  vNormalW;
varying vec3  vPositionW;
varying vec3  vLocalPos;
varying float vSpikeMask;
varying float vFlowAccum;
varying float vFold;
varying float vRipple;
varying float vScar;
varying float vSurfaceDetail;

${noiseGLSL}

void main() {
  vec3 localPos = position;
  vec3 nrm = normalize(normal);

  // Constant-volume trick: ferrofluid is incompressible, so when the body is
  // pulled inward it must swell somewhere else. Scaling against the normal
  // keeps apparent mass constant as chaos rises.
  float squash = 1.0 - uChaos * 0.06 * uSafety;

  // Standard normal/tangent frame from the geometry.
  vec3 tangent = normalize(cross(nrm, vec3(0.0, 1.0, 0.001)));
  vec3 bitangent = normalize(cross(nrm, tangent));

  // Per-vertex noise basis, rotated per instance so vertices never line up.
  vec3 noisePos = localPos * 1.9;

  // ---------------------------------------------------------------------
  // Water: currents travelling around the skin (build kit p.4).
  // ---------------------------------------------------------------------
  vec3 curl = curlNoise(noisePos * 1.15 + vec3(0.0, uTime * uFlowSpeed * 0.9, 0.0));
  float curlMag = length(curl);
  vFlowAccum = curlMag;

  // Surface waves that roll under the skin — two crossing directions so the
  // flow never looks like a single sliding texture.
  float waveA = sin(localPos.x * 3.1 + uTime * uFlowSpeed * 2.4 + snoise(noisePos) * 1.4);
  float waveB = sin(localPos.z * 2.4 - uTime * uFlowSpeed * 1.8 + localPos.y * 1.6);
  float waterCurrent = (waveA * 0.5 + waveB * 0.5) * 0.5;

  // ---------------------------------------------------------------------
  // Smoke: vapour peels off the surface, then curls back inward.
  // ---------------------------------------------------------------------
  float smokeLift = fbm(noisePos * 0.85 + vec3(uTime * 0.11, -uTime * 0.07, 0.0), 3, 2.0, 0.5);
  float peel = smoothstep(0.15, 0.9, smokeLift) * uAudioHigh;

  // ---------------------------------------------------------------------
  // Symbiote: slow viscous folding — the mass has weight and pull.
  // ---------------------------------------------------------------------
  float foldField = fbm(localPos * 1.35 + vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04), 3, 2.0, 0.5);
  vFold = foldField * 0.5 + 0.5;

  // ---------------------------------------------------------------------
  // Ferrofluid: magnetic spikes. Spikes = pow(saturate(Noise * Pressure), 5)
  // ---------------------------------------------------------------------
  float spikeNoise = ridged(noisePos * 0.72 + uTime * 0.02, 3);
  float pressureField = clamp(spikeNoise * uPressure, 0.0, 1.0);
  float spikes = pow(pressureField, 5.0);
  // Bias by mood so Ominous and Wild grow different spike geometries.
  spikes *= uSpikeBias;
  // Peaks need a fine second layer or they read as soft bumps.
  spikes *= 0.7 + 0.6 * ridged(noisePos * 2.3, 2);
  vSpikeMask = clamp(spikes * 2.2, 0.0, 1.0);

  // Sharpen with EdgeSharpness so spikes keep a cut edge at any density.
  spikes = pow(spikes, clamp(uEdgeSharpness * 0.34, 1.0, 4.0));

  // ---------------------------------------------------------------------
  // Touch: contact point -> surface ripple -> core turns -> memory scar.
  // ---------------------------------------------------------------------
  float distToTouch = distance(localPos, uTouchPoint);
  float rippleRadius = uTouchAge * 1.7;
  // Squared by hand: pow() with a negative base is undefined in GLSL, and the
  // ring term is negative on the inside of the wavefront.
  float rippleOffset = (distToTouch - rippleRadius) * 2.6;
  float rippleBand = exp(-rippleOffset * rippleOffset);
  vRipple = rippleBand * uTouchStrength;

  // The scar fades but never fully disappears while the impulse lives.
  float scarField = exp(-distToTouch * 1.35) * uTouchStrength * (1.0 - clamp(uTouchAge * 0.35, 0.0, 1.0));
  vScar = scarField;

  // ---------------------------------------------------------------------
  // Attention: FuX leans toward what he is watching.
  // ---------------------------------------------------------------------
  vec3 toAttention = uAttentionPoint - localPos;
  float attDist = length(toAttention);
  vec3 attDir = attDist > 0.0001 ? toAttention / attDist : vec3(0.0);
  float lean = uAttention * 0.35 * smoothstep(4.0, 0.5, attDist);

  // ---------------------------------------------------------------------
  // Breath: sin(Time * BreathRate) * BreathAmount
  // ---------------------------------------------------------------------
  float breathWave = uBreath - 0.5;

  // ---------------------------------------------------------------------
  // Assemble.
  // ---------------------------------------------------------------------
  vec3 flow = curl * (0.32 + curlMag * 0.22) * (0.35 + uFlowSpeed * 2.2);
  flow += nrm * waterCurrent * 0.16;

  vec3 fold = nrm * foldField * 0.18;

  vec3 smokeDir = nrm * 0.55 + curl * 0.45;
  vec3 smoke = smokeDir * peel * 0.22;

  vec3 spikeDir = nrm + tangent * foldField * 0.14 + bitangent * waterCurrent * 0.12;
  vec3 spikeVec = spikeDir * spikes * (0.55 + uChaos * 0.85);

  // Base pulse is the slow breath; reaction strength is the live signal.
  float basePulse = breathWave * 0.35;
  float reactionStrength = uEnergy * 0.55 + uAudioLow * 0.4 + uAudioMid * 0.18;

  vec3 displaceVec = (flow + spikeVec + fold + smoke) * (basePulse + reactionStrength);

  // Radial pulse from the touch point pushes the surface outward.
  displaceVec += nrm * (vRipple * 0.34 + scarField * 0.2) * (1.0 + uAudioLow);

  // Lean toward attention.
  displaceVec += attDir * lean * 0.3;

  // Clamp total travel so nothing ever tears the silhouette apart.
  float travel = length(displaceVec);
  float maxTravel = 1.35;
  if (travel > maxTravel) displaceVec *= maxTravel / travel;

  // Displace is authored in centimetres (build kit p.4) and converted to
  // model units here, so the mood assets keep the numbers the kit specifies.
  vec3 displaced = localPos * squash + displaceVec * uDisplace * uDisplaceScale;

  vSurfaceDetail = foldField;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  // Reconstruct a usable normal: displacement changes the surface, so bias
  // the shading normal along the gradient of the flow field.
  vec3 displacedNormal = normalize(nrm - curl * 0.22 + spikeDir * spikes * 0.35);

  vNormalW = normalize(mat3(modelMatrix) * displacedNormal);
  vPositionW = worldPos.xyz;
  vLocalPos = localPos;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
