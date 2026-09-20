/**
 * BP_FuXChaosEngine — one actor owns the whole performance (build kit p.3).
 *
 * Component tree, mirrored from the build kit exactly:
 *   SceneRoot
 *   |- FerroCoreMesh      (custom ferrofluid shader)
 *   |- WaterSkinMesh      (thin transparent skin)
 *   |- NS_SmokeBody       (point sprites, curl-advected, pulled back inward)
 *   |- NS_FluidTendrils   (vertex-built ribbons)
 *   |- NS_MagneticSparks  (high-band driven discharges)
 *   |- ReactionVolume     (the invisible input volume / touch surface)
 *   |- PointLight_FuX     (one unshadowed light — the stated budget)
 *   |- (the Magic Mirror Box shell itself)
 *
 * Every visual layer reads the same frame state, so the four motion
 * languages stay married instead of drifting into four separate effects.
 */

import * as THREE from 'three';
import { coreVertexShader } from './shaders/core.vert.js';
import { coreFragmentShader } from './shaders/core.frag.js';
import { skinVertexShader, skinFragmentShader } from './shaders/skin.glsl.js';
import { tendrilVertexShader, tendrilFragmentShader } from './shaders/tendril.glsl.js';
import { particleVertexShader, particleFragmentShader } from './shaders/particles.glsl.js';
import { bodyAmount, makeRandom } from '../core/params.js';
import { QUALITY } from './quality.js';

/**
 * Density comes from the tier table in quality.js — one source of truth, so a
 * budget change cannot drift between the two files.
 */
const TENDRIL_COLUMNS = 5;

export class FuXEntity {
  constructor({ quality = 'high', coreRadius = 1 } = {}) {
    this.quality = QUALITY[quality] ? quality : 'high';
    this.tier = QUALITY[this.quality];
    this.coreRadius = coreRadius;
    this.time = 0;
    /** Current frame state, kept for the HUD and for tests. */
    this.frame = null;
    this.warnings = [];

    this.group = new THREE.Group();
    this.group.name = 'BP_FuXChaosEngine';

    this.buildCore();
    this.buildSkin();
    this.buildTendrils();
    this.buildSmoke();
    this.buildSparks();
    this.buildBox();
    this.buildLight();
    this.buildReactionVolume();

    this.materials = [
      this.coreMaterial,
      this.skinMaterial,
      this.tendrilMaterial,
      this.smokeMaterial,
      this.sparkMaterial,
    ];
  }

