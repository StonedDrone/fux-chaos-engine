/**
 * Mood Data Assets -> CSV for UE5 import.
 *
 * The four moods are the part of the build kit most likely to be retyped by
 * hand and mistyped: they are twelve numbers each, they were tuned in the
 * browser prototype, and "Calm = violet + teal; curious" is not a value anyone
 * can check by eye. So the prototype's `MOODS` table is the source, and the
 * CSV that Unreal imports is generated from it.
 *
 *   node tools/moods-to-csv.mjs
 *   node tools/moods-to-csv.mjs --check   # fail if the CSVs are stale
 *
 * Two files are written:
 *
 *   handoff/moods/DA_FuX_Moods.csv        the twelve DA_EntityMood fields,
 *                                         import-ready for a DataTable whose
 *                                         row struct is FEntityMood
 *   handoff/moods/DA_FuX_MoodTuning.csv   the prototype-only values the kit's
 *                                         struct does not carry yet
 *
 * Colours are converted from the prototype's sRGB hex to the linear values an
 * `FLinearColor` column expects. Dropping the sRGB numbers straight into a
 * linear colour would make every mood read washed out next to the prototype.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MOODS, MOOD_ORDER } from '../src/core/moods.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'handoff', 'moods');

/** The fields of `DA_EntityMood`, in the order the build kit lists them. */
const ENTITY_MOOD_FIELDS = [
  'PrimaryColor',
  'SecondaryColor',
  'BreathRate',
  'FlowSpeed',
  'DisplaceAmount',
  'FilamentCount',
  'SparkRate',
  'ResponseDelay',
  'TouchAttraction',
  'AudioGainLow',
  'AudioGainMid',
  'AudioGainHigh',
];

/** Prototype values the kit's struct does not carry yet, in its own table. */
const TUNING_FIELDS = ['ChaosAnchor', 'SpikeBias', 'SmokeCurl', 'OrbitSpeed', 'Glow', 'Opacity'];

const MOOD_KEY = { calm: 'Calm', joyful: 'Joyful', ominous: 'Ominous', wild: 'Wild' };

/** `#rrggbb` -> the `(R=,G=,B=,A=)` literal an FLinearColor column reads. */
function linearColor(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    // The sRGB transfer function, the inverse of what Unreal applies on
    // display. Values below the linear segment use the 12.92 branch.
    const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    return linear.toFixed(4);
  });
  return `(R=${channels[0]},G=${channels[1]},B=${channels[2]},A=1.0000)`;
}

/** The prototype's camelCase field names against the kit's struct fields. */
function fieldValue(mood, field) {
  switch (field) {
    case 'PrimaryColor': return linearColor(mood.primaryColor);
    case 'SecondaryColor': return linearColor(mood.secondaryColor);
    case 'BreathRate': return mood.breathRate;
    case 'FlowSpeed': return mood.flowSpeed;
    case 'DisplaceAmount': return mood.displaceAmount;
    case 'FilamentCount': return mood.filamentCount;
    case 'SparkRate': return mood.sparkRate;
    case 'ResponseDelay': return mood.responseDelay;
    case 'TouchAttraction': return mood.touchAttraction;
    case 'AudioGainLow': return mood.audioGainLow;
    case 'AudioGainMid': return mood.audioGainMid;
    case 'AudioGainHigh': return mood.audioGainHigh;
    default: throw new Error(`no mapping for DA_EntityMood field ${field}`);
  }
}

function tuningValue(mood, field) {
  switch (field) {
    case 'ChaosAnchor': return mood.chaosAnchor;
    case 'SpikeBias': return mood.spikeBias;
    case 'SmokeCurl': return mood.smokeCurl;
    case 'OrbitSpeed': return mood.orbitSpeed;
    case 'Glow': return mood.glow;
    case 'Opacity': return mood.opacity;
    default: throw new Error(`no mapping for tuning field ${field}`);
  }
}

/** A CSV cell, quoted only when it has to be (colours contain commas). */
const cell = (value) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text}"` : text;
};

function writeCsv(fields, valueOf) {
  const header = ['Name', ...fields].map(cell).join(',');
  const rows = MOOD_ORDER.map((key) => {
    const mood = MOODS[key];
    return [MOOD_KEY[key], ...fields.map((field) => valueOf(mood, field))].map(cell).join(',');
  });
  return `${[header, ...rows].join('\n')}\n`;
}

const FILES = [
  {
    name: 'DA_FuX_Moods.csv',
    contents: writeCsv(ENTITY_MOOD_FIELDS, fieldValue),
    note: 'twelve DA_EntityMood fields',
  },
  {
    name: 'DA_FuX_MoodTuning.csv',
    contents: writeCsv(TUNING_FIELDS, tuningValue),
    note: 'prototype-only tuning values',
  },
];

function main() {
  const check = process.argv.includes('--check');
  const stale = [];

  for (const file of FILES) {
    const path = join(OUT_DIR, file.name);
    if (check) {
      const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (current !== file.contents) stale.push(file.name);
      continue;
    }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path, file.contents);
    console.log(`Wrote ${path} (${file.note})`);
  }

  if (check && stale.length) {
    console.error(`${stale.join(', ')} out of date. Run: npm run docs:moods`);
    process.exit(1);
  }
  if (check) console.log('handoff/moods is up to date.');
}

main();
