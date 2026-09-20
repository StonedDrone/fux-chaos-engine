/**
 * Music gives the entity a nervous system (build kit p.6).
 *
 * "Music is one sense, not the whole brain." Three sources feed the same
 * { energy, low, mid, high, beat } struct:
 *
 *   silence  — no source; FuX breathes and stays aware.
 *   demo     — a deterministic synthesised signal (WaveScope's `3` silent demo).
 *   live     — AnalyserNode FFT from a microphone or captured tab audio.
 *   bridge   — compact packets from MilkDrop-Shake (energy, low, mid, high,
 *              preset ID, beat) arriving over the adapter boundary.
 *
 * Frequency bands are the same three the build kit asks for:
 *   Low: body scale, displacement, heavy tendrils
 *   Mid: color travel, orbit speed, gaze
 *   High: sparks, thin filaments, edge shimmer
 */

import { saturate, makeRandom } from '../core/params.js';

export const BANDS = {
  low: [20, 250],
  mid: [250, 2000],
  high: [2000, 9000],
};

export const AUDIO_SOURCES = ['silence', 'demo', 'live', 'bridge'];

/** The zero signal — silence still gets a slow breath downstream. */
export function silentFrame() {
  return { energy: 0, low: 0, mid: 0, high: 0, beat: 0, presetId: null };
}

/**
 * Deterministic musical demo signal so a test run is reproducible and the
 * entity behaves consistently when nobody is playing anything.
 */
export class DemoSignal {
  constructor({ seed = 0x1f2e3d, bpm = 84 } = {}) {
    this.random = makeRandom(seed);
    this.bpm = bpm;
    this.time = 0;
    this.beatPhase = 0;
    this.phrase = 0;
    /** Sections cycle: calm intro → build → drop → decay. */
    this.sections = [
      { name: 'intro', length: 12, gain: 0.28, bass: 0.35 },
      { name: 'build', length: 14, gain: 0.55, bass: 0.6 },
      { name: 'drop', length: 10, gain: 0.92, bass: 1.0 },
      { name: 'tide', length: 12, gain: 0.45, bass: 0.5 },
    ];
  }

  /** Current section descriptor for the HUD. */
  currentSection() {
    const cycle = this.sections.reduce((sum, s) => sum + s.length, 0);
    let t = this.time % cycle;
    for (const section of this.sections) {
      if (t < section.length) return section;
      t -= section.length;
    }
    return this.sections[0];
  }

  /** @returns {{energy:number,low:number,mid:number,high:number,beat:number,presetId:null,section:string}} */
  step(dt) {
    this.time += dt;
    const section = this.currentSection();
    const beatLength = 60 / this.bpm;
    const beatPhase = (this.time % beatLength) / beatLength;
    const kick = Math.pow(1 - beatPhase, 7);
    this.beatPhase = beatPhase;

    // A slow two-bar swell plus per-beat accents.
    const swell = 0.5 + 0.5 * Math.sin((this.time / (beatLength * 8)) * Math.PI * 2);
    const hat = beatPhase < 0.12 ? 1 : 0;
    const wander = (this.random() - 0.5) * 0.12;

    const low = saturate(section.bass * (0.55 + kick * 0.8) * (0.6 + swell * 0.5) + wander * 0.3);
    const mid = saturate(section.gain * (0.45 + swell * 0.5) + wander);
    const high = saturate(section.gain * (0.3 + hat * 0.45) + wander * 0.5);
    const energy = saturate((low * 0.45 + mid * 0.35 + high * 0.2) * (0.7 + section.gain * 0.5));

    return { energy, low, mid, high, beat: kick > 0.75 ? 1 : 0, presetId: null, section: section.name };
  }

  reset() {
    this.time = 0;
  }
}

/**
 * Live analyser over a MediaStream (microphone, or a captured tab / system
 * audio source). Mirrors WaveScope's `1` key, which taps Windows system audio.
 */
export class LiveAnalyser {
  constructor({ fftSize = 2048, smoothing = 0.75 } = {}) {
    this.fftSize = fftSize;
    this.analyserSmoothing = smoothing;
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.freqData = null;
    this.timeData = null;
    this.ready = false;
    this.error = null;
    /** Adaptive beat detection state. */
    this.beatHistory = [];
    this.beatCooldown = 0;
    this.lastEnergy = 0;
  }

