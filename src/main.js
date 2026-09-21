/**
 * FuX Chaos Engine - Master Game Coordinator
 * Combines the Trinity Hunt:
 *  1. ICU AR Shard Hunt
 *  2. Magic Mirror Box Genesis
 *  3. The Trail to MiiE & FuXZero
 */

class FuxMasterGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Current active mode: 'hub', 'campaign', 'game1', 'game2', 'game3', 'sandbox'
    this.currentMode = 'hub';
    this.campaignStep = 0; // 1 = Game 1, 2 = Game 2, 3 = Game 3

    // Active sub-instance
    this.activeGameInstance = null;
    this.hubBackgroundEntity = null;

    // Campaign persistent state
    this.campaignStats = {
      score: 0,
      time: 0,
      spawnPacket: null,
      genome: null,
      shardsFound: 0
    };

    // Global loop
    this.lastTime = performance.now();
    this.animationFrameId = null;

    this.initDOM();
    this.resizeCanvas();
    this.initHubBackground();
    this.bindEvents();
    this.startLoop();
  }

  initDOM() {
    // Screens
    this.hubScreen = document.getElementById('hub-screen');
    this.sandboxPanel = document.getElementById('sandbox-panel');
    this.codexModal = document.getElementById('codex-modal');
    this.spawnModal = document.getElementById('spawn-modal');
    this.victoryModal = document.getElementById('victory-modal');
    this.intermissionModal = document.getElementById('intermission-modal');
    this.mobileControls = document.getElementById('mobile-touch-controls');

    // Header elements
    this.chaosValueEl = document.getElementById('chaos-value');
    this.chaosLabelEl = document.getElementById('chaos-label');
    this.muteBtn = document.getElementById('mute-btn');
    this.soundIcon = document.getElementById('sound-icon');
  }

  resizeCanvas() {
    const viewport = document.getElementById('viewport');
    const w = viewport.clientWidth || window.innerWidth;
    const h = viewport.clientHeight || (window.innerHeight - 56);
    this.canvas.width = w;
    this.canvas.height = h;

    if (this.activeGameInstance && this.activeGameInstance.resize) {
      this.activeGameInstance.resize(w, h);
    }
    if (this.hubBackgroundEntity && this.hubBackgroundEntity.resize) {
      this.hubBackgroundEntity.resize(w, h);
    }
  }

  initHubBackground() {
    this.hubBackgroundEntity = new FerrofluidEntity(this.canvas);
    this.hubBackgroundEntity.setMood('calm');
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Navigation buttons
    document.getElementById('nav-logo').addEventListener('click', () => this.showHub());
    document.getElementById('nav-menu-btn').addEventListener('click', () => this.showHub());

    // Mute toggle
    this.muteBtn.addEventListener('click', () => {
      if (window.soundEngine) {
        const isMuted = window.soundEngine.toggleMute();
        this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
        this.muteBtn.classList.toggle('active', !isMuted);
      }
    });

    // Start Campaign
    document.getElementById('start-campaign-btn').addEventListener('click', () => {
      this.startCampaign();
    });

    // Arcade Mini-games
    document.getElementById('play-game1-btn').addEventListener('click', () => {
      this.startMiniGame(1);
    });
    document.getElementById('play-game2-btn').addEventListener('click', () => {
      this.startMiniGame(2);
    });
    document.getElementById('play-game3-btn').addEventListener('click', () => {
      this.startMiniGame(3);
    });

    // WaveScope Sandbox
    document.getElementById('open-sandbox-btn').addEventListener('click', () => {
      this.startSandbox();
    });

    // Codex & Protocol Viewer
    document.getElementById('open-codex-btn').addEventListener('click', () => {
      this.openModal(this.codexModal);
    });
    document.getElementById('close-codex-btn').addEventListener('click', () => {
      this.closeModal(this.codexModal);
    });

    // Spawn Packet Viewer Close
    document.getElementById('close-spawn-btn').addEventListener('click', () => {
      this.closeModal(this.spawnModal);
    });
    document.getElementById('copy-json-btn').addEventListener('click', () => {
      const code = document.getElementById('spawn-json-view').textContent;
      navigator.clipboard.writeText(code).then(() => {
        alert('Canonical Spawn Packet JSON copied to clipboard!');
      });
    });

    // Victory Screen Actions
    document.getElementById('victory-hub-btn').addEventListener('click', () => {
      this.closeModal(this.victoryModal);
      this.showHub();
    });
    document.getElementById('victory-view-spawn-btn').addEventListener('click', () => {
      this.closeModal(this.victoryModal);
      this.showSpawnPacketViewer();
    });

    // Intermission Next Step
    document.getElementById('intermission-next-btn').addEventListener('click', () => {
      this.closeModal(this.intermissionModal);
      this.advanceCampaign();
    });

    // Sandbox Controls
    this.bindSandboxUI();

    // Mobile virtual touch buttons
    document.getElementById('touch-left').addEventListener('pointerdown', () => {
      if (this.activeGameInstance && this.activeGameInstance.changeLane) this.activeGameInstance.changeLane(-1);
    });
    document.getElementById('touch-right').addEventListener('pointerdown', () => {
      if (this.activeGameInstance && this.activeGameInstance.changeLane) this.activeGameInstance.changeLane(1);
    });
    document.getElementById('touch-jump').addEventListener('pointerdown', () => {
      if (this.activeGameInstance && this.activeGameInstance.jump) this.activeGameInstance.jump();
      if (this.activeGameInstance && this.activeGameInstance.triggerPing) this.activeGameInstance.triggerPing();
    });
    document.getElementById('touch-slide').addEventListener('pointerdown', () => {
      if (this.activeGameInstance && this.activeGameInstance.slide) this.activeGameInstance.slide();
    });
    document.getElementById('touch-burst').addEventListener('pointerdown', () => {
      if (this.activeGameInstance && this.activeGameInstance.triggerShockwave) this.activeGameInstance.triggerShockwave();
    });
  }

  bindSandboxUI() {
    const chaosSlider = document.getElementById('sb-chaos');
    const lowSlider = document.getElementById('sb-low');
    const midSlider = document.getElementById('sb-mid');
    const highSlider = document.getElementById('sb-high');
    const micBtn = document.getElementById('sb-mic-btn');

    chaosSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (this.activeGameInstance && this.activeGameInstance.entity) {
        this.activeGameInstance.entity.setChaos(val);
      }
      this.updateChaosHUD(val);
      if (window.soundEngine) window.soundEngine.setChaos(val);
    });

    const updateBands = () => {
      if (this.activeGameInstance && this.activeGameInstance.entity) {
        this.activeGameInstance.entity.setAudioBands(
          Number(lowSlider.value),
          Number(midSlider.value),
          Number(highSlider.value)
        );
      }
    };

    lowSlider.addEventListener('input', updateBands);
    midSlider.addEventListener('input', updateBands);
    highSlider.addEventListener('input', updateBands);

    // Mood buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mood = btn.dataset.mood;
        if (this.activeGameInstance && this.activeGameInstance.entity) {
          this.activeGameInstance.entity.setMood(mood);
          this.updateChaosHUD(this.activeGameInstance.entity.chaos);
          chaosSlider.value = this.activeGameInstance.entity.chaos;
        }
      });
    });

    // Mic toggle
    micBtn.addEventListener('click', async () => {
      if (this.activeGameInstance && this.activeGameInstance.toggleMic) {
        const isActive = await this.activeGameInstance.toggleMic();
        micBtn.classList.toggle('active', isActive);
        micBtn.textContent = isActive ? '🎤 MIC LISTENING' : '🎤 AUDIO INPUT';
      }
    });
  }

  updateChaosHUD(val) {
    val = Math.round(val);
    this.chaosValueEl.textContent = val;
    let label = 'CALM';
    let color = '#39ff14';
    if (val > 90) { label = 'UNLEASHED'; color = '#b026ff'; }
    else if (val > 60) { label = 'SURGING'; color = '#ff0055'; }
    else if (val > 25) { label = 'STIRRING'; color = '#00f3ff'; }
    this.chaosLabelEl.textContent = label;
    this.chaosLabelEl.style.color = color;
  }

  updateShardsHUD() {
    const count = window.fuxProtocol ? window.fuxProtocol.getCollectedCount() : 0;
    const icons = document.querySelectorAll('.shard-slot-icon');
    icons.forEach((icon, idx) => {
      icon.classList.toggle('active', idx < count);
    });
  }

  openModal(modal) {
    modal.classList.remove('hidden');
  }

  closeModal(modal) {
    modal.classList.add('hidden');
  }

  cleanupActiveInstance() {
    if (this.activeGameInstance && this.activeGameInstance.destroy) {
      this.activeGameInstance.destroy();
    }
    this.activeGameInstance = null;
    this.sandboxPanel.classList.add('hidden');
    this.mobileControls.style.display = 'none';
  }

  showHub() {
    this.cleanupActiveInstance();
    this.currentMode = 'hub';
    this.hubScreen.classList.remove('hidden');
    this.closeModal(this.codexModal);
    this.closeModal(this.spawnModal);
    this.closeModal(this.victoryModal);
    this.closeModal(this.intermissionModal);

    if (window.soundEngine) {
      window.soundEngine.startMusic();
      window.soundEngine.setChaos(20);
    }
    this.updateChaosHUD(20);
    this.updateShardsHUD();
  }

  startCampaign() {
    this.campaignStats = {
      score: 0,
      time: 0,
      spawnPacket: null,
      genome: null,
      shardsFound: 0
    };
    if (window.fuxProtocol) {
      window.fuxProtocol.resetShards();
    }
    this.updateShardsHUD();
    this.campaignStep = 1;
    this.startMiniGame(1, true);
  }

  startMiniGame(gameNum, isCampaign = false) {
    this.cleanupActiveInstance();
    this.hubScreen.classList.add('hidden');
    this.currentMode = `game${gameNum}`;

    if (window.soundEngine) {
      window.soundEngine.startMusic();
    }

    if (gameNum === 1) {
      this.updateChaosHUD(30);
      this.activeGameInstance = new Game1Hunt(this.canvas, (result) => {
        this.campaignStats.score += result.score || 0;
        this.campaignStats.time += result.time || 0;
        this.campaignStats.shardsFound = 7;
        this.updateShardsHUD();

        if (isCampaign) {
          this.showIntermission(
            'ACT I COMPLETED: 7 SHARDS RECOVERED',
            'All seven fragment slots (Board, Grip, TruX, Hubs, Core, aR, Aura) are calibrated! Transporting to the Magic Mirror Box for the Genesis Ceremony...',
            'ENTER MAGIC MIRROR BOX'
          );
        } else {
          this.showIntermission('HUNT VICTORIOUS', 'All 7 shards found in record time!', 'RETURN TO HUB');
        }
      });
    } else if (gameNum === 2) {
      this.updateChaosHUD(50);
      this.activeGameInstance = new Game2Box(this.canvas, (result) => {
        this.campaignStats.spawnPacket = result.spawnPacket;
        if (isCampaign) {
          this.showIntermission(
            'ACT II COMPLETED: GENESIS CEREMONY IRREVERSIBLE',
            `Your unique FuX symbiote (${result.spawnPacket ? result.spawnPacket.variant : 'Prime'}) is born and bonded at birth! Now follow FuX\'s trail to locate FuXZero and find MiiE (Jay IRL)!`,
            'FOLLOW THE SYMBIOTE TRAIL'
          );
        } else {
          this.showSpawnPacketViewer(result.spawnPacket);
        }
      });
    } else if (gameNum === 3) {
      this.updateChaosHUD(85);
      this.mobileControls.style.display = 'flex';
      this.activeGameInstance = new Game3Trail(this.canvas, (result) => {
        this.campaignStats.score += result.score || 0;
        if (isCampaign) {
          this.showVictoryScreen();
        } else {
          this.showIntermission('TRAIL FINISHED', `Pursuit completed with score ${result.score}! MiiE reached!`, 'RETURN TO HUB');
        }
      });
    }
  }

  startSandbox() {
    this.cleanupActiveInstance();
    this.hubScreen.classList.add('hidden');
    this.currentMode = 'sandbox';
    this.sandboxPanel.classList.remove('hidden');

    this.activeGameInstance = new ChaosSandbox(this.canvas);
    if (window.soundEngine) {
      window.soundEngine.startMusic();
      window.soundEngine.setChaos(45);
    }
    this.updateChaosHUD(45);
  }

  showIntermission(title, body, btnText) {
    document.getElementById('intermission-title').textContent = title;
    document.getElementById('intermission-desc').textContent = body;
    document.getElementById('intermission-next-btn').textContent = btnText;
    this.openModal(this.intermissionModal);
  }

  advanceCampaign() {
    this.campaignStep++;
    if (this.campaignStep === 2) {
      this.startMiniGame(2, true);
    } else if (this.campaignStep === 3) {
      this.startMiniGame(3, true);
    } else {
      this.showHub();
    }
  }

  showSpawnPacketViewer(packetData = null) {
    const data = packetData || this.campaignStats.spawnPacket;
    if (data) {
      document.getElementById('spawn-json-view').textContent = data.canonicalJson;
      document.getElementById('spawn-hash-view').textContent = data.hash;
      document.getElementById('spawn-pda-view').textContent = data.packet.fuxEntity;
      document.getElementById('spawn-arweave-view').textContent = data.arweaveId;
    }
    this.openModal(this.spawnModal);
  }

  showVictoryScreen() {
    const stats = this.campaignStats;
    const packet = stats.spawnPacket;

    document.getElementById('final-score').textContent = stats.score;
    document.getElementById('final-time').textContent = Math.round(stats.time) + 's';
    document.getElementById('final-variant').textContent = packet ? packet.variant : 'Ferro-Symbiote Genesis Prime';
    document.getElementById('final-rarity').textContent = packet ? packet.packet.rarity.toUpperCase() : 'MYTHIC';

    this.openModal(this.victoryModal);
  }

  startLoop() {
    const tick = (now) => {
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (this.activeGameInstance) {
        this.activeGameInstance.update(dt);
        this.activeGameInstance.render();
      } else if (this.currentMode === 'hub') {
        this.hubBackgroundEntity.update(dt);
        this.hubBackgroundEntity.render();
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.masterGame = new FuxMasterGame();
});
