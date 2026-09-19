# FuX Spawn Verification — ICU ↔ Chaos Engine

How a FuX spawning in the ICU ("I See U" AR hunt) connects to the FuX Chaos
Engine in the Magic Mirror Box, with every spawn verified on-chain.

Stack (per the On-Chain FuX Protocol): **Solana** witnesses, **Arweave**
remembers, the **ICU program** enforces. The blockchain is a witness, not a
database — Solana stores hashes, sequence, and compact state; full packets
live on Arweave.

## Genesis spawns (locked 2026-09-18)

ICU spawns ARE genesis. Every spawn is a FuX being born — not an appearance,
a birth. This matches the protocol's own language: Law I, "Irreversible
Creation — once spawned, forever."

- Each spawn commits the seven fragment slots (Board, Grip, TruX, Hubs,
  Core, aR, Aura), scattered hidden in the hunt zone, and derives the
  genome. The FuX is born **wild and unbound** — no hunter at birth.
- The first valid find claim (the 6 checks) assembles the hunter's board:
  **genesis and bonding fire atomically** — the soulbound Token-2022
  identity is minted, the FuxEntity PDA is created, and the identity binds
  to the finder's HunterAccount in one ceremony. **Finding is bonding.**
- The 70,000 cap is enforced by the program's genesis counter — spawn
  70,001 is rejected. Every spawn burns one birth.
- No Bible amendment needed: the seven slots are valid at spawn (Law I
  satisfied), and the hunter is decided by the find, exactly as the hunt
  promises.

## The loop

1. **Spawn brain** triggers a wild genesis — a FuX is born in a hunt zone.
2. **Spawn packet** is built, hashed, stored on Arweave, and anchored on
   Solana through the ICU program → the spawn is now verifiable by anyone.
3. **Chaos Engine** feels the spawn: chaos surges, the box flares.
4. **Player** finds the FuX in AR → location claim (the protocol's 6 checks:
   ±5m GPS, Illust marker, time window, wallet signature, accelerometer,
   unused nullifier) → `SPAWN_FOUND` event appended on-chain → the Engine
   celebrates.
5. **Chaos feed** flows back: the Engine's live `chaos_level` tells the spawn
   brain what to drop next — high chaos = rarer FuX, wilder zones.

## Spawn packet (canonical JSON)

Follows the protocol's canonicalization rules: UTF-8, keys sorted
recursively, lowercase hex, no floats, no raw GPS on-chain (station IDs and
hashes only).

```json
{
  "schema": "fux-spawn/1.0",
  "fuxEntity": "FUX_ENTITY_PDA",
  "spawnId": "SPAWN_SEQUENCE_ID",
  "previousEventHash": "SHA256_HEX",
  "variant": "VARIANT_NAME",
  "rarity": "common|uncommon|rare|legendary|mythic",
  "stationId": "HUNT_STATION_ID",
  "stationHash": "SHA256_HEX",
  "chaosAtSpawn": 0,
  "spawnSlot": "SOLANA_SLOT",
  "spawnBlockhash": "BASE58_BLOCKHASH",
  "issuer": "SPAWN_SERVICE_PUBKEY",
  "signature": "SIGNATURE"
}
```

## Verification path (every spawn)

1. **Build** — canonical spawn bytes + SHA-256 hash.
2. **Preserve** — upload bytes to Arweave, byte-compare the retrieval.
3. **Anchor** — ICU program records the event hash, sequence
   (`current sequence + 1`), and spawn slot on Solana, linked to the FuX's
   `FuxEntity` (`latest_event_hash` updates, history stays append-only).
4. **Confirm** — the hunt client shows the FuX only after the anchor is
   finalized. A pending transaction never counts as a spawn.

A verifier accepts a spawn only when: the Solana anchor, the Arweave bytes,
and the submitted hash all agree — same rule as the protocol's genesis
verification.

## Find path (player claims)

Uses the protocol's location-claim flow unchanged: the proof service checks
the six requirements and signs a short-lived claim; the ICU program verifies
it and appends a `SPAWN_FOUND` event (with a one-use nullifier — no
double-claiming). Raw GPS and sensor traces stay off-chain.

## Chaos feed (Engine → spawn brain)

The spawn brain reads `chaos_level` from the FuX's `FuxEntity` / `ICUState`
and shapes the next drop:

| Chaos | Spawn behavior |
|---|---|
| 0–25 (calm) | Common variants, familiar zones, slow cadence |
| 26–60 (stirring) | Uncommon/rares enter rotation |
| 61–90 (surging) | Rare/legendary, new zones unlock |
| 91–100 (unleashed) | Mythic table opens, chaos drops |

Jay can also stir the hunt by hand — touch the box, play music — and watch
the next spawns come out wilder.

## The Hunt Loop — find MiiE, win prizes (locked 2026-09-18)

The spawned FuX are not just hiding. Each lil FuX has a mission: **find
MiiE and FuXZero.**

- **MiiE** = Mixed Immersive Interactive Experience = Jay himself, IRL.
- **FuXZero** = Jay's Agent Zero.
- The loop: FuX spawn wild (genesis) → hunters find the lil FuX → the lil
  FuX are all seeking MiiE → the trail leads hunters to Jay IRL →
  **whoever finds Jay wins the prizes.**
- The Chaos Engine (the prime, in the Mirror Box) feels every step: every
  spawn, every find, every hunter closing in on MiiE.

## Privacy (non-negotiable)

No raw coordinates, routes, sensor traces, or device identifiers on Solana
or Arweave — station IDs, salted hashes, and short retention only, per the
protocol's privacy rules.

## Rollout

This rides the ICU program's delivery plan: **devnet vertical slice first**
(spawn → anchor → find → verify end-to-end on devnet), then the audited
immutable mainnet release. Until mainnet, devnet is the witness.