  /**
   * @param {MediaStreamConstraints} [constraints]
   * @param {Object} [opts]
   * @param {MediaStream|null} [opts.stream] Attach to an existing stream
   *        (e.g. from getDisplayMedia tab capture) instead of opening the mic.
   */
  async start(constraints = { audio: true }, opts = {}) {
    const AudioContextClass =
      typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.error = 'Web Audio API unavailable in this browser.';
      this.ready = false;
      return false;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.error = 'Audio capture needs microphone access, which this context does not provide.';
      this.ready = false;
      return false;
    }
    try {
      const stream = opts.stream ?? (await navigator.mediaDevices.getUserMedia(constraints));
      this.stream = stream;
      this.ctx = new AudioContextClass();
      await this.ctx.resume().catch(() => {});
      const source = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = this.fftSize;
      analyser.smoothingTimeConstant = this.analyserSmoothing;
      source.connect(analyser);
      this.analyser = analyser;
      this.source = source;
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      this.timeData = new Uint8Array(analyser.fftSize);
      this.labels = constraints.audio
        ? 'microphone'
        : opts.label ?? 'captured audio';
      this.ready = true;
      this.error = null;
      return true;
    } catch (err) {
      this.error = describeMediaError(err);
      this.ready = false;
      return false;
    }
  }

  /** Band-average the current FFT frame into the three build-kit bands. */
  step(dt) {
    if (!this.ready || !this.analyser) return silentFrame();
    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const nyquist = this.ctx.sampleRate / 2;
    const binHz = nyquist / this.freqData.length;

    const band = ([lo, hi]) => {
      const start = Math.max(0, Math.floor(lo / binHz));
      const end = Math.min(this.freqData.length - 1, Math.ceil(hi / binHz));
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end; i += 1) {
        sum += this.freqData[i];
        count += 1;
      }
      // Slight boost: raw byte averages sit low for music.
      return saturate((count ? sum / count : 0) / 190);
    };

    const low = band(BANDS.low);
    const mid = band(BANDS.mid);
    const high = band(BANDS.high);

    // RMS envelope over the time domain.
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i += 1) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    const energy = saturate(rms * 2.6 * 0.35 + low * 0.35 + mid * 0.2 + high * 0.1);

    // Adaptive beat: energy exceeding the running mean triggers a beat.
    this.beatHistory.push(energy);
    if (this.beatHistory.length > 43) this.beatHistory.shift();
    const mean = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;
    this.beatCooldown = Math.max(0, this.beatCooldown - dt);
    let beat = 0;
    if (this.beatCooldown === 0 && energy > mean * 1.32 && energy > 0.18 && energy > this.lastEnergy) {
      beat = 1;
      this.beatCooldown = 0.22;
    }
    this.lastEnergy = energy;

    return { energy, low, mid, high, beat, presetId: null };
  }

  stop() {
    this.stream?.getTracks?.().forEach((t) => t.stop());
    this.ctx?.close?.().catch(() => {});
    this.ready = false;
    this.stream = null;
    this.analyser = null;
    this.ctx = null;
    this.beatHistory.length = 0;
  }
}

/** Friendly, actionable messages instead of raw DOMException text. */
function describeMediaError(err) {
  const name = err?.name ?? '';
  if (name === 'NotAllowedError') return 'Permission denied — allow microphone access, then try again.';
  if (name === 'NotFoundError') return 'No audio input device found.';
  if (name === 'NotReadableError') return 'Audio device is in use by another application.';
  if (name === 'SecurityError') return 'Blocked by browser security — serve over HTTPS or localhost.';
  return err?.message ?? 'Could not open the audio source.';
}

/**
 * The MilkDrop-Shake adapter boundary (build kit p.5, stage 2).
 *
 * The bridge sends a compact packet — energy, low, mid, high, preset ID, beat
 * trigger — over OSC, WebSocket, or a local plugin. Pick one transport after
 * the display machine is confirmed; here the packet shape is fixed so any
 * transport can be dropped in behind it.
 */
export class BridgeReceiver {
  constructor({ staleAfter = 1.0 } = {}) {
    this.frame = silentFrame();
    this.lastPacketAt = -Infinity;
    this.sinceLastPacket = Infinity;
    this.staleAfter = staleAfter;
    this.time = 0;
    this.packetCount = 0;
    this.presetId = null;
    this.connected = false;
    this.history = [];
  }

  /**
   * Accept one bridge packet. Unknown fields are ignored; every value is
   * clamped so a misbehaving bridge cannot push FuX out of range.
   */
  accept(packet = {}) {
    this.frame = {
      energy: saturate(Number(packet.energy ?? packet.envelope ?? 0)),
      low: saturate(Number(packet.low ?? packet.bass ?? 0)),
      mid: saturate(Number(packet.mid ?? 0)),
      high: saturate(Number(packet.high ?? packet.treble ?? 0)),
      beat: packet.beat ? 1 : 0,
      presetId: packet.presetId ?? packet.preset ?? null,
      presetName: packet.presetName ?? null,
      moodHint: packet.moodHint ?? null,
    };
    this.presetId = this.frame.presetId;
    this.packetCount += 1;
    this.connected = true;
    // Stamp the arrival. Without this the staleness clock never advances and
    // the frame decays away the instant after every packet.
    this.lastPacketAt = this.time;
    this.history.push({ t: this.time, ...this.frame });
    if (this.history.length > 60) this.history.shift();
    return this.frame;
  }

