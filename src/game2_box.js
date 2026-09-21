/**
 * FuX Chaos Engine - Mini-Game 2: "Magic Mirror Box Genesis"
 * Harmonize the living ferrofluid symbiote inside the neon cube.
 * Balances Low/Mid/High audio frequencies and touch ripples across 4 moods to fire Genesis.
 */

class Game2Box {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onComplete = onComplete;

    this.width = canvas.width;
    this.height = canvas.height;

    // Living ferrofluid entity instance inside the box
    this.entity = new FerrofluidEntity(canvas);

    // Audio Frequency Sliders / Faders (0.0 to 1.0)
    this.bands = {
      low: 0.5,
      mid: 0.5,
      high: 0.5
    };

    // 4 Mood harmonization progression
    this.moodStages = ['calm', 'stirring', 'surging', 'unleashed'];
    this.currentStageIdx = 0;
    this.currentMood = 'calm';

    // Target frequency sweet-spots per mood
    this.stageTargets = {
      calm: { low: [0.2, 0.5], mid: [0.1, 0.4], high: [0.0, 0.3], chaos: 20 },
      stirring: { low: [0.3, 0.6], mid: [0.5, 0.8], high: [0.2, 0.5], chaos: 50 },
      surging: { low: [0.6, 0.9], mid: [0.3, 0.6], high: [0.5, 0.8], chaos: 80 },
      unleashed: { low: [0.7, 1.0], mid: [0.7, 1.0], high: [0.7, 1.0], chaos: 98 }
    };

    // Resonance synchronization progress per mood (0 to 100%)
    this.syncProgress = 0;
    this.isInSync = false;
    this.stageCompleted = [false, false, false, false];

    // Genesis Ceremony triggered state
    this.isGenesisFiring = false;
    this.genesisTimer = 0;
    this.spawnPacketResult = null;

    // Pressure points / hotspots that need to be touched on the glass
    this.hotspots = [];
    this.initHotspots();

    // Input state
    this.activeFader = null;
    this.time = 0;
    this.isRunning = true;

