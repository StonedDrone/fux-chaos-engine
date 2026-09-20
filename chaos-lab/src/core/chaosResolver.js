/**
 * The Chaos resolver — FuX decides how his fluid body answers.
 *
 * Implements the state-priority stack from build kit p.7 and the entity
 * update order from p.8. Everything the renderer needs for one frame is
 * produced by `update()` as a plain, inspectable object.
 */

import { clamp, saturate, smooth, MATERIAL_DEFAULTS, BLEND } from './params.js';
import { MOODS, blendMoods, moodForChaos, bandFor } from './moods.js';

/** How long a touch keeps rippling, in seconds (build kit p.6). */
export const TOUCH_WINDOW = 1.8;

/**
 * Scale factors converting raw 0..1 inputs into chaos points (0..100).
 *
 * Calibrated so the meter behaves musically: quiet music sits in calm, an
 * ordinary track stirs, a drop surges, and only a genuinely loud, broadband
 * signal with the high band present reaches unleashed.
 *
 * No single sense can pin the meter at 100 — full-tilt music tops out just
 * short of it (97.6), so the last stretch of the range is reserved for
 * layering, which is the build kit's point that "music is one sense, not the
 * whole brain" (p.6). Everything together clamps at 100.
 */
export const CHAOS_WEIGHTS = {
  music: 72, // continuous motion, scaled by 0.55 for energy
  low: 20,
  mid: 18,
  high: 16,
  attention: 6,
  story: 16,
  idleFloor: 4,
};

/** Highest chaos reachable from music and the idle floor alone. */
export const MUSIC_CEILING =
  CHAOS_WEIGHTS.music * 0.55 + CHAOS_WEIGHTS.low + CHAOS_WEIGHTS.mid + CHAOS_WEIGHTS.high + CHAOS_WEIGHTS.idleFloor;

/** Smoothing speeds for continuous values — build kit p.5. */
export const SENSOR_SMOOTHING = {
  energy: 6.0,
  low: 8.0,
  mid: 9.0,
  high: 12.0,
  chaos: 2.6,
};

/** Resolves FuX's state for a single update step. */
export class ChaosResolver {
  constructor({ safety = defaultSafety() } = {}) {
    /** Current chaos level, 0..100. */
    this.chaos = 0;
    /** Target the chaos smooths toward. */
    this.chaosTarget = 0;
    /** Active mood id and the one being crossfaded to. */
    this.mood = 'calm';
    this.moodTarget = 'calm';
    /** The mood the crossfade is currently travelling toward. */
    this.blendTo = 'calm';
    this.moodBlend = 1;
    this.blendTime = BLEND.default;
    /** 'auto' follows chaos, 'manual' pins a mood. */
    this.moodMode = 'auto';
    this.manualMood = 'calm';
    /** A story cue can direct the mood ahead of music (priority 2). */
    this.storyMood = null;
    this.storyMoodTimer = 0;
    /** Seconds since the last foreground impulse — drives idle behaviour. */
    this.idleTime = 0;
    this.time = 0;
    this.safety = safety;
    /** Smoothed sensor values. */
    this.sensors = { energy: 0, low: 0, mid: 0, high: 0, beat: 0 };
    /** Last touch point, in normalised device space. */
    this.touchX = [0, 0, 0];
    this.touchStrength = 0;
    this.touchTimer = 0;
    /** Debug: which priority level produced the current answer. */
    this.lastPriority = 'idle';
    /** @type {import('./reaction.js').ImpulseBank|null} */
    this.impulses = null;
  }

  /** Bind the impulse bank this resolver reads each frame. */
  attach(impulses) {
    this.impulses = impulses;
    return this;
  }

  /**
   * Priority 1 safety limits. "Safety override: clamp flash and displacement",
   * and the low-stimulation mode required before any public showing (p.10).
   */
  setSafety(next) {
    this.safety = { ...this.safety, ...next };
    return this.safety;
  }

  /** A story cue directs the mood (priority 2). */
  cueStoryMood(moodId, seconds = 8) {
    if (!MOODS[moodId]) return;
    this.storyMood = moodId;
    this.storyMoodTimer = seconds;
    this.lastPriority = 'story';
  }

