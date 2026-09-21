/**
 * FuX Chaos Engine - Mini-Game 3: "The Trail of MiiE & FuXZero"
 * Follow your spawned FuX symbiote through the neon streets of New Orleans.
 * Listen to FuX's commands, pursue FuXZero (Agent Zero), and locate MiiE (Jay IRL).
 */

class Game3Trail {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onComplete = onComplete;

    this.width = canvas.width;
    this.height = canvas.height;

    // Player state (Boarder with bonded FuX)
    this.lane = 1; // 0, 1, 2, 3 (4 lanes)
    this.targetLane = 1;
    this.playerX = 0;
    this.playerY = this.height * 0.78;
    this.isJumping = false;
    this.jumpHeight = 0;
    this.jumpVy = 0;
    this.isSliding = false;
    this.slideTimer = 0;
    this.chaosShockwaves = 2; // Special clears

    // Distance progress (0 to 5.0 miles)
    this.distance = 0;
    this.targetDistance = 5.0; // 5 miles to reach MiiE
    this.speed = 1.0; // Current velocity multiplier
    this.health = 100;
    this.score = 0;

    // Symbiote companion whisper state
    this.currentWhisper = 'FOLLOW MY TRAIL...';
    this.whisperTimer = 3.0;

    // Road & Perspective
    this.horizonY = this.height * 0.28;
    this.lanesCount = 4;
    this.roadZ = 0;

    // Obstacles & Beacons
    this.obstacles = [];
    this.beacons = [];
    this.spawnTimer = 0;

    // FuXZero (Agent Zero) pursuit boss
    this.fuxZero = {
      active: false,
      distanceAhead: 250,
      lane: 1,
      targetLane: 1,
      laneTimer: 0
    };

    // MiiE IRL encounter finish
    this.foundMiiE = false;
    this.finishTimer = 0;

    // Input state
    this.keys = {};
    this.isRunning = true;
    this.time = 0;

