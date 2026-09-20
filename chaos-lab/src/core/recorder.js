/**
 * Session recorder — the `R` key workflow from the README's mood pipeline.
 *
 * "Press `R` to record MP4 reference clips of the moods you want the UE5
 *  entity to reproduce."
 *
 * The lab cannot capture video of a UE5 build, but it can capture the thing
 * that actually needs reproducing: the resolved state over time. A recording
 * is a compact JSON timeline of chaos, mood, material parameters, and every
 * reaction packet, which is what a Niagara or material artist needs in order
 * to match timing, and which makes a regression test out of a good take.
 */

import { bandFor } from './moods.js';
import { MOOD_ORDER } from './moods.js';

const DEFAULT_SECONDS = 60;
const SAMPLE_HZ = 30;

export class SessionRecorder {
  constructor({ seconds = DEFAULT_SECONDS, sampleHz = SAMPLE_HZ } = {}) {
    this.capacity = Math.round(seconds * sampleHz);
    this.sampleHz = sampleHz;
    this.seconds = seconds;
    this.recording = false;
    this.samples = [];
    this.events = [];
    this.startedAt = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.meta = {};
  }

  start(meta = {}) {
    this.recording = true;
    this.samples = [];
    this.events = [];
    this.startedAt = performance.now();
    this.elapsed = 0;
    this.accumulator = 0;
    this.meta = { ...meta, startedAtIso: new Date().toISOString(), sampleHz: this.sampleHz };
    return this;
  }

  stop() {
    this.recording = false;
    this.elapsed = (performance.now() - this.startedAt) / 1000;
    return this.summary();
  }

  /** Called once per resolved frame; decimates to the target sample rate. */
  capture(frame, dt) {
    if (!this.recording) return;
    this.accumulator += dt;
    const period = 1 / this.sampleHz;
    if (this.accumulator < period) return;
    this.accumulator %= period;

    if (this.samples.length >= this.capacity) {
      // Ring behaviour: the take keeps running, the oldest samples roll off.
      this.samples.shift();
    }

    this.samples.push({
      t: Number(this.elapsed.toFixed(3)),
      chaos: Number(frame.chaos.toFixed(2)),
      band: frame.band,
      mood: frame.moodId,
      blend: Number(frame.moodBlend.toFixed(3)),
      glow: Number(frame.glow.toFixed(3)),
      displace: Number(frame.displace.toFixed(3)),
      flowSpeed: Number(frame.flowSpeed.toFixed(4)),
      breathRate: Number(frame.breathRate.toFixed(3)),
      opacity: Number(frame.opacity.toFixed(3)),
      spikes: Number(frame.spikes.toFixed(4)),
      filaments: frame.filamentCount,
      smokeCurl: Number(frame.smokeCurl.toFixed(3)),
      sparkRate: Number(frame.sparkRate.toFixed(3)),
      attention: Number(frame.attention.toFixed(3)),
      pressure: Number(frame.pressure.toFixed(3)),
      energy: Number(frame.audio.energy.toFixed(3)),
      low: Number(frame.audio.low.toFixed(3)),
      mid: Number(frame.audio.mid.toFixed(3)),
      high: Number(frame.audio.high.toFixed(3)),
      priority: frame.priority,
      safety: frame.safety === true,
    });

    this.elapsed += dt;
  }

  /** Reaction packets land in the event log alongside the timeline. */
  event(type, detail = {}) {
    if (!this.recording) return;
    this.events.push({
      t: Number(this.elapsed.toFixed(3)),
      event: type,
      ...detail,
    });
  }

  /** Peak, mean, per-band dwell time, and the mood timeline. */
  summary() {
    const samples = this.samples;
    if (!samples.length) {
      return { samples: 0, duration: 0, error: 'nothing recorded' };
    }

    let peak = 0;
    let sum = 0;
    const bandTime = { calm: 0, stirring: 0, surging: 0, unleashed: 0 };
    const moodTime = Object.fromEntries(MOOD_ORDER.map((m) => [m, 0]));
    const dt = 1 / this.sampleHz;

    for (const s of samples) {
      peak = Math.max(peak, s.chaos);
      sum += s.chaos;
      bandTime[bandFor(s.chaos).id] += dt;
      if (moodTime[s.mood] !== undefined) moodTime[s.mood] += dt;
    }

    const duration = samples.length * dt;
    return {
      samples: samples.length,
      duration: Number(duration.toFixed(2)),
      peakChaos: Number(peak.toFixed(1)),
      meanChaos: Number((sum / samples.length).toFixed(1)),
      bandSeconds: roundValues(bandTime),
      moodSeconds: roundValues(moodTime),
      events: this.events.length,
      eventTypes: countBy(this.events, (e) => e.event),
    };
  }

  /** The full artifact, ready to download or diff. */
  toJSON() {
    return {
      schema: 'fux-chaos-session/1.0',
      generator: 'FuX Chaos Lab',
      buildKit: 'docs/symbiote-entity-ue5-build-kit.pdf',
      ...this.meta,
      summary: this.summary(),
      timeline: this.samples,
      events: this.events,
    };
  }

  /** Trigger a download of the recording. */
  download(filename) {
    const name =
      filename ??
      `fux-session-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    const blob = new Blob([JSON.stringify(this.toJSON(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }

  reset() {
    this.recording = false;
    this.samples = [];
    this.events = [];
    this.elapsed = 0;
    this.accumulator = 0;
  }
}

function roundValues(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Number(v.toFixed(2))]));
}

function countBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
