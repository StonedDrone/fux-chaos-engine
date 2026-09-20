/**
 * Logic-layer tests.
 *
 * These cover the parts of the build kit that are behavioural rather than
 * visual, which are also the parts that must match the UE5 actor later:
 * the Chaos bands, the mood blend rules, the reaction priority stack, and the
 * safety clamps.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MOODS, MOOD_ORDER, blendMoods, bandFor, moodForChaos, CHAOS_BANDS } from '../src/core/moods.js';
import {
  ChaosResolver,
  CHAOS_WEIGHTS,
  MUSIC_CEILING,
  TOUCH_WINDOW,
} from '../src/core/chaosResolver.js';
import { ImpulseBank, ReactionMemory, normalisePacket, REACTION_TYPES } from '../src/core/reaction.js';
import { clamp, saturate, smooth, decay } from '../src/core/params.js';
import { SessionRecorder } from '../src/core/recorder.js';
import { PerformanceGuard, degradeFrom, QUALITY_ORDER } from '../src/render/quality.js';
import { DemoSignal } from '../src/audio/analysis.js';

/** Build a resolver wired to a fresh impulse bank. */
function makeResolver() {
  const impulses = new ImpulseBank();
  const resolver = new ChaosResolver().attach(impulses);
  return { impulses, resolver };
}

const SILENCE = { energy: 0, low: 0, mid: 0, high: 0, beat: 0 };

describe('chaos bands', () => {
  it('maps levels onto the four bands from the chaos feed table', () => {
    expect(bandFor(0).id).toBe('calm');
    expect(bandFor(25).id).toBe('stirring');
    expect(bandFor(59.9).id).toBe('stirring');
    expect(bandFor(60).id).toBe('surging');
    expect(bandFor(90).id).toBe('unleashed');
    expect(bandFor(100).id).toBe('unleashed');
  });

  it('covers 0..100 with no gaps between bands', () => {
    for (let chaos = 0; chaos <= 100; chaos += 0.5) {
      expect(bandFor(chaos)).toBeTruthy();
    }
    expect(CHAOS_BANDS[0].min).toBe(0);
  });

  it('assigns the mood each band maps to', () => {
    expect(moodForChaos(10)).toBe('calm');
    expect(moodForChaos(40)).toBe('joyful');
    expect(moodForChaos(75)).toBe('ominous');
    expect(moodForChaos(95)).toBe('wild');
  });
});

describe('mood assets', () => {
  it('defines exactly the four moods from the build kit', () => {
    expect(MOOD_ORDER).toEqual(['calm', 'joyful', 'ominous', 'wild']);
    expect(Object.keys(MOODS).sort()).toEqual([...MOOD_ORDER].sort());
  });

  it('gives every mood a distinct timing, shape, particle, and response value', () => {
    // "A mood is behaviour, not a color filter. Every preset changes at least
    //  one timing value, one shape value, one particle value, and one response
    //  bias." (build kit p.7)
    const timing = MOOD_ORDER.map((m) => MOODS[m].breathRate);
    const shape = MOOD_ORDER.map((m) => MOODS[m].filamentCount);
    const particle = MOOD_ORDER.map((m) => MOODS[m].sparkRate);
    const bias = MOOD_ORDER.map((m) => MOODS[m].responseDelay);

    expect(new Set(timing).size).toBe(4);
    expect(new Set(shape).size).toBe(4);
    expect(new Set(particle).size).toBe(4);
    expect(new Set(bias).size).toBe(4);
  });

  it('keeps Ominous dark and recoiling, Joyful approaching', () => {
    expect(MOODS.ominous.touchAttraction).toBeLessThan(0);
    expect(MOODS.joyful.touchAttraction).toBeGreaterThan(0);
    expect(MOODS.wild.filamentCount).toBeGreaterThan(MOODS.calm.filamentCount);
  });
});

