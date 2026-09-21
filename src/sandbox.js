/**
 * FuX Chaos Engine - WaveScope / MilkDrop-Shake Interactive Sandbox
 * Matches the audition workflow described in README.md and UE5 build kit.
 */

class ChaosSandbox {
  constructor(canvas) {
    this.canvas = canvas;
    this.entity = new FerrofluidEntity(canvas);
    this.isRunning = true;
    this.time = 0;

    // Mic analysis support
    this.micStream = null;
    this.micAnalyser = null;
    this.micDataArray = null;
    this.isMicActive = false;

    this.bindEvents();
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.entity.resize(w, h);
  }

  bindEvents() {
    this._pointerDown = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.entity.triggerReaction(x, y, 1.0, 'touch');
    };

    this._pointerMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.entity.targetX = x;
      this.entity.targetY = y;
    };

    this.canvas.addEventListener('pointerdown', this._pointerDown);
    this.canvas.addEventListener('pointermove', this._pointerMove);
  }

  destroy() {
    this.isRunning = false;
    this.canvas.removeEventListener('pointerdown', this._pointerDown);
    this.canvas.removeEventListener('pointermove', this._pointerMove);
    this.stopMic();
  }

  async toggleMic() {
    if (this.isMicActive) {
      this.stopMic();
      return false;
    } else {
      return await this.startMic();
    }
  }

  async startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      const ctx = window.soundEngine && window.soundEngine.ctx ? window.soundEngine.ctx : new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 64;
      source.connect(this.micAnalyser);
      this.micDataArray = new Uint8Array(this.micAnalyser.frequencyBinCount);
      this.isMicActive = true;
      return true;
    } catch (e) {
      console.warn('Microphone access denied or unavailable:', e);
      return false;
    }
  }

  stopMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    this.isMicActive = false;
    this.micAnalyser = null;
  }

  update(dt = 0.016) {
    if (!this.isRunning) return;

    // Mic spectrum analysis
    if (this.isMicActive && this.micAnalyser) {
      this.micAnalyser.getByteFrequencyData(this.micDataArray);
      // Low (bins 0-3), Mid (bins 4-12), High (bins 13-31)
      let lowSum = 0, midSum = 0, highSum = 0;
      for (let i = 0; i < 4; i++) lowSum += this.micDataArray[i];
      for (let i = 4; i < 14; i++) midSum += this.micDataArray[i];
      for (let i = 14; i < 32; i++) highSum += this.micDataArray[i];

      const low = lowSum / (4 * 255);
      const mid = midSum / (10 * 255);
      const high = highSum / (18 * 255);
      this.entity.setAudioBands(low, mid, high);
    }

    this.entity.update(dt);
  }

  render() {
    this.entity.render();
  }
}

window.ChaosSandbox = ChaosSandbox;
