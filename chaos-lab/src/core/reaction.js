/**
 * The universal reaction interface (build kit p.6).
 *
 * "Everything reaches FuX through one reaction packet."  Sound, contact,
 * attention, voice, and system events all arrive here as the same small
 * struct, so the entity cannot tell — and never has to care — which sensor
 * produced a signal.
 */

import { clamp, decay, smooth } from './params.js';

/** Signal types recognised by the reaction layer. */
export const REACTION_TYPES = [
  'music', // continuous energy + bands
  'touch', // point + strength
  'proximity', // point + strength, approaching
  'movement', // target + speed
  'voice', // mood + charge
  'story', // mood + charge, directs the mood
  'system', // type + urgency, spike / bloom / settle
];

/** Default decay times in seconds per signal type. */
export const DEFAULT_DECAY = {
  music: 0.45,
  touch: 1.6,
  proximity: 1.1,
  movement: 0.9,
  voice: 2.2,
  story: 4.0,
  system: 0.8,
};

/**
 * @typedef {Object} ReactionPacket
 * @property {string} type          One of REACTION_TYPES.
 * @property {number} strength      0..1 signal intensity.
 * @property {[number,number,number]} [point]  Contact / attention point.
 * @property {[number,number,number]} [direction]
 * @property {string} [moodHint]    Optional mood the source suggests.
 * @property {number} [urgency]     0..1, how hard it interrupts.
 * @property {number} [decayTime]   Seconds for the impulse to fade.
 * @property {string} [label]       Human label for the memory trace.
 */

/**
 * Normalises an incoming packet. Mirrors the pseudocode on p.6:
 *   Packet.Strength = Clamp(Packet.Strength, 0, 1)
 *   ReactionQueue.Add(Packet)
 */
export function normalisePacket(raw = {}) {
  const type = REACTION_TYPES.includes(raw.type) ? raw.type : 'system';
  return {
    type,
    strength: clamp(Number(raw.strength ?? 0), 0, 1),
    point: raw.point ? [...raw.point] : null,
    direction: raw.direction ? [...raw.direction] : null,
    moodHint: raw.moodHint ?? null,
    urgency: clamp(Number(raw.urgency ?? raw.strength ?? 0), 0, 1),
    decayTime: Number(raw.decayTime ?? DEFAULT_DECAY[type] ?? 1),
    label: raw.label ?? type,
    age: 0,
  };
}

/**
 * The short reaction-memory trace (build kit p.8, step 8).
 * Keeps the most recent impulses so the same signal does not always get the
 * same answer — mood, recent memory, and competing inputs change FuX's timing.
 */
export class ReactionMemory {
  constructor({ capacity = 12, traceLength = 240 } = {}) {
    this.capacity = capacity;
    /** @type {ReactionPacket[]} */
    this.recent = [];
    /** Rolling chaos trace for the readout. */
    this.trace = new Float32Array(traceLength);
    this.traceLength = traceLength;
    this.traceHead = 0;
    this.traceCount = 0;
    this.lastOfType = new Map();
  }

  /** Store an impulse and note repeat pressure per type. */
  push(packet) {
    this.recent.unshift(packet);
    if (this.recent.length > this.capacity) this.recent.length = this.capacity;
    const last = this.lastOfType.get(packet.type);
    this.lastOfType.set(packet.type, packet);
    // Repeated identical signals build familiarity and get a calmer answer.
    return last ? clamp(1 - (packet.age ?? 0) / 5, 0, 1) : 0;
  }

  /** Append a chaos sample to the rolling trace. */
  sample(chaos) {
    this.trace[this.traceHead] = chaos;
    this.traceHead = (this.traceHead + 1) % this.traceLength;
    this.traceCount = Math.min(this.traceCount + 1, this.traceLength);
  }

  /** Trace as an ordered array (oldest → newest). */
  orderedTrace() {
    const out = new Array(this.traceCount);
    const start = (this.traceHead - this.traceCount + this.traceLength) % this.traceLength;
    for (let i = 0; i < this.traceCount; i += 1) {
      out[i] = this.trace[(start + i) % this.traceLength];
    }
    return out;
  }