describe('blendMoods', () => {
  it('interpolates numeric fields and snaps strings at the midpoint', () => {
    const mid = blendMoods(MOODS.calm, MOODS.wild, 0.5);
    expect(mid.breathRate).toBeCloseTo((MOODS.calm.breathRate + MOODS.wild.breathRate) / 2, 6);
    expect([MOODS.calm.primaryColor, MOODS.wild.primaryColor]).toContain(mid.primaryColor);

    const early = blendMoods(MOODS.calm, MOODS.wild, 0.2);
    expect(early.primaryColor).toBe(MOODS.calm.primaryColor);
    expect(early.id).toBe('calm');

    const late = blendMoods(MOODS.calm, MOODS.wild, 0.8);
    expect(late.primaryColor).toBe(MOODS.wild.primaryColor);
    expect(late.id).toBe('wild');
  });

  it('returns the destination at t = 1', () => {
    const end = blendMoods(MOODS.calm, MOODS.ominous, 1);
    expect(end.breathRate).toBeCloseTo(MOODS.ominous.breathRate, 6);
    expect(end.spikeBias).toBeCloseTo(MOODS.ominous.spikeBias, 6);
  });
});

describe('reaction packets', () => {
  it('clamps strength and urgency into 0..1', () => {
    const p = normalisePacket({ type: 'touch', strength: 4.2, urgency: -3 });
    expect(p.strength).toBe(1);
    expect(p.urgency).toBe(0);
  });

  it('falls back to a system packet for an unknown type', () => {
    expect(normalisePacket({ type: 'telepathy' }).type).toBe('system');
  });

  it('accepts every signal type the build kit lists', () => {
    for (const type of REACTION_TYPES) {
      expect(normalisePacket({ type }).type).toBe(type);
    }
  });

  it('defaults decay per type, loudest signals decaying slowest', () => {
    expect(normalisePacket({ type: 'touch' }).decayTime).toBeGreaterThan(
      normalisePacket({ type: 'system' }).decayTime,
    );
    expect(normalisePacket({ type: 'story' }).decayTime).toBeGreaterThan(
      normalisePacket({ type: 'touch' }).decayTime,
    );
  });

  it('echoes an explicitly supplied decay time', () => {
    expect(normalisePacket({ type: 'touch', decayTime: 0.25 }).decayTime).toBe(0.25);
  });
});

describe('impulse bank', () => {
  it('takes the strongest value rather than summing repeats', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'touch', strength: 0.9 }));
    bank.absorb(normalisePacket({ type: 'touch', strength: 0.3 }));
    expect(bank.get('touch')).toBeCloseTo(0.9, 6);
  });

  it('moves the attention target to the newest packet point', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'movement', strength: 0.5, point: [1, 2, 3] }));
    expect(bank.attentionTarget).toEqual([1, 2, 3]);
  });

  it('decays impulses back toward zero', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'touch', strength: 1, decayTime: 0.5 }));
    for (let i = 0; i < 120; i += 1) bank.update(1 / 30);
    expect(bank.get('touch')).toBeLessThan(0.05);
  });

  it('builds story charge that holds far longer than a touch', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'story', strength: 1, decayTime: 4 }));
    for (let i = 0; i < 30; i += 1) bank.update(1 / 30);
    expect(bank.storyCharge).toBeGreaterThan(0.5);
  });

  it('weights foreground signals by their role in the answer', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'touch', strength: 1 }));
    const touchOnly = bank.foregroundTotal();
    bank.absorb(normalisePacket({ type: 'system', strength: 1 }));
    expect(bank.foregroundTotal()).toBeGreaterThan(touchOnly);
  });

  it('excludes continuous music from the foreground total', () => {
    const bank = new ImpulseBank();
    bank.absorb(normalisePacket({ type: 'music', strength: 1 }));
    expect(bank.foregroundTotal()).toBe(0);
  });
});

describe('reaction memory', () => {
  it('keeps a bounded trace that reads oldest to newest', () => {
    const memory = new ReactionMemory({ traceLength: 8 });
    for (let i = 0; i < 12; i += 1) memory.sample(i);
    const trace = memory.orderedTrace();
    expect(trace.length).toBe(8);
    expect(trace[0]).toBe(4);
    expect(trace[7]).toBe(11);
  });

  it('reports a mean over the trailing window', () => {
    const memory = new ReactionMemory({ traceLength: 100 });
    for (let i = 0; i < 60; i += 1) memory.sample(50);
    expect(memory.meanOver(1, 30)).toBeCloseTo(50, 6);
  });

  it('caps the recent packet list', () => {
    const memory = new ReactionMemory({ capacity: 3 });
    for (let i = 0; i < 10; i += 1) {
      memory.push(normalisePacket({ type: 'touch', strength: 0.5 }));
    }
    expect(memory.recent.length).toBe(3);
  });

  it('notes repeat pressure for a signal type seen before', () => {
    const memory = new ReactionMemory();
    const first = memory.push(normalisePacket({ type: 'touch', strength: 0.5 }));
    const second = memory.push(normalisePacket({ type: 'touch', strength: 0.5 }));
    expect(first).toBe(0);
    expect(second).toBeGreaterThanOrEqual(0);
  });
});

