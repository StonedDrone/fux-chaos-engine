/**
 * Ferrofluid core — fragment stage.
 *
 * "Glossy near-black base with metallic response... Purple and lime light
 *  trapped beneath the surface." (build kit p.4)
 *
 * Emissive = lerp(Purple, ToxicLime, Attention + AudioMid) * Glow
 *
 * The glow only breaks through the black where a vein mask exists, so the
 * body stays a mass of dark fluid with light inside it rather than a glowing
 * blob. Veins follow the same flow and spike fields that moved the geometry,
 * which is what makes the lighting feel like it belongs to the body.
 */

import { noiseGLSL } from './noise.glsl.js';

export const coreFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;

// Material runtime parameters (build kit p.4).
uniform float uGlow;
uniform float uOpacity;
uniform float uEdgeSharpness;

// Resolved state.
uniform float uChaos;
uniform float uEnergy;
uniform float uAudioLow;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uAttention;
uniform float uSpikes;
uniform float uSafety;
uniform float uBeat;
uniform float uThreat;
uniform float uExposure;

uniform vec3 uColorPrimary;    // identity — deep violet
uniform vec3 uColorSecondary;  // answer — acid lime / teal

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
  vec3 nrm = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vPositionW);

  // -------------------------------------------------------------------
  // Base: glossy near-black with a metallic response.
  // -------------------------------------------------------------------
  vec3 base = vec3(0.022, 0.02, 0.032);

  // Fresnel rim — ferrofluid is wet, so grazing angles pick up the room.
  float fresnel = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 4.0);

  // A cheap environment stand-in: the cube's own neon frame bouncing back.
  vec3 rimColor = mix(uColorPrimary, uColorSecondary, 0.35 + uAudioMid * 0.4);
  vec3 envReflect = rimColor * fresnel * (0.55 + uEnergy * 0.85);

  // -------------------------------------------------------------------
  // Veins: light trapped beneath the surface.
  // -------------------------------------------------------------------
  // Veins travel along the flow field, so they look like they are inside a
  // moving fluid rather than painted on.
  float veinWarp = fbm(vLocalPos * 2.1 + vec3(0.0, uTime * 0.13, uTime * 0.05), 3, 2.0, 0.5);
  float veinField = fbm(vLocalPos * 1.45 + veinWarp * 0.6 + vec3(uTime * 0.07), 2, 2.1, 0.5);

  // Ridged mask turns the smooth field into filaments.
  float veins = 1.0 - abs(veinField);
  veins = pow(clamp(veins, 0.0, 1.0), clamp(3.2 - uEdgeSharpness * 0.25, 1.0, 6.0));

  // Spikes carry brighter veins, as magnetic discharge concentrates at peaks.
  veins += vSpikeMask * 0.85;

  // Charge builds with chaos; wild mood runs the whole palette.
  float veinIntensity = veins * (0.32 + uChaos * 0.85 + uEnergy * 0.5);

  // Emissive = lerp(Purple, ToxicLime, Attention + AudioMid) * Glow
  float colorMix = clamp(uAttention * 0.7 + uAudioMid * 0.65 + uThreat * 0.3, 0.0, 1.0);
  vec3 veinColor = mix(uColorPrimary, uColorSecondary, colorMix);

  // Beat drives a short bloom through the whole body.
  float beatBloom = uBeat * 0.6 + smoothstep(0.72, 1.0, uEnergy) * 0.35;

  vec3 emissive = veinColor * veinIntensity * (uGlow * 0.14) * uExposure;
  emissive += veinColor * beatBloom * 0.22 * uExposure;

  // -------------------------------------------------------------------
  // Touch: luminous ripple + fading scar.
  // -------------------------------------------------------------------
  vec3 touchColor = mix(uColorSecondary, vec3(1.0), 0.25);
  emissive += touchColor * vRipple * 1.5 * uExposure;
  emissive += touchColor * vScar * 0.85 * uExposure;

  // -------------------------------------------------------------------
  // Specular: hardened by EdgeSharpness, so spikes glint like wet metal.
  // -------------------------------------------------------------------
  vec3 lightDir = normalize(vec3(0.45, 0.8, 0.35));
  vec3 halfVec = normalize(lightDir + viewDir);
  float shininess = mix(38.0, 190.0, clamp(uEdgeSharpness / 8.0, 0.0, 1.0));
  float spec = pow(max(dot(nrm, halfVec), 0.0), shininess);
  spec *= 0.55 + uEnergy * 1.1;
  vec3 specular = mix(vec3(1.0), veinColor, 0.45) * spec;

  // A second, broader specular keeps the mass reading as wet rather than
  // mirror-like — ferrofluid has a soft sheen over a hard glint.
  float broadSpec = pow(max(dot(nrm, halfVec), 0.0), 9.0) * 0.16;

  // Surface detail darkens the folds so the internal structure reads.
  float foldShade = mix(0.82, 1.05, vSurfaceDetail);

  vec3 color = (base * foldShade + envReflect * 0.55) * foldShade;
  color += specular + broadSpec * rimColor;
  color += emissive;

  // Safety mode never permits blown highlights (build kit p.10).
  float maxLuma = mix(2.6, 1.0, uSafety);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (luma > maxLuma) color *= maxLuma / luma;

  // Opacity rises with chaos so the mass feels denser when it is aroused.
  float alpha = clamp(uOpacity * (0.72 + uChaos * 0.42 + vSpikeMask * 0.2), 0.25, 1.0);
  alpha = max(alpha, fresnel * 0.85);

  gl_FragColor = vec4(color, alpha);
}
`;