  /**
   * Steps 2–6 of the entity update order.
   *
   * @param {Object} ctx
   * @param {number} ctx.dt       Delta seconds.
   * @param {Object} ctx.audio    Raw { energy, low, mid, high, beat }.
   * @param {boolean} [ctx.silent] True when there is no audio source at all.
   * @returns {Object} frame state for the renderer
   */
  update(ctx) {
    const { dt, audio } = ctx;
    this.time += dt;

    // --- Step 2 + 4: normalise, then smooth continuous sensor values -------
    const s = this.sensors;
    s.energy = smooth(s.energy, saturate(audio.energy), dt, SENSOR_SMOOTHING.energy);
    s.low = smooth(s.low, saturate(audio.low), dt, SENSOR_SMOOTHING.low);
    s.mid = smooth(s.mid, saturate(audio.mid), dt, SENSOR_SMOOTHING.mid);
    s.high = smooth(s.high, saturate(audio.high), dt, SENSOR_SMOOTHING.high);
    s.beat = Math.max(0, s.beat - dt * 4);

    // --- Step 5: impulses decay -------------------------------------------
    const impulses = this.impulses;
    impulses.update(dt);
    if (this.touchTimer > 0) this.touchTimer = Math.max(0, this.touchTimer - dt);

    // --- Chaos target: music + attention + foreground impulses ------------
    const musicPoints =
      s.energy * (CHAOS_WEIGHTS.music * 0.55) +
      s.low * CHAOS_WEIGHTS.low +
      s.mid * CHAOS_WEIGHTS.mid +
      s.high * CHAOS_WEIGHTS.high;
    const attentionPoints = impulses.attention * CHAOS_WEIGHTS.attention;
    const foregroundPoints = impulses.foregroundTotal();

    let target = musicPoints + attentionPoints + foregroundPoints + CHAOS_WEIGHTS.idleFloor;

    // Story charge is a slow narrative build (build kit p.4 control list).
    target += impulses.storyCharge * CHAOS_WEIGHTS.story;

    this.lastPriority = this.resolvePriority(s, foregroundPoints);

    this.chaosTarget = clamp(target, 0, 100);

    // Chaos is smoothed, so FuX never snaps between states.
    this.chaos = clamp(smooth(this.chaos, this.chaosTarget, dt, SENSOR_SMOOTHING.chaos), 0, 100);

    // Idle tracking: silence must still feel alive (p.10 visual QA).
    this.idleTime = foregroundPoints < 1 && s.energy < 0.05 ? this.idleTime + dt : 0;

    // --- Step 3: resolve mood ---------------------------------------------
    this.resolveMood(dt);

    // --- Step 6 + build: safety clamps applied to the outgoing frame ------
    return this.applySafety(this.buildFrame());
  }

  /**
   * The state priority stack, in the order the build kit lists it (p.7):
   *   1. Safety override
   *   2. Story cue
   *   3. System event — an urgent spike outranks contact
   *   4. Touch / proximity / movement — short foreground response
   *   5. Music — continuous motion
   *   6. Idle — breath and awareness
   *
   * @returns {string} which priority level produced this frame's answer
   */
  resolvePriority(sensors, foregroundPoints) {
    if (this.safety.enabled) return 'safety';
    if (this.storyMood) return 'story';
    if ((this.impulses?.get('system') ?? 0) > 0) return 'system';
    if (foregroundPoints > 3) return 'touch';
    if (sensors.energy > 0.12) return 'music';
    return 'idle';
  }

  resolveMood(dt) {
    if (this.storyMoodTimer > 0) {
      this.storyMoodTimer -= dt;
      if (this.storyMoodTimer <= 0) this.storyMood = null;
    }

    let next;
    if (this.storyMood) {
      next = this.storyMood; // priority 2
    } else if (this.moodMode === 'manual') {
      next = this.manualMood;
    } else {
      next = moodForChaos(this.chaos); // continuous motion follows chaos
    }
    this.moodTarget = next;

    // A new destination resets the crossfade. Without this the blend would
    // start from a completed 1.0 and land on the new mood in a single step,
    // which is exactly the snap the mood system exists to avoid.
    if (next !== this.blendTo) {
      this.blendTo = next;
      this.moodBlend = 0;
      // Ominous enters slower; Wild exits slower so the energy must settle.
      const enter = BLEND.enterSlow[next] ?? BLEND.default;
      const exit = BLEND.exitSlow[this.mood] ?? BLEND.default;
      this.blendTime = Math.max(enter, exit);
    }

    if (next !== this.mood) {
      this.moodBlend = Math.min(1, this.moodBlend + dt / this.blendTime);
      if (this.moodBlend >= 1) this.mood = next;
    } else {
      this.moodBlend = 1;
    }
  }

  /** The blended mood asset currently driving the body. */
  currentMood() {
    const from = MOODS[this.mood] ?? MOODS.calm;
    const to = MOODS[this.moodTarget] ?? from;
    if (this.mood === this.moodTarget || this.moodBlend >= 1) return from;
    // Ease so mood changes feel intentional rather than linear.
    return blendMoods(from, to, easeInOut(clamp(this.moodBlend, 0, 1)));
  }

  /** Register a touch so the surface ripple lands in the right place. */
  registerTouch(point, strength) {
    this.touchX = [...point];
    this.touchTimer = TOUCH_WINDOW;
    this.touchStrength = strength;
  }

