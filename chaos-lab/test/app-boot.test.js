// @vitest-environment jsdom
/**
 * The application boots.
 *
 * This is the test for the failure that produces nothing to look at: a null
 * element, a stale reference left behind by a refactor, an interface that no
 * longer matches what `main.js` calls. None of those show up in the shader
 * contract tests or the mood tables — the page simply comes up black and the
 * only clue is a console nobody is reading.
 *
 * The engine is stubbed, because constructing the real one needs a GPU. What
 * is exercised is everything above it: the entry point runs to completion
 * against the real `index.html`, the readout, deck and settings menu are
 * built, the keyboard is bound, and the shortcuts still drive the app with the
 * settings sheet shut.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'index.html'), 'utf8');

// --- The stub engine -------------------------------------------------------
// Only the surface `main.js` actually uses; anything it calls that is missing
// here fails the test, which is the point.

/** A frame shaped like the one the resolver produces, so the readout renders. */
function stubFrame(chaos = 42) {
  return {
    chaos,
    band: 'stirring',
    mood: 'calm',
    moodLabel: 'Calm',
    fromMood: 'calm',
    toMood: 'joyful',
    moodBlend: 0.25,
    priority: 'music',
    idle: 3.4,
    spikes: 0.3,
    threat: 0.1,
    breathRate: 0.35,
    flowSpeed: 0.12,
    displace: 2,
    glow: 8,
    opacity: 0.68,
    edgeSharpness: 3.5,
    filamentCount: 12,
    responseDelay: 0.4,
    audio: { energy: 0.4, low: 0.3, mid: 0.2, high: 0.1, beat: false },
  };
}

const STUB_STATS = {
  quality: 'high',
  fps: 60,
  frameMs: 16,
  parameterHz: 30,
  triangles: 18000,
  drawCalls: 4,
  coreVertices: 16000,
  particles: 400,
  tendrils: 12,
};

const audioFrames = [];
const stub = {
  started: false,
  stopped: false,
  observerSpeed: null,
  filamentBias: 1,
  quality: 'high',
  running: true,
  lastFrame: stubFrame(),
  frameStats: STUB_STATS,
  memory: {},
  impulses: {},
  audio: {
    source: 'demo',
    demo: { reset: () => {} },
    live: { labels: 'microphone', needsOwnTab: false, error: null },
    step: () => ({ energy: 0.4, low: 0.3, mid: 0.2, high: 0.1, beat: false }),
  },
  entity: { stats: () => ({}) },
  resolver: { registerTouch: () => {}, setSafety: () => {} },
  renderer: { domElement: document.createElement('canvas') },
  camera: {},
  raycaster: { setFromCamera: () => {}, intersectObject: () => [] },
  pointer: { x: 0, y: 0 },
};

vi.mock('../src/engine.js', () => ({
  FuXEngine: class {
    constructor(options) {
      this.options = options;
      Object.assign(this, stub);
      this.audio = stub.audio;
      this.entity = stub.entity;
      this.resolver = stub.resolver;
      this.renderer = stub.renderer;
      this.raycaster = stub.raycaster;
      this.pointer = stub.pointer;
    }
    start() { stub.started = true; }
    stop() { stub.stopped = true; }
    tick() {}
    render() {}
    step() {}
    emit() {}
    cue() {}
    send() {}
    touchAt() { return null; }
    setQuality(q) { stub.quality = q; }
    setObserverMotion(v) { stub.observerSpeed = v; }
    setMoodMode() {}
    setSafety() {}
    setAudioSource(s) { this.audio.source = s; return s; }
    setExposure() {}
    async enableMicrophone() { return false; }
  },
}));

/** Point the entry point at the real markup and run it. */
async function bootApp() {
  document.documentElement.innerHTML = HTML.replace(/^[\s\S]*<body>/, '<body>')
    .replace(/<\/body>[\s\S]*$/, '');
  vi.resetModules();
  await import('../src/main.js');
  // main.js boots on DOMContentLoaded if the document is still loading.
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
}

