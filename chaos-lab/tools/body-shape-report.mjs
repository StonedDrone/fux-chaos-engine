/**
 * Body shape report — and a picture of it.
 *
 * FuX's silhouette is a radius as a function of direction, and this tool does
 * the two things a browser would otherwise do by eye: it measures that
 * function, and it draws it. There is no GPU in this environment, so the same
 * field the shaders evaluate is sampled here on the CPU.
 *
 *   node tools/body-shape-report.mjs
 *   node tools/body-shape-report.mjs --out reference/body-shape.png
 *
 * The render is an orthographic ray-solve against the radius field, shaded from
 * the field's own normals. It is not the WebGL result — no bloom, no ferrofluid
 * shading, no particles, no skin — it is the *shape*, which is the part that
 * could not be checked any other way here.
 *
 * Because a radius evaluation is expensive in JS (~40µs), the field is sampled
 * once per panel onto a latitude/longitude grid and interpolated for the
 * million ray steps. The tool prints the error that introduces, measured
 * against direct evaluation, so the picture cannot quietly drift from the
 * shader.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BODY, bodyAmount } from '../src/core/params.js';
import {
  fuxBodyRadius,
  fuxBodyShape,
  silhouetteChange,
  silhouetteSpread,
  sphereDirections,
} from '../src/render/bodyShape.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------------------
// The field, sampled onto a grid
// ---------------------------------------------------------------------------

const LAT = 160;  // rows of polar angle, 0..PI
const LON = 320;  // columns of azimuth, 0..2PI

/**
 * Radius over the sphere, plus the surface normals that follow from it.
 *
 * A star-shaped surface — every point is `radius(direction) * direction` — has
 * normals from two tangents of that map, which is exactly how `fuxBodyNormal`
 * builds them in the shader; here they come from neighbouring grid samples
 * instead of neighbouring directions.
 */
function sampleField(time, amount) {
  const radius = new Float64Array((LAT + 1) * LON);
  const point = new Float64Array((LAT + 1) * LON * 3);
  let peak = 0;

  for (let i = 0; i <= LAT; i += 1) {
    const phi = (i / LAT) * Math.PI;
    const sinPhi = Math.sin(phi);
    const y = Math.cos(phi);
    for (let j = 0; j < LON; j += 1) {
      const theta = (j / LON) * Math.PI * 2;
      const u = [sinPhi * Math.cos(theta), y, sinPhi * Math.sin(theta)];
      const r = fuxBodyRadius(u, time, amount);
      const at = i * LON + j;
      radius[at] = r;
      point[at * 3] = u[0] * r;
      point[at * 3 + 1] = u[1] * r;
      point[at * 3 + 2] = u[2] * r;
      if (r > peak) peak = r;
    }
  }

  const normal = new Float64Array((LAT + 1) * LON * 3);
  for (let i = 0; i <= LAT; i += 1) {
    for (let j = 0; j < LON; j += 1) {
      const at = i * LON + j;
      const jm = (j + LON - 1) % LON;
      const jp = (j + 1) % LON;
      const im = i === 0 ? 0 : i - 1;
      const ip = i === LAT ? LAT : i + 1;

      const alongLon = [0, 1, 2].map((k) => point[(i * LON + jp) * 3 + k] - point[(i * LON + jm) * 3 + k]);
      const alongLat = [0, 1, 2].map((k) => point[(ip * LON + j) * 3 + k] - point[(im * LON + j) * 3 + k]);

      const cross = [
        alongLat[1] * alongLon[2] - alongLat[2] * alongLon[1],
        alongLat[2] * alongLon[0] - alongLat[0] * alongLon[2],
        alongLat[0] * alongLon[1] - alongLat[1] * alongLon[0],
      ];
      const length = Math.hypot(cross[0], cross[1], cross[2]);
      if (length < 1e-12) {
        // Degenerate at the poles, where every column meets: face outward.
        const phi = (i / LAT) * Math.PI;
        normal[at * 3] = 0;
        normal[at * 3 + 1] = Math.cos(phi) >= 0 ? 1 : -1;
        normal[at * 3 + 2] = 0;
        continue;
      }
      const outward = point[at * 3] * cross[0] + point[at * 3 + 1] * cross[1] + point[at * 3 + 2] * cross[2] > 0 ? 1 : -1;
      normal[at * 3] = (outward * cross[0]) / length;
      normal[at * 3 + 1] = (outward * cross[1]) / length;
      normal[at * 3 + 2] = (outward * cross[2]) / length;
    }
  }

  return { radius, normal, peak };
}