  /** Average chaos over the last `seconds` at `hz` samples per second. */
  meanOver(seconds, hz = 30) {
    const n = Math.min(Math.floor(seconds * hz), this.traceCount);
    if (!n) return 0;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const idx = (this.traceHead - 1 - i + this.traceLength * 2) % this.traceLength;
      sum += this.trace[idx];
    }
    return sum / n;
  }

  clear() {
    this.recent.length = 0;
    this.lastOfType.clear();
    this.trace.fill(0);
    this.traceHead = 0;
    this.traceCount = 0;
  }
}

/**
 * Impulse accumulator: converts discrete packets into continuous 0..1
 * foreground values that decay over each packet's own DecayTime.
 *
 * This is build-kit step 5, "Decay touch, story, and system impulses".
 */
export class ImpulseBank {
  constructor(types = REACTION_TYPES) {
    /** @type {Record<string, {value:number, decayTime:number, packet:ReactionPacket|null}>} */
    this.channels = {};
    for (const t of types) this.channels[t] = { value: 0, decayTime: 1, packet: null };
    this.attention = 0;
    this.attentionTarget = [0, 0, 0];
    this.pressure = 0;
    this.storyCharge = 0;
    this.lastTouch = null;
  }

  /** Absorb a packet into the matching channel. */
  absorb(packet) {
    const ch = this.channels[packet.type];
    if (ch) {
      ch.value = clamp(Math.max(ch.value, packet.strength), 0, 1);
      ch.decayTime = packet.decayTime;
      ch.packet = packet;
    }

    // "AttentionTarget = Packet.Point" — p.6
    if (packet.point) {
      this.attentionTarget = [...packet.point];
      this.attention = clamp(Math.max(this.attention, packet.strength), 0, 1);
    }

    if (packet.type === 'touch') this.lastTouch = packet;
    // Story charge builds slowly and holds (build kit p.4 control: Story charge).
    if (packet.type === 'story' || packet.type === 'voice') {
      this.storyCharge = clamp(Math.max(this.storyCharge, packet.strength), 0, 1);
    }
  }

  /**
   * Step 5 of the update order. `dt` in seconds.
   */
  update(dt) {
    for (const ch of Object.values(this.channels)) {
      if (ch.value > 0) {
        ch.value = decay(ch.value, dt, ch.decayTime * 0.5);
        if (ch.value < 0.001) ch.value = 0;
      }
    }
    this.attention = decay(this.attention, dt, 3.5);
    this.pressure = decay(this.pressure, dt, 0.5);
    this.storyCharge = decay(this.storyCharge, dt, 18);
    return this;
  }

  get(type) {
    return this.channels[type]?.value ?? 0;
  }

  /** Sum of all non-continuous foreground impulses. */
  foregroundTotal() {
    let total = 0;
    for (const [type, ch] of Object.entries(this.channels)) {
      if (type === 'music') continue; // continuous motion, handled separately
      total += ch.value * foregroundWeight(type);
    }
    return total;
  }
}

/** How much each discrete signal pushes chaos (build kit p.6 behaviour map). */
export function foregroundWeight(type) {
  switch (type) {
    case 'touch':
      return 14;
    case 'proximity':
      return 8;
    case 'movement':
      return 5;
    case 'voice':
      return 11;
    case 'story':
      return 18;
    case 'system':
      return 22;
    default:
      return 6;
  }
}

/** Smoothing speeds for continuous values (build kit p.5). */
export const SENSOR_SMOOTHING = {
  energy: 6.0,
  low: 8.0,
  mid: 9.0,
  high: 12.0,
  chaos: 2.6,
};

/** One-pole smoothing helper bound to a named signal. */
export function makeSmoother(initial = 0, speed = 6) {
  let value = initial;
  return {
    get value() {
      return value;
    },
    set value(v) {
      value = v;
    },
    update(target, dt) {
      value = smooth(value, target, dt, speed);
      return value;
    },
  };
}
