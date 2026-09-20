/**
 * Build kit document tests.
 *
 * `handoff/ENTITY-BUILD-KIT.md` is generated from the PDF, and the whole point
 * of generating it is that it stays true to the source: every number in this
 * repository is supposed to be checked against it. A converter that quietly
 * drops a word, splits a table in half, or interleaves two columns produces a
 * document that looks plausible and is wrong, which is worse than no document
 * at all.
 *
 * So two things are asserted here. First, that the committed markdown is
 * current — the PDF has not changed underneath it. Second, that the passages
 * the rest of the project depends on survived extraction intact: the exact
 * pseudocode, the runtime parameter table, the component tree, and the words
 * the PDF builds out of ligature glyph runs, which are the ones most likely to
 * be mangled silently.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage, classifyLine } from '../tools/build-kit-to-markdown.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = join(HERE, '..');
const ROOT = join(LAB, '..');
const DOC_PATH = join(ROOT, 'handoff', 'ENTITY-BUILD-KIT.md');
const PDF_PATH = join(ROOT, 'docs', 'symbiote-entity-ue5-build-kit.pdf');
const doc = readFileSync(DOC_PATH, 'utf8');

/** Comparable words: markdown syntax and punctuation fall away. */
const words = (text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Run the converter and return its stdout, failing the test on a bad exit. */
function runConverter(...args) {
  return execFileSync('node', [join(LAB, 'tools', 'build-kit-to-markdown.mjs'), ...args], {
    cwd: LAB,
    encoding: 'utf8',
  });
}

describe('build kit markdown is current', () => {
  it('passes its own --check without rewriting anything', () => {
    const output = runConverter('--check');
    expect(output).toContain('up to date');
  });

  it('covers all eleven pages of the source document', () => {
    for (let page = 1; page <= 11; page += 1) {
      expect(doc).toContain(`<!-- page ${page} -->`);
    }
    expect(doc).not.toContain('page undefined');
  });

  it('is a full transcription, not a summary', () => {
    const words = doc.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(2200);
  });

  it('names the document and the date it was made, from the PDF itself', () => {
    // The cover's title block is set in tracked-out capitals that leave no
    // recoverable word breaks, so the header carries it instead — read from
    // the PDF's metadata rather than typed in, so it cannot go stale.
    const header = doc.slice(0, doc.indexOf('<!-- page 1 -->'));
    expect(header).toContain('FuX Chaos Engine - Magic Mirror Box UE5 Build Kit');
    expect(header).toMatch(/Dated \d{4}-\d{2}-\d{2}\./);
  });

  it('carries every word of the source, page for page', async () => {
    // The check that makes the rest of this file worth trusting: extract each
    // page again and require every readable word to appear in the markdown for
    // that page. Anything the converter silently drops — a table cell beside a
    // column boundary, a sentence spliced into another stream, a word lost to
    // a ligature — shows up here as a missing token.
    const pdf = new Uint8Array(readFileSync(PDF_PATH));
    const document_ = await getDocument({ data: pdf, useSystemFonts: true }).promise;

    const parts = doc.split(/<!-- page (\d+) -->/).slice(1);
    const byPage = new Map();
    for (let i = 0; i < parts.length; i += 2) byPage.set(Number(parts[i]), parts[i + 1]);

    // Furniture the converter drops on purpose, and only this.
    const FURNITURE = new Set(['footer', 'blank', 'section-number', 'decoration']);
    const missing = [];

    for (let page = 1; page <= document_.numPages; page += 1) {
      const lines = await extractPage(document_, page);
      const present = new Set(words(byPage.get(page) ?? ''));
      for (const line of lines) {
        if (FURNITURE.has(classifyLine(line).type)) continue;
        for (const word of words(line.text)) {
          if (!present.has(word)) missing.push(`p${page} "${word}"`);
        }
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('the passages the prototype is built from', () => {
  it('keeps the material graph pseudocode on six whole lines', () => {
    const code = doc.slice(doc.indexOf('Flow = CurlNoise'), doc.indexOf('Emissive = lerp'));
    expect(code).toContain('WPO = VertexNormal * (Flow + Spikes) * (BasePulse + ReactionStrength)');
    expect(code).toContain('Breath = sin(Time * BreathRate) * BreathAmount');
  });

  it('keeps the runtime parameter table whole', () => {
    expect(doc).toContain('| PARAMETER | START | DRIVEN BY |');
    for (const row of [
      '| Glow | 8.0 | Overall energy |',
      '| BreathRate | 0.35 | Mood |',
      '| Displace | 2.0 cm | Pressure + touch |',
      '| FlowSpeed | 0.12 | Mood + movement |',
      '| Opacity | 0.68 | Story charge |',
      '| EdgeSharpness | 3.5 | Ominous mood |',
    ]) {
      expect(doc).toContain(row);
    }
  });

  it('keeps the actor component tree as one entry per line', () => {
    const tree = doc.slice(doc.indexOf('### Component tree'), doc.indexOf('### Keep the public controls'));
    for (const component of [
      'BP_FuXChaosEngine', '|- SceneRoot', '|- FerroCoreMesh', '|- WaterSkinMesh',
      '|- NS_SmokeBody', '|- NS_FluidTendrils', '|- NS_MagneticSparks',
      '|- ReactionVolume', '|- PointLight_FuX', '|- Audio_Murmur (optional)',
    ]) {
      expect(tree).toContain(component);
    }
    // Each entry is its own line: a widescreen row would mean the tree's two
    // columns were merged.
    expect(tree.split('\n').filter((line) => line.startsWith('|-')).length).toBe(9);
  });

  it('keeps the sections that sit beside another column on the same page', () => {
    // Page 7 runs a checklist beside another checklist, page 5 a code panel
    // beside prose, page 9 a folder list beside a "done" list.
    expect(doc).toContain('### Technical QA');
    expect(doc).toContain('### Visual QA');
    expect(doc).toContain('### Behavior map');
    expect(doc).toContain('### Starter folder layout');
    expect(doc).toContain('### Definition of done');
  });

  it('keeps the performance budgets and the first target', () => {
    expect(doc).toContain('| Fluid tendrils | 8-16 active | 4-8 active |');
    expect(doc).toContain('| Smoke / sparks | Under 500 visible | Lower count, shorter life |');
    expect(doc).toContain('First target: a 60-second scene where FuX breathes in silence');
  });
});

describe('text that the PDF splits across glyph runs', () => {
  // The document encodes "fl", "fi" and "ff" as their own runs, and emits
  // explicit space runs that overlap the following run, so both a naive gap
  // test and a naive space test mangle these words. They are the canary.
  it('rejoins ligatures inside words', () => {
    for (const word of ['ferrofluid', 'fluid', 'define', 'first', 'filaments', 'effects', 'confirmed', 'Profile']) {
      expect(doc).toContain(word);
    }
  });

  it('does not leave a word split at a line break', () => {
    expect(doc).not.toMatch(/\bde fi/);
    expect(doc).not.toMatch(/\bfl uid/);
    expect(doc).not.toMatch(/\bff ects/);
  });

  it('keeps the words that a dropped space would glue together', () => {
    expect(doc).not.toContain('practicalfirst');
    expect(doc).not.toContain('Not afixed');
    expect(doc).not.toMatch(/\bpseudocodewith\b/);
  });
});
