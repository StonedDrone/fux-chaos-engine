/**
 * FuX Chaos Engine - Mini-Game 1: "ICU AR Shard Hunt"
 * An Augmented Reality fragment hunt through the New Orleans cyber-grid.
 * Objective: Find and calibrate all 7 shards to unlock the Genesis Ceremony.
 */

class Game1Hunt {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onComplete = onComplete;

    this.width = canvas.width;
    this.height = canvas.height;

    // Player (Hunter) state
    this.player = {
      x: this.width * 0.5,
      y: this.height * 0.7,
      vx: 0,
      vy: 0,
      speed: 4.5,
      radius: 14,
      heading: 0,
      battery: 100,
      shield: 100,
      isJammed: false,
      jamTimer: 0
    };

    // Input state
    this.keys = {};
    this.mouseTarget = null;

    // World sectors (New Orleans French Quarter map layout)
    this.sectors = [
      { name: 'Jackson Square', x: 0.5, y: 0.35, r: 85 },
      { name: 'Bourbon St Cyber-Alley', x: 0.28, y: 0.55, r: 90 },
      { name: 'Royal St Art Grid', x: 0.45, y: 0.65, r: 80 },
      { name: 'Mississippi Riverwalk', x: 0.75, y: 0.45, r: 100 },
      { name: 'Canal St Commercial Node', x: 0.22, y: 0.8, r: 75 },
      { name: 'Frenchmen St Sound Lab', x: 0.78, y: 0.75, r: 85 },
      { name: 'Treme Voodoo Gateway', x: 0.5, y: 0.15, r: 80 }
    ];

    // The 7 Shards placed across the sectors
    this.shards = [];
    this.initShards();

    // Radar scanning pulse
    this.pulses = [];
    this.lastPingTime = 0;

    // Nullifier Patrol Drones
    this.drones = [];
    this.initDrones();

    // Chaos Glitch Anomalies
    this.anomalies = [];
    this.initAnomalies();

    // Pickups (Energy Batteries)
    this.batteries = [];
    this.initBatteries();

    // Extraction mini-puzzle state
    this.activeExtractShard = null;
    this.extractProgress = 0;
    this.extractTargetAngle = 0;
    this.extractCurrentAngle = 0;
    this.extractSpeed = 0.05;

    // Game state
    this.isRunning = true;
    this.chaosLevel = 25;
    this.score = 0;
    this.timeElapsed = 0;

    this.bindEvents();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  initShards() {
    const shardDefs = (window.SHARD_DEFINITIONS && window.SHARD_DEFINITIONS.length > 0)
      ? window.SHARD_DEFINITIONS
      : [
          { id: 'board', name: 'Board', color: '#00f3ff' },
          { id: 'grip', name: 'Grip', color: '#39ff14' },
          { id: 'trux', name: 'TruX', color: '#b026ff' },
          { id: 'hubs', name: 'Hubs', color: '#00f3ff' },
          { id: 'core', name: 'Core', color: '#b026ff' },
          { id: 'ar', name: 'aR', color: '#39ff14' },
          { id: 'aura', name: 'Aura', color: '#e056fd' }
        ];

    this.shards = shardDefs.map((def, idx) => {
      const sector = this.sectors[idx % this.sectors.length];
      const offsetDist = Math.random() * (sector.r * 0.7);
      const offsetAngle = Math.random() * Math.PI * 2;

      return {
        ...def,
        x: sector.x * this.width + Math.cos(offsetAngle) * offsetDist,
        y: sector.y * this.height + Math.sin(offsetAngle) * offsetDist,
        found: false,
        revealed: false,
        pulseRadius: 0,
        revealTimer: 0,
        sectorName: sector.name
      };
    });
  }

  initDrones() {
    this.drones = [
      { x: this.width * 0.3, y: this.height * 0.4, vx: 1.5, vy: 0.8, angle: 0, scanAngle: 0, range: 110, fov: 0.8 },
      { x: this.width * 0.7, y: this.height * 0.6, vx: -1.2, vy: 1.1, angle: Math.PI, scanAngle: 0, range: 120, fov: 0.75 },
      { x: this.width * 0.5, y: this.height * 0.25, vx: -0.9, vy: -1.0, angle: Math.PI / 2, scanAngle: 0, range: 100, fov: 0.9 }
    ];
  }

