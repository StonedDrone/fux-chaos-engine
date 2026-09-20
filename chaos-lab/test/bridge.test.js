/**
 * Bridge tests — the MilkDrop-Shake adapter boundary (build kit p.5).
 *
 * The bridge is the one place where data FuX did not produce enters the
 * system, so it is the one place that must never be trusted: every value is
 * clamped, unknown fields are ignored, and losing the bridge must return the
 * entity to idle rather than freezing it mid-flare.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeReceiver, AudioRouter, LiveAnalyser } from '../src/audio/analysis.js';
import { ChaosResolver } from '../src/core/chaosResolver.js';
import { ImpulseBank } from '../src/core/reaction.js';

/** One bridge packet in the shape the adapter sends. */
const packet = (over = {}) => ({
  energy: 0.6,
  low: 0.7,
  mid: 0.5,
  high: 0.4,
  beat: false,
  presetId: 'acid-bloom',
  presetName: 'Acid Bloom',
  moodHint: 'wild',
  ...over,
});

describe('BridgeReceiver', () => {
  let bridge;

  beforeEach(() => {
    bridge = new BridgeReceiver({ staleAfter: 1 });
  });

  it('accepts a packet in the documented shape', () => {
    const frame = bridge.accept(packet());
    expect(frame.energy).toBeCloseTo(0.6, 6);
    expect(frame.low).toBeCloseTo(0.7, 6);
    expect(frame.mid).toBeCloseTo(0.5, 6);
    expect(frame.high).toBeCloseTo(0.4, 6);
    expect(frame.presetId).toBe('acid-bloom');
    expect(bridge.presetId).toBe('acid-bloom');
    expect(bridge.connected).toBe(true);
  });

  it('clamps a misbehaving bridge instead of trusting it', () => {
    const frame = bridge.accept(packet({ energy: 90, low: -4, mid: Number.NaN, high: 1e9 }));
    expect(frame.energy).toBe(1);
    expect(frame.low).toBe(0);
    expect(frame.mid).toBe(0);
    expect(frame.high).toBe(1);
  });

  it('accepts the alternative field names a real adapter may send', () => {
    const frame = bridge.accept({ envelope: 0.4, bass: 0.5, treble: 0.2, preset: 'neon-swarm' });
    expect(frame.energy).toBeCloseTo(0.4, 6);
    expect(frame.low).toBeCloseTo(0.5, 6);
    expect(frame.high).toBeCloseTo(0.2, 6);
    expect(frame.presetId).toBe('neon-swarm');
  });

  it('normalises a beat flag of any type', () => {
    expect(bridge.accept(packet({ beat: true })).beat).toBe(1);
    expect(bridge.accept(packet({ beat: 0 })).beat).toBe(0);
    expect(bridge.accept(packet({ beat: 'yes' })).beat).toBe(1);
  });

  it('counts packets and reports its health', () => {
    bridge.accept(packet());
    bridge.step(1 / 30);
    expect(bridge.packetCount).toBe(1);
    expect(bridge.status()).toContain('1 packets');
  });

  it('decays the frame when packets stop arriving', () => {
    bridge.accept(packet());
    const before = bridge.frame.energy;
    for (let i = 0; i < 30; i += 1) bridge.step(1 / 30);
    expect(bridge.frame.energy).toBeLessThan(before);
  });

  it('returns to idle after the stale window, so bridge loss is safe', () => {
    bridge.accept(packet());
    for (let i = 0; i < 120; i += 1) bridge.step(1 / 30);
    expect(bridge.connected).toBe(false);
    expect(bridge.frame.energy).toBeLessThan(0.01);
    expect(bridge.frame.beat).toBe(0);
    expect(bridge.status()).toContain('stale');
  });

  it('reports no packets before anything has arrived', () => {
    expect(bridge.status()).toBe('no packets');
    expect(bridge.connected).toBe(false);
  });

  it('resets cleanly', () => {
    bridge.accept(packet());
    bridge.reset();
    expect(bridge.packetCount).toBe(0);
    expect(bridge.presetId).toBeNull();
    expect(bridge.frame.energy).toBe(0);
  });
});