/** Bilinear lookup of a grid row-set at a unit direction. */
function lookup(grid, u, components = 1) {
  const phi = Math.acos(Math.max(-1, Math.min(1, u[1])));
  let ifloat = (phi / Math.PI) * LAT;
  ifloat = Math.max(0, Math.min(LAT - 1e-9, ifloat));
  const i0 = Math.floor(ifloat);
  const fi = ifloat - i0;
  const i1 = i0 + 1;

  let jfloat = (Math.atan2(u[2], u[0]) / (Math.PI * 2)) * LON;
  jfloat -= Math.floor(jfloat / LON) * LON;
  const j0 = Math.floor(jfloat);
  const fj = jfloat - j0;
  const j1 = (j0 + 1) % LON;

  const out = [];
  for (let k = 0; k < components; k += 1) {
    const a = grid[(i0 * LON + j0) * components + k];
    const b = grid[(i0 * LON + j1) * components + k];
    const c = grid[(i1 * LON + j0) * components + k];
    const d = grid[(i1 * LON + j1) * components + k];
    out.push((a * (1 - fj) + b * fj) * (1 - fi) + (c * (1 - fj) + d * fj) * fi);
  }
  return out;
}

/** How far the interpolated field strays from the real one — printed, not hidden. */
function interpolationError(time, amount) {
  const field = sampleField(time, amount);
  let worst = 0;
  for (const dir of sphereDirections(1500)) {
    const exact = fuxBodyRadius(dir, time, amount);
    const sampled = lookup(field.radius, dir)[0];
    worst = Math.max(worst, Math.abs(exact - sampled));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function report(interpError) {
  const rest = bodyAmount();
  const excited = bodyAmount({ chaos: 1 });
  const calm = bodyAmount({ chaos: 1, safety: 1 });
  const lines = [];
  const stat = (label, value) => lines.push(`  ${label.padEnd(24)} ${value}`);

  lines.push('Body shape — deviation from a sphere, over the whole surface');
  stat('at rest', `±${(rest * 100).toFixed(0)}% of the radius`);
  stat('full chaos', `±${(excited * 100).toFixed(0)}%`);
  stat('low stimulation', `±${(calm * 100).toFixed(0)}% (smaller, still moving)`);

  const spreadOverSphere = [];
  for (const time of [0, 3.5, 11, 27, 44]) {
    for (const dir of sphereDirections(2000)) spreadOverSphere.push(fuxBodyShape(dir, time));
  }
  spreadOverSphere.sort((a, b) => a - b);
  const at = (p) => spreadOverSphere[Math.floor(p * (spreadOverSphere.length - 1))];
  const clipped = spreadOverSphere.filter((v) => Math.abs(v) >= BODY.shapeLimit - 1e-9).length;

  lines.push('');
  lines.push('Normalised shape, 10,000 direction-time samples');
  stat('range', `${at(0).toFixed(2)} .. ${at(1).toFixed(2)}`);
  stat('1st / 99th percentile', `${at(0.01).toFixed(2)} .. ${at(0.99).toFixed(2)}`);
  stat('clamped at the limit', `${((clipped / spreadOverSphere.length) * 100).toFixed(2)}%`);

  lines.push('');
  lines.push('Silhouette: distance from the centre of the mass');
  for (const [label, amount] of [['rest', rest], ['full chaos', excited], ['low stimulation', calm]]) {
    const s = silhouetteSpread(6, amount);
    stat(label, `mean ${s.mean.toFixed(2)}   min ${s.min.toFixed(2)}   max ${s.max.toFixed(2)}   std ${s.std.toFixed(3)}`);
  }

  lines.push('');
  lines.push('Motion: mean change in radius over an interval (a sphere = 0)');
  for (const seconds of [0.25, 0.5, 1, 2, 4, 8]) {
    stat(`${seconds}s`, silhouetteChange(0, seconds, rest).toFixed(4));
  }
  lines.push('');
  lines.push('Motion does not decay — the same half-second, later in the run');
  for (const start of [0, 30, 120, 600, 3600]) {
    stat(`t=${start}s .. ${start + 0.5}s`, silhouetteChange(start, start + 0.5, rest).toFixed(4));
  }

  lines.push('');
  stat('grid interpolation error', `${interpError.toExponential(1)} of the radius`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGB PNG writer — a 13-byte header, then deflated scanlines. */
function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 2;  // truecolour
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// A 3x5 font, for the labels only
// ---------------------------------------------------------------------------

const FONT = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['111', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  E: ['111', '100', '110', '100', '111'],
  H: ['101', '101', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  R: ['111', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  X: ['101', '101', '010', '101', '101'],
  '=': ['000', '111', '000', '111', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

/** Draw text into an RGB buffer. Only the label glyphs above exist. */
function drawText(pixels, width, text, x0, y0, scale, rgb) {
  let x = x0;
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw];
    if (!glyph) continue;
    for (let gy = 0; gy < 5; gy += 1) {
      for (let gx = 0; gx < 3; gx += 1) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = x + gx * scale + sx;
            const py = y0 + gy * scale + sy;
            const at = (py * width + px) * 3;
            pixels[at] = rgb[0];
            pixels[at + 1] = rgb[1];
            pixels[at + 2] = rgb[2];
          }
        }
      }
    }
    x += 4 * scale;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const BACKGROUND = [9, 6, 17];
const INK = [150, 150, 175];
const GUIDE = [58, 40, 90];

const LIGHT = normalize3([-0.42, 0.6, 0.68]);
const VIEW = [0, 0, 1];
const HALF = normalize3([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

const mix3 = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);

const VIOLET = [146, 84, 255];
const TEAL = [26, 226, 200];
const LIME = [186, 255, 40];
const BONE = [240, 240, 255];

/**
 * Ferrofluid-style shading of one surface point. Deliberately generic: this is
 * a shape preview, and the app's own materials do the real thing.
 */
function shade(dir, normal) {
  const diffuse = Math.max(normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2], 0);
  const specular = Math.max(normal[0] * HALF[0] + normal[1] * HALF[1] + normal[2] * HALF[2], 0) ** 20;
  const rim = (1 - Math.max(normal[2], 0)) ** 3;
  const facing = Math.max(normal[2], 0);

  // Colour runs across the form so the surface reads as a turning body rather
  // than a flat disc: violet in the light, teal around the edge, lime specks.
  const base = mix3(VIOLET, TEAL, Math.min(rim * 1.6, 1));
  const lit = mix3(base, BONE, specular * 0.85);
  const amount = 0.12 + diffuse * 0.62 + specular * 0.5 + rim * 0.18 * facing;
  const glow = rim * rim * 0.5;

  return [
    Math.min(255, lit[0] * amount + rim * 30),
    Math.min(255, lit[1] * amount + rim * 12),
    Math.min(255, lit[2] * amount + LIME[2] * glow * 0.12),
  ].map((v) => Math.max(0, Math.round(v)));
}

/**
 * Render one panel: orthographic camera down -Z, body centred at the origin.
 * For each pixel the view ray walks inward and stops where it first enters the
 * mass; the normal at that point comes from the sampled field.
 */
function renderPanel(panel, time, amount, field) {
  const pixels = Buffer.alloc(panel * panel * 3);
  const span = 1.5;                    // world units from the centre to the edge
  const bound = field.peak + 0.002;    // nothing outside this sphere
  const steps = 44;
  const bisections = 12;

  for (let y = 0; y < panel; y += 1) {
    const wy = ((panel / 2 - (y + 0.5)) / (panel / 2)) * span;
    for (let x = 0; x < panel; x += 1) {
      const wx = (((x + 0.5) - panel / 2) / (panel / 2)) * span;
      const d = Math.hypot(wx, wy);
      const at = (y * panel + x) * 3;

      if (d > bound) {
        pixels[at] = BACKGROUND[0];
        pixels[at + 1] = BACKGROUND[1];
        pixels[at + 2] = BACKGROUND[2];
        continue;
      }

      // Inside the bound sphere the ray runs from z = +h to z = -h; find where
      // it enters the mass. The radius is bounded below, so there is no risk of
      // marching through a solid region without seeing it.
      const h = Math.sqrt(Math.max(bound * bound - d * d, 0));
      let z = h;
      let outside = true;
      let lo = h;
      let hi = h;
      for (let s = 0; s <= steps; s += 1) {
        z = h - (2 * h * s) / steps;
        const length = Math.hypot(d, z);
        const u = [wx / length, wy / length, z / length];
        const r = lookup(field.radius, u)[0];
        const inside = r >= length;
        if (inside) {
          lo = outside ? h : hi;
          hi = z;
          break;
        }
        outside = true;
        lo = z;
        hi = z;
      }

      if (hi === lo) {
        // Never entered: a grazing pixel just outside the silhouette.
        pixels[at] = BACKGROUND[0];
        pixels[at + 1] = BACKGROUND[1];
        pixels[at + 2] = BACKGROUND[2];
        continue;
      }

      for (let k = 0; k < bisections; k += 1) {
        const mid = (lo + hi) / 2;
        const length = Math.hypot(d, mid);
        const r = lookup(field.radius, [wx / length, wy / length, mid / length])[0];
        if (r >= length) hi = mid;
        else lo = mid;
      }

      // Shade at the midpoint of the final bracket: cheap antialiasing against
      // the silhouette, where the bracket is wide.
      const zHit = (lo + hi) / 2;
      const length = Math.hypot(d, zHit);
      const u = [wx / length, wy / length, zHit / length];
      const covered = 1 - Math.min((hi - lo) / (2 * h / steps), 1);
      const normal = normalize3(lookup(field.normal, u, 3));
      const colour = shade(u, normal);
      const edge = 0.35 * (1 - covered) + 0.65;
      pixels[at] = Math.round(colour[0] * edge);
      pixels[at + 1] = Math.round(colour[1] * edge);
      pixels[at + 2] = Math.round(colour[2] * edge);
    }
  }

  // A dashed circle of radius 1 — the sphere FuX would be if he had one.
  const centre = panel / 2 - 0.5;
  const guideRadius = (1 / span) * (panel / 2);
  for (let a = 0; a < 720; a += 1) {
    if ((a >> 2) % 3 !== 0) continue;
    const angle = (a / 720) * Math.PI * 2;
    const gx = Math.round(centre + Math.cos(angle) * guideRadius);
    const gy = Math.round(centre - Math.sin(angle) * guideRadius);
    if (gx < 0 || gy < 0 || gx >= panel || gy >= panel) continue;
    const at = (gy * panel + gx) * 3;
    const luma = (pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3;
    pixels[at] = Math.round(pixels[at] * 0.55 + GUIDE[0] * (luma > 30 ? 0.45 : 1));
    pixels[at + 1] = Math.round(pixels[at + 1] * 0.55 + GUIDE[1] * (luma > 30 ? 0.45 : 1));
    pixels[at + 2] = Math.round(pixels[at + 2] * 0.55 + GUIDE[2] * (luma > 30 ? 0.45 : 1));
  }

  return pixels;
}

/** A strip of the same body at several moments, at rest and at full chaos. */
function renderSheet({ panel = 200, times = [0, 4, 12, 30], chaosTimes = [0, 4, 12, 30], rest, chaos }) {
  const rows = [
    { amount: rest, times, caption: (t) => `T=${t}S` },
    { amount: chaos, times: chaosTimes, caption: (t) => `T=${t}S` },
  ];
  const columns = Math.max(times.length, chaosTimes.length);
  const width = panel * columns;
  const height = panel * rows.length;
  const canvas = Buffer.alloc(width * height * 3).fill(0);

  const stats = [];
  rows.forEach((row, rowIndex) => {
    row.times.forEach((time, column) => {
      const field = sampleField(time, row.amount);
      const tile = renderPanel(panel, time, row.amount, field);
      for (let y = 0; y < panel; y += 1) {
        const target = ((rowIndex * panel + y) * width + column * panel) * 3;
        tile.copy(canvas, target, y * panel * 3, (y + 1) * panel * 3);
      }
      drawText(canvas, width, row.caption(time), column * panel + 8, rowIndex * panel + 8, 2, INK);
      if (column === 0) {
        drawText(canvas, width, rowIndex === 0 ? 'REST' : 'CHAOS', 8, rowIndex * panel + 26, 2, rowIndex === 0 ? VIOLET : LIME);
      }
      stats.push({ row: rowIndex, time, ...silhouetteSpread(time, row.amount) });
    });
  });

  // Caption the sheet itself.
  drawText(canvas, width, 'FUX BODY SHAPE - SAMPLED FIELD', 8, height - 16, 2, [90, 90, 110]);
  drawText(canvas, width, 'DASHED = UNIT SPHERE', width - 176, height - 16, 2, GUIDE);

  return { width, height, canvas, stats };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

/** A `--flag value` argument, or the fallback. */
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

export function main() {
  const outPath = join(ROOT, flag('out', 'reference/body-shape.png'));
  const panel = Number(flag('size', 200));
  const times = flag('times', '0,4,12,30').split(',').map(Number);
  const chaosTimes = flag('chaos-times', flag('times', '0,4,12,30')).split(',').map(Number);
  const rest = bodyAmount();
  const chaos = bodyAmount({ chaos: 1 });

  if (!args.includes('--quiet')) console.log(report(interpolationError(0, rest)));

  const { width, height, canvas, stats } = renderSheet({
    panel, times, chaosTimes, rest, chaos,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(width, height, canvas));

  console.log('');
  console.log('Sheet: top row at rest, bottom row at full chaos; dashed circle = unit sphere.');
  for (const s of stats) {
    const which = s.row === 0 ? 'rest ' : 'chaos';
    console.log(`  ${which} t=${String(s.time).padStart(2)}s   min ${s.min.toFixed(2)}  max ${s.max.toFixed(2)}  std ${s.std.toFixed(3)}`);
  }
  console.log(`\nWrote ${outPath} — ${width}x${height} px.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