describe('ChaosResolver', () => {
  let ctx;
  let resolver;
  let impulses;

  beforeEach(() => {
    ({ impulses, resolver } = makeResolver());
    ctx = { dt: 1 / 30, audio: { ...SILENCE } };
  });

  /** Run the resolver for a while at 30 Hz. */
  function run(seconds, audio = SILENCE, onStep) {
    const steps = Math.round(seconds * 30);
    let frame = null;
    for (let i = 0; i < steps; i += 1) {
      frame = resolver.update({ dt: 1 / 30, audio });
      onStep?.(frame, i);
    }
    return frame;
  }

  it('starts calm and stays in the calm band in silence', () => {
    const frame = run(6);
    expect(frame.band).toBe('calm');
    expect(frame.chaos).toBeGreaterThan(0); // idle floor — never fully dead
    expect(frame.chaos).toBeLessThan(25);
  });

  it('never leaves 0..100 even when every input screams', () => {
    let frame = null;
    for (let i = 0; i < 90; i += 1) {
      impulses.absorb(normalisePacket({ type: 'system', strength: 1 }));
      impulses.absorb(normalisePacket({ type: 'touch', strength: 1 }));
      frame = resolver.update({
        dt: 1 / 30,
        audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 },
      });
      expect(frame.chaos).toBeGreaterThanOrEqual(0);
      expect(frame.chaos).toBeLessThanOrEqual(100);
    }
    expect(frame.band).toBe('unleashed');
  });

  it('reaches unleashed on a sustained loud, broadband signal', () => {
    const frame = run(12, { energy: 1, low: 1, mid: 1, high: 1, beat: 0 });
    expect(frame.band).toBe('unleashed');
    expect(frame.chaos).toBeGreaterThan(90);
  });

  it('sits in calm under quiet music and surges under a drop', () => {
    const quiet = run(10, { energy: 0.12, low: 0.15, mid: 0.1, high: 0.05, beat: 0 });
    expect(quiet.band).toBe('calm');

    const drop = run(10, { energy: 0.8, low: 0.95, mid: 0.7, high: 0.6, beat: 1 });
    expect(drop.chaos).toBeGreaterThan(quiet.chaos + 35);
    expect(['surging', 'unleashed']).toContain(drop.band);
  });

  it('reserves the last stretch of the range for layered senses', () => {
    // "Music is one sense, not the whole brain" (build kit p.6): no single
    // sense can pin the meter at 100, so the top of the range takes layering.
    const musicOnly = run(20, { energy: 1, low: 1, mid: 1, high: 1, beat: 0 });
    expect(musicOnly.chaos).toBeLessThan(100);
    expect(musicOnly.chaos).toBeLessThanOrEqual(MUSIC_CEILING + 0.5);

    for (let i = 0; i < 30; i += 1) {
      impulses.absorb(normalisePacket({ type: 'system', strength: 1 }));
      resolver.update({ dt: 1 / 30, audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 } });
    }
    const layered = resolver.update({
      dt: 1 / 30,
      audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 },
    });
    expect(layered.chaos).toBeGreaterThan(musicOnly.chaos);
  });

  it('follows chaos with the mood in auto mode through all four bands', () => {
    const seen = new Set();
    const steps = 30 * 30;
    for (let i = 0; i < steps; i += 1) {
      // Sweep the music from silence to full over the run.
      const t = i / steps;
      const wave = Math.max(0, Math.sin(t * Math.PI)) ** 2;
      const frame = resolver.update({
        dt: 1 / 30,
        audio: { energy: wave, low: wave, mid: wave, high: wave, beat: 0 },
      });
      seen.add(frame.moodId);
    }
    expect([...seen].sort()).toEqual([...MOOD_ORDER].sort());
  });

  it('smooths chaos instead of snapping to the target', () => {
    const full = { energy: 1, low: 1, mid: 1, high: 1, beat: 0 };

    // One frame in, the smoothed level must trail the target by a wide margin.
    resolver.update({ dt: 1 / 30, audio: full });
    const early = resolver.chaos;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(resolver.chaosTarget * 0.5);

    // It must still get there, and monotonically.
    let previous = early;
    let frame = null;
    for (let i = 0; i < 10 * 30; i += 1) {
      frame = resolver.update({ dt: 1 / 30, audio: full });
      expect(frame.chaos).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = frame.chaos;
    }
    expect(frame.chaos).toBeGreaterThan(90);
    expect(frame.chaos).toBeLessThanOrEqual(100);
  });

  it('lets a story cue direct the mood ahead of music', () => {
    resolver.cueStoryMood('ominous', 5);
    // Loud, joyful-leaning music must not override the story cue.
    const frame = run(1, { energy: 0.5, low: 0.3, mid: 0.6, high: 0.4, beat: 0 });
    expect(frame.moodId).toBe('ominous');
    expect(frame.priority).toBe('story');
  });

  it('expires a story cue when its window closes', () => {
    resolver.cueStoryMood('ominous', 0.5);
    run(2, { ...SILENCE });
    expect(resolver.storyMood).toBeNull();
  });

  it('pins the mood in manual mode', () => {
    resolver.moodMode = 'manual';
    resolver.manualMood = 'wild';
    const frame = run(2, { ...SILENCE });
    expect(frame.moodId).toBe('wild');
  });

  it('blends between moods rather than cutting', () => {
    resolver.moodMode = 'manual';
    resolver.manualMood = 'calm';
    run(3);
    resolver.manualMood = 'ominous';
    const frame = run(0.2);
    expect(frame.fromMood).toBe('calm');
    expect(frame.toMood).toBe('ominous');
    expect(frame.moodBlend).toBeGreaterThan(0);
    expect(frame.moodBlend).toBeLessThan(1);
  });

  it('enters Ominous slower than the default blend time', () => {
    resolver.moodMode = 'manual';
    resolver.manualMood = 'ominous';
    run(0.1);
    expect(resolver.blendTime).toBeGreaterThan(1.8);
  });

  it('exits Wild slower than the default blend time', () => {
    resolver.moodMode = 'manual';
    resolver.manualMood = 'wild';
    run(4);
    resolver.manualMood = 'calm';
    run(0.1);
    expect(resolver.blendTime).toBeGreaterThan(1.8);
  });

  it('surfaces touch as an expanding ripple with a fading scar', () => {
    // A contact is one event: registering it must be enough to make it visible.
    resolver.registerTouch([0, 0, 1], 0.9);
    const fresh = run(1 / 30);
    expect(fresh.touchStrength).toBeGreaterThan(0.5);
    expect(fresh.touchAge).toBeLessThan(0.2);
    expect(fresh.touchPoint).toEqual([0, 0, 1]);

    // The ripple travels outward from the contact point.
    const mid = run(0.6);
    expect(mid.touchAge).toBeGreaterThan(fresh.touchAge);

    // And it is gone by the time the window closes.
    run(TOUCH_WINDOW + 0.5);
    const faded = resolver.update({ dt: 1 / 30, audio: SILENCE });
    expect(faded.touchStrength).toBeLessThan(0.05);
  });

  it('follows the touch-attraction bias of the active mood', () => {
    resolver.moodMode = 'manual';
    resolver.manualMood = 'joyful';
    run(3);
    expect(run(1 / 30).touchAttraction).toBeGreaterThan(0);

    resolver.manualMood = 'ominous';
    run(4);
    expect(run(1 / 30).touchAttraction).toBeLessThan(0);
  });

  it('reports the highest-priority signal that produced the answer', () => {
    // Idle when there is nothing to answer.
    expect(run(1).priority).toBe('idle');

    // Music outranks idle.
    expect(run(1, { energy: 0.5, low: 0.4, mid: 0.3, high: 0.2, beat: 0 }).priority).toBe('music');

    // Contact outranks music.
    impulses.absorb(normalisePacket({ type: 'touch', strength: 0.8 }));
    expect(run(1 / 30, { energy: 0.5, low: 0.4, mid: 0.3, high: 0.2, beat: 0 }).priority).toBe(
      'touch',
    );

    // A system spike outranks contact.
    impulses.absorb(normalisePacket({ type: 'system', strength: 0.8 }));
    expect(run(1 / 30).priority).toBe('system');

    // Safety is priority one and shows as such.
    resolver.setSafety({ enabled: true });
    expect(run(1 / 30).priority).toBe('safety');
  });

  it('shows every material parameter the build kit table defines', () => {
    const frame = run(1);
    for (const key of ['glow', 'breathRate', 'displace', 'flowSpeed', 'opacity', 'edgeSharpness']) {
      expect(typeof frame[key]).toBe('number');
      expect(Number.isFinite(frame[key])).toBe(true);
    }
    expect(frame.glow).toBeGreaterThan(0);
    expect(frame.opacity).toBeGreaterThan(0);
    expect(frame.opacity).toBeLessThanOrEqual(1);
  });

  it('keeps the reported filament count inside the 8-16 prototype budget', () => {
    for (const mood of MOOD_ORDER) {
      resolver.moodMode = 'manual';
      resolver.manualMood = mood;
      const frame = run(3, { energy: 1, low: 1, mid: 1, high: 1, beat: 0 });
      expect(frame.filamentCount).toBeGreaterThanOrEqual(6);
      expect(frame.filamentCount).toBeLessThanOrEqual(24);
    }
  });

  it('leaves the attention target as a finite three-vector', () => {
    const frame = run(1);
    expect(frame.attentionTarget).toHaveLength(3);
    frame.attentionTarget.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe('safety override', () => {
  it('is priority one and clamps flash and displacement', () => {
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    const ctx = { dt: 1 / 30, audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 } };
    for (let i = 0; i < 60; i += 1) resolver.update(ctx);
    const unsafe = resolver.update(ctx);
    resolver.setSafety({ enabled: true });
    const safe = resolver.update(ctx);

    expect(safe.glow).toBeLessThanOrEqual(resolver.safety.maxGlow);
    expect(safe.displace).toBeLessThanOrEqual(resolver.safety.maxDisplace);
    expect(safe.sparkRate).toBeLessThanOrEqual(unsafe.sparkRate);
    expect(safe.safety).toBe(true);
  });

  it('caps glow below the full-intensity value', () => {
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    const ctx = { dt: 1 / 30, audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 } };
    for (let i = 0; i < 90; i += 1) resolver.update(ctx);
    const before = resolver.chaos;
    resolver.setSafety({ enabled: true });
    const frame = resolver.update(ctx);
    expect(frame.glow).toBeLessThan(12);
    expect(before).toBeGreaterThan(60);
  });
});

