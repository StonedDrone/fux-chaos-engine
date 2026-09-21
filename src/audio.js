/**
 * FuX Chaos Engine - Web Audio Synthesis System
 * Procedural cyberpunk soundscape, reactive beats, and sound effects.
 * Zero external audio files required - 100% self-contained.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.65;
    this.isInitialized = false;

    // Music nodes
    this.musicGain = null;
    this.sfxGain = null;
    this.filterNode = null;
    this.tempo = 110; // BPM
    this.chaosLevel = 20; // 0 - 100
    this.isPlayingMusic = false;
    this.stepIndex = 0;
    this.timerId = null;

    // Bass & Drone continuous oscillators
    this.droneOsc = null;
    this.droneGain = null;
    this.humOsc = null;
    this.humGain = null;

    // Scale notes for pentatonic cyberpunk melodies
    // F minor pentatonic: F, Ab, Bb, C, Eb
    this.scale = [174.61, 207.65, 233.08, 261.63, 311.13, 349.23, 415.30, 466.16, 523.25];
    this.bassNotes = [43.65, 51.91, 58.27, 65.41]; // Sub-bass
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Music submix
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      // SFX submix
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Filter for ambient mood
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(2400, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(2.5, this.ctx.currentTime);
      this.filterNode.connect(this.musicGain);

      this.isInitialized = true;
      this.startDrone();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  resume() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.resume();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setChaos(level) {
    this.chaosLevel = Math.max(0, Math.min(100, level));
    // Dynamic tempo & filter modulation with chaos
    this.tempo = 100 + (this.chaosLevel / 100) * 45; // 100 - 145 BPM
    if (this.filterNode && this.ctx) {
      const targetFreq = 800 + (this.chaosLevel / 100) * 4500;
      this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.3);
    }
    if (this.humGain && this.ctx) {
      const humVol = 0.05 + (this.chaosLevel / 100) * 0.15;
      this.humGain.gain.setTargetAtTime(this.isMuted ? 0 : humVol, this.ctx.currentTime, 0.2);
    }
  }

  startDrone() {
    if (!this.ctx || this.droneOsc) return;

    // Ambient sub drone
    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'sawtooth';
    this.droneOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 note

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(140, this.ctx.currentTime);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.droneOsc.connect(droneFilter);
    droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.musicGain);
    this.droneOsc.start();

    // Ferrofluid electromagnetic hum
    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = 'sine';
    this.humOsc.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.humGain = this.ctx.createGain();
    this.humGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

    this.humOsc.connect(this.humGain);
    this.humGain.connect(this.musicGain);
    this.humOsc.start();
  }

  startMusic() {
    this.resume();
    if (this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.stepIndex = 0;
    this.scheduleStep();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  scheduleStep() {
    if (!this.isPlayingMusic || !this.ctx) return;

    const stepDuration = 60 / this.tempo / 4; // 16th note in seconds

    // Beat logic
    const step = this.stepIndex % 16;
    const now = this.ctx.currentTime;

    // Kick on 0, 4, 8, 12 (four on the floor) or syncopated in wild state
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      this.triggerKick(now);
    } else if (this.chaosLevel > 60 && (step === 6 || step === 14)) {
      this.triggerKick(now, 0.6);
    }

    // Hi-hat on every 2 steps, extra on high chaos
    if (step % 2 === 0 || this.chaosLevel > 70) {
      this.triggerHihat(now, step % 4 === 2 ? 0.35 : 0.18);
    }

    // Bass note changes every 8 steps
    if (step % 4 === 0) {
      const bassIdx = Math.floor(this.stepIndex / 8) % this.bassNotes.length;
      const freq = this.bassNotes[bassIdx];
      this.triggerBass(now, freq, stepDuration * 3);
    }

    // Melodic synth arpeggios
    if (step % 2 === 0 || (this.chaosLevel > 40 && step % 3 === 0)) {
      const noteIdx = (step * 2 + Math.floor(this.stepIndex / 16)) % this.scale.length;
      const freq = this.scale[noteIdx];
      this.triggerArp(now, freq, stepDuration * 1.5);
    }

    this.stepIndex++;
    this.timerId = setTimeout(() => this.scheduleStep(), stepDuration * 1000);
  }

  triggerKick(time, gainScale = 1.0) {
    if (this.isMuted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

    gain.gain.setValueAtTime(0.55 * gainScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  triggerHihat(time, gainVal = 0.2) {
    if (this.isMuted || !this.ctx) return;
    // Metallic noise burst
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  triggerBass(time, freq, dur) {
    if (this.isMuted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260 + (this.chaosLevel / 100) * 300, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  triggerArp(time, freq, dur) {
    if (this.isMuted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // ===== SOUND EFFECTS =====

  // Radar ping for ICU Hunt
  playPing(intensity = 1.0) {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880 + intensity * 600, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  // Shard found - celestial crystalline arpeggio
  playShardFound() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C major pentatonic high

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  // Magnetic spike eruption sound
  playSpike() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Fast frequency sweep with noise crackle
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Touch ripple on mirror box glass
  playTouchRipple() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Glitch / Barrier hit sound
  playGlitch() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(90, now + 0.04);
    osc.frequency.setValueAtTime(240, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Speed boost whoosh
  playWhoosh() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.4);
    filter.Q.setValueAtTime(3.0, now);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Symbiote Shockwave
  playShockwave() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  // Genesis ceremony birth fanfare
  playGenesisSpawn() {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Heavy sub explosion
    this.triggerKick(now, 1.5);

    // 2. Rising harmonic chorus
    const chord = [220, 277.18, 329.63, 440, 554.37, 659.25, 880];
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.08;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq / 2, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.6);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 1.5);
    });
  }

  // Formant-filtered Symbiotic voice whisper ("Left", "Right", "Surge", "Danger")
  playWhisper(cue = 'surge') {
    this.resume();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Dual formant filter
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.setValueAtTime(7.0, now);

    let startF = 800;
    let endF = 1800;
    if (cue === 'left') {
      startF = 600; endF = 1400;
    } else if (cue === 'right') {
      startF = 1200; endF = 700;
    } else if (cue === 'jump') {
      startF = 400; endF = 2200;
    } else if (cue === 'slide') {
      startF = 1900; endF = 500;
    }

    f1.frequency.setValueAtTime(startF, now);
    f1.frequency.exponentialRampToValueAtTime(endF, now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(f1);
    f1.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.26);
  }
}

// Global singleton instance
window.soundEngine = new SoundEngine();
