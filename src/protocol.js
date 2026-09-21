/**
 * FuX Chaos Engine - On-Chain Protocol & Spawn Verification
 * Complies with protocol/spawn-verification.md
 */

const SHARD_DEFINITIONS = [
  {
    id: 'board',
    name: 'Board',
    slot: 1,
    title: 'Kinetic Deck Foundation',
    desc: 'The physical composite deck foundation and primary kinetic ground interface.',
    color: '#00f3ff',
    icon: '🛹'
  },
  {
    id: 'grip',
    name: 'Grip',
    slot: 2,
    title: 'Tactile Neural Bridge',
    desc: 'Micro-perforated traction layer providing continuous neural feedback to the hunter.',
    color: '#39ff14',
    icon: '⚡'
  },
  {
    id: 'trux',
    name: 'TruX',
    slot: 3,
    title: 'Magnetic Suspension Pivot',
    desc: 'Dual-axis turning geometry with electromagnetic ferro-bushings for agile lean.',
    color: '#b026ff',
    icon: '⚙️'
  },
  {
    id: 'hubs',
    name: 'Hubs',
    slot: 4,
    title: 'Kinetic Dynamo Hubs',
    desc: 'Brushless magnetic dynamo wheels capturing street friction into raw Chaos voltage.',
    color: '#00f3ff',
    icon: '🌀'
  },
  {
    id: 'core',
    name: 'Core',
    slot: 5,
    title: 'Ferrofluid Symbiote Seed',
    desc: 'Obsidian containment core holding the dormant living ferrofluid symbiote organism.',
    color: '#b026ff',
    icon: '💎'
  },
  {
    id: 'ar',
    name: 'aR',
    slot: 6,
    title: 'Illust AR Spatial Prism',
    desc: 'Augmented reality optical prism anchoring the digital entity to physical NOLA coordinates.',
    color: '#39ff14',
    icon: '👁️'
  },
  {
    id: 'aura',
    name: 'Aura',
    slot: 7,
    title: 'Bioluminescent Frequency Band',
    desc: 'Dual-phase purple and toxic-lime optical emitter establishing the symbiotic link.',
    color: '#e056fd',
    icon: '✨'
  }
];

class FuXProtocol {
  constructor() {
    this.collectedShards = new Map();
    this.spawnCount = 4287; // Total genesis count toward 70,000 cap
    this.maxCap = 70000;
  }

  // Check if all 7 shards are collected
  isGenesisReady() {
    return this.collectedShards.size >= 7;
  }

  getCollectedCount() {
    return this.collectedShards.size;
  }

  getShard(id) {
    return SHARD_DEFINITIONS.find(s => s.id === id);
  }

  collectShard(id, station = 'NOLA-STATION-01') {
    const shard = this.getShard(id);
    if (!shard) return false;

    if (!this.collectedShards.has(id)) {
      this.collectedShards.set(id, {
        ...shard,
        timestamp: Date.now(),
        stationId: station,
        claimHash: this._generatePseudoHash(id + Date.now())
      });
      return true;
    }
    return false;
  }

  resetShards() {
    this.collectedShards.clear();
  }

  // Derive unique FuX genome from hunter's 7 shard find data
  deriveGenome(hunterId = 'Hunter-NOLA') {
    let seed = 0;
    this.collectedShards.forEach((item, id) => {
      seed += (item.timestamp || 1000) % 99991;
    });

    const phenotypes = ['Obsidian Tendril', 'Magnetic Spiker', 'Vapor Weaver', 'Electric Hydra', 'Vortex Prime'];
    const affinities = ['Violet Subsurface', 'Toxic Lime Pulse', 'Dual Polar Resonance', 'Abyssal Pitch'];
    const traits = ['Ultra-Reactive', 'Harmonic Leaper', 'Memory Anchor', 'Street Magician'];

    const phenotype = phenotypes[seed % phenotypes.length];
    const affinity = affinities[(seed >> 3) % affinities.length];
    const trait = traits[(seed >> 5) % traits.length];

    // Determine rarity based on chaos level and shard speed
    let rarity = 'rare';
    const rand = seed % 100;
    if (rand > 92) rarity = 'mythic';
    else if (rand > 75) rarity = 'legendary';
    else if (rand > 40) rarity = 'rare';
    else rarity = 'uncommon';

    return {
      seed: seed.toString(16).toUpperCase(),
      phenotype,
      affinity,
      trait,
      rarity,
      dnaString: `FUX-${(seed % 8999 + 1000)}-${rarity.toUpperCase()}`
    };
  }

