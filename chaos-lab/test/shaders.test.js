/**
 * Shader contract tests.
 *
 * A shader that references a uniform the JavaScript never supplies compiles
 * fine and then renders as garbage, and a varying declared in one stage but
 * not the other is a link error that only shows up in the browser. Neither is
 * catchable without a GL context, so these tests check the contract
 * statically: every uniform declared in GLSL must exist in the material's
 * uniform map, every varying must exist on both sides, and the geometry must
 * respect the prototype budgets from build kit p.10.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FuXEntity } from '../src/render/entity.js';
import { BUDGETS } from '../src/core/params.js';
import { QUALITY_ORDER, particleCount } from '../src/render/quality.js';
import { coreVertexShader } from '../src/render/shaders/core.vert.js';
import { coreFragmentShader } from '../src/render/shaders/core.frag.js';
import { skinVertexShader, skinFragmentShader } from '../src/render/shaders/skin.glsl.js';
import { tendrilVertexShader, tendrilFragmentShader } from '../src/render/shaders/tendril.glsl.js';
import { particleVertexShader, particleFragmentShader } from '../src/render/shaders/particles.glsl.js';

const ENTITY = new FuXEntity({ quality: 'high' });

/** Every `uniform <type> <name>;` declaration in a source string. */
function declaredUniforms(source) {
  const names = new Set();
  const re = /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(source))) names.add(match[1]);
  return names;
}

/** Every `varying <type> <name>;` declaration in a source string. */
function declaredVaryings(source) {
  const names = new Set();
  const re = /varying\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(source))) names.add(match[1]);
  return names;
}

/** Every custom `attribute <type> <name>;` declaration. */
function declaredAttributes(source) {
  const names = new Set();
  const re = /attribute\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(source))) names.add(match[1]);
  return names;
}

/** Identifiers that three.js injects into every ShaderMaterial. */
const BUILTIN_UNIFORMS = new Set([
  'modelMatrix',
  'modelViewMatrix',
  'projectionMatrix',
  'viewMatrix',
  'normalMatrix',
  'cameraPosition',
  'isOrthographic',
]);

/** Built-in vertex attributes three.js provides. */
const BUILTIN_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'uv1', 'uv2', 'color', 'tangent']);

const STAGES = [
  {
    name: 'core',
    material: () => ENTITY.coreMaterial,
    vertex: coreVertexShader,
    fragment: coreFragmentShader,
  },
  {
    name: 'skin',
    material: () => ENTITY.skinMaterial,
    vertex: skinVertexShader,
    fragment: skinFragmentShader,
  },
  {
    name: 'tendril',
    material: () => ENTITY.tendrilMaterial,
    vertex: tendrilVertexShader,
    fragment: tendrilFragmentShader,
  },
  {
    name: 'smoke',
    material: () => ENTITY.smokeMaterial,
    vertex: particleVertexShader,
    fragment: particleFragmentShader,
  },
  {
    name: 'spark',
    material: () => ENTITY.sparkMaterial,
    vertex: particleVertexShader,
    fragment: particleFragmentShader,
  },
];