    this.bindEvents();
    this.applyCurrentStage();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.entity.resize(w, h);
  }

  initHotspots() {
    this.hotspots = [];
    const count = 2 + this.currentStageIdx;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = this.entity.baseRadius * 1.35;
      this.hotspots.push({
        x: this.entity.cx + Math.cos(angle) * dist,
        y: this.entity.cy + Math.sin(angle) * dist,
        radius: 24,
        pressure: 1.0,
        soothed: false
      });
    }
  }

  applyCurrentStage() {
    this.currentMood = this.moodStages[this.currentStageIdx];
    this.entity.setMood(this.currentMood);
    this.syncProgress = 0;
    this.initHotspots();
    if (window.soundEngine) {
      window.soundEngine.setChaos(this.stageTargets[this.currentMood].chaos);
    }
  }

  bindEvents() {
    this._pointerDown = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);

      // Check if clicking frequency faders at bottom
      const faderHit = this.checkFaderClick(x, y);
      if (faderHit) {
        this.activeFader = faderHit;
        return;
      }

      // Check if touching a pressure hotspot
      let hitHotspot = false;
      for (const h of this.hotspots) {
        if (!h.soothed) {
          const dx = x - h.x;
          const dy = y - h.y;
          if (Math.sqrt(dx * dx + dy * dy) < h.radius + 15) {
            h.soothed = true;
            hitHotspot = true;
            this.entity.triggerReaction(h.x, h.y, 1.0, 'touch');
            break;
          }
        }
      }

      if (!hitHotspot) {
        this.entity.triggerReaction(x, y, 0.7, 'touch');
      }
    };

    this._pointerMove = (e) => {
      if (!this.activeFader) return;
      const rect = this.canvas.getBoundingClientRect();
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.updateFaderValue(this.activeFader, y);
    };

    this._pointerUp = () => {
      this.activeFader = null;
    };

    this._keyDown = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'q') this.bands.low = Math.min(1.0, this.bands.low + 0.08);
      if (key === 'a') this.bands.low = Math.max(0.0, this.bands.low - 0.08);
      if (key === 'w') this.bands.mid = Math.min(1.0, this.bands.mid + 0.08);
      if (key === 's') this.bands.mid = Math.max(0.0, this.bands.mid - 0.08);
      if (key === 'e') this.bands.high = Math.min(1.0, this.bands.high + 0.08);
      if (key === 'd') this.bands.high = Math.max(0.0, this.bands.high - 0.08);
      if (key === ' ' && this.isGenesisFiring) {
        // Space during genesis
      }
    };

    this.canvas.addEventListener('pointerdown', this._pointerDown);
    window.addEventListener('pointermove', this._pointerMove);
    window.addEventListener('pointerup', this._pointerUp);
    window.addEventListener('keydown', this._keyDown);
  }

  destroy() {
    this.isRunning = false;
    this.canvas.removeEventListener('pointerdown', this._pointerDown);
    window.removeEventListener('pointermove', this._pointerMove);
    window.removeEventListener('pointerup', this._pointerUp);
    window.removeEventListener('keydown', this._keyDown);
  }

  checkFaderClick(x, y) {
    const faderY = this.height - 110;
    const faderH = 75;
    const faders = [
      { id: 'low', x: this.width * 0.28 },
      { id: 'mid', x: this.width * 0.5 },
      { id: 'high', x: this.width * 0.72 }
    ];

    for (const f of faders) {
      if (Math.abs(x - f.x) < 32 && y >= faderY - 10 && y <= faderY + faderH + 10) {
        this.updateFaderValue(f.id, y);
        return f.id;
      }
    }
    return null;
  }

  updateFaderValue(faderId, y) {
    const faderY = this.height - 110;
    const faderH = 75;
    const norm = 1.0 - Math.max(0, Math.min(1, (y - faderY) / faderH));
    this.bands[faderId] = Number(norm.toFixed(2));
  }

  update(dt = 0.016) {
    if (!this.isRunning) return;

    this.time += dt;

    // Feed frequency values into entity
    this.entity.setAudioBands(this.bands.low, this.bands.mid, this.bands.high);
    this.entity.update(dt);

    if (this.isGenesisFiring) {
      this.genesisTimer += dt;
      if (this.genesisTimer > 2.8) {
        this.completeGenesis();
      }
      return;
    }

    // Check if current frequencies match stage target bands
    const target = this.stageTargets[this.currentMood];
    const lowOk = this.bands.low >= target.low[0] && this.bands.low <= target.low[1];
    const midOk = this.bands.mid >= target.mid[0] && this.bands.mid <= target.mid[1];
    const highOk = this.bands.high >= target.high[0] && this.bands.high <= target.high[1];

    // Check hotspots soothed
    const hotspotsOk = this.hotspots.every(h => h.soothed);

    this.isInSync = lowOk && midOk && highOk && hotspotsOk;

    if (this.isInSync) {
      this.syncProgress += dt * 32; // fills up in ~3 seconds of stable sync
      if (this.syncProgress >= 100) {
        this.stageCompleted[this.currentStageIdx] = true;
        this.nextStageOrGenesis();
      }
    } else {
      this.syncProgress = Math.max(0, this.syncProgress - dt * 14);
    }
  }

  nextStageOrGenesis() {
    if (this.currentStageIdx < this.moodStages.length - 1) {
      this.currentStageIdx++;
      if (window.soundEngine) {
        window.soundEngine.playShardFound();
      }
      this.applyCurrentStage();
    } else {
      // All 4 moods harmonized! Trigger Genesis Spawning!
      this.fireGenesisCeremony();
    }
  }

  async fireGenesisCeremony() {
    this.isGenesisFiring = true;
    this.genesisTimer = 0;

    // Unleash entity maximum chaos
    this.entity.setChaos(100);

    if (window.soundEngine) {
      window.soundEngine.playGenesisSpawn();
    }

    // Build authentic canonical on-chain spawn packet
    if (window.fuxProtocol) {
      this.spawnPacketResult = await window.fuxProtocol.buildCanonicalSpawnPacket(98, 'HUNT-NOLA-FQ07');
    }
  }

  completeGenesis() {
    this.isRunning = false;
    if (this.onComplete) {
      this.onComplete({
        spawnPacket: this.spawnPacketResult,
        moodsHarmonized: 4,
        chaosAtSpawn: 98
      });
    }
  }

  render() {
    const ctx = this.ctx;

    // 1. Render Living Ferrofluid Symbiote & Mirror Box
    this.entity.render();

    // 2. Render Pressure Hotspots on Box Glass
    this.drawHotspots(ctx);

    // 3. Render Top Stage Tracker & Sync Bar
    this.drawStageTracker(ctx);

    // 4. Render Frequency Fader Controls (Low, Mid, High)
    this.drawFaders(ctx);

    // 5. Genesis Explosion Effect
    if (this.isGenesisFiring) {
      this.drawGenesisOverlay(ctx);
    }
  }

  drawHotspots(ctx) {
    ctx.save();
    for (const h of this.hotspots) {
      if (h.soothed) continue;

      const pulse = Math.sin(this.time * 6) * 5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff0055';
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 0, 85, 0.2)';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TOUCH', h.x, h.y + 4);
    }
    ctx.restore();
  }

  drawStageTracker(ctx) {
    ctx.save();
    const cx = this.width / 2;

    // Top Panel Header
    ctx.fillStyle = 'rgba(5, 10, 18, 0.85)';
    ctx.fillRect(cx - 240, 15, 480, 96);
    ctx.strokeStyle = this.isInSync ? '#39ff14' : '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 240, 15, 480, 96);

    // Current Mood & Chaos State
    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`MOOD STABILIZER: [ PHASE ${this.currentStageIdx + 1}/4: ${this.currentMood.toUpperCase()} ]`, cx, 34);

    // 4 Mood Phase dots
    this.moodStages.forEach((m, idx) => {
      const dotX = cx - 90 + idx * 60;
      const isDone = this.stageCompleted[idx];
      const isCurrent = idx === this.currentStageIdx;

      ctx.beginPath();
      ctx.arc(dotX, 48, 7, 0, Math.PI * 2);
      ctx.fillStyle = isDone ? '#39ff14' : (isCurrent ? '#00f3ff' : 'rgba(255, 255, 255, 0.2)');
      ctx.fill();

      ctx.font = '9px monospace';
      ctx.fillStyle = isCurrent ? '#00f3ff' : 'rgba(255, 255, 255, 0.4)';
      ctx.fillText(m.toUpperCase().slice(0, 4), dotX, 64);
    });

    // Resonance Synchronization Meter Bar
    const barW = 440;
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(cx - barW / 2, 72, barW, 10);

    const grad = ctx.createLinearGradient(cx - barW / 2, 0, cx + barW / 2, 0);
    grad.addColorStop(0, '#b026ff');
    grad.addColorStop(1, '#39ff14');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - barW / 2, 72, (this.syncProgress / 100) * barW, 10);

    // Guidance prompt
    ctx.fillStyle = this.isInSync ? '#39ff14' : 'rgba(0, 243, 255, 0.85)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const guideText = this.isInSync
      ? 'RESONANCE STABILIZED — SYNCHRONIZING...'
      : 'ALIGN FADERS INSIDE GREEN TARGETS • TOUCH RED HOTSPOTS ON GLASS';
    ctx.fillText(guideText, cx, 102);

    ctx.restore();
  }

  drawFaders(ctx) {
    ctx.save();
    const faderY = this.height - 110;
    const faderH = 75;
    const target = this.stageTargets[this.currentMood];

    const faderDefs = [
      { id: 'low', name: 'LOW (BASS)', val: this.bands.low, target: target.low, key: 'Q / A', x: this.width * 0.28 },
      { id: 'mid', name: 'MID (FLOW)', val: this.bands.mid, target: target.mid, key: 'W / S', x: this.width * 0.5 },
      { id: 'high', name: 'HIGH (SPIKES)', val: this.bands.high, target: target.high, key: 'E / D', x: this.width * 0.72 }
    ];

    for (const f of faderDefs) {
      // Track background
      ctx.fillStyle = 'rgba(5, 10, 18, 0.85)';
      ctx.fillRect(f.x - 30, faderY - 20, 60, faderH + 45);
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
      ctx.strokeRect(f.x - 30, faderY - 20, 60, faderH + 45);

      // Target sweet-spot band
      const targetTopY = faderY + (1 - f.target[1]) * faderH;
      const targetH = (f.target[1] - f.target[0]) * faderH;
      ctx.fillStyle = 'rgba(57, 255, 20, 0.25)';
      ctx.fillRect(f.x - 12, targetTopY, 24, targetH);
      ctx.strokeStyle = '#39ff14';
      ctx.strokeRect(f.x - 12, targetTopY, 24, targetH);

      // Track slot line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x, faderY);
      ctx.lineTo(f.x, faderY + faderH);
      ctx.stroke();

      // Fader Handle
      const handleY = faderY + (1 - f.val) * faderH;
      const isTargetOk = f.val >= f.target[0] && f.val <= f.target[1];

      ctx.shadowBlur = 12;
      ctx.shadowColor = isTargetOk ? '#39ff14' : '#00f3ff';
      ctx.fillStyle = isTargetOk ? '#39ff14' : '#00f3ff';
      ctx.fillRect(f.x - 18, handleY - 6, 36, 12);

      // Labels
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.name, f.x, faderY - 6);
      ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
      ctx.font = '8px monospace';
      ctx.fillText(f.key, f.x, faderY + faderH + 16);
    }

    ctx.restore();
  }

  drawGenesisOverlay(ctx) {
    ctx.save();
    // Radiant burst
    const flashAlpha = Math.min(1.0, this.genesisTimer * 0.4);
    ctx.fillStyle = `rgba(176, 38, 255, ${flashAlpha * 0.4})`;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#39ff14';
    ctx.fillText('GENESIS SPAWN INITIATED — FUX AWAKENED', this.width / 2, this.height / 2 - 30);

    ctx.fillStyle = '#00f3ff';
    ctx.font = '13px monospace';
    ctx.fillText('ANCHORING SOLANA PDA & ARWEAVE PROTOCOL PACKET...', this.width / 2, this.height / 2 + 10);

    ctx.restore();
  }
}

window.Game2Box = Game2Box;
