/**
 * FuX Chaos Engine - Procedural Ferrofluid Symbiote & Magic Mirror Box
 * Matches UE5 Build Kit specification (M_FuX_Chaos_Master, BP_FuXChaosEngine)
 */

class FerrofluidEntity {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Display sizing
    this.width = canvas.width;
    this.height = canvas.height;
    this.cx = this.width / 2;
    this.cy = this.height / 2;

    // Entity state
    this.mood = 'calm'; // calm, stirring (joyful), surging (ominous), unleashed (wild)
    this.chaos = 20; // 0 - 100
    this.baseRadius = Math.min(this.width, this.height) * 0.22;
    this.time = 0;

    // Physical audio parameters
    this.audioLow = 0.3;
    this.audioMid = 0.3;
    this.audioHigh = 0.2;

    // Mood presets matching UE5 Data Assets
    this.moodConfigs = {
      calm: {
        breathRate: 0.35,
        flowSpeed: 0.08,
        spikeCount: 12,
        spikeLength: 25,
        primaryColor: '#8a2be2', // Violet
        secondaryColor: '#00f3ff', // Teal/Cyan
        smokeDensity: 25,
        viscosity: 0.8
      },
      stirring: { // Joyful
        breathRate: 0.65,
        flowSpeed: 0.16,
        spikeCount: 24,
        spikeLength: 50,
        primaryColor: '#00f3ff', // Teal
        secondaryColor: '#39ff14', // Acid lime
        smokeDensity: 40,
        viscosity: 0.65
      },
      surging: { // Ominous
        breathRate: 0.85,
        flowSpeed: 0.24,
        spikeCount: 36,
        spikeLength: 85,
        primaryColor: '#7b1fa2', // Deep purple
        secondaryColor: '#ff007f', // Magenta threat
        smokeDensity: 55,
        viscosity: 0.92
      },
      unleashed: { // Wild
        breathRate: 1.4,
        flowSpeed: 0.45,
        spikeCount: 48,
        spikeLength: 130,
        primaryColor: '#b026ff', // Electric violet
        secondaryColor: '#39ff14', // Toxic lime
        smokeDensity: 80,
        viscosity: 0.5
      }
    };

    // Target tracking & attention (gaze)
    this.targetX = this.cx;
    this.targetY = this.cy;
    this.currentAttractX = this.cx;
    this.currentAttractY = this.cy;

    // Dynamic particles (Smoke & Sparks)
    this.particles = [];
    this.maxParticles = 120;

    // Surface touch ripples
    this.ripples = [];

    // Electric bioluminescent vein branches
    this.veins = [];
    this.veinTimer = 0;

    // Cube 3D rotation angles
    this.cubeRotX = 0.2;
    this.cubeRotY = 0.3;
    this.cubeSize = Math.min(this.width, this.height) * 0.38;

    // Reaction packet queue
    this.reactionHistory = [];