  initAnomalies() {
    this.anomalies = [
      { x: this.width * 0.4, y: this.height * 0.5, r: 28, vx: 0.6, vy: -0.4, phase: 0 },
      { x: this.width * 0.65, y: this.height * 0.35, r: 35, vx: -0.5, vy: 0.7, phase: 2 }
    ];
  }

  initBatteries() {
    this.batteries = [
      { x: this.width * 0.2, y: this.height * 0.3, active: true },
      { x: this.width * 0.8, y: this.height * 0.3, active: true },
      { x: this.width * 0.4, y: this.height * 0.8, active: true },
      { x: this.width * 0.6, y: this.height * 0.85, active: true }
    ];
  }

  bindEvents() {
    this._keyDownHandler = (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerPing();
        if (this.activeExtractShard) {
          this.attemptExtract();
        }
      }
    };
    this._keyUpHandler = (e) => {
      this.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);

    this._clickHandler = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.mouseTarget = { x, y };

      if (this.activeExtractShard) {
        this.attemptExtract();
      } else {
        this.triggerPing();
      }
    };

    this.canvas.addEventListener('pointerdown', this._clickHandler);
  }

  destroy() {
    this.isRunning = false;
    window.removeEventListener('keydown', this._keyDownHandler);
    window.removeEventListener('keyup', this._keyUpHandler);
    this.canvas.removeEventListener('pointerdown', this._clickHandler);
  }

  triggerPing() {
    if (this.player.battery <= 2) return;
    this.player.battery = Math.max(0, this.player.battery - 4);

    this.pulses.push({
      x: this.player.x,
      y: this.player.y,
      radius: 10,
      maxRadius: 280,
      speed: 8
    });

    if (window.soundEngine) {
      window.soundEngine.playPing(1.0);
    }
  }

  update(dt = 0.016) {
    if (!this.isRunning) return;

    this.timeElapsed += dt;
    this.chaosLevel = 25 + Math.min(65, (this.timeElapsed / 60) * 40);

    // Battery slow recharge
    if (this.player.battery < 100) {
      this.player.battery += dt * 3.5;
    }

    // Shield emergency reboot if depleted
    if (this.player.shield <= 0) {
      this.player.shield = 40;
      this.player.isJammed = true;
      this.player.jamTimer = 2.0;
      if (window.soundEngine) window.soundEngine.playGlitch();
    }

    // Extract puzzle animation
    if (this.activeExtractShard) {
      this.extractCurrentAngle += this.extractSpeed;
      if (this.extractCurrentAngle > Math.PI * 2) {
        this.extractCurrentAngle -= Math.PI * 2;
      }
      return; // Freeze hunter during calibration
    }

    // Hunter Movement
    let moveX = 0;
    let moveY = 0;

    if (this.keys['w'] || this.keys['arrowup']) moveY -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) moveY += 1;
    if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
    if (this.keys['d'] || this.keys['arrowright']) moveX += 1;

    if (this.mouseTarget) {
      const dx = this.mouseTarget.x - this.player.x;
      const dy = this.mouseTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 15) {
        moveX = dx / dist;
        moveY = dy / dist;
      } else {
        this.mouseTarget = null;
      }
    }

    const currentSpeed = this.player.isJammed ? this.player.speed * 0.45 : this.player.speed;
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      this.player.x += (moveX / len) * currentSpeed;
      this.player.y += (moveY / len) * currentSpeed;
      this.player.heading = Math.atan2(moveY, moveX);
    }

    // Boundary constraints
    this.player.x = Math.max(30, Math.min(this.width - 30, this.player.x));
    this.player.y = Math.max(30, Math.min(this.height - 30, this.player.y));

    // Update pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.radius += p.speed;

      // Reveal shards within pulse wave
      for (const s of this.shards) {
        if (s.found) continue;
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dist - p.radius) < 25) {
          s.revealed = true;
          s.revealTimer = 5.0; // stays visible for 5s
        }
      }

      if (p.radius >= p.maxRadius) {
        this.pulses.splice(i, 1);
      }
    }

    // Update Shards & check player collision for calibration
    let nearestDist = 9999;
    for (const s of this.shards) {
      if (s.found) continue;
      if (s.revealTimer > 0) s.revealTimer -= dt;
      if (s.revealTimer <= 0) s.revealed = false;

      const dx = s.x - this.player.x;
      const dy = s.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) nearestDist = dist;

      // Trigger calibration when touching shard node
      if (dist < 32 && !this.activeExtractShard) {
        this.startExtraction(s);
      }
    }

    // Periodic radar audio ping based on proximity to closest shard
    if (this.timeElapsed - this.lastPingTime > Math.max(0.4, nearestDist / 350)) {
      this.lastPingTime = this.timeElapsed;
      if (window.soundEngine && nearestDist < 300) {
        window.soundEngine.playPing(Math.max(0, 1 - nearestDist / 300));
      }
    }

    // Update Drones
    for (const d of this.drones) {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 50 || d.x > this.width - 50) d.vx *= -1;
      if (d.y < 50 || d.y > this.height - 50) d.vy *= -1;

      d.angle = Math.atan2(d.vy, d.vx);
      d.scanAngle += dt * 1.5;

      // Check if player is caught in cone
      const pdx = this.player.x - d.x;
      const pdy = this.player.y - d.y;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pdist < d.range) {
        const toPlayerAngle = Math.atan2(pdy, pdx);
        let diff = Math.abs(toPlayerAngle - (d.angle + Math.sin(d.scanAngle) * 0.4));
        if (diff > Math.PI) diff = Math.PI * 2 - diff;

        if (diff < d.fov * 0.5) {
          // Hunter detected by nullifier drone!
          this.player.isJammed = true;
          this.player.jamTimer = 2.5;
          this.player.battery = Math.max(0, this.player.battery - dt * 25);
          if (window.soundEngine) window.soundEngine.playGlitch();
        }
      }
    }

    // Update Chaos Anomalies
    for (const a of this.anomalies) {
      a.x += a.vx;
      a.y += a.vy;
      a.phase += dt * 3;
      if (a.x < 60 || a.x > this.width - 60) a.vx *= -1;
      if (a.y < 60 || a.y > this.height - 60) a.vy *= -1;

      const adx = this.player.x - a.x;
      const ady = this.player.y - a.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < a.r + this.player.radius) {
        this.player.shield = Math.max(0, this.player.shield - dt * 20);
        if (window.soundEngine) window.soundEngine.playGlitch();
      }
    }

    // Battery pickups
    for (const b of this.batteries) {
      if (!b.active) continue;
      const bdx = this.player.x - b.x;
      const bdy = this.player.y - b.y;
      if (Math.sqrt(bdx * bdx + bdy * bdy) < 25) {
        b.active = false;
        this.player.battery = 100;
        this.player.shield = Math.min(100, this.player.shield + 25);
        if (window.soundEngine) window.soundEngine.playWhoosh();
      }
    }
  }

  startExtraction(shard) {
    this.activeExtractShard = shard;
    this.extractTargetAngle = Math.PI * (0.5 + Math.random());
    this.extractCurrentAngle = 0;
    this.extractSpeed = 0.06 + Math.random() * 0.04;
  }

  attemptExtract() {
    if (!this.activeExtractShard) return;

    // Check angle alignment
    let diff = Math.abs(this.extractCurrentAngle - this.extractTargetAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;

    if (diff < 0.45) {
      // Successful calibration!
      const shard = this.activeExtractShard;
      shard.found = true;
      shard.revealed = true;
      this.score += 500;

      if (window.fuxProtocol) {
        window.fuxProtocol.collectShard(shard.id, shard.sectorName);
      }

      if (window.soundEngine) {
        window.soundEngine.playShardFound();
      }

      // Check win condition (all 7 found)
      const foundCount = this.shards.filter(s => s.found).length;
      this.activeExtractShard = null;

      if (foundCount >= 7) {
        this.triggerVictory();
      }
    } else {
      // Failed timing - small glitch penalty
      if (window.soundEngine) window.soundEngine.playGlitch();
      this.player.battery = Math.max(0, this.player.battery - 8);
    }
  }

  triggerVictory() {
    this.isRunning = false;
    if (window.soundEngine) {
      window.soundEngine.playGenesisSpawn();
    }
    setTimeout(() => {
      if (this.onComplete) {
        this.onComplete({
          score: this.score,
          time: this.timeElapsed,
          shardsCount: 7
        });
      }
    }, 1200);
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Cyberpunk Map Grid Background
    this.drawGrid(ctx);

    // 2. Sectors & Districts
    this.drawSectors(ctx);

    // 3. Battery Pickups
    this.drawBatteries(ctx);

    // 4. Shards
    this.drawShards(ctx);

    // 5. Radar Pulses
    this.drawPulses(ctx);

    // 6. Nullifier Drones & Cones
    this.drawDrones(ctx);

    // 7. Chaos Anomalies
    this.drawAnomalies(ctx);

    // 8. Player Hunter
    this.drawPlayer(ctx);

    // 9. HUD & Calibration Mini-game Overlay
    this.drawHUD(ctx);
    if (this.activeExtractShard) {
      this.drawExtractionPuzzle(ctx);
    }
  }

  drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.06)';
    ctx.lineWidth = 1;

    const gridSize = 45;
    for (let x = 0; x < this.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSectors(ctx) {
    ctx.save();
    for (const sec of this.sectors) {
      const sx = sec.x * this.width;
      const sy = sec.y * this.height;

      // Sector perimeter
      ctx.beginPath();
      ctx.arc(sx, sy, sec.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(176, 38, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = 'rgba(0, 243, 255, 0.45)';
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(sec.name.toUpperCase(), sx, sy - sec.r - 6);
    }
    ctx.restore();
  }

  drawBatteries(ctx) {
    ctx.save();
    for (const b of this.batteries) {
      if (!b.active) continue;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#39ff14';
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', b.x, b.y + 3);
    }
    ctx.restore();
  }

  drawShards(ctx) {
    ctx.save();
    for (const s of this.shards) {
      if (s.found) {
        // Collected indicator
        ctx.fillStyle = 'rgba(57, 255, 20, 0.4)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (s.revealed) {
        // Glowing Shard Beacon
        ctx.shadowBlur = 20;
        ctx.shadowColor = s.color || '#39ff14';

        // Outer rotating ring
        ctx.strokeStyle = s.color || '#39ff14';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 16 + Math.sin(this.timeElapsed * 5) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Shard Core Icon
        ctx.fillStyle = s.color || '#39ff14';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, s.x, s.y - 20);
      } else {
        // Hidden shimmer
        const shimmer = Math.sin(this.timeElapsed * 3 + s.x) * 0.5 + 0.5;
        if (shimmer > 0.85) {
          ctx.fillStyle = 'rgba(176, 38, 255, 0.25)';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawPulses(ctx) {
    ctx.save();
    for (const p of this.pulses) {
      const alpha = Math.max(0, 1 - p.radius / p.maxRadius);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.75})`;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00f3ff';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDrones(ctx) {
    ctx.save();
    for (const d of this.drones) {
      // Vision cone
      const beamAngle = d.angle + Math.sin(d.scanAngle) * 0.4;
      const halfFov = d.fov * 0.5;

      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.arc(d.x, d.y, d.range, beamAngle - halfFov, beamAngle + halfFov);
      ctx.closePath();

      const coneGrad = ctx.createRadialGradient(d.x, d.y, 5, d.x, d.y, d.range);
      coneGrad.addColorStop(0, 'rgba(255, 0, 85, 0.4)');
      coneGrad.addColorStop(1, 'rgba(255, 0, 85, 0.02)');
      ctx.fillStyle = coneGrad;
      ctx.fill();

      // Drone Body
      ctx.fillStyle = '#ff0055';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff0055';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 9, 0, Math.PI * 2);
      ctx.fill();

      // Sensor eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(d.x + Math.cos(beamAngle) * 4, d.y + Math.sin(beamAngle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawAnomalies(ctx) {
    ctx.save();
    for (const a of this.anomalies) {
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#b026ff';

      const pulseR = a.r + Math.sin(a.phase) * 6;
      ctx.beginPath();
      ctx.arc(a.x, a.y, pulseR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(176, 38, 255, 0.35)';
      ctx.fill();

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    ctx.save();
    const p = this.player;

    // Proximity aura
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = p.isJammed ? 'rgba(255, 0, 85, 0.6)' : 'rgba(57, 255, 20, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hunter Avatar Body
    ctx.shadowBlur = 18;
    ctx.shadowColor = p.isJammed ? '#ff0055' : '#00f3ff';

    ctx.fillStyle = p.isJammed ? '#ff0055' : '#00f3ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Direction needle
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.heading) * (p.radius + 6), p.y + Math.sin(p.heading) * (p.radius + 6));
    ctx.stroke();

    ctx.restore();
  }

  drawHUD(ctx) {
    ctx.save();

    // Top left battery & shield
    ctx.fillStyle = 'rgba(5, 10, 18, 0.8)';
    ctx.fillRect(15, 15, 200, 60);
    ctx.strokeStyle = '#00f3ff';
    ctx.strokeRect(15, 15, 200, 60);

    // Battery bar
    ctx.fillStyle = '#00f3ff';
    ctx.font = '10px monospace';
    ctx.fillText(`SCANNER BATTERY: ${Math.round(this.player.battery)}%`, 25, 32);
    ctx.fillStyle = '#112233';
    ctx.fillRect(25, 38, 180, 8);
    ctx.fillStyle = this.player.battery > 20 ? '#00f3ff' : '#ff0055';
    ctx.fillRect(25, 38, (this.player.battery / 100) * 180, 8);

    // Shield bar
    ctx.fillStyle = '#39ff14';
    ctx.fillText(`ICU SHIELD: ${Math.round(this.player.shield)}%`, 25, 58);
    ctx.fillStyle = '#112233';
    ctx.fillRect(25, 62, 180, 6);
    ctx.fillStyle = '#39ff14';
    ctx.fillRect(25, 62, (this.player.shield / 100) * 180, 6);

    // Top right shards inventory
    const foundCount = this.shards.filter(s => s.found).length;
    ctx.fillStyle = 'rgba(5, 10, 18, 0.8)';
    ctx.fillRect(this.width - 215, 15, 200, 60);
    ctx.strokeStyle = '#b026ff';
    ctx.strokeRect(this.width - 215, 15, 200, 60);

    ctx.fillStyle = '#b026ff';
    ctx.font = '11px monospace';
    ctx.fillText(`SHARDS LOCATED: ${foundCount} / 7`, this.width - 200, 32);

    // Shard slot dots
    this.shards.forEach((s, idx) => {
      const dotX = this.width - 195 + idx * 26;
      const dotY = 50;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
      ctx.fillStyle = s.found ? (s.color || '#39ff14') : 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
      if (s.found) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = s.color || '#39ff14';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // Scanner prompt at bottom
    ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[SPACE / TAP] TRIGGER AR RADAR PULSE  •  [WASD / TOUCH] MOVE HUNTER', this.width / 2, this.height - 20);

    ctx.restore();
  }

  drawExtractionPuzzle(ctx) {
    ctx.save();
    const cx = this.width / 2;
    const cy = this.height / 2;

    // Dark backdrop overlay
    ctx.fillStyle = 'rgba(3, 6, 12, 0.82)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Puzzle HUD Box
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 160, cy - 160, 320, 320);

    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`RESONANCE CALIBRATION: ${this.activeExtractShard.name.toUpperCase()}`, cx, cy - 120);

    ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
    ctx.font = '11px monospace';
    ctx.fillText('ALIGN OSCILLATOR INSIDE TARGET ZONE TO EXTRACT', cx, cy - 98);

    // Resonance Ring
    const ringRadius = 70;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Target Zone Arc
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, this.extractTargetAngle - 0.35, this.extractTargetAngle + 0.35);
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 14;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#39ff14';
    ctx.stroke();

    // Rotating Oscillator Pointer
    const oscX = cx + Math.cos(this.extractCurrentAngle) * ringRadius;
    const oscY = cy + Math.sin(this.extractCurrentAngle) * ringRadius;

    ctx.beginPath();
    ctx.arc(oscX, oscY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#00f3ff';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#00f3ff';
    ctx.fill();

    // Button Prompt
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText('[TAP / SPACE] LOCK RESONANCE', cx, cy + 115);

    ctx.restore();
  }
}

window.Game1Hunt = Game1Hunt;