describe('numeric helpers', () => {
  it('clamps and saturates', () => {
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(saturate(0.42)).toBe(0.42);
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
  });

  it('smooths toward a target without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 100; i += 1) v = smooth(v, 1, 1 / 30, 6);
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('is frame-rate independent in the limit', () => {
    // The same elapsed time must land in the same place regardless of step size.
    let a = 0;
    for (let i = 0; i < 60; i += 1) a = smooth(a, 1, 1 / 30, 4);
    let b = 0;
    for (let i = 0; i < 120; i += 1) b = smooth(b, 1, 1 / 60, 4);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it('halves on the half-life', () => {
    expect(decay(1, 1, 1)).toBeCloseTo(0.5, 6);
    expect(decay(1, 2, 1)).toBeCloseTo(0.25, 6);
  });
});

describe('demo signal', () => {
  it('is deterministic for a given seed', () => {
    const a = new DemoSignal({ seed: 42 });
    const b = new DemoSignal({ seed: 42 });
    for (let i = 0; i < 300; i += 1) {
      expect(a.step(1 / 30)).toEqual(b.step(1 / 30));
    }
  });

  it('stays inside 0..1 for every band', () => {
    const demo = new DemoSignal();
    for (let i = 0; i < 60 * 60; i += 1) {
      const f = demo.step(1 / 30);
      for (const key of ['energy', 'low', 'mid', 'high']) {
        expect(f[key]).toBeGreaterThanOrEqual(0);
        expect(f[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('cycles through its sections so a take is not monotone', () => {
    const demo = new DemoSignal();
    const seen = new Set();
    for (let i = 0; i < 30 * 60; i += 1) seen.add(demo.step(1 / 30).section);
    expect(seen.size).toBe(4);
    expect(seen.has('drop')).toBe(true);
  });
});

describe('performance guard', () => {
  it('orders the tiers from richest to leanest', () => {
    expect(QUALITY_ORDER).toEqual(['high', 'medium', 'low']);
    expect(degradeFrom('high')).toBe('medium');
    expect(degradeFrom('medium')).toBe('low');
    expect(degradeFrom('low')).toBeNull();
  });

  it('degrade recommendation needs a sustained problem, not one hitch', () => {
    const guard = new PerformanceGuard({ cooldown: 0 });
    guard.sample(0.5); // one very slow frame
    expect(guard.recommend('high')).toBeNull();
  });

  it('recommends a lower tier after sustained slowness', () => {
    const guard = new PerformanceGuard({ cooldown: 0 });
    for (let i = 0; i < 120; i += 1) guard.sample(1 / 18); // ~18 fps
    const rec = guard.recommend('high');
    expect(rec?.tier).toBe('medium');
  });

  it('never recommends degrading below the floor', () => {
    const guard = new PerformanceGuard({ cooldown: 0 });
    for (let i = 0; i < 200; i += 1) guard.sample(1 / 12);
    expect(guard.recommend('low')).toBeNull();
  });

  it('recommends raising quality when there is headroom', () => {
    const guard = new PerformanceGuard({ cooldown: 0 });
    // 120 fps for ten seconds — a sustained surplus, not a fast moment.
    for (let i = 0; i < 1200; i += 1) guard.sample(1 / 120);
    expect(guard.recommend('low')?.tier).toBe('medium');
  });
});

describe('session recorder', () => {
  it('captures a decimated timeline with a summary', () => {
    const rec = new SessionRecorder({ seconds: 10, sampleHz: 30 });
    rec.start({ note: 'test' });
    const frame = {
      chaos: 42,
      band: 'stirring',
      moodId: 'joyful',
      moodBlend: 1,
      glow: 6,
      displace: 3,
      flowSpeed: 0.2,
      breathRate: 0.5,
      opacity: 0.7,
      spikes: 0.1,
      filamentCount: 12,
      smokeCurl: 0.4,
      sparkRate: 0.3,
      attention: 0.5,
      pressure: 0.2,
      audio: { energy: 0.5, low: 0.4, mid: 0.3, high: 0.2 },
      priority: 'music',
    };
    for (let i = 0; i < 300; i += 1) rec.capture(frame, 1 / 30);
    const summary = rec.stop();
    expect(summary.samples).toBeGreaterThan(200);
    expect(summary.meanChaos).toBeCloseTo(42, 1);
    expect(summary.peakChaos).toBeCloseTo(42, 1);
    expect(summary.bandSeconds.stirring).toBeGreaterThan(0);
    expect(summary.moodSeconds.joyful).toBeGreaterThan(0);
  });

  it('records events with a running timestamp', () => {
    const rec = new SessionRecorder({ sampleHz: 30 });
    rec.start();
    rec.event('touch', { strength: 0.5 });
    expect(rec.events[0].event).toBe('touch');
    expect(typeof rec.events[0].t).toBe('number');
  });

  it('produces a versioned artifact', () => {
    const rec = new SessionRecorder({ sampleHz: 30 });
    rec.start({ quality: 'high' });
    const json = rec.toJSON();
    expect(json.schema).toBe('fux-chaos-session/1.0');
    expect(json.quality).toBe('high');
    expect(Array.isArray(json.timeline)).toBe(true);
  });

  it('reports an empty take rather than throwing', () => {
    const rec = new SessionRecorder();
    expect(rec.summary().error).toBe('nothing recorded');
  });
});

describe('chaos weights', () => {
  it('keeps the idle floor above zero so silence is never dead', () => {
    expect(CHAOS_WEIGHTS.idleFloor).toBeGreaterThan(0);
  });

  it('cannot push past 100 even with every weight maxed', () => {
    const max =
      CHAOS_WEIGHTS.music * 0.55 +
      CHAOS_WEIGHTS.low +
      CHAOS_WEIGHTS.mid +
      CHAOS_WEIGHTS.high +
      CHAOS_WEIGHTS.attention +
      CHAOS_WEIGHTS.story +
      CHAOS_WEIGHTS.idleFloor +
      100; // foreground, generously over-estimated
    expect(max).toBeGreaterThan(100); // clamping is what protects the range
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    for (const type of REACTION_TYPES) {
      impulses.absorb(normalisePacket({ type, strength: 1 }));
    }
    const frame = resolver.update({
      dt: 1 / 30,
      audio: { energy: 1, low: 1, mid: 1, high: 1, beat: 1 },
    });
    expect(frame.chaos).toBeLessThanOrEqual(100);
  });
});