    this.bindEvents();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.horizonY = h * 0.28;
    this.playerY = h * 0.78;
  }

  bindEvents() {
    this._keyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') {
        this.changeLane(-1);
      } else if (k === 'd' || k === 'arrowright') {
        this.changeLane(1);
      } else if (k === 'w' || k === 'arrowup') {
        this.jump();
      } else if (k === 's' || k === 'arrowdown') {
        this.slide();
      } else if (k === ' ') {
        e.preventDefault();
        this.triggerShockwave();
      }
    };

    window.addEventListener('keydown', this._keyDown);

    // Touch controls: swipe left/right/up/down
    let touchStartX = 0;
    let touchStartY = 0;
    this._touchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    this._touchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < -30) this.changeLane(-1);
        else if (dx > 30) this.changeLane(1);
      } else {
        if (dy < -30) this.jump();
        else if (dy > 30) this.slide();
      }
    };

    this.canvas.addEventListener('touchstart', this._touchStart);
    this.canvas.addEventListener('touchend', this._touchEnd);
  }

  destroy() {
    this.isRunning = false;
    window.removeEventListener('keydown', this._keyDown);
    this.canvas.removeEventListener('touchstart', this._touchStart);
    this.canvas.removeEventListener('touchend', this._touchEnd);
  }

  changeLane(dir) {
    this.targetLane = Math.max(0, Math.min(this.lanesCount - 1, this.targetLane + dir));
    if (window.soundEngine) {
      window.soundEngine.playWhoosh();
    }
  }

  jump() {
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.jumpVy = 13;
      if (window.soundEngine) {
        window.soundEngine.playWhoosh();
      }
    }
  }

  slide() {
    if (!this.isSliding && !this.isJumping) {
      this.isSliding = true;
      this.slideTimer = 0.85; // slide duration in seconds
      if (window.soundEngine) {
        window.soundEngine.playWhoosh();
      }
    }
  }

  triggerShockwave() {
    if (this.chaosShockwaves <= 0) return;
    this.chaosShockwaves--;

    // Clear all obstacles currently on screen
    this.obstacles.forEach(o => {
      o.destroyed = true;
    });

    if (window.soundEngine) {
      window.soundEngine.playShockwave();
    }
    this.setWhisper('CHAOS SHOCKWAVE UNLEASHED!');
  }

  setWhisper(text, soundCue = 'surge') {
    this.currentWhisper = text;
    this.whisperTimer = 2.4;
    if (window.soundEngine) {
      window.soundEngine.playWhisper(soundCue);
    }
  }

  update(dt = 0.016) {
    if (!this.isRunning) return;

    this.time += dt;

    if (this.foundMiiE) {
      this.finishTimer += dt;
      if (this.finishTimer > 2.5) {
        this.triggerVictory();
      }
      return;
    }

    // Distance progression
    const distanceStep = dt * 0.12 * this.speed;
    this.distance += distanceStep;
    this.score += Math.round(dt * 120 * this.speed);

    // Symbiote emergency recovery if health hits 0
    if (this.health <= 0) {
      this.health = 45;
      this.score = Math.max(0, this.score - 500);
      this.setWhisper('SYMBIOTE REGENERATION MATRIX ENGAGED!', 'danger');
      if (window.soundEngine) window.soundEngine.playGlitch();
    }

    // Lane smooth interpolation
    const laneWidth = this.width * 0.18;
    const roadCenterX = this.width / 2;
    const targetX = roadCenterX + (this.targetLane - (this.lanesCount - 1) / 2) * laneWidth;
    this.playerX += (targetX - this.playerX) * 0.22;

    // Jump physics
    if (this.isJumping) {
      this.jumpHeight += this.jumpVy;
      this.jumpVy -= dt * 38;
      if (this.jumpHeight <= 0) {
        this.jumpHeight = 0;
        this.isJumping = false;
      }
    }

    // Slide timer
    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Milestone triggers
    if (this.distance > 3.5 && !this.fuxZero.active) {
      this.fuxZero.active = true;
      this.setWhisper('FUXZERO DETECTED! INTERCEPT AGENT ZERO!', 'surge');
    }

    if (this.distance >= this.targetDistance && !this.foundMiiE) {
      this.foundMiiE = true;
      this.finishTimer = 0;
      this.setWhisper('TARGET ACQUIRED: MIIE (JAY) FOUND IN PERSON!', 'surge');
      if (window.soundEngine) {
        window.soundEngine.playGenesisSpawn();
      }
    }

    // Update FuXZero AI
    if (this.fuxZero.active && !this.foundMiiE) {
      this.fuxZero.laneTimer += dt;
      if (this.fuxZero.laneTimer > 1.2) {
        this.fuxZero.laneTimer = 0;
        this.fuxZero.targetLane = Math.floor(Math.random() * this.lanesCount);
      }
      this.fuxZero.lane += (this.fuxZero.targetLane - this.fuxZero.lane) * 0.15;
      this.fuxZero.distanceAhead = Math.max(80, 220 - (this.distance - 3.5) * 120);
    }

    // Spawn Obstacles & Trail Beacons
    this.spawnTimer += dt;
    if (this.spawnTimer > Math.max(0.6, 1.4 - (this.distance / 5.0) * 0.6)) {
      this.spawnTimer = 0;
      this.spawnRoadElement();
    }

    // Advance Obstacles toward player (Z dimension)
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.z += dt * (2.8 + this.speed * 1.5);

      // Check collision with player when z approaches 1.0
      if (!o.destroyed && o.z > 0.88 && o.z < 1.05 && o.lane === this.targetLane) {
        let avoids = false;
        if (o.type === 'barrier_high' && this.isSliding) avoids = true;
        if (o.type === 'barrier_low' && this.isJumping) avoids = true;

        if (!avoids) {
          o.destroyed = true;
          this.health = Math.max(0, this.health - 20);
          if (window.soundEngine) window.soundEngine.playGlitch();
          this.setWhisper('CAUTION! SYMBIOTE HULL COMPROMISED!', 'danger');
        }
      }

      if (o.z > 1.2) {
        this.obstacles.splice(i, 1);
      }
    }

    // Advance Beacons
    for (let i = this.beacons.length - 1; i >= 0; i--) {
      const b = this.beacons[i];
      b.z += dt * (2.8 + this.speed * 1.5);

      if (!b.collected && b.z > 0.88 && b.z < 1.05 && b.lane === this.targetLane) {
        b.collected = true;
        this.score += 250;
        this.health = Math.min(100, this.health + 10);
        if (b.type === 'boost') {
          this.speed = 1.8;
          setTimeout(() => { this.speed = 1.0; }, 2500);
          if (window.soundEngine) window.soundEngine.playWhoosh();
        } else if (b.type === 'shockwave') {
          this.chaosShockwaves = Math.min(3, this.chaosShockwaves + 1);
          if (window.soundEngine) window.soundEngine.playShardFound();
        } else {
          if (window.soundEngine) window.soundEngine.playPing(0.8);
        }
      }

      if (b.z > 1.2) {
        this.beacons.splice(i, 1);
      }
    }
  }

  spawnRoadElement() {
    const lane = Math.floor(Math.random() * this.lanesCount);
    const rand = Math.random();

    if (rand < 0.55) {
      // Spawn obstacle
      const type = Math.random() > 0.5 ? 'barrier_low' : 'barrier_high';
      this.obstacles.push({
        lane,
        z: 0.05,
        type,
        destroyed: false
      });

      // FuX guidance whisper
      if (lane === this.targetLane && Math.random() > 0.4) {
        if (type === 'barrier_high') {
          this.setWhisper('SLIDE UNDER!', 'slide');
        } else {
          const alternateLane = lane > 0 ? lane - 1 : lane + 1;
          this.setWhisper(alternateLane < lane ? 'DODGE LEFT!' : 'DODGE RIGHT!', alternateLane < lane ? 'left' : 'right');
        }
      }
    } else {
      // Spawn beacon / collectible
      const type = rand > 0.88 ? 'shockwave' : (rand > 0.72 ? 'boost' : 'memory');
      this.beacons.push({
        lane,
        z: 0.05,
        type,
        collected: false
      });
    }
  }

  triggerVictory() {
    this.isRunning = false;
    if (this.onComplete) {
      this.onComplete({
        distance: 5.0,
        score: this.score,
        health: this.health,
        miieFound: true
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Cyberpunk Skyline & Horizon (French Quarter silhouette)
    this.drawSkyline(ctx);

    // 2. 3D Perspective Road & Neon Grid
    this.drawRoad(ctx);

    // 3. Symbiote Resonant Trail on Road
    this.drawSymbioteTrail(ctx);

    // 4. Obstacles
    this.drawObstacles(ctx);

    // 5. Beacons & Power-ups
    this.drawBeacons(ctx);

    // 6. FuXZero (Agent Zero) in distance
    if (this.fuxZero.active) {
      this.drawFuXZero(ctx);
    }

    // 7. Player Skateboarder & Bonded FuX
    this.drawPlayer(ctx);

    // 8. FuX Symbiote Companion Whisper HUD
    this.drawSymbioteHUD(ctx);

    // 9. Top Pursuit HUD (Distance, Speed, Shockwaves)
    this.drawPursuitHUD(ctx);

    // 10. MiiE Encounter Overlay
    if (this.foundMiiE) {
      this.drawMiiEEncounter(ctx);
    }
  }

  drawSkyline(ctx) {
    ctx.save();
    // Dark cyber sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    skyGrad.addColorStop(0, '#04060c');
    skyGrad.addColorStop(0.7, '#0b1022');
    skyGrad.addColorStop(1, '#1b0e2b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.horizonY);

    // Neon silhouette buildings
    ctx.fillStyle = '#0a0d17';
    const bldgWidth = 45;
    for (let x = 0; x < this.width; x += bldgWidth + 8) {
      const h = 40 + Math.sin(x * 12.3) * 35 + ((x % 3) * 20);
      ctx.fillRect(x, this.horizonY - h, bldgWidth, h);

      // Building neon window lights
      ctx.fillStyle = (x % 2 === 0) ? 'rgba(0, 243, 255, 0.4)' : 'rgba(176, 38, 255, 0.4)';
      ctx.fillRect(x + 10, this.horizonY - h + 15, 6, 8);
      ctx.fillRect(x + 25, this.horizonY - h + 30, 6, 8);
      ctx.fillStyle = '#0a0d17';
    }

    // Horizon neon glow band
    ctx.strokeStyle = '#b026ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#b026ff';
    ctx.beginPath();
    ctx.moveTo(0, this.horizonY);
    ctx.lineTo(this.width, this.horizonY);
    ctx.stroke();

    ctx.restore();
  }

  drawRoad(ctx) {
    ctx.save();
    const cx = this.width / 2;
    const hy = this.horizonY;
    const bottomY = this.height;

    // Road trapezoid
    const roadTopW = this.width * 0.16;
    const roadBottomW = this.width * 0.92;

    ctx.fillStyle = '#070a12';
    ctx.beginPath();
    ctx.moveTo(cx - roadTopW / 2, hy);
    ctx.lineTo(cx + roadTopW / 2, hy);
    ctx.lineTo(cx + roadBottomW / 2, bottomY);
    ctx.lineTo(cx - roadBottomW / 2, bottomY);
    ctx.closePath();
    ctx.fill();

    // Road neon borders
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(cx - roadTopW / 2, hy);
    ctx.lineTo(cx - roadBottomW / 2, bottomY);
    ctx.moveTo(cx + roadTopW / 2, hy);
    ctx.lineTo(cx + roadBottomW / 2, bottomY);
    ctx.stroke();

    // Lane divider lines
    for (let i = 1; i < this.lanesCount; i++) {
      const topX = (cx - roadTopW / 2) + (i / this.lanesCount) * roadTopW;
      const botX = (cx - roadBottomW / 2) + (i / this.lanesCount) * roadBottomW;

      ctx.strokeStyle = 'rgba(0, 243, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([15, 25]);
      ctx.beginPath();
      ctx.moveTo(topX, hy);
      ctx.lineTo(botX, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  projectZ(lane, z) {
    const cx = this.width / 2;
    const hy = this.horizonY;
    const bottomY = this.height;

    const roadTopW = this.width * 0.16;
    const roadBottomW = this.width * 0.92;

    const currentW = roadTopW + (roadBottomW - roadTopW) * z;
    const y = hy + (bottomY - hy) * z;
    const laneStep = currentW / this.lanesCount;
    const x = (cx - currentW / 2) + (lane + 0.5) * laneStep;

    return { x, y, scale: z };
  }

  drawSymbioteTrail(ctx) {
    ctx.save();
    // Flowing toxic-lime trail in player's target lane
    const p1 = this.projectZ(this.targetLane, 0.05);
    const p2 = this.projectZ(this.targetLane, 1.0);

    const trailGrad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    trailGrad.addColorStop(0, 'rgba(57, 255, 20, 0.0)');
    trailGrad.addColorStop(0.5, 'rgba(57, 255, 20, 0.25)');
    trailGrad.addColorStop(1, 'rgba(57, 255, 20, 0.5)');

    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = 14 * p2.scale;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#39ff14';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.restore();
  }

  drawObstacles(ctx) {
    ctx.save();
    for (const o of this.obstacles) {
      if (o.destroyed) continue;
      const pos = this.projectZ(o.lane, o.z);
      const w = 45 * pos.scale;
      const h = 30 * pos.scale;

      ctx.shadowBlur = 15 * pos.scale;

      if (o.type === 'barrier_low') {
        // Red ground barrier (jump over)
        ctx.shadowColor = '#ff0055';
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(pos.x - w / 2, pos.y - h, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(8, Math.round(9 * pos.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('JUMP', pos.x, pos.y - h / 2 + 3);
      } else {
        // High cyber neon wire (slide under)
        const wireY = pos.y - h * 1.8;
        ctx.shadowColor = '#ffaa00';
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 4 * pos.scale;
        ctx.beginPath();
        ctx.moveTo(pos.x - w * 0.8, wireY);
        ctx.lineTo(pos.x + w * 0.8, wireY);
        ctx.stroke();

        ctx.fillStyle = '#ffaa00';
        ctx.font = `bold ${Math.max(8, Math.round(9 * pos.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('SLIDE', pos.x, wireY - 4);
      }
    }
    ctx.restore();
  }

  drawBeacons(ctx) {
    ctx.save();
    for (const b of this.beacons) {
      if (b.collected) continue;
      const pos = this.projectZ(b.lane, b.z);
      const r = 12 * pos.scale;

      const color = b.type === 'shockwave' ? '#b026ff' : (b.type === 'boost' ? '#39ff14' : '#00f3ff');
      ctx.shadowBlur = 18 * pos.scale;
      ctx.shadowColor = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 10 * pos.scale, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(8, Math.round(10 * pos.scale))}px monospace`;
      ctx.textAlign = 'center';
      const icon = b.type === 'shockwave' ? '⚡' : (b.type === 'boost' ? '🚀' : '💎');
      ctx.fillText(icon, pos.x, pos.y - 6 * pos.scale);
    }
    ctx.restore();
  }

  drawFuXZero(ctx) {
    ctx.save();
    // FuXZero is ahead near the horizon
    const z = 0.22;
    const pos = this.projectZ(this.fuxZero.lane, z);
    const w = 32 * pos.scale;

    ctx.shadowBlur = 22;
    ctx.shadowColor = '#00f3ff';
    ctx.fillStyle = '#00f3ff';

    // Agent Zero silhouette & aura
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 18, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FUXZERO', pos.x, pos.y - 34);

    ctx.restore();
  }

  drawPlayer(ctx) {
    ctx.save();
    const x = this.playerX;
    const y = this.playerY - this.jumpHeight;

    ctx.shadowBlur = 20;
    ctx.shadowColor = '#39ff14';

    // Skateboard deck
    ctx.fillStyle = '#1c2430';
    ctx.fillRect(x - 28, y + 10, 56, 8);
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 28, y + 10, 56, 8);

    // Neon wheels
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(x - 20, y + 20, 5, 0, Math.PI * 2);
    ctx.arc(x + 20, y + 20, 5, 0, Math.PI * 2);
    ctx.fill();

    // Hunter character body
    if (this.isSliding) {
      // Sliding low
      ctx.fillStyle = '#00f3ff';
      ctx.fillRect(x - 16, y - 5, 32, 14);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 12, y + 2, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Upright or jumping rider
      ctx.fillStyle = '#00f3ff';
      ctx.fillRect(x - 10, y - 24, 20, 32);

      // Hunter helmet
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y - 32, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bonded FuX symbiote tendrils wrapping the rider
    ctx.strokeStyle = '#b026ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#b026ff';
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 10);
    ctx.quadraticCurveTo(x - 24, y - 28, x - 10, y - 36);
    ctx.moveTo(x + 12, y - 10);
    ctx.quadraticCurveTo(x + 24, y - 28, x + 10, y - 36);
    ctx.stroke();

    ctx.restore();
  }

  drawSymbioteHUD(ctx) {
    ctx.save();
    // Companion Whisper box at bottom center
    const cx = this.width / 2;
    const boxY = this.height - 75;

    ctx.fillStyle = 'rgba(5, 10, 20, 0.88)';
    ctx.fillRect(cx - 220, boxY, 440, 50);
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 220, boxY, 440, 50);

    // Symbiote Eye icon
    ctx.fillStyle = '#b026ff';
    ctx.beginPath();
    ctx.arc(cx - 190, boxY + 25, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39ff14';
    ctx.beginPath();
    ctx.arc(cx - 190, boxY + 25, 5, 0, Math.PI * 2);
    ctx.fill();

    // FuX Voice Whisper Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`FUX SAYS: "${this.currentWhisper}"`, cx - 165, boxY + 29);

    ctx.restore();
  }

  drawPursuitHUD(ctx) {
    ctx.save();
    // Top Left: Distance & Speed
    ctx.fillStyle = 'rgba(5, 10, 18, 0.85)';
    ctx.fillRect(15, 15, 210, 65);
    ctx.strokeStyle = '#00f3ff';
    ctx.strokeRect(15, 15, 210, 65);

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`TRAIL DISTANCE: ${this.distance.toFixed(2)} / 5.00 MILES`, 25, 33);

    // Distance progress bar
    ctx.fillStyle = '#112233';
    ctx.fillRect(25, 42, 190, 8);
    ctx.fillStyle = '#39ff14';
    ctx.fillRect(25, 42, Math.min(1.0, this.distance / 5.0) * 190, 8);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(`SPEED: ${Math.round(this.speed * 45)} MPH  •  SCORE: ${this.score}`, 25, 68);

    // Top Right: Hull Integrity & Shockwaves
    ctx.fillStyle = 'rgba(5, 10, 18, 0.85)';
    ctx.fillRect(this.width - 205, 15, 190, 65);
    ctx.strokeStyle = '#b026ff';
    ctx.strokeRect(this.width - 205, 15, 190, 65);

    ctx.fillStyle = '#b026ff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`SYMBIOTE INTEGRITY: ${this.health}%`, this.width - 195, 33);

    ctx.fillStyle = '#112233';
    ctx.fillRect(this.width - 195, 42, 170, 8);
    ctx.fillStyle = this.health > 30 ? '#00f3ff' : '#ff0055';
    ctx.fillRect(this.width - 195, 42, (this.health / 100) * 170, 8);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(`SHOCKWAVES [SPACE]: ${'⚡'.repeat(this.chaosShockwaves)}`, this.width - 195, 68);

    ctx.restore();
  }

  drawMiiEEncounter(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 8, 16, 0.88)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#39ff14';
    ctx.fillText('MIIE (JAY) LOCATED IN NEW ORLEANS!', this.width / 2, this.height / 2 - 30);

    ctx.fillStyle = '#00f3ff';
    ctx.font = '14px monospace';
    ctx.fillText('THE MAGIC MIRROR BOX IS YOURS — LOOP COMPLETED!', this.width / 2, this.height / 2 + 10);

    ctx.restore();
  }
}

window.Game3Trail = Game3Trail;