  /** Assemble the frame state the renderer consumes. */
  buildFrame() {
    const mood = this.currentMood();
    const s = this.sensors;
    const n = chaosNorm(this.chaos);

    // Material graph logic (build kit p.4):
    //   Flow     = CurlNoise + WaterCurrent
    //   Pressure = AudioLow + Threat + Touch
    //   Spikes   = pow(saturate(Noise * Pressure), 5)
    //   Breath   = sin(Time * BreathRate) * BreathAmount
    const pressure = saturate(s.low * mood.audioGainLow * 0.6 + this.threat() + this.touchAmount());
    const breath = Math.sin(this.time * mood.breathRate * Math.PI * 2) * 0.5 + 0.5;

    return {
      chaos: this.chaos,
      chaosNorm: n,
      band: bandFor(this.chaos).id,
      moodId: this.moodTarget,
      moodLabel: MOODS[this.moodTarget]?.label ?? mood.label,
      fromMood: this.mood,
      toMood: this.moodTarget,
      moodBlend: this.moodBlend,
      priority: this.lastPriority,

      // --- Material runtime parameters (build kit p.4 parameter table) ----
      glow: mood.glow * (0.55 + n * 0.6 + s.energy * 0.35),
      breathRate: mood.breathRate,
      breath,
      displace: mood.displaceAmount,
      flowSpeed: mood.flowSpeed,
      opacity: mood.opacity,
      edgeSharpness: MATERIAL_DEFAULTS.edgeSharpness + mood.spikeBias * n * 3,

      // --- Shape / particle drivers ---------------------------------------
      pressure,
      spikes: Math.pow(pressure, 1.4) * mood.spikeBias,
      flow: saturate(mood.flowSpeed + s.mid * 0.18),
      filamentCount: Math.round(mood.filamentCount * (0.75 + n * 0.5)),
      smokeCurl: saturate(mood.smokeCurl + n * 0.25),
      sparkRate: mood.sparkRate * (0.4 + n),
      orbitSpeed: mood.orbitSpeed,

      // --- Response bias ---------------------------------------------------
      responseDelay: mood.responseDelay,
      touchAttraction: mood.touchAttraction,
      touchPoint: [...this.touchX],
      touchStrength: this.touchAmount(),
      // Seconds since contact — the renderer turns this into an expanding
      // ripple radius and a fading scar (build kit p.6 touch sequence).
      touchAge: Math.max(0, this.touchTimer > 0 ? TOUCH_WINDOW - this.touchTimer : TOUCH_WINDOW),

      // --- Attention -------------------------------------------------------
      attention: saturate(s.mid * mood.audioGainMid + (this.impulses?.attention ?? 0)),
      attentionTarget: [...(this.impulses?.attentionTarget ?? [0, 0, 0])],
      storyCharge: this.impulses?.storyCharge ?? 0,

      // --- Colors ----------------------------------------------------------
      primaryColor: mood.primaryColor,
      secondaryColor: mood.secondaryColor,

      // --- Audio + perception ---------------------------------------------
      audio: { energy: s.energy, low: s.low, mid: s.mid, high: s.high },
      beat: s.beat,
      threat: this.threat(),
      idle: this.idleTime,
    };
  }

  /** Threat proxy: how recently something large happened (build kit p.4). */
  threat() {
    const sys = this.impulses?.get('system') ?? 0;
    const prox = this.impulses?.get('proximity') ?? 0;
    return saturate(sys * 0.8 + prox * 0.45);
  }

  /**
   * Live touch strength.
   *
   * A contact can arrive two ways — a reaction packet from the universal
   * interface, or a direct `registerTouch()` from the pointer — and the ripple
   * must be driven by whichever is stronger. A touch is one event, so it
   * should not need two calls to become visible.
   */
  touchAmount() {
    const fromPacket = this.impulses?.get('touch') ?? 0;
    const local =
      this.touchTimer > 0 ? this.touchStrength * saturate(this.touchTimer / TOUCH_WINDOW) : 0;
    return Math.max(fromPacket, local);
  }

  /** Priority 1: clamp flash and displacement when safety mode is engaged. */
  applySafety(frame) {
    if (!this.safety.enabled) return frame;
    const f = this.safety;
    frame.glow = Math.min(frame.glow, f.maxGlow);
    frame.displace = Math.min(frame.displace, f.maxDisplace);
    frame.sparkRate *= f.sparkScale;
    frame.audio = {
      energy: frame.audio.energy * f.audioScale,
      low: frame.audio.low * f.audioScale,
      mid: frame.audio.mid * f.audioScale,
      high: frame.audio.high * f.audioScale,
    };
    frame.flowSpeed = Math.min(frame.flowSpeed, f.maxFlowSpeed);
    frame.smokeCurl *= f.smokeScale;
    frame.spikes *= 0.5;
    frame.safety = true;
    return frame;
  }
}

function chaosNorm(chaos) {
  return clamp(chaos / 100, 0, 1);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Conservative starting limits for flash safety (build kit p.10). */
export function defaultSafety() {
  return {
    enabled: false,
    maxGlow: 6.0,
    maxDisplace: 2.4,
    sparkScale: 0.3,
    audioScale: 0.55,
    maxFlowSpeed: 0.2,
    smokeScale: 0.5,
  };
}
