# FuX Chaos Engine


**FuX is the Chaos Engine** — a living symbiote-like energy entity for the
[Magic Mirror Box](https://github.com/StonedDrone/MilkDrop-Shake): a neon-lit
UE5 cube holding a reactive being. New Orleans street magic × digital genie.


## The entity


- One fluid body: **ferrofluid tension + viscous symbiote motion + smoke + water flow**
- Glossy black mass with purple and toxic-lime bioluminescent veins
- Amorphous — no fixed form, always in motion


## Reactive to everything


Sound, touch, movement, proximity, voice, story beats, and system events all
feed one Chaos parameter (0–100): calm → stirring → surging → unleashed.


## Mood pipeline


New in September 2026: the entity's moods are now auditioned and recorded in
**WaveScope Native v1.2.1** (portable Windows build, OpenGL 3.3). The workflow:

1. Point WaveScope at the Cream of the Crop preset pack (9,795 curated `.milk`
   presets) or any external preset folder.
2. Audition presets live — `3` runs a silent demo signal, `1` taps Windows
   system audio, `E` cycles visual engines, `F3` opens the preset browser.
3. Classify what you see into entity moods: **calm, wild, ominous, joyful** —
   these map onto the Chaos parameter's four states (calm → stirring →
   surging → unleashed).
4. Press `R` to record MP4 reference clips of the moods you want the UE5
   entity to reproduce.

The recorded clips become the visual targets for the Niagara/shader work in
the UE5 build kit under `docs/`.


The reactive engine is [MilkDrop-Shake](https://github.com/StonedDrone/MilkDrop-Shake).


## Playable Game: FuX Chaos Engine — Trinity Hunt

A unified interactive game combining all three core pillars of the FuX lore and protocol:

1. **Mini-Game 1: ICU AR Shard Hunt (Sector Scavenger)**:
   - Deploy AR radar scanner across the New Orleans French Quarter cyber-grid.
   - Recover all 7 Genesis Shards: `Board` (Deck), `Grip` (Neural Bridge), `TruX` (Suspension), `Hubs` (Dynamo), `Core` (Symbiote Seed), `aR` (Spatial Prism), and `Aura` (Resonance Band).
   - Calibrate resonance oscillators while evading patrolling ICU Nullifier Drones and shifting Chaos Glitch anomalies.

2. **Mini-Game 2: Magic Mirror Box (Ferrofluid Chaos Harmonizer & Genesis)**:
   - Interact directly with the living ferrofluid symbiote inside the neon cube.
   - Modulate `Low` (Bass/Tension), `Mid` (Flow/Color), and `High` (Spikes/Sparks) frequency bands across all 4 moods (`Calm`, `Stirring`, `Surging`, `Unleashed`).
   - Touch the glass to dissipate pressure hotspots and initiate the irreversible on-chain Genesis Ceremony, generating a canonical Solana/Arweave JSON Spawn Packet.

3. **Mini-Game 3: The Trail of MiiE & FuXZero (Symbiote Street Navigator)**:
   - Bonded at birth, your FuX symbiote guides and commands you through the streets.
   - Listen to FuX's symbiotic whispers ("LEFT!", "RIGHT!", "SLIDE!", "SURGE!").
   - Weave between lanes, jump over barricades, slide under high-voltage cables, and trigger Chaos Shockwaves.
   - Pursue FuXZero (Agent Zero) into the French Quarter to discover MiiE (Jay IRL) and claim the Grand Victory prize!

### Game Modes:
- **The Genesis Loop (Campaign)**: Play all 3 acts seamlessly in sequence with persistent score, time tracking, and on-chain verification receipt.
- **Arcade Selection**: Jump directly into any of the 3 mini-games for high-score challenges.
- **WaveScope / Chaos Sandbox Lab**: Freely play with the living ferrofluid entity, test microphone / procedural audio synesthesia, switch moods, and inspect real-time reaction packets.
- **Protocol Codex & Art Gallery**: In-game protocol reference and high-resolution concept art viewer.

### Running the Game:
```bash
node server.js
```
Open `http://localhost:3000` (or the Arena live preview URL) in any web browser.


## Contents


- `docs/` — the UE5 build kit (Blueprint architecture, master materials,
  Niagara tendrils, reaction-packet system, performance targets for
  Intel UHD 620-class hardware)
- `concept-art/` — visual direction renders


Built by Stoned Drone LLC. Part of the Stonerverse.
