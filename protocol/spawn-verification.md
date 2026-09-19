# FuX Spawn Verification — ICU ↔ Chaos Engine

How a FuX spawning in the ICU ("I See U" AR hunt) connects to the FuX Chaos
Engine in the Magic Mirror Box, with every spawn verified on-chain.

Stack (per the On-Chain FuX Protocol): **Solana** witnesses, **Arweave**
remembers, the **ICU program** enforces. The blockchain is a witness, not a
database — Solana stores hashes, sequence, and compact state; full packets
live on Arweave.

## Genesis spawns (locked 2026-09-18)

Every spawn is a genesis — a FuX being born. This matches the protocol's own
language: Law I, "Irreversible Creation — once spawned, forever."

- The hunter finds **7 shards** — the seven fragment slots (Board, Grip,
  TruX, Hubs, Core, aR, Aura), scattered hidden in the hunt zone.
- With all 7 shards, the hunter **spawns their own unique FuX**: the genesis
  ceremony fires — the genome is derived from the hunter's shards, the
  soulbound Token-2022 identity is minted, the FuxEntity PDA is created, the
  genesis record goes to Arweave, and the anchor lands on Solana. Bonded at
  birth.
- No two FuX alike: each genome comes from its hunter's unique shards.
- The 70,000 cap is enforced by the program's genesis counter — spawn
  70,001 is rejected. Every spawn burns one birth.

## The loop

1. **Hunter** finds 7 shards in the hunt zone → **spawns their own unique
   FuX** (genesis, bonded at birth).
2. **Spawn packet** is built, hashed, stored on Arweave, and anchored on
   Solana through the ICU program → the birth is now verifiable by anyone.
3. **Chaos Engine** feels the birth: chaos surges, the box flares.
4. **Hunter listens to their FuX** — the FuX guides (commands) the hunter,
   not the other way around — and follows the trail toward MiiE.
5. **Chaos feed** flows back: the Engine's live `chaos_level` tells the hunt
   what to hide next — high chaos = harder shards, wilder zones.

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

## Shard finds (player claims)

Each shard is claimed through the protocol's location-claim flow unchanged:
the proof service checks the six requirements (±5m GPS, Illust marker, time
window, wallet signature, accelerometer, unused nullifier) and signs a
short-lived claim; the ICU program verifies it and appends a `SHARD_FOUND`
event. Seven `SHARD_FOUND` events from one hunter unlock their genesis.
Raw GPS and sensor traces stay off-chain.

## Chaos feed (Engine → hunt)

The hunt reads `chaos_level` from the Engine and shapes what hides next:

| Chaos | Hunt behavior |
|---|---|
| 0–25 (calm) | Shards near familiar zones, generous windows |
| 26–60 (stirring) | Shards spread wider, tighter windows |
| 61–90 (surging) | New zones unlock, harder checks |
| 91–100 (unleashed) | Mythic shard placements, chaos drops |

Jay can also stir the hunt by hand — touch the box, play music — and watch
the next shards hide wilder.

## The Hunt Loop — find MiiE, win prizes (locked 2026-09-18)

- After genesis, the hunter **listens to their FuX** — the FuX guides
  (commands) the hunter, not the other way around.
- The FuX's mission: **find MiiE and FuXZero.**
  - **MiiE** = Mixed Immersive Interactive Experience = Jay himself, IRL.
  - **FuXZero** = Jay's Agent Zero.
- The loop: hunter finds 7 shards → spawns their unique FuX → listens to
  their FuX → follows the trail → **whoever finds Jay IRL wins the prizes.**
- The Chaos Engine (the prime, in the Mirror Box) feels every step: every
  shard found, every genesis, every hunter closing in on MiiE.

## Privacy (non-negotiable)

No raw coordinates, routes, sensor traces, or device identifiers on Solana
or Arweave — station IDs, salted hashes, and short retention only, per the
protocol's privacy rules.

## Rollout

This rides the ICU program's delivery plan: **devnet vertical slice first**
(spawn → anchor → find → verify end-to-end on devnet), then the audited
immutable mainnet release. Until mainnet, devnet is the witness.