const press = (key, shiftKey = false) => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
};

/**
 * jsdom has no 2D canvas backend, so `getContext('2d')` returns null and the
 * readout's chaos trace throws. A browser is not affected; the context is
 * stubbed here so the rest of the boot is exercised as it really runs.
 */
const noop = () => {};
const fakeContext = new Proxy({}, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => {
    target[key] = value;
    return true;
  },
});
window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

/** Console errors seen since the last reset. */
const errors = [];

beforeEach(() => {
  errors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '));
  });
});

describe('the application', () => {
  it('boots against the real markup without throwing or logging an error', async () => {
    await expect(bootApp()).resolves.toBeUndefined();
    // A null element or a stale reference shows up here rather than as a black
    // page with a message nobody reads.
    expect(errors).toEqual([]);
  });

  it('starts the engine and puts the readout and the menu on the page', async () => {
    await bootApp();
    expect(stub.started).toBe(true);
    expect(document.querySelector('#readout .chaos-value')).not.toBeNull();
    expect(document.querySelector('#menuBody .group-title')).not.toBeNull();
  });

  it('opens with the settings menu shut, and the launcher ready', async () => {
    await bootApp();
    expect(document.getElementById('menu').hidden).toBe(true);
    expect(audioFrames.length).toBe(0);
    const launcher = document.getElementById('uiToggle');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(launcher.querySelector('kbd').textContent).toBe('M');
  });

  it('opens and closes the sheet from the launcher', async () => {
    await bootApp();
    const launcher = document.getElementById('uiToggle');
    launcher.click();
    expect(document.getElementById('menu').hidden).toBe(false);
    document.getElementById('menuClose').click();
    expect(document.getElementById('menu').hidden).toBe(true);
  });

  it('closes the sheet with Escape', async () => {
    await bootApp();
    document.getElementById('uiToggle').click();
    press('Escape');
    expect(document.getElementById('menu').hidden).toBe(true);
  });

  it('drives the app from the keyboard with the sheet shut', async () => {
    // The deck now lives inside a closed dialog. The keys stay live, so they
    // must still reach the engine and still be reflected in the deck.
    await bootApp();
    press('q');
    expect(stub.quality).toBe('medium');

    press('3');
    expect(document.querySelector('#menuBody button[data-id="demo"]').getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('hides the chrome with H and restores it, through the same state', async () => {
    await bootApp();
    const readout = document.getElementById('readout');

    // H: presets. The first press drops the side panels.
    press('h');
    expect(document.body.dataset.regionReadout).toBe('off');
    expect(document.body.dataset.regionMasthead).toBe('on');

    press('h');
    expect(document.body.dataset.regionMasthead).toBe('off');
    expect(readout).not.toBeNull();

    press('h');
    expect(document.body.dataset.regionReadout).toBe('on');
    expect(document.body.dataset.regionMasthead).toBe('on');
  });

  it('brings the readout back from the sheet after closing it with its own button', async () => {
    await bootApp();
    document.querySelector('#readout .panel-close').click();
    expect(document.body.dataset.regionReadout).toBe('off');

    // The checkbox in the sheet is the way back, and it must be in step.
    const boxes = [...document.querySelectorAll('#menuBody .check input')];
    expect(boxes[1].checked).toBe(false);
    boxes[1].checked = true;
    boxes[1].dispatchEvent(new window.Event('change'));
    expect(document.body.dataset.regionReadout).toBe('on');
  });

  it('keeps the sheet checkboxes describing the page after H', async () => {
    await bootApp();
    press('h');
    press('h');
    const boxes = [...document.querySelectorAll('#menuBody .check input')].map((b) => b.checked);
    expect(boxes).toEqual([false, false, false]);

    const justFux = [...document.querySelectorAll('#menuBody button[data-id="restore"]')][0];
    justFux.click();
    expect([...document.querySelectorAll('#menuBody .check input')].map((b) => b.checked))
      .toEqual([true, true, true]);
  });
});