  step(dt) {
    this.time += dt;
    this.sinceLastPacket = this.time - this.lastPacketAt;
    // "Bridge loss returns to idle" (build kit p.10 technical QA): the frame
    // decays instead of freezing at its last value.
    if (this.sinceLastPacket > 0.12) {
      const drop = dt * 1.5;
      this.frame = {
        ...this.frame,
        energy: Math.max(0, this.frame.energy - drop),
        low: Math.max(0, this.frame.low - drop),
        mid: Math.max(0, this.frame.mid - drop),
        high: Math.max(0, this.frame.high - drop),
        beat: 0,
      };
    }
    if (this.sinceLastPacket > this.staleAfter) this.connected = false;
    return this.frame;
  }

  /** Human-readable bridge health for the HUD. */
  status() {
    if (!this.packetCount) return 'no packets';
    const interval = this.sinceLastPacket;
    if (!this.connected) {
      return Number.isFinite(interval) ? `stale (${interval.toFixed(1)}s)` : 'stale';
    }
    const hz = interval > 0.0001 && Number.isFinite(interval) ? 1 / interval : 0;
    return hz > 0 ? `${this.packetCount} packets @ ~${hz.toFixed(0)} Hz` : `${this.packetCount} packets`;
  }

  reset() {
    this.frame = silentFrame();
    this.connected = false;
    this.packetCount = 0;
    this.presetId = null;
    this.lastPacketAt = -Infinity;
    this.sinceLastPacket = Infinity;
    this.history.length = 0;
  }
}

/**
 * WebSocket transport for the bridge. Any adapter — a Python OSC-to-WS shim
 * next to MilkDrop-Shake, a UE5 plugin, a test script — can send the same
 * compact packet and FuX responds.
 */
export class BridgeSocket {
  constructor({ url = '', onStatus = () => {} } = {}) {
    this.url = url;
    this.onStatus = onStatus;
    this.socket = null;
    this.state = 'idle';
    this.error = null;
  }

  connect(url = this.url) {
    this.url = url;
    if (!url) {
      this.error = 'No bridge URL set.';
      this.onStatus(this.state, this.error);
      return false;
    }
    if (this.socket) this.disconnect();
    try {
      this.socket = new WebSocket(url);
      this.state = 'connecting';
    } catch (err) {
      this.state = 'error';
      this.error = err.message;
      this.onStatus(this.state, this.error);
      return false;
    }
    this.socket.addEventListener('open', () => {
      this.state = 'open';
      this.error = null;
      this.onStatus(this.state);
    });
    this.socket.addEventListener('close', () => {
      this.state = 'closed';
      this.onStatus(this.state);
    });
    this.socket.addEventListener('error', () => {
      this.state = 'error';
      this.error = `Could not reach ${this.url}. If it is a plain ws:// endpoint it must be running and reachable from this page.`;
      this.onStatus(this.state, this.error);
    });
    return true;
  }

  /** Wire incoming JSON packets into a BridgeReceiver. */
  attach(receiver) {
    if (!this.socket) return this;
    this.socket.addEventListener('message', (event) => {
      try {
        const packet = JSON.parse(event.data);
        receiver.accept(Array.isArray(packet) ? packet[0] : packet);
      } catch {
        // Ignore malformed frames; the bridge must never break the entity.
      }
    });
    return this;
  }

  disconnect() {
    this.socket?.close?.();
    this.socket = null;
    this.state = 'idle';
    this.onStatus(this.state);
  }
}

/**
 * Routes whichever audio source is active into one signal frame.
 */
export class AudioRouter {
  constructor() {
    this.source = 'demo';
    this.demo = new DemoSignal();
    this.live = new LiveAnalyser();
    this.bridge = new BridgeReceiver();
    this.frame = silentFrame();
    this.section = null;
  }

  setSource(name) {
    if (!AUDIO_SOURCES.includes(name)) return this.source;
    this.source = name;
    if (name !== 'demo') this.demo.reset();
    return this.source;
  }

  step(dt) {
    switch (this.source) {
      case 'silence':
        this.frame = silentFrame();
        this.section = null;
        break;
      case 'live':
        this.frame = this.live.step(dt);
        this.section = 'live input';
        break;
      case 'bridge':
        this.frame = this.bridge.step(dt);
        this.section = this.bridge.presetId ? `preset ${this.bridge.presetId}` : 'bridge';
        break;
      case 'demo':
      default: {
        const f = this.demo.step(dt);
        this.section = f.section;
        this.frame = f;
        break;
      }
    }
    return this.frame;
  }
}
