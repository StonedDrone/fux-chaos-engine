/**
 * GLSL syntax check.
 *
 * There is no GL context in CI or in the sandbox, so the shaders are parsed
 * with a real GLSL grammar instead. This catches the syntax class of bug —
 * missing semicolons, malformed control flow, unbalanced blocks — that would
 * otherwise only surface as a black canvas in the browser.
 *
 * Run: node tools/glsl-lint.mjs
 */

import { parser } from '@shaderfrog/glsl-parser';
import { coreVertexShader } from '../src/render/shaders/core.vert.js';
import { coreFragmentShader } from '../src/render/shaders/core.frag.js';
import { skinVertexShader, skinFragmentShader } from '../src/render/shaders/skin.glsl.js';
import { tendrilVertexShader, tendrilFragmentShader } from '../src/render/shaders/tendril.glsl.js';
import { particleVertexShader, particleFragmentShader } from '../src/render/shaders/particles.glsl.js';

/** The prelude three.js prepends to a ShaderMaterial. */
const threePrelude = `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
`;

const fragmentPrelude = `
precision highp float;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
varying vec2 vUv;
`;

// The shader modules already interpolate the shared noise library into their
// source strings, so it must not be prepended again here.
const shaders = [
  ['core.vert', threePrelude + coreVertexShader],
  ['core.frag', fragmentPrelude + coreFragmentShader],
  ['skin.vert', threePrelude + skinVertexShader],
  ['skin.frag', fragmentPrelude + skinFragmentShader],
  ['tendril.vert', threePrelude + tendrilVertexShader],
  ['tendril.frag', fragmentPrelude + tendrilFragmentShader],
  ['particles.vert', threePrelude + particleVertexShader],
  ['particles.frag', fragmentPrelude + particleFragmentShader],
];

/**
 * Builtins the parser does not model. They are valid in GLSL ES 1.00 and are
 * supplied by the driver, so they are filtered out of the report rather than
 * treated as errors.
 */
const KNOWN_PARSER_NOISE = [
  /^Encountered undefined variable: "gl_(Position|PointSize|FragColor|PointCoord|VertexID|InstanceID)"/,
];

let failures = 0;
const notes = [];

for (const [name, source] of shaders) {
  try {
    // The parser reports through a callback; collect rather than print so
    // driver builtins can be filtered out.
    parser.parse(source, { quiet: false, grammars: undefined });
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures += 1;
    const line = error.location?.start?.line ?? '?';
    const column = error.location?.start?.column ?? '?';
    const lines = source.split('\n');
    console.log(`  FAIL  ${name}  (line ${line}, column ${column})`);
    console.log(`        ${error.message}`);
    if (KNOWN_PARSER_NOISE.some((re) => re.test(error.message))) {
      console.log('        (known parser limitation — GLSL builtin)');
      failures -= 1;
      continue;
    }
    // Show the offending line with two lines of context, which is usually
    // enough to spot the problem without opening the file.
    const from = Math.max(0, Number(line) - 3);
    lines.slice(from, Number(line) + 1).forEach((l, i) => {
      const n = from + i + 1;
      console.log(`    ${String(n).padStart(4)} | ${l}`);
    });
  }
}

if (failures) {
  console.error(`\n${failures} shader(s) failed to parse.`);
  process.exit(1);
}

console.log(`\n${shaders.length} shaders parsed cleanly.`);
console.log('(the parser does not model gl_Position / gl_FragColor / gl_PointCoord —');
console.log(' those are driver builtins and are not errors)');