    this.initParticles();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.cx = w / 2;
    this.cy = h / 2;
    this.baseRadius = Math.min(w, h) * 0.22;
    this.cubeSize = Math.min(w, h) * 0.38;
  }

  setMood(moodName) {
    if (this.moodConfigs[moodName]) {
      this.mood = moodName;
      if (moodName === 'calm') this.chaos = 15;
      else if (moodName === 'stirring') this.chaos = 45;
      else if (moodName === 'surging') this.chaos = 75;
      else if (moodName === 'unleashed') this.chaos = 95;
    }
  }

  setChaos(chaosVal) {
    this.chaos = Math.max(0, Math.min(100, chaosVal));
    if (this.chaos <= 25) this.mood = 'calm';
    else if (this.chaos <= 60) this.mood = 'stirring';
    else if (this.chaos <= 90) this.mood = 'surging';
    else this.mood = 'unleashed';
  }

  setAudioBands(low, mid, high) {
    this.audioLow = low;
    this.audioMid = mid;
    this.audioHigh = high;
  }

  // Handle touch/mouse interaction (matches OnReaction(Packet))
  triggerReaction(x, y, strength = 1.0, type = 'touch') {
    this.targetX = x;
    this.targetY = y;

    this.ripples.push({
      x,
      y,
      radius: 5,
      maxRadius: 100 * strength,
      strength,
      life: 1.0
    });

    // Spawn sparks
    const sparkCount = Math.floor(6 + strength * 12);
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6 * strength;
      this.particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.04,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() > 0.5 ? '#39ff14' : '#b026ff'
      });
    }

    // Record packet
    const packet = {
      type,
      strength: Number(strength.toFixed(2)),
      point: { x: Math.round(x), y: Math.round(y) },
      time: Date.now(),
      moodHint: this.mood
    };
    this.reactionHistory.unshift(packet);
    if (this.reactionHistory.length > 20) this.reactionHistory.pop();

    if (window.soundEngine) {
      window.soundEngine.playTouchRipple();
      if (strength > 0.6) window.soundEngine.playSpike();
    }
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createSmokeParticle());
    }
  }

  createSmokeParticle() {
    const angle = Math.random() * Math.PI * 2;
    const dist = this.baseRadius * (0.8 + Math.random() * 0.5);
    return {
      type: 'smoke',
      x: this.cx + Math.cos(angle) * dist,
      y: this.cy + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -0.6 - Math.random() * 1.4,
      life: Math.random(),
      decay: 0.008 + Math.random() * 0.015,
      size: 12 + Math.random() * 24,
      curlSpeed: (Math.random() - 0.5) * 0.08,
      color: Math.random() > 0.4 ? 'rgba(176, 38, 255, ' : 'rgba(57, 255, 20, '
    };
  }

  update(dt = 0.016) {
    this.time += dt;

    // Smoothly track attention target
    this.currentAttractX += (this.targetX - this.currentAttractX) * 0.08;
    this.currentAttractY += (this.targetY - this.currentAttractY) * 0.08;

    // Slowly rotate mirror box in 3D
    this.cubeRotY += dt * (0.35 + (this.chaos / 100) * 0.6);
    this.cubeRotX = 0.25 + Math.sin(this.time * 0.5) * 0.15;

    // Update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += (r.maxRadius - r.radius) * 0.12 + 1.5;
      r.life -= 0.025;
      if (r.life <= 0) {
        this.ripples.splice(i, 1);
      }
    }

    // Update particles (Smoke & Sparks)
    const cfg = this.moodConfigs[this.mood];
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay;

      if (p.type === 'smoke') {
        // Curl noise advection back toward core center
        const dx = this.cx - p.x;
        const dy = this.cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Swirl force
        const swirlX = -dy / (dist || 1) * p.curlSpeed * 20;
        const swirlY = dx / (dist || 1) * p.curlSpeed * 20;

        p.x += p.vx + swirlX;
        p.y += p.vy + swirlY;

        if (p.life <= 0) {
          this.particles[i] = this.createSmokeParticle();
        }
      } else if (p.type === 'spark') {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;

        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    // Refresh electric veins periodically
    this.veinTimer += dt;
    if (this.veinTimer > 0.12 - (this.chaos / 100) * 0.07) {
      this.veinTimer = 0;
      this.generateVeins();
    }
  }

  generateVeins() {
    this.veins = [];
    const veinCount = 3 + Math.floor((this.chaos / 100) * 8);

    for (let v = 0; v < veinCount; v++) {
      const startAngle = Math.random() * Math.PI * 2;
      const startDist = Math.random() * (this.baseRadius * 0.4);
      let currX = this.cx + Math.cos(startAngle) * startDist;
      let currY = this.cy + Math.sin(startAngle) * startDist;

      const path = [{ x: currX, y: currY }];
      let angle = startAngle + (Math.random() - 0.5) * 1.5;
      const steps = 6 + Math.floor(Math.random() * 7);

      for (let s = 0; s < steps; s++) {
        const segLen = 10 + Math.random() * 20;
        angle += (Math.random() - 0.5) * 1.4;
        currX += Math.cos(angle) * segLen;
        currY += Math.sin(angle) * segLen;
        path.push({ x: currX, y: currY });
      }

      this.veins.push({
        path,
        color: Math.random() > 0.45 ? '#39ff14' : '#b026ff',
        width: 1.2 + Math.random() * 2.2
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Magic Mirror Box background glow & rear cube wireframe
    this.drawMirrorBox(ctx, false);

    // 2. Draw curling smoke volume behind core
    this.drawSmoke(ctx, true);

    // 3. Draw Living Ferrofluid Core & Magnetic Spikes
    this.drawFerrofluidCore(ctx);

    // 4. Draw Bioluminescent Veins (Trapped Purple & Lime light)
    this.drawBioluminescentVeins(ctx);

    // 5. Draw Water Skin Specular Sheen & Ripples
    this.drawWaterSkin(ctx);

    // 6. Draw foreground smoke and sparks
    this.drawSmoke(ctx, false);
    this.drawSparks(ctx);

    // 7. Draw Magic Mirror Box front glass, frame, and neon corner reflections
    this.drawMirrorBox(ctx, true);
  }

  drawFerrofluidCore(ctx) {
    const cfg = this.moodConfigs[this.mood];
    const breath = Math.sin(this.time * cfg.breathRate * Math.PI * 2) * (0.05 + this.audioLow * 0.15);
    const effectiveRadius = this.baseRadius * (1 + breath);

    // Vector toward attention / cursor
    const pullX = (this.currentAttractX - this.cx) * 0.25;
    const pullY = (this.currentAttractY - this.cy) * 0.25;

    const numPoints = cfg.spikeCount;
    const points = [];

    // Calculate boundary vertices with organic harmonic noise + magnetic spikes
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;

      // Harmonic wave flow
      const wave1 = Math.sin(angle * 3 + this.time * cfg.flowSpeed * 8) * 15;
      const wave2 = Math.cos(angle * 5 - this.time * cfg.flowSpeed * 6) * 10;
      const wave3 = Math.sin(angle * 7 + this.time * 2) * (5 + this.audioMid * 12);

      // Magnetic spike projection
      // Spikes erupt toward cursor or with high frequency audio and chaos
      const toTargetAngle = Math.atan2(this.currentAttractY - this.cy, this.currentAttractX - this.cx);
      let angleDiff = Math.abs(angle - toTargetAngle);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

      const proximitySpike = Math.max(0, 1 - angleDiff / 1.2) * 1.4;
      const audioSpike = (this.audioHigh * 0.8 + this.audioLow * 0.4);
      const spikeNoise = Math.pow(Math.abs(Math.sin(angle * 4 + this.time * 3)), 4);

      const spikeMag = (spikeNoise * cfg.spikeLength * (1 + audioSpike + proximitySpike)) * (this.chaos / 60);

      // Final radial distance
      const r = effectiveRadius + wave1 + wave2 + wave3 + spikeMag;

      const px = this.cx + Math.cos(angle) * r + pullX * 0.4;
      const py = this.cy + Math.sin(angle) * r + pullY * 0.4;
      points.push({ x: px, y: py, angle, r });
    }

    // Draw glossy black ferrofluid mass
    ctx.save();

    // Outer glow from trapped bioluminescence
    ctx.shadowBlur = 35 + (this.chaos / 100) * 45;
    ctx.shadowColor = cfg.primaryColor;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    ctx.closePath();

    // Metallic Obsidian / Glossy Black Ferrofluid Gradient
    const grad = ctx.createRadialGradient(
      this.cx - 20 + pullX * 0.2, this.cy - 20 + pullY * 0.2, 5,
      this.cx, this.cy, effectiveRadius * 1.5
    );
    grad.addColorStop(0, '#1c212a');
    grad.addColorStop(0.3, '#0b0e14');
    grad.addColorStop(0.7, '#040608');
    grad.addColorStop(1, '#000000');

    ctx.fillStyle = grad;
    ctx.fill();

    // Deep purple / toxic lime subsurface perimeter stroke
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = cfg.secondaryColor;
    ctx.stroke();

    ctx.restore();
  }

  drawBioluminescentVeins(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const v of this.veins) {
      if (v.path.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(v.path[0].x, v.path[0].y);
      for (let i = 1; i < v.path.length; i++) {
        ctx.lineTo(v.path[i].x, v.path[i].y);
      }

      ctx.strokeStyle = v.color;
      ctx.lineWidth = v.width;
      ctx.shadowBlur = 18;
      ctx.shadowColor = v.color;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawWaterSkin(ctx) {
    // Viscous specular gloss highlights
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Specular top reflection
    const glossGrad = ctx.createRadialGradient(
      this.cx - this.baseRadius * 0.35, this.cy - this.baseRadius * 0.35, 1,
      this.cx - this.baseRadius * 0.35, this.cy - this.baseRadius * 0.35, this.baseRadius * 0.6
    );
    glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    glossGrad.addColorStop(0.3, 'rgba(176, 38, 255, 0.25)');
    glossGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(this.cx - this.baseRadius * 0.35, this.cy - this.baseRadius * 0.35, this.baseRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Draw active touch ripples
    for (const r of this.ripples) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(57, 255, 20, ${r.life * 0.8})`;
      ctx.lineWidth = 2.5 * r.life;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#39ff14';
      ctx.stroke();

      // Inner violet echo ring
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0, r.radius - 12), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(176, 38, 255, ${r.life * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#b026ff';
      ctx.stroke();
    }

    ctx.restore();
  }

  drawSmoke(ctx, isBackground) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of this.particles) {
      if (p.type !== 'smoke') continue;
      // Filter background vs foreground smoke
      if (isBackground && p.life > 0.5) continue;
      if (!isBackground && p.life <= 0.5) continue;

      const alpha = Math.sin(p.life * Math.PI) * 0.35;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, p.color + alpha + ')');
      grad.addColorStop(0.7, p.color + (alpha * 0.4) + ')');
      grad.addColorStop(1, p.color + '0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawSparks(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of this.particles) {
      if (p.type !== 'spark') continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
    }

    ctx.restore();
  }

  // 3D Magic Mirror Box Wireframe Projection
  drawMirrorBox(ctx, isForeground) {
    const S = this.cubeSize;
    const vertices = [
      { x: -S, y: -S, z: -S },
      { x:  S, y: -S, z: -S },
      { x:  S, y:  S, z: -S },
      { x: -S, y:  S, z: -S },
      { x: -S, y: -S, z:  S },
      { x:  S, y: -S, z:  S },
      { x:  S, y:  S, z:  S },
      { x: -S, y:  S, z:  S },
    ];

    // Edges connecting cube vertices
    const edges = [
      [0,1],[1,2],[2,3],[3,0], // Rear square
      [4,5],[5,6],[6,7],[7,4], // Front square
      [0,4],[1,5],[2,6],[3,7]  // Struts
    ];

    // Rotate and project to 2D
    const cosY = Math.cos(this.cubeRotY);
    const sinY = Math.sin(this.cubeRotY);
    const cosX = Math.cos(this.cubeRotX);
    const sinX = Math.sin(this.cubeRotX);

    const projected = vertices.map(v => {
      // Y rotation
      const x1 = v.x * cosY + v.z * sinY;
      const z1 = -v.x * sinY + v.z * cosY;

      // X rotation
      const y2 = v.y * cosX - z1 * sinX;
      const z2 = v.y * sinX + z1 * cosX;

      // Perspective projection
      const cameraDist = 800;
      const scale = cameraDist / (cameraDist + z2);

      return {
        x: this.cx + x1 * scale,
        y: this.cy + y2 * scale,
        z: z2,
        scale
      };
    });

    ctx.save();

    for (const [i1, i2] of edges) {
      const p1 = projected[i1];
      const p2 = projected[i2];
      const avgZ = (p1.z + p2.z) / 2;

      // Split rendering: background edges behind entity, foreground edges in front
      if (isForeground && avgZ < 0) continue;
      if (!isForeground && avgZ >= 0) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      // Neon frame color matching box concept art: cyan neon edges with purple/lime reflections
      const frameColor = avgZ > 0 ? '#00f3ff' : 'rgba(0, 243, 255, 0.4)';
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = isForeground ? 3.0 : 1.5;
      ctx.shadowBlur = isForeground ? 18 : 6;
      ctx.shadowColor = '#00f3ff';
      ctx.stroke();

      // Draw glowing corner brackets
      if (isForeground) {
        ctx.fillStyle = '#39ff14';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Glass panel reflection on front face
    if (isForeground) {
      ctx.beginPath();
      ctx.moveTo(projected[4].x, projected[4].y);
      ctx.lineTo(projected[5].x, projected[5].y);
      ctx.lineTo(projected[6].x, projected[6].y);
      ctx.lineTo(projected[7].x, projected[7].y);
      ctx.closePath();

      const glassGrad = ctx.createLinearGradient(projected[4].x, projected[4].y, projected[6].x, projected[6].y);
      glassGrad.addColorStop(0, 'rgba(0, 243, 255, 0.08)');
      glassGrad.addColorStop(0.5, 'rgba(176, 38, 255, 0.04)');
      glassGrad.addColorStop(1, 'rgba(57, 255, 20, 0.08)');
      ctx.fillStyle = glassGrad;
      ctx.fill();
    }

    ctx.restore();
  }
}

window.FerrofluidEntity = FerrofluidEntity;