  // Build canonical JSON spawn packet matching protocol/spawn-verification.md
  async buildCanonicalSpawnPacket(chaosAtSpawn = 85, stationId = 'HUNT-NOLA-FQ07') {
    this.spawnCount++;
    const genome = this.deriveGenome();
    const spawnSeq = this.spawnCount;

    // Pseudo-Solana slot and blockhash
    const spawnSlot = 289410000 + spawnSeq * 12;
    const spawnBlockhash = this._base58(this._generatePseudoHash('blockhash' + spawnSlot));
    const fuxEntity = 'FuX' + this._base58(this._generatePseudoHash('entity' + spawnSeq)).substring(0, 32);
    const stationHash = await this.sha256Hex(stationId + '-SECRET-SALT');
    const previousEventHash = await this.sha256Hex('prev-event-' + (spawnSeq - 1));
    const issuer = 'SPAWN_SVC_' + this._base58(this._generatePseudoHash('issuer-pubkey')).substring(0, 32);

    const packet = {
      schema: 'fux-spawn/1.0',
      fuxEntity: fuxEntity,
      spawnId: String(spawnSeq).padStart(5, '0'),
      previousEventHash: previousEventHash,
      variant: genome.phenotype + ' (' + genome.affinity + ')',
      rarity: genome.rarity,
      stationId: stationId,
      stationHash: stationHash,
      chaosAtSpawn: Math.round(chaosAtSpawn),
      spawnSlot: String(spawnSlot),
      spawnBlockhash: spawnBlockhash,
      issuer: issuer,
      signature: ''
    };

    // Canonical sorted JSON string for signing & hashing
    const canonicalStr = JSON.stringify(packet, Object.keys(packet).sort());
    packet.signature = this._base58(await this.sha256Hex(canonicalStr + 'PRIVATE_KEY')).substring(0, 64);

    const packetHash = await this.sha256Hex(JSON.stringify(packet));

    return {
      packet,
      canonicalJson: JSON.stringify(packet, null, 2),
      hash: packetHash,
      arweaveId: 'ar://' + this._base58(packetHash).substring(0, 43),
      solanaTx: this._base58(this._generatePseudoHash('soltx' + spawnSlot)).substring(0, 64),
      genome,
      spawnIndex: spawnSeq,
      capRemaining: this.maxCap - spawnSeq
    };
  }

  // SHA-256 via browser subtle crypto
  async sha256Hex(message) {
    if (window.crypto && crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback pseudo-sha256
    return this._generatePseudoHash(message);
  }

  _generatePseudoHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      let ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex1 = ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
    const hex2 = ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
    const hex3 = ('00000000' + ((h1 ^ h2) >>> 0).toString(16)).slice(-8);
    const hex4 = ('00000000' + ((h2 + 0x1337) >>> 0).toString(16)).slice(-8);
    return hex1 + hex2 + hex3 + hex4 + hex2 + hex1 + hex4 + hex3;
  }

  _base58(hexStr) {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let res = '';
    for (let i = 0; i < hexStr.length; i += 2) {
      const byte = parseInt(hexStr.substr(i, 2), 16) || 0;
      res += chars[byte % chars.length];
    }
    return res;
  }
}

// Global protocol instance
window.SHARD_DEFINITIONS = SHARD_DEFINITIONS;
window.fuxProtocol = new FuXProtocol();