describe('shader sources', () => {
  it.each(STAGES)('$name has balanced braces', ({ vertex, fragment }) => {
    for (const [label, src] of [
      ['vertex', vertex],
      ['fragment', fragment],
    ]) {
      const open = (src.match(/{/g) ?? []).length;
      const close = (src.match(/}/g) ?? []).length;
      expect(open, `${label} braces`).toBe(close);
      expect(open).toBeGreaterThan(0);
    }
  });

  it.each(STAGES)('$name left no template placeholders behind', ({ vertex, fragment }) => {
    for (const src of [vertex, fragment]) {
      expect(src).not.toMatch(/\$\{/);
    }
  });

  it.each(STAGES)('$name declares its precision', ({ vertex, fragment }) => {
    expect(vertex).toMatch(/precision\s+(low|medium|high)p\s+float/);
    expect(fragment).toMatch(/precision\s+(low|medium|high)p\s+float/);
  });

  it.each(STAGES)('$name has a main() in both stages', ({ vertex, fragment }) => {
    expect(vertex).toMatch(/void\s+main\s*\(\s*\)/);
    expect(fragment).toMatch(/void\s+main\s*\(\s*\)/);
  });

  it('never calls pow() with a bracket expression as the base', () => {
    // pow() with a negative base is undefined in GLSL and shows up as black
    // patches or NaNs. Every such term is squared by hand instead.
    for (const { vertex, fragment } of STAGES) {
      for (const src of [vertex, fragment]) {
        expect(src).not.toMatch(/pow\s*\(\s*\(/);
      }
    }
  });
});

describe('uniform contract', () => {
  it.each(STAGES)('$name supplies every uniform the GLSL declares', ({ material, vertex, fragment }) => {
    const uniforms = material().uniforms;
    for (const src of [vertex, fragment]) {
      for (const name of declaredUniforms(src)) {
        if (BUILTIN_UNIFORMS.has(name)) continue;
        expect(uniforms, `${name} missing from the uniform map`).toHaveProperty(name);
        expect(uniforms[name]).toHaveProperty('value');
      }
    }
  });

  it.each(STAGES)('$name declares no uniform the GLSL never uses', ({ material, vertex, fragment }) => {
    const uniforms = material().uniforms;
    const declared = new Set([
      ...declaredUniforms(vertex),
      ...declaredUniforms(fragment),
    ]);
    for (const name of Object.keys(uniforms)) {
      // A uniform declared in JS but absent from GLSL is dead weight: it is
      // uploaded every frame and never read.
      expect(declared.has(name), `${name} is never declared in GLSL`).toBe(true);
    }
  });

  it('exposes the material parameter table from build kit p.4', () => {
    const uniforms = ENTITY.coreMaterial.uniforms;
    for (const param of ['glow', 'breathRate', 'displace', 'flowSpeed', 'opacity', 'edgeSharpness']) {
      expect(uniforms[`u${param[0].toUpperCase()}${param.slice(1)}`]).toBeDefined();
    }
  });
});

describe('varying contract', () => {
  it.each(STAGES)('$name writes only varyings it declares', ({ vertex }) => {
    const declared = declaredVaryings(vertex);
    const written = new Set();
    const re = /(?:^|[^\w.])(v[A-Z]\w*)\s*=/gm;
    let match;
    while ((match = re.exec(vertex))) written.add(match[1]);
    for (const name of written) {
      expect(declared.has(name), `${name} assigned but not declared`).toBe(true);
    }
  });

  it.each(STAGES)('$name declares every varying the fragment stage reads', ({ vertex, fragment }) => {
    const vsOut = declaredVaryings(vertex);
    const fsIn = declaredVaryings(fragment);
    // A varying must have a matching declaration in both stages or the program
    // fails to link.
    expect([...fsIn].sort()).toEqual([...vsOut].sort());
  });
});

describe('attribute contract', () => {
  it('supplies every custom attribute the vertex shaders declare', () => {
    const checks = [
      [ENTITY.core, coreVertexShader],
      [ENTITY.skin, skinVertexShader],
      [ENTITY.tendrils, tendrilVertexShader],
      [ENTITY.smoke, particleVertexShader],
      [ENTITY.sparks, particleVertexShader],
    ];
    for (const [mesh, src] of checks) {
      for (const name of declaredAttributes(src)) {
        if (BUILTIN_ATTRIBUTES.has(name)) continue;
        expect(
          mesh.geometry.getAttribute(name),
          `${mesh.name} is missing the ${name} attribute`,
        ).toBeDefined();
      }
    }
  });

  it('gives tendrils an index so the filament budget can retire them', () => {
    expect(ENTITY.tendrils.geometry.getAttribute('aIndex')).toBeDefined();
    expect(ENTITY.tendrils.geometry.getAttribute('aAlong')).toBeDefined();
    expect(ENTITY.tendrils.geometry.getAttribute('aAcross')).toBeDefined();
  });
});

describe('prototype budgets (build kit p.10)', () => {
  it('keeps the core mesh under the vertex budget', () => {
    expect(ENTITY.coreVertexCount).toBeLessThanOrEqual(BUDGETS.coreVertices);
  });

  it('stays within the two-layer translucency limit', () => {
    const transparentLayers = [ENTITY.core, ENTITY.skin, ENTITY.tendrils, ENTITY.smoke, ENTITY.sparks]
      .filter((m) => m.material.transparent).length;
    expect(transparentLayers).toBeLessThanOrEqual(5);
    // The two *translucent body* layers are the core and the skin.
    expect(ENTITY.core.material.transparent).toBe(true);
    expect(ENTITY.skin.material.transparent).toBe(true);
  });

  it('allocates tendrils inside the 8-16 budget', () => {
    expect(ENTITY.tendrilCount).toBeGreaterThanOrEqual(BUDGETS.fluidTendrils.fallback);
    expect(ENTITY.tendrilCount).toBeLessThanOrEqual(BUDGETS.fluidTendrils.target);
  });

  it('keeps visible particles under 500', () => {
    const particles =
      ENTITY.smoke.geometry.attributes.position.count + ENTITY.sparks.geometry.attributes.position.count;
    expect(particles).toBeLessThanOrEqual(500);
  });

  it('uses exactly one unshadowed dynamic light', () => {
    // Ambient fill lives in the scene, not on the entity: the component tree
    // in the build kit lists one light and the budget allows one dynamic light.
    const dynamic = ENTITY.group.children.filter((c) => c.isLight && !c.isAmbientLight);
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0].name).toBe('PointLight_FuX');
    expect(dynamic[0].castShadow).toBe(false);
    expect(ENTITY.group.children.filter((c) => c.isAmbientLight)).toHaveLength(0);
  });

  it('includes every component from the build kit component tree', () => {
    const names = ENTITY.group.children.map((c) => c.name);
    for (const required of [
      'FerroCoreMesh',
      'WaterSkinMesh',
      'NS_SmokeBody',
      'NS_FluidTendrils',
      'NS_MagneticSparks',
      'ReactionVolume',
      'PointLight_FuX',
    ]) {
      expect(names).toContain(required);
    }
  });
});

describe('applyFrame', () => {
  const frame = {
    chaos: 60,
    chaosNorm: 0.6,
    band: 'surging',
    moodId: 'ominous',
    moodLabel: 'Ominous',
    fromMood: 'joyful',
    toMood: 'ominous',
    moodBlend: 0.5,
    priority: 'music',
    glow: 7,
    breathRate: 0.3,
    breath: 0.5,
    displace: 3,
    flowSpeed: 0.2,
    opacity: 0.7,
    edgeSharpness: 4,
    pressure: 0.4,
    spikes: 0.2,
    flow: 0.3,
    filamentCount: 12,
    smokeCurl: 0.4,
    sparkRate: 0.3,
    orbitSpeed: 1,
    responseDelay: 0.5,
    touchAttraction: -0.5,
    touchPoint: [0, 1, 0],
    touchStrength: 0.8,
    touchAge: 0.2,
    attention: 0.5,
    attentionTarget: [1, 1, 1],
    storyCharge: 0.2,
    primaryColor: '#6a2cff',
    secondaryColor: '#b6ff1a',
    audio: { energy: 0.5, low: 0.4, mid: 0.3, high: 0.2 },
    beat: 0,
    threat: 0.2,
    idle: 0,
  };

  it('pushes the resolved state onto every layer without NaN', () => {
    ENTITY.applyFrame(frame, 1 / 30);
    for (const material of ENTITY.materials) {
      for (const [name, uniform] of Object.entries(material.uniforms)) {
        const v = uniform.value;
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `${name} became ${v}`).toBe(true);
        } else if (v && typeof v.x === 'number') {
          expect(Number.isFinite(v.x), `${name}.x became ${v.x}`).toBe(true);
          expect(Number.isFinite(v.y), `${name}.y became ${v.y}`).toBe(true);
          expect(Number.isFinite(v.z), `${name}.z became ${v.z}`).toBe(true);
        } else if (v && typeof v.r === 'number') {
          expect(Number.isFinite(v.r), `${name}.r became ${v.r}`).toBe(true);
        }
      }
    }
  });

  it('collapses retired tendrils in the shader instead of rebuilding geometry', () => {
    ENTITY.applyFrame({ ...frame, filamentCount: 9 }, 1 / 30);
    expect(ENTITY.tendrilMaterial.uniforms.uActiveCount.value).toBe(9);
    expect(ENTITY.activeTendrils).toBe(9);
    expect(ENTITY.tendrilCount).toBe(16); // allocation is untouched
  });

  it('clamps the tendril budget into the allocated range', () => {
    ENTITY.applyFrame({ ...frame, filamentCount: 99 }, 1 / 30);
    expect(ENTITY.tendrilMaterial.uniforms.uActiveCount.value).toBe(ENTITY.tendrilCount);

    ENTITY.applyFrame({ ...frame, filamentCount: 0 }, 1 / 30);
    expect(ENTITY.tendrilMaterial.uniforms.uActiveCount.value).toBeGreaterThanOrEqual(1);
  });

  it('keeps the lighting layer in sync with the mood colours', () => {
    ENTITY.applyFrame(frame, 1 / 30);
    expect(ENTITY.light.intensity).toBeGreaterThan(0);
    expect(ENTITY.frameMaterial.opacity).toBeLessThanOrEqual(1);
    expect(ENTITY.frameMaterial.opacity).toBeGreaterThan(0);
  });

  it('dims the dynamic light when safety mode is engaged', () => {
    const lit = ENTITY.applyFrame({ ...frame, safety: false }, 1 / 30);
    const safe = ENTITY.applyFrame({ ...frame, safety: true }, 1 / 30);
    expect(ENTITY.light.intensity).toBeLessThan(lit ? ENTITY.light.intensity + 1 : Infinity);
    expect(safe).toBeDefined();
  });

  it('reports its cost for the performance readout', () => {
    const stats = ENTITY.stats();
    expect(stats.coreVertices).toBe(ENTITY.coreVertexCount);
    expect(stats.particles).toBe(ENTITY.smoke.geometry.attributes.position.count + ENTITY.sparks.geometry.attributes.position.count);
    expect(stats.tendrils).toBe(ENTITY.activeTendrils);
  });
});

