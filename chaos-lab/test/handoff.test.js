/**
 * Handoff pack tests.
 *
 * The handoff artefacts are the part of this repository that cannot be run:
 * HLSL that Unreal will compile, a CSV that Unreal will import, a folder
 * scaffold the editor will fill in. Nothing here needs a GPU — but a port with
 * a GLSL keyword left in it, or a mood table that has drifted from the
 * prototype it was generated from, would be discovered in the editor by
 * somebody who trusted us. So the contracts are checked statically:
 *
 *   - the HLSL is self-contained (no call to anything Unreal will not have)
 *   - the numbers in it are the kit's numbers, and the prototype's
 *   - the mood CSVs still match the prototype's mood table
 *   - the folder scaffold is intact
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MATERIAL_DEFAULTS } from '../src/core/params.js';
import { MOODS, MOOD_ORDER } from '../src/core/moods.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = join(HERE, '..');
const ROOT = join(LAB, '..');
const CONTENT = join(ROOT, 'Content', 'MirrorBox', 'FuX');
const HLSL_PATH = join(CONTENT, 'Materials', 'FuXChaos.ush');
const MOODS_DIR = join(ROOT, 'handoff', 'moods');

const hlsl = readFileSync(HLSL_PATH, 'utf8');

/** The code, without the prose: a comment naming a function is not a call. */
const hlslCode = hlsl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Everything a Material Expression Custom node can call without being told. */
const HLSL_INTRINSICS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'cosh', 'cross',
  'ddx', 'ddy', 'degrees', 'distance', 'dot', 'exp', 'exp2', 'floor', 'fmod', 'frac',
  'length', 'lerp', 'log', 'log2', 'max', 'min', 'modf', 'mul', 'normalize', 'pow',
  'radians', 'rcp', 'reflect', 'refract', 'round', 'rsqrt', 'saturate', 'sign', 'sin',
  'sincos', 'sinh', 'smoothstep', 'sqrt', 'step', 'tan', 'tanh', 'transpose', 'trunc',
  // Language forms the regex picks up as if they were calls.
  'if', 'for', 'while', 'switch', 'return', 'defined',
  // Constructors.
  'float', 'float2', 'float3', 'float4', 'int', 'uint', 'bool',
]);

describe('the folder scaffold from build kit p.9', () => {
  const folders = [
    'Blueprints', 'Materials', 'Niagara', 'Moods',
    'Reactions', 'Audio', 'Meshes', join('Maps', 'TestLab'),
  ];

  it('has every folder the kit lays out', () => {
    for (const folder of folders) {
      expect(existsSync(join(CONTENT, folder)), `${folder} is missing`).toBe(true);
    }
  });

  it('documents the asset names that belong in each one', () => {
    const manifest = readFileSync(join(CONTENT, 'README.md'), 'utf8');
    for (const asset of [
      'BP_FuXChaosEngine', 'M_FuX_Chaos_Master', 'MI_FuX_Runtime',
      'NS_FuX_SmokeBody', 'NS_FuX_FluidTendrils', 'NS_FuX_MagneticSparks',
      'DA_FuX_Calm', 'DA_FuX_Joyful', 'DA_FuX_Ominous', 'DA_FuX_Wild',
      'BPI_FuXReactive', 'ST_FuXReactionPacket', 'TestLab',
    ]) {
      expect(manifest).toContain(asset);
    }
  });

  it('lists the component tree the actor has to have', () => {
    const manifest = readFileSync(join(CONTENT, 'README.md'), 'utf8');
    for (const component of [
      'SceneRoot', 'FerroCoreMesh', 'WaterSkinMesh', 'NS_SmokeBody',
      'NS_FluidTendrils', 'NS_MagneticSparks', 'ReactionVolume',
      'PointLight_FuX', 'Audio_Murmur',
    ]) {
      expect(manifest).toContain(component);
    }
  });
});

