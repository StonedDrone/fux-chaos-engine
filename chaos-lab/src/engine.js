/**
 * The Chaos Engine — the actor's runtime.
 *
 * Implements the entity update order from build kit p.8:
 *   1. Gather queued reaction packets
 *   2. Normalise strength, target, and urgency
 *   3. Resolve priority, mood, and recent memory   (ChaosResolver)
 *   4. Smooth audio and continuous sensor values   (ChaosResolver)
 *   5. Decay touch, story, and system impulses     (ImpulseBank)
 *   6. Apply safety clamps                         (ChaosResolver)
 *   7. Update material, Niagara, and cube light    (FuXEntity)
 *   8. Store a short reaction-memory trace         (ReactionMemory)
 *
 * Visual parameters update at the tier's rate (30 Hz) while the render loop
 * runs free, which is exactly the split the build kit asks for.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FuXEntity } from './render/entity.js';
import { QUALITY, PerformanceGuard } from './render/quality.js';
import { ChaosResolver, TOUCH_WINDOW } from './core/chaosResolver.js';
import { ImpulseBank, ReactionMemory, normalisePacket } from './core/reaction.js';
import { AudioRouter } from './audio/analysis.js';
import { makeRandom } from './core/params.js';
import { MOODS } from './core/moods.js';

const MAX_DELTA = 1 / 15; // guard against tab-switch spikes

export class FuXEngine {
  constructor({ container, quality = 'high', onEvent = () => {} } = {}) {
    this.container = container;
    this.onEvent = onEvent;
    this.quality = QUALITY[quality] ? quality : 'high';
    this.manualQuality = false;
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.time = 0;

    // --- Logic layer ------------------------------------------------------
    this.impulses = new ImpulseBank();
    this.memory = new ReactionMemory();
    this.resolver = new ChaosResolver().attach(this.impulses);
    this.audio = new AudioRouter();
    this.guard = new PerformanceGuard();

    /** Packets queued this frame, flushed on the next parameter step. */
    this.queue = [];

    /** Continuous input simulated by the lab: a moving observer FuX tracks. */
    this.random = makeRandom(0x1ce1ce);
    this.observer = { position: new THREE.Vector3(2.4, 1.2, 2.6), speed: 0, enabled: true, phase: 0 };
    this.moveSpeed = 0.45;

    this.buildScene();
    this.bindResize();

    /** Bloom/exposure multiplier, applied to the core emissive (p.4 Glow). */
    this.exposure = 1;
    this.updateCount = 0;
  }

  // -------------------------------------------------------------------------
  // Scene, camera, renderer
  // -------------------------------------------------------------------------
  buildScene() {
    const tier = QUALITY[this.quality];

    this.renderer = new THREE.WebGLRenderer({
      antialias: tier.id !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x05030b, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * tier.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.classList.add('fux-canvas');
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030b, 0.028);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.camera.position.set(0, 1.5, 9.2);
    this.camera.lookAt(0, 0, 0);

    this.entity = new FuXEntity({ quality: this.quality });
    this.scene.add(this.entity.group);

    // Room fill. This is the scene's ambient, not a dynamic light, so the
    // entity still ships exactly one unshadowed PointLight_FuX (p.10).
    this.scene.add(new THREE.AmbientLight(0x120c22, 1.1));

    this.buildFloor();
    this.buildPost();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.resize();
  }

  /** A dark ground plane keeps the cube from floating in a void. */
  buildFloor() {
    const geometry = new THREE.CircleGeometry(16, 48);
    const material = new THREE.MeshBasicMaterial({ color: 0x0a0616, transparent: true, opacity: 0.85 });
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -1.75;
    this.scene.add(this.floor);

    // A faint radial pool of light under the box, so contact reads.
    const ringGeo = new THREE.RingGeometry(1.9, 5.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2a1060,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.floorGlow = new THREE.Mesh(ringGeo, ringMat);
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = -1.74;
    this.scene.add(this.floorGlow);
  }

  buildPost() {
    const tier = QUALITY[this.quality];
    const size = new THREE.Vector2(1, 1);
    const target = this.renderer.getDrawingBufferSize(size);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(target.x, target.y),
      tier.bloomStrength,
      0.75,
      0.28,
    );
    this.bloom.enabled = tier.bloom;
    this.composer.addPass(this.bloom);
  }

  // -------------------------------------------------------------------------
  // Public control surface — deliberately small (build kit p.3)
  // -------------------------------------------------------------------------

  /** Intensity / mood blend / attention / story charge / reaction strength. */
  cue(moodId, seconds = 8) {
    this.resolver.cueStoryMood(moodId, seconds);
    this.emit('cue', { moodId, seconds });
  }

  setMoodMode(mode, moodId) {
    this.resolver.moodMode = mode;
    if (moodId && MOODS[moodId]) this.resolver.manualMood = moodId;
    this.emit('moodMode', { mode, moodId: this.resolver.manualMood });
  }

  setSafety(enabled) {
    this.resolver.setSafety({ enabled });
    this.emit('safety', { enabled });
  }

  setAudioSource(name) {
    const applied = this.audio.setSource(name);
    this.emit('audioSource', { source: applied });
    return applied;
  }

  async enableMicrophone() {
    const ok = await this.audio.live.start({ audio: true });
    if (ok) this.setAudioSource('live');
    this.emit('microphone', { ok, error: this.audio.live.error });
    return ok;
  }

  /**
   * Touch arrives from the pointer. The point is converted into the entity's
   * local space, because the ripple originates on the surface of the mass.
   */
  touchAt(clientX, clientY, strength = 1) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObject(this.entity.reactionVolume, false);
    if (!hits.length) return null;

    const worldPoint = hits[0].point;
    const localPoint = this.entity.group.worldToLocal(worldPoint.clone());
    // Project onto the core surface so the ripple starts on the body itself.
    localPoint.setLength(this.entity.coreRadius);

    this.resolver.registerTouch(localPoint.toArray(), strength);
    this.send({
      type: 'touch',
      strength,
      point: localPoint.toArray(),
      decayTime: TOUCH_WINDOW,
      label: 'contact',
    });
    this.emit('touch', { point: localPoint.toArray(), strength });
    return localPoint;
  }

  /** Queue a reaction packet — the universal input (build kit p.6). */
  send(rawPacket) {
    const packet = normalisePacket(rawPacket);
    this.queue.push(packet);
    return packet;
  }

  setQuality(tier, { manual = true } = {}) {
    if (!QUALITY[tier] || tier === this.quality) return;
    this.quality = tier;
    if (manual) this.manualQuality = true;

    // Rebuild the layers that carry geometry density and post-processing.
    const wasRunning = this.running;
    this.entity.dispose();
    this.scene.remove(this.entity.group);
    this.entity = new FuXEntity({ quality: tier });
    this.scene.add(this.entity.group);

    this.bloom.enabled = QUALITY[tier].bloom;
    this.bloom.strength = QUALITY[tier].bloomStrength;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * QUALITY[tier].pixelRatio);

    const target = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(target.x, target.y);
    this.resize();
    this.guard.reset();
    if (wasRunning) this.running = true;

    this.emit('quality', { tier, reason: 'changed' });
  }

  /** Exposure multiplier for the core emissive. */
  setExposure(value) {
    this.exposure = Math.max(0.1, Math.min(3, Number(value) || 1));
    return this.exposure;
  }

  /** Simulated observer movement — the "person moves" row of the signal table. */
  setObserverMotion(speed) {
    this.moveSpeed = speed;
    this.observer.enabled = speed > 0;
  }

  // -------------------------------------------------------------------------
  // The update order (build kit p.8)
  // -------------------------------------------------------------------------
  step(dt) {
    // 1 + 2. Gather queued packets and normalise (done on send, flushed here).
    const incoming = this.queue;
    this.queue = [];
    for (const packet of incoming) {
      this.impulses.absorb(packet);
      const repeat = this.memory.push(packet);
      // Familiarity: the same signal repeated does not get an identical
      // answer (build kit p.6 personality rule).
      if (repeat > 0.4) this.impulses.channels[packet.type].value *= 0.82;
    }

    // A moving observer continuously feeds the movement + attention channels.
    this.stepObserver(dt);

    // 4. Audio.
    const audioFrame = this.audio.step(dt);
    if (audioFrame.beat > 0) this.resolver.sensors.beat = 1;

    // 3, 4, 5, 6. Resolve state.
    const frame = this.resolver.update({ dt, audio: audioFrame });

    // Exposure is a live tuning control, so it rides on the frame rather than
    // living in one material's uniform map where a rebuild would drop it.
    frame.exposure = this.exposure;

    // 7. Update material, Niagara, and cube light.
    this.entity.applyFrame(frame, dt);

    // 8. Store a short reaction-memory trace.
    this.memory.sample(frame.chaos);

    // Visual flourish that carries the frame's meaning into the room.
    this.floorGlow.material.color.copy(this.entity.frameMaterial.color);
    this.floorGlow.material.opacity = 0.25 + frame.chaosNorm * 0.35;
    this.floorGlow.scale.setScalar(1 + frame.chaosNorm * 0.12);

    this.lastFrame = frame;
    this.updateCount += 1;
    return frame;
  }

  stepObserver(dt) {
    if (!this.observer.enabled) {
      this.impulses.channels.movement.value *= 0.94;
      return;
    }
    this.observer.phase += dt * this.moveSpeed;
    const r = 2.6;
    const x = Math.cos(this.observer.phase) * r;
    const z = Math.sin(this.observer.phase * 0.78) * r;
    const y = 1.1 + Math.sin(this.observer.phase * 1.7) * 0.65;
    this.observer.position.set(x, y, z);
    this.observer.speed = this.moveSpeed;

    // Movement is a voice in the chorus, not a shout: it nudges attention
    // every step but only registers as an impulse when it speeds up.
    this.impulses.attention = Math.max(this.impulses.attention, 0.25 + this.moveSpeed * 0.5);
    this.impulses.attentionTarget = [x, y, z];

    this.movementAccum = (this.movementAccum ?? 0) + dt * this.moveSpeed * 2.4;
    if (this.movementAccum >= 1) {
      this.movementAccum = 0;
      this.send({
        type: 'movement',
        strength: 0.2 + this.moveSpeed * 0.35,
        point: [x, y, z],
        decayTime: 1.2,
        label: 'observer moved',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Render loop
  // -------------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.rafId = requestAnimationFrame(loop);
    this.emit('started', {});
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.emit('stopped', {});
  }

  tick(now) {
    const rawDt = Math.min((now - this.lastTime) / 1000, MAX_DELTA);
    this.lastTime = now;
    this.time += rawDt;

    // The shaders advance on a continuous clock so motion never stutters,
    // while the resolved parameters step at the tier's rate.
    this.accumulator += rawDt;
    const stepDt = 1 / QUALITY[this.quality].parameterHz;

    let frame = this.lastFrame;
    let steps = 0;
    while (this.accumulator >= stepDt && steps < 4) {
      frame = this.step(stepDt);
      this.accumulator -= stepDt;
      steps += 1;
    }

    this.render(rawDt, frame);
  }

  render(rawDt, frame) {
    // Subtle camera drift so the entity is never seen from one static angle.
    const drift = Math.sin(this.time * 0.13) * 0.55;
    this.camera.position.x = drift * 1.1;
    this.camera.position.y = 1.5 + Math.sin(this.time * 0.21) * 0.22;
    this.camera.lookAt(0, 0, 0);

    if (this.composer && QUALITY[this.quality].bloom) {
      this.composer.render(rawDt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Performance guard.
    this.guard.sample(rawDt);
    if (!this.manualQuality) {
      const rec = this.guard.recommend(this.quality);
      if (rec) {
        this.setQuality(rec.tier, { manual: false });
        this.emit('autoscale', rec);
      }
    }

    this.frameStats = {
      fps: this.guard.fps,
      frameMs: this.guard.frameMs,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      quality: this.quality,
      parameterHz: QUALITY[this.quality].parameterHz,
    };

    if (frame) this.emit('frame', { state: frame, stats: this.frameStats });
  }

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------
  bindResize() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  emit(type, detail) {
    this.onEvent({ type, detail, engine: this });
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.audio.live.stop();
    this.entity.dispose();
    this.composer?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