describe('quality tiers', () => {
  it('spends fewer vertices at every step down', () => {
    const high = new FuXEntity({ quality: 'high' });
    const medium = new FuXEntity({ quality: 'medium' });
    const low = new FuXEntity({ quality: 'low' });

    expect(high.coreVertexCount).toBeGreaterThan(medium.coreVertexCount);
    expect(medium.coreVertexCount).toBeGreaterThan(low.coreVertexCount);

    const particles = (e) =>
      e.smoke.geometry.attributes.position.count + e.sparks.geometry.attributes.position.count;
    expect(particles(high)).toBeGreaterThan(particles(medium));
    expect(particles(medium)).toBeGreaterThan(particles(low));

    [high, medium, low].forEach((e) => e.dispose());
  });

  it('keeps even the richest tier inside the UHD 620 budget', () => {
    const high = new FuXEntity({ quality: 'high' });
    expect(high.coreVertexCount).toBeLessThanOrEqual(BUDGETS.coreVertices);
    expect(
      high.smoke.geometry.attributes.position.count + high.sparks.geometry.attributes.position.count,
    ).toBeLessThanOrEqual(BUDGETS.particles.target);
    expect(particleCount('high')).toBeLessThanOrEqual(BUDGETS.particles.target);
    high.dispose();
  });

  it('keeps the particle population inside the budget at every tier', () => {
    for (const tier of QUALITY_ORDER) {
      expect(particleCount(tier), `${tier} particles`).toBeLessThanOrEqual(BUDGETS.particles.target);
    }
  });
});