describe('the HLSL port of the material graph', () => {
  it('is syntactically HLSL rather than GLSL', () => {
    // A Custom node gives the compiler no second chance: `vec3` is not a type,
    // `mix` is not a function, and `gl_` names do not exist.
    for (const wrong of [/\bvec[234]\b/, /\bmat[34]\b/, /\bmix\s*\(/, /\bfract\s*\(/,
      /\btexture2D\s*\(/, /\bgl_\w+/, /\bdFdx\s*\(/, /\bmod\s*\(/, /\binversesqrt\s*\(/]) {
      expect(hlsl).not.toMatch(wrong);
    }
  });

  it('has balanced braces', () => {
    const open = (hlsl.match(/\{/g) ?? []).length;
    const close = (hlsl.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(10);
  });

  it('declares the six functions the graph is made of', () => {
    for (const fn of [
      'FuXFlowField', 'FuXPressure', 'FuXSpikeField', 'FuXBreath',
      'FuXWorldPositionOffset', 'FuXEmissive',
    ]) {
      expect(hlsl).toMatch(new RegExp(`float3?\\s+${fn}\\s*\\(`));
    }
  });

  it('every function it calls is defined in the file or is an intrinsic', () => {
    // This is the check that matters for Custom nodes: paste one function into
    // a node and it must still compile, so it may not call a sibling that only
    // exists because it sits in the same file.
    const defined = new Set([...hlslCode.matchAll(/^\s*(?:float|float3)\s+(\w+)\s*\(/gm)].map((m) => m[1]));
    const called = new Set([...hlslCode.matchAll(/(?:^|[^.\w])(\w+)\s*\(/g)].map((m) => m[1]));
    const unresolved = [...called].filter((name) => !defined.has(name) && !HLSL_INTRINSICS.has(name));
    expect(unresolved, `undefined calls: ${unresolved.join(', ')}`).toEqual([]);
  });

  it('every variable a function uses is its own parameter, local, or a constant', () => {
    // The same self-containment rule one level down. A Custom node sees its
    // own body and nothing else, so an identifier that is not a parameter, a
    // local, a #define, or an intrinsic would be a compile error in the editor
    // — and a typo like `BreathAmt` is exactly the kind of thing that survives
    // review in a file nobody here can compile.
    const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'return', 'const',
      'float', 'float2', 'float3', 'float4', 'int', 'void', 'true', 'false']);
    const DEFINES = new Set([...hlslCode.matchAll(/#define\s+(\w+)/g)].map((m) => m[1]));
    const FUNCTIONS = new Set([...hlslCode.matchAll(/^\s*(?:float3?|void)\s+(\w+)\s*\(/gm)].map((m) => m[1]));

    const signature = /^\s*(?:float3?)\s+(\w+)\s*\(/gm;
    const unresolved = [];
    let match;

    while ((match = signature.exec(hlslCode))) {
      const name = match[1];
      const open = hlslCode.indexOf('{', match.index);
      let depth = 0;
      let end = open;
      for (; end < hlslCode.length; end += 1) {
        if (hlslCode[end] === '{') depth += 1;
        if (hlslCode[end] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }

      const header = hlslCode.slice(match.index, open);
      const body = hlslCode.slice(open + 1, end);
      const scoped = new Set([
        ...[...header.matchAll(/(?:float3?|int)\s+(\w+)\s*(?:=[^,)]*)?(?=[,)])/g)].map((x) => x[1]),
        ...[...body.matchAll(/(?:float3?|int)\s+(\w+)\s*=/g)].map((x) => x[1]),
        ...[...body.matchAll(/for\s*\(\s*int\s+(\w+)/g)].map((x) => x[1]),
      ]);

      // Swizzles are member access, not identifiers of their own.
      const used = [...body.replace(/\.\w+/g, '').matchAll(/\b([A-Za-z_]\w*)\b/g)].map((x) => x[1]);
      for (const id of used) {
        if (KEYWORDS.has(id) || HLSL_INTRINSICS.has(id)) continue;
        if (DEFINES.has(id) || FUNCTIONS.has(id) || scoped.has(id)) continue;
        unresolved.push(`${name}: ${id}`);
      }
    }

    expect([...new Set(unresolved)]).toEqual([]);
  });

  it('keeps the kit equations verbatim in structure', () => {
    expect(hlsl).toContain('pow(saturate(noise * Pressure), 5.0)');
    expect(hlsl).toContain('sin(Time * BreathRate) * BreathAmount');
    expect(hlsl).toContain('(Flow + Spikes) * (basePulse + ReactionStrength)');
    expect(hlsl).toContain('lerp(Purple, ToxicLime, answer)');
    expect(hlsl).toContain('saturate(AudioLow + Threat + Touch)');
  });

  it('carries the kit start values, and agrees with the prototype about them', () => {
    const numbers = {
      FUX_GLOW_DEFAULT: 'glow',
      FUX_BREATH_RATE_DEFAULT: 'breathRate',
      FUX_DISPLACE_CM_DEFAULT: 'displace',
      FUX_FLOW_SPEED_DEFAULT: 'flowSpeed',
      FUX_OPACITY_DEFAULT: 'opacity',
      FUX_EDGE_SHARPNESS_DEFAULT: 'edgeSharpness',
    };
    for (const [define, key] of Object.entries(numbers)) {
      const match = hlsl.match(new RegExp(`#define\\s+${define}\\s+([\\d.]+)`));
      expect(match, `${define} is missing`).not.toBeNull();
      expect(Number(match[1])).toBe(MATERIAL_DEFAULTS[key]);
    }
  });

  it('uses every define it declares', () => {
    // Every constant is either used in the code or is one of the kit's start
    // values, which appear as the default argument of the function that takes
    // that parameter.
    const declares = [...hlsl.matchAll(/#define\s+(\w+)/g)].map((m) => m[1]);
    for (const name of declares) {
      const uses = hlsl.split(new RegExp(`\\b${name}\\b`)).length - 1;
      expect(uses, `${name} is declared but never used`).toBeGreaterThan(1);
    }
  });

  it('converts centimetres to metres exactly once, in the WPO function', () => {
    // Displace is authored in centimetres so the mood assets keep the numbers
    // the kit prints; the conversion has to happen in one place, or an offset
    // scaled twice tears the silhouette apart.
    expect(hlsl).toMatch(/#define\s+FUX_CM_TO_M\s+0\.01/);
    expect(hlsl.match(/FUX_CM_TO_M/g)?.length ?? 0).toBe(2);
  });

  it('names, in the materials README, only functions that exist', () => {
    // The README is how somebody wires the nodes by hand; a function that has
    // been renamed in the HLSL must not be left behind in the table there.
    const readme = readFileSync(join(CONTENT, 'Materials', 'README.md'), 'utf8');
    const table = readme.slice(readme.indexOf('| Node |'), readme.indexOf('## Shading'));
    // The second column of that table is the function each node pastes in;
    // the parameter-collection table elsewhere in the file names things that
    // are not functions at all.
    const named = table
      .split('\n')
      .filter((row) => row.startsWith('|') && !row.startsWith('| ---') && !row.startsWith('| Node'))
      .flatMap((row) => [...row.split('|')[2].matchAll(/`(\w+)`/g)].map((m) => m[1]));
    expect(named.length).toBeGreaterThan(6);
    for (const fn of new Set(named)) {
      expect(hlsl, `${fn} is documented but not defined`).toMatch(new RegExp(`\\b${fn}\\s*\\(`));
    }
  });

  it('carries the safety clamp that priority one calls for', () => {
    expect(hlsl).toContain('float3 FuXApplySafety');
    expect(hlsl).toContain('float3 FuXClampTravel');
    expect(hlsl).toContain('FUX_MAX_TRAVEL');
  });
});

describe('the mood tables', () => {
  const csv = readFileSync(join(MOODS_DIR, 'DA_FuX_Moods.csv'), 'utf8');
  const rows = csv.trim().split('\n');

  it('is current with the prototype mood table', () => {
    const output = execFileSync('node', [join(LAB, 'tools', 'moods-to-csv.mjs'), '--check'], {
      cwd: LAB,
      encoding: 'utf8',
    });
    expect(output).toContain('up to date');
  });

  it('has the twelve DA_EntityMood fields in the kit order', () => {
    expect(rows[0]).toBe(
      'Name,PrimaryColor,SecondaryColor,BreathRate,FlowSpeed,DisplaceAmount,FilamentCount,'
      + 'SparkRate,ResponseDelay,TouchAttraction,AudioGainLow,AudioGainMid,AudioGainHigh',
    );
  });

  it('carries one row per mood, named for the Data Assets', () => {
    const names = rows.slice(1).map((row) => row.split(',')[0]);
    expect(names).toEqual(['Calm', 'Joyful', 'Ominous', 'Wild']);
    expect(names.map((name) => `DA_FuX_${name}`).length).toBe(MOOD_ORDER.length);
  });

  it('keeps every colour a linear FLinearColor literal', () => {
    for (const row of rows.slice(1)) {
      for (const colour of row.match(/\(R=[^)]+\)/g) ?? []) {
        expect(colour).toMatch(/^\(R=[\d.]+,[G]=[\d.]+,[B]=[\d.]+,[A]=[\d.]+\)$/);
      }
    }
    expect((rows[1].match(/\(R=/g) ?? []).length).toBe(2);
  });

  it('carries the prototype values rather than a retyped copy', () => {
    for (const key of MOOD_ORDER) {
      const mood = MOODS[key];
      const row = rows.find((line) => line.startsWith(`${mood.label},`));
      expect(row, `${key} row is missing`).toBeDefined();
      const cells = row.match(/"(?:[^"]*)",?|[^,]+,?/g).map((cell) => cell.replace(/^"|",?$|,$/g, ''));
      expect(Number(cells[3])).toBe(mood.breathRate);
      expect(Number(cells[5])).toBe(mood.displaceAmount);
      expect(Number(cells[7])).toBe(mood.sparkRate);
      expect(Number(cells[10])).toBe(mood.audioGainLow);
    }
  });

  it('ships the prototype-only tuning values too', () => {
    const tuning = readFileSync(join(MOODS_DIR, 'DA_FuX_MoodTuning.csv'), 'utf8');
    expect(tuning.split('\n')[0]).toBe('Name,ChaosAnchor,SpikeBias,SmokeCurl,OrbitSpeed,Glow,Opacity');
    expect(tuning).toContain('Calm,12,');
    expect(tuning).toContain('Wild,94,');
  });

  it('explains the import in a README beside the CSVs', () => {
    const readme = readFileSync(join(MOODS_DIR, 'README.md'), 'utf8');
    expect(readme).toContain('FEntityMood');
    expect(readme).toContain('linear');
  });
});
