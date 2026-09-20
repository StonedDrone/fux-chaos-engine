/**
 * MilkDrop-Shake bridge — demo packet source.
 *
 * The adapter boundary from build kit p.5: "the bridge can pass a compact
 * packet — energy, low, mid, high, preset ID, and beat trigger — into UE5
 * through Open Sound Control, WebSocket, or a local plugin." This is the
 * WebSocket side of that, with no dependencies, so the lab has something real
 * to talk to before the MilkDrop adapter exists.
 *
 * It simulates what a preset-driven feed looks like: a preset takes over for
 * a few seconds, the bands follow it, and beats fire on a tempo.
 *
 *   node tools/bridge-demo.mjs            # ws://127.0.0.1:8765
 *   node tools/bridge-demo.mjs 9000       # custom port
 *
 * Then in the lab: set the bridge URL and press Connect.
 *
 * NOTE: run this on the same machine as the browser. The lab's live preview
 * runs in a sandbox, and a ws://127.0.0.1 URL always means the machine the
 * browser is on, so the bridge is a local-development and installation-time
 * tool, not something the hosted preview can reach.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8765);
const HZ = 30;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Preset personalities, mirroring how a MilkDrop preset feels. */
const PRESETS = [
  { id: 'crystal-tide', name: 'Crystal Tide', energy: 0.30, low: 0.34, mid: 0.28, high: 0.16, bpm: 72, mood: 'calm' },
  { id: 'neon-swarm', name: 'Neon Swarm', energy: 0.55, low: 0.50, mid: 0.52, high: 0.44, bpm: 96, mood: 'joyful' },
  { id: 'ferro-hymn', name: 'Ferro Hymn', energy: 0.44, low: 0.72, mid: 0.30, high: 0.12, bpm: 64, mood: 'ominous' },
  { id: 'acid-bloom', name: 'Acid Bloom', energy: 0.86, low: 0.82, mid: 0.74, high: 0.70, bpm: 128, mood: 'wild' },
];

const clients = new Set();
let presetIndex = 0;
let presetTime = 0;
let time = 0;
let beatAccumulator = 0;

// ---------------------------------------------------------------------------
// Minimal RFC 6455 server — handshake plus unmasked text frames. A WebSocket
// server is the only thing the bridge needs, and this avoids a dependency for
// what is fundamentally forty lines of framing.
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('This endpoint speaks WebSocket. Point the FuX Chaos Lab bridge at it.\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  socket.setNoDelay(true);
  clients.add(socket);
  console.log(`[bridge] client connected (${clients.size} total)`);

  const drop = () => {
    clients.delete(socket);
    console.log(`[bridge] client disconnected (${clients.size} remaining)`);
  };
  socket.on('close', drop);
  socket.on('error', drop);
  // The bridge is send-only; drain anything the client says so the socket
  // never backs up.
  socket.on('data', () => {});
});

/** Encode one unmasked text frame. */
function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

// ---------------------------------------------------------------------------
// Signal generator
// ---------------------------------------------------------------------------
function step(dt) {
  time += dt;
  presetTime += dt;

  // Hand over to the next preset every 12 seconds, with a short crossfade so
  // the bridge looks like a real engine changing presets rather than a loop.
  if (presetTime > 12) {
    presetTime = 0;
    presetIndex = (presetIndex + 1) % PRESETS.length;
    console.log(`[bridge] preset -> ${PRESETS[presetIndex].name} (${PRESETS[presetIndex].mood})`);
  }

  const preset = PRESETS[presetIndex];
  const next = PRESETS[(presetIndex + 1) % PRESETS.length];
  const blend = Math.min(1, presetTime / 1.2);
  const at = (key) => preset[key] + (next[key] - preset[key]) * blend * 0.35;

  const beatLength = 60 / at('bpm');
  beatAccumulator += dt;
  let beat = false;
  if (beatAccumulator >= beatLength) {
    beatAccumulator -= beatLength;
    beat = true;
  }

  // Organic movement on top of the preset baseline.
  const wobble = (phase, amount) => (Math.sin(time * phase) * 0.5 + 0.5) * amount - amount / 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  const energy = clamp01(at('energy') + wobble(0.7, 0.12) + (beat ? 0.06 : 0));
  const low = clamp01(at('low') + wobble(0.4, 0.16) + (beat ? 0.1 : 0));
  const mid = clamp01(at('mid') + wobble(1.1, 0.14));
  const high = clamp01(at('high') + wobble(2.3, 0.18) + (beat ? 0.08 : 0));

  return {
    energy: round(energy),
    low: round(low),
    mid: round(mid),
    high: round(high),
    beat,
    presetId: preset.id,
    presetName: preset.name,
    moodHint: preset.mood,
  };
}

const round = (v) => Number(v.toFixed(4));

let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const dt = Number(now - last) / 1e9;
  last = now;

  const packet = step(Math.min(dt, 0.1));
  if (!clients.size) return;

  const frame = encodeTextFrame(JSON.stringify(packet));
  for (const socket of clients) {
    if (socket.writable) socket.write(frame);
  }
}, 1000 / HZ);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[bridge] port ${PORT} is already in use — pick another: node tools/bridge-demo.mjs 9000`);
  } else {
    console.error('[bridge] ' + error.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] MilkDrop-Shake packet source listening on ws://127.0.0.1:${PORT}`);
  console.log(
    `[bridge] sending ${HZ} packets/s — paste ws://127.0.0.1:${PORT} into the lab's bridge field.`,
  );
  console.log('[bridge] presets: ' + PRESETS.map((p) => `${p.name} (${p.mood})`).join(', '));
});