describe('AudioRouter', () => {
  it('routes each source into one signal frame', () => {
    const router = new AudioRouter();
    expect(router.setSource('silence')).toBe('silence');
    const silent = router.step(1 / 30);
    expect(silent.energy).toBe(0);

    router.setSource('demo');
    expect(router.step(1 / 30).energy).toBeGreaterThanOrEqual(0);

    router.setSource('bridge');
    router.bridge.accept(packet({ energy: 0.9 }));
    expect(router.step(1 / 30).energy).toBeCloseTo(0.9, 3);
  });

  it('ignores an unknown source instead of breaking', () => {
    const router = new AudioRouter();
    const original = router.source;
    expect(router.setSource('telepathy')).toBe(original);
  });

  it('reports the active preset on the bridge source', () => {
    const router = new AudioRouter();
    router.setSource('bridge');
    router.bridge.accept(packet({ presetId: 'ferro-hymn' }));
    router.step(1 / 30);
    expect(router.section).toContain('ferro-hymn');
  });

  it('starts on the demo signal rather than a silent void', () => {
    expect(new AudioRouter().source).toBe('demo');
  });
});

describe('bridge to entity integration', () => {
  it('drives chaos from bridge packets alone', () => {
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    const router = new AudioRouter();
    router.setSource('bridge');

    const ctx = { dt: 1 / 30, audio: null };

    // Idle first, to establish a baseline.
    for (let i = 0; i < 60; i += 1) {
      ctx.audio = router.step(1 / 30);
      resolver.update(ctx);
    }
    const idleChaos = resolver.chaos;

    // Now a wild preset streams in at 30 Hz for eight seconds.
    for (let i = 0; i < 30 * 8; i += 1) {
      if (i % 15 === 0) router.bridge.accept(packet());
      ctx.audio = router.step(1 / 30);
      resolver.update(ctx);
    }
    const driven = resolver.chaos;
    expect(driven).toBeGreaterThan(idleChaos + 25);
  });

  it('falls back toward idle when the bridge dies mid-performance', () => {
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    const router = new AudioRouter();
    router.setSource('bridge');
    const ctx = { dt: 1 / 30, audio: null };

    for (let i = 0; i < 30 * 6; i += 1) {
      if (i % 15 === 0) router.bridge.accept(packet());
      ctx.audio = router.step(1 / 30);
      resolver.update(ctx);
    }
    const peak = resolver.chaos;

    // The bridge stops; the entity must settle, not freeze.
    for (let i = 0; i < 30 * 12; i += 1) {
      ctx.audio = router.step(1 / 30);
      resolver.update(ctx);
    }
    expect(resolver.chaos).toBeLessThan(peak - 20);
    expect(resolver.chaos).toBeLessThan(20);
  });

  it('keeps a preset swap from popping the mood', () => {
    const impulses = new ImpulseBank();
    const resolver = new ChaosResolver().attach(impulses);
    const router = new AudioRouter();
    router.setSource('bridge');
    const ctx = { dt: 1 / 30, audio: null };

    // Settle into a calm preset.
    for (let i = 0; i < 30 * 8; i += 1) {
      if (i % 15 === 0) router.bridge.accept(packet({ energy: 0.2, low: 0.2, mid: 0.15, high: 0.1 }));
      ctx.audio = router.step(1 / 30);
      resolver.update(ctx);
    }
    const calmMood = resolver.moodTarget;

    // Swap to a loud one and watch the transition rather than the endpoint.
    let sawBlend = false;
    for (let i = 0; i < 30 * 10; i += 1) {
      if (i % 15 === 0) router.bridge.accept(packet({ energy: 1, low: 1, mid: 1, high: 1 }));
      ctx.audio = router.step(1 / 30);
      const frame = resolver.update(ctx);
      if (frame.fromMood !== frame.toMood && frame.moodBlend > 0 && frame.moodBlend < 1) {
        sawBlend = true;
      }
    }
    expect(calmMood).toBe('calm');
    expect(sawBlend).toBe(true);
    expect(resolver.moodTarget).not.toBe('calm');
  });
});

describe('LiveAnalyser', () => {
  it('reports a usable error when the Web Audio API is missing', async () => {
    const analyser = new LiveAnalyser();
    const ok = await analyser.start({ audio: true });
    expect(ok).toBe(false);
    expect(analyser.error).toMatch(/Web Audio/i);
    expect(analyser.ready).toBe(false);
  });

  it('returns a silent frame when it is not ready', () => {
    expect(new LiveAnalyser().step(1 / 30)).toEqual({
      energy: 0,
      low: 0,
      mid: 0,
      high: 0,
      beat: 0,
      presetId: null,
    });
  });

  it('stops without throwing when it never started', () => {
    expect(() => new LiveAnalyser().stop()).not.toThrow();
  });
});