  // -------------------------------------------------------------------------
  // FerroCoreMesh
  // -------------------------------------------------------------------------
  buildCore() {
    const geometry = new THREE.IcosahedronGeometry(this.coreRadius, this.tier.coreDetail);
    this.coreVertexCount = geometry.attributes.position.count;

    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDisplace: { value: 2.0 },        // centimetres, straight from the mood
        uDisplaceScale: { value: 0.028 }, // cm -> model units
        // The fluid body: how far the silhouette deviates from round. Driven
        // from chaos and the safety clamp in applyFrame.
        uBodyAmount: { value: bodyAmount() },
        uBreathRate: { value: 0.35 },
        uFlowSpeed: { value: 0.12 },
        uEdgeSharpness: { value: 3.5 },
        uGlow: { value: 8 },
        uOpacity: { value: 0.68 },
        uChaos: { value: 0 },
        uPressure: { value: 0 },
        uSpikeBias: { value: 0.2 },
        uSpikes: { value: 0 },
        uBreath: { value: 0.5 },
        uEnergy: { value: 0 },
        uAudioLow: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uAttention: { value: 0 },
        uThreat: { value: 0 },
        uBeat: { value: 0 },
        uSafety: { value: 0 },
        uExposure: { value: 1 },
        uTouchPoint: { value: new THREE.Vector3(0, 2, 0) },
        uTouchStrength: { value: 0 },
        uTouchAge: { value: 0 },
        uAttentionPoint: { value: new THREE.Vector3(2, 1, 2) },
        uColorPrimary: { value: new THREE.Color('#6a2cff') },
        uColorSecondary: { value: new THREE.Color('#b6ff1a') },
      },
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    this.core = new THREE.Mesh(geometry, this.coreMaterial);
    this.core.name = 'FerroCoreMesh';
    this.group.add(this.core);
  }

  // -------------------------------------------------------------------------
  // WaterSkinMesh
  // -------------------------------------------------------------------------
  buildSkin() {
    const geometry = new THREE.IcosahedronGeometry(this.coreRadius * 1.16, this.tier.skinDetail);

    this.skinMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlowSpeed: { value: 0.12 },
        uDisplace: { value: 2.0 },
        uDisplaceScale: { value: 0.028 },
        uChaos: { value: 0 },
        uOpacity: { value: 0.68 },
        uEnergy: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uBreath: { value: 0.5 },
        uSafety: { value: 0 },
        uSkinRadius: { value: 1.16 },
        uBodyAmount: { value: bodyAmount() },
        uAttention: { value: 0 },
        uTouchPoint: { value: new THREE.Vector3(0, 2, 0) },
        uTouchStrength: { value: 0 },
        uTouchAge: { value: 0 },
        uColorPrimary: { value: new THREE.Color('#6a2cff') },
        uColorSecondary: { value: new THREE.Color('#b6ff1a') },
      },
      vertexShader: skinVertexShader,
      fragmentShader: skinFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.skin = new THREE.Mesh(geometry, this.skinMaterial);
    this.skin.name = 'WaterSkinMesh';
    this.group.add(this.skin);
  }

  // -------------------------------------------------------------------------
  // NS_FluidTendrils
  // -------------------------------------------------------------------------
  buildTendrils(count = this.tier.tendrilCount, seed = 0x7a11) {
    const rows = this.tier.tendrilRows;
    const cols = TENDRIL_COLUMNS;
    const random = makeRandom(seed);

    const vertsPerTendril = rows * cols;
    const trisPerTendril = (rows - 1) * (cols - 1) * 2;

    const positions = new Float32Array(count * vertsPerTendril * 3);
    const along = new Float32Array(count * vertsPerTendril);
    const across = new Float32Array(count * vertsPerTendril);
    const direction = new Float32Array(count * vertsPerTendril * 3);
    const seedAttr = new Float32Array(count * vertsPerTendril);
    const indexAttr = new Float32Array(count * vertsPerTendril);
    const indices = new Uint32Array(count * trisPerTendril * 3);

    let v = 0;
    let i = 0;

    for (let n = 0; n < count; n += 1) {
      // Spawn directions biased to the upper hemisphere so tendrils read as
      // reach and intent rather than as a uniform sea urchin.
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * random() * 0.78);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi) * 0.85 + 0.15,
        Math.sin(phi) * Math.sin(theta),
      ).normalize();

      const tendrilSeed = random();
      const base = v;

      for (let r = 0; r < rows; r += 1) {
        const t = r / (rows - 1);
        for (let c = 0; c < cols; c += 1) {
          const a = (c / (cols - 1)) * 2 - 1;
          positions[v * 3] = 0;
          positions[v * 3 + 1] = 0;
          positions[v * 3 + 2] = 0;
          along[v] = t;
          across[v] = a;
          direction[v * 3] = dir.x;
          direction[v * 3 + 1] = dir.y;
          direction[v * 3 + 2] = dir.z;
          seedAttr[v] = tendrilSeed;
          indexAttr[v] = n;
          v += 1;
        }
      }

      for (let r = 0; r < rows - 1; r += 1) {
        for (let c = 0; c < cols - 1; c += 1) {
          const a = base + r * cols + c;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          indices[i] = a; indices[i + 1] = d; indices[i + 2] = b;
          indices[i + 3] = b; indices[i + 4] = d; indices[i + 5] = e;
          i += 6;
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geometry.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    geometry.setAttribute('aDirection', new THREE.BufferAttribute(direction, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr, 1));
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indexAttr, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    // The vertex shader owns all positions, so skip the CPU-side bounds check
    // that would otherwise cull the tendrils when the core is off-centre.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);

    this.tendrilMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uChaos: { value: 0 },
        uLength: { value: 1.05 },
        uThickness: { value: 0.11 },
        uCurlAmount: { value: 0.42 },
        uAudioLow: { value: 0 },
        uAudioMid: { value: 0 },
        uEnergy: { value: 0 },
        uGlow: { value: 8 },
        uSafety: { value: 0 },
        uAttention: { value: 0 },
        uAttentionPoint: { value: new THREE.Vector3(2, 1, 2) },
        uTouchPoint: { value: new THREE.Vector3(0, 2, 0) },
        uTouchStrength: { value: 0 },
        uActiveCount: { value: count },
        uBodyAmount: { value: bodyAmount() },
        uCoreRadius: { value: this.coreRadius },
        uColorPrimary: { value: new THREE.Color('#6a2cff') },
        uColorSecondary: { value: new THREE.Color('#b6ff1a') },
      },
      vertexShader: tendrilVertexShader,
      fragmentShader: tendrilFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.tendrils = new THREE.Mesh(geometry, this.tendrilMaterial);
    this.tendrils.name = 'NS_FluidTendrils';
    this.tendrilCount = count;
    this.activeTendrils = count;
    this.group.add(this.tendrils);
  }

  // -------------------------------------------------------------------------
  // NS_SmokeBody
  // -------------------------------------------------------------------------
  buildSmoke(seed = 0x51ee) {
    this.smoke = this.makeParticles(this.tier.smoke, seed, 0.34, 0.9);
    this.smoke.name = 'NS_SmokeBody';
    this.smokeMaterial = this.smoke.material;
    this.group.add(this.smoke);
  }

  // -------------------------------------------------------------------------
  // NS_MagneticSparks
  // -------------------------------------------------------------------------
  buildSparks(seed = 0x5a8c) {
    this.sparks = this.makeParticles(this.tier.sparks, seed, 0.16, 0.55);
    this.sparks.name = 'NS_MagneticSparks';
    this.sparkMaterial = this.sparks.material;
    this.group.add(this.sparks);
  }

  /** Shared particle builder — both systems use the same shader, mode-switched. */
  makeParticles(count, seed, size, spread) {
    const random = makeRandom(seed);
    const positions = new Float32Array(count * 3);
    const aSeed = new Float32Array(count * 3);
    const aBirth = new Float32Array(count);
    const aScale = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // Distribute birth directions over the sphere surface, weighted upward.
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * random());
      const y = Math.cos(phi) * 0.75 + 0.25;
      aSeed[i * 3] = Math.sin(phi) * Math.cos(theta);
      aSeed[i * 3 + 1] = y;
      aSeed[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);

      aBirth[i] = random();
      aScale[i] = 0.55 + random() * 0.85 * spread / 0.9;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 3));
    geometry.setAttribute('aBirth', new THREE.BufferAttribute(aBirth, 1));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(aScale, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 9);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: 0 },
        uBodyAmount: { value: bodyAmount() },
        uCoreRadius: { value: this.coreRadius },
        uChaos: { value: 0 },
        uEnergy: { value: 0 },
        uAudioLow: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uSmokeCurl: { value: 0.3 },
        uSparkRate: { value: 0 },
        uSafety: { value: 0 },
        uSize: { value: size },
        uAttention: { value: 0 },
        uAttentionPoint: { value: new THREE.Vector3(2, 1, 2) },
        uTouchPoint: { value: new THREE.Vector3(0, 2, 0) },
        uTouchStrength: { value: 0 },
        uBeat: { value: 0 },
        uColorPrimary: { value: new THREE.Color('#6a2cff') },
        uColorSecondary: { value: new THREE.Color('#b6ff1a') },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  // -------------------------------------------------------------------------
  // The Magic Mirror Box shell
  // -------------------------------------------------------------------------
  buildBox() {
    const size = 3.05;

    // Glass shell: "the cube's glass and frame catching FuX's purple and
    // toxic-lime pulse" (build kit p.3).
    const glassGeo = new THREE.BoxGeometry(size, size, size);
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0a0714,
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity: 0.12,
      transmission: this.quality === 'high' ? 0.55 : 0,
      thickness: 0.6,
      ior: 1.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.glass = new THREE.Mesh(glassGeo, this.glassMaterial);
    this.glass.name = 'MirrorBoxGlass';
    this.group.add(this.glass);

    // Neon frame — the box's own light, pulsing with FuX.
    const edges = new THREE.EdgesGeometry(glassGeo);
    this.frameMaterial = new THREE.LineBasicMaterial({
      color: 0x8a2bff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.frame = new THREE.LineSegments(edges, this.frameMaterial);
    this.frame.name = 'MirrorBoxFrame';
    this.group.add(this.frame);

    // A second, faint inner frame sells the glass thickness.
    const innerGeo = new THREE.BoxGeometry(size * 0.965, size * 0.965, size * 0.965);
    this.innerFrameMaterial = new THREE.LineBasicMaterial({
      color: 0xb6ff1a,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    this.innerFrame = new THREE.LineSegments(new THREE.EdgesGeometry(innerGeo), this.innerFrameMaterial);
    this.group.add(this.innerFrame);
  }

  // -------------------------------------------------------------------------
  // PointLight_FuX — one unshadowed dynamic light, per budget
  // -------------------------------------------------------------------------
  buildLight() {
    this.light = new THREE.PointLight(0x8a2bff, 12, 26, 2);
    this.light.name = 'PointLight_FuX';
    this.light.castShadow = false;
    this.group.add(this.light);
    // Ambient fill is the room's, not the entity's: the component tree lists
    // exactly one dynamic light, so nothing else is added here.
  }

  // -------------------------------------------------------------------------
  // ReactionVolume — the invisible input volume
  // -------------------------------------------------------------------------
  buildReactionVolume() {
    const geometry = new THREE.SphereGeometry(this.coreRadius * 3.4, 12, 8);
    this.reactionVolumeMaterial = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.BackSide,
    });
    this.reactionVolume = new THREE.Mesh(geometry, this.reactionVolumeMaterial);
    this.reactionVolume.name = 'ReactionVolume';
    this.group.add(this.reactionVolume);
    // The interaction layer raycasts against this, so a click anywhere near
    // the body registers as contact without needing the deforming mesh.
    this.reactionVolume.userData.isReactionVolume = true;
  }

  // -------------------------------------------------------------------------
  // Per-frame application
  // -------------------------------------------------------------------------

  /**
   * Push a resolved frame onto every layer.
   * @param {Object} f Frame state from ChaosResolver.update().
   * @param {number} dt Delta seconds.
   */
  applyFrame(f, dt) {
    this.frame = f;
    this.time += dt;

    const chaos = f.chaosNorm ?? f.chaos / 100;
    const safety = f.safety ? 1 : 0;
    const core = this.coreMaterial.uniforms;

    // The body's own shape: at rest it is already uneven and moving, and it
    // loosens further as chaos climbs. Low-stimulation mode calms it without
    // ever stilling it — "silence still feels alive" (build kit p.10), and the
    // same silhouette is evaluated by every mesh so the layers stay married.
    const body = bodyAmount({ chaos, safety });

    // --- Core -------------------------------------------------------------
    core.uTime.value = this.time;
    core.uBodyAmount.value = body;
    core.uChaos.value = chaos;
    core.uPressure.value = f.pressure;
    core.uSpikeBias.value = f.spikes * 6 + 0.05;
    core.uSpikes.value = f.spikes;
    core.uBreath.value = f.breath;
    core.uBreathRate.value = f.breathRate;
    core.uEnergy.value = f.audio.energy;
    core.uAudioLow.value = f.audio.low;
    core.uAudioMid.value = f.audio.mid;
    core.uAudioHigh.value = f.audio.high;
    core.uGlow.value = f.glow;
    core.uOpacity.value = f.opacity;
    core.uEdgeSharpness.value = f.edgeSharpness;
    core.uFlowSpeed.value = f.flowSpeed;
    core.uDisplace.value = f.displace;
    core.uAttention.value = f.attention;
    core.uThreat.value = f.threat;
    core.uBeat.value = f.beat;
    core.uSafety.value = safety;
    core.uTouchStrength.value = f.touchStrength;
    core.uTouchAge.value = f.touchAge ?? 0;
    core.uTouchPoint.value.fromArray(f.touchPoint);
    core.uAttentionPoint.value.fromArray(f.attentionTarget);
    core.uExposure.value = f.exposure ?? 1;
    core.uColorPrimary.value.set(f.primaryColor);
    core.uColorSecondary.value.set(f.secondaryColor);

    // --- Skin -------------------------------------------------------------
    const skin = this.skinMaterial.uniforms;
    skin.uTime.value = this.time;
    skin.uBodyAmount.value = body;
    skin.uChaos.value = chaos;
    skin.uAudioMid.value = f.audio.mid;
    skin.uAudioHigh.value = f.audio.high;
    skin.uEnergy.value = f.audio.energy;
    skin.uBreath.value = f.breath;
    skin.uFlowSpeed.value = f.flowSpeed;
    skin.uDisplace.value = f.displace;
    skin.uOpacity.value = f.opacity;
    skin.uAttention.value = f.attention;
    skin.uSafety.value = safety;
    skin.uTouchStrength.value = f.touchStrength;
    skin.uTouchAge.value = f.touchAge ?? 0;
    skin.uTouchPoint.value.fromArray(f.touchPoint);
    skin.uColorPrimary.value.copy(core.uColorPrimary.value);
    skin.uColorSecondary.value.copy(core.uColorSecondary.value);

    // --- Tendrils ---------------------------------------------------------
    const ten = this.tendrilMaterial.uniforms;
    ten.uTime.value = this.time;
    ten.uBodyAmount.value = body;
    ten.uChaos.value = chaos;
    ten.uAudioLow.value = f.audio.low;
    ten.uAudioMid.value = f.audio.mid;
    ten.uEnergy.value = f.audio.energy;
    ten.uGlow.value = f.glow;
    ten.uSafety.value = safety;
    ten.uAttention.value = f.attention;
    ten.uAttentionPoint.value.fromArray(f.attentionTarget);
    ten.uTouchPoint.value.fromArray(f.touchPoint);
    ten.uTouchStrength.value = f.touchStrength;
    ten.uColorPrimary.value.copy(core.uColorPrimary.value);
    ten.uColorSecondary.value.copy(core.uColorSecondary.value);
    // Tendril count is a shape variable per mood (build kit p.7): hide the
    // unused tendrils by collapsing their length rather than rebuilding.
    ten.uLength.value = 0.75 + chaos * 0.85;
    ten.uCurlAmount.value = 0.25 + chaos * 0.4;
    this.applyTendrilBudget(f.filamentCount);

    // --- Smoke + sparks ---------------------------------------------------
    const smoke = this.smokeMaterial.uniforms;
    smoke.uMode.value = 0;
    smoke.uTime.value = this.time;
    smoke.uBodyAmount.value = body;
    smoke.uChaos.value = chaos;
    smoke.uEnergy.value = f.audio.energy;
    smoke.uAudioLow.value = f.audio.low;
    smoke.uAudioHigh.value = f.audio.high;
    smoke.uSmokeCurl.value = f.smokeCurl;
    smoke.uSafety.value = safety;
    smoke.uAttention.value = f.attention;
    smoke.uAttentionPoint.value.fromArray(f.attentionTarget);
    smoke.uTouchPoint.value.fromArray(f.touchPoint);
    smoke.uTouchStrength.value = f.touchStrength;
    smoke.uColorPrimary.value.copy(core.uColorPrimary.value);
    smoke.uColorSecondary.value.copy(core.uColorSecondary.value);

    const spark = this.sparkMaterial.uniforms;
    spark.uMode.value = 1;
    spark.uBodyAmount.value = body;
    spark.uTime.value = this.time;
    spark.uChaos.value = chaos;
    spark.uEnergy.value = f.audio.energy;
    spark.uAudioHigh.value = f.audio.high;
    spark.uAudioMid.value = f.audio.mid;
    spark.uSparkRate.value = f.sparkRate;
    spark.uBeat.value = f.beat;
    spark.uSafety.value = safety;
    spark.uAttention.value = f.attention;
    spark.uAttentionPoint.value.fromArray(f.attentionTarget);
    spark.uTouchPoint.value.fromArray(f.touchPoint);
    spark.uTouchStrength.value = f.touchStrength;
    spark.uColorPrimary.value.copy(core.uColorPrimary.value);
    spark.uColorSecondary.value.copy(core.uColorSecondary.value);

    // --- Frame shares FuX's pulse ----------------------------------------
    const pulse = 0.55 + chaos * 0.5 + f.audio.energy * 0.4 + f.beat * 0.25;
    this.frameMaterial.color.copy(core.uColorPrimary.value).lerp(core.uColorSecondary.value, 0.25 + f.attention * 0.4);
    this.frameMaterial.opacity = Math.min(1, 0.45 + pulse * 0.5);
    this.innerFrameMaterial.color.copy(core.uColorSecondary.value);
    this.innerFrameMaterial.opacity = 0.1 + pulse * 0.12;

    this.light.color.copy(core.uColorPrimary.value).lerp(core.uColorSecondary.value, f.attention * 0.5);
    this.light.intensity = (6 + chaos * 16 + f.audio.energy * 12) * (safety ? 0.5 : 1);

    this.glassMaterial.opacity = 0.08 + chaos * 0.05;

    // A slow rotation keeps the silhouette changing even at rest.
    this.group.rotation.y += dt * (0.04 + chaos * 0.12);
    this.group.position.y = Math.sin(this.time * f.breathRate * Math.PI * 2) * 0.04;

    return this;
  }

  /**
   * "Fluid tendrils 8-16 active" (build kit p.10). The geometry is allocated
   * once at the tier's maximum; the filament budget is applied by collapsing
   * retired tendrils in the vertex shader, so a mood change never rebuilds
   * geometry mid-performance.
   */
  applyTendrilBudget(activeCount) {
    const clamped = Math.max(1, Math.min(activeCount, this.tendrilCount));
    if (this.activeTendrils === clamped) return;
    this.activeTendrils = clamped;
    this.tendrilMaterial.uniforms.uActiveCount.value = clamped;
  }

  /** Free GPU resources for every layer. */
  dispose() {
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
  }

  /** Rough cost report for the performance readout. */
  stats() {
    let triangles = 0;
    let points = 0;
    this.group.traverse((obj) => {
      if (obj.isMesh && obj.geometry?.index) {
        triangles += obj.geometry.index.count / 3;
      } else if (obj.isMesh && obj.geometry?.attributes?.position) {
        triangles += obj.geometry.attributes.position.count / 3;
      } else if (obj.isPoints && obj.geometry?.attributes?.position) {
        points += obj.geometry.attributes.position.count;
      }
    });
    return {
      triangles: Math.round(triangles),
      particles: points,
      coreVertices: this.coreVertexCount,
      tendrils: this.activeTendrils ?? this.tendrilCount,
      drawCalls: this.materials.length + 4,
      quality: this.quality,
    };
  }
}
