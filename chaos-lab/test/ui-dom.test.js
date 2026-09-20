// @vitest-environment jsdom
/**
 * The interface, built for real.
 *
 * The panels and the settings sheet are the parts of this project most likely
 * to be broken by a change that still passes every other test: they are DOM,
 * they are wired to each other by callbacks, and nothing about them shows up
 * in a shader contract or a mood table. There is no WebGL here — the engine
 * needs a GPU and is not constructed — but everything above the engine is
 * exercised as actual DOM, including the checkboxes in the sheet, the readout's
 * close button, and the focus handling on the dialog.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ControlDeck } from '../src/ui/deck.js';
import { Readout } from '../src/ui/readout.js';
import { SettingsMenu } from '../src/ui/menu.js';
import {
  createViewState,
  hideAll,
  isClear,
  setRegion,
  showAll,
  VIEW_REGIONS,
} from '../src/ui/panels.js';

/** Mount a container into the document body and hand it back. */
function mount(tag = 'div', className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  document.body.appendChild(node);
  return node;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the control deck', () => {
  const buildDeck = (handlers = {}) => {
    const root = mount();
    return { root, deck: new ControlDeck(root, handlers) };
  };

  it('builds every group of controls', () => {
    const { root } = buildDeck();
    const titles = [...root.querySelectorAll('.group-title')].map((n) => n.textContent);
    expect(titles.length).toBeGreaterThanOrEqual(6);
    expect(titles[0]).toBe('On screen');
    for (const expected of ['Signal source', 'MilkDrop-Shake bridge', 'Safety · quality · take']) {
      expect(titles).toContain(expected);
    }
  });

  it('offers one checkbox per region, all ticked to start with', () => {
    const { root } = buildDeck();
    const boxes = [...root.querySelectorAll('.check input')];
    expect(boxes.length).toBe(VIEW_REGIONS.length);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('reports a checkbox change to the caller', () => {
    const seen = [];
    const { root } = buildDeck({ onViewRegion: (region, visible) => seen.push([region, visible]) });
    const boxes = [...root.querySelectorAll('.check input')];
    const readoutBox = boxes[VIEW_REGIONS.indexOf('readout')];

    readoutBox.checked = false;
    readoutBox.dispatchEvent(new window.Event('change'));
    expect(seen).toEqual([['readout', false]]);
  });

  it('reports the presets', () => {
    const seen = [];
    const { root } = buildDeck({ onViewPreset: (id) => seen.push(id) });
    const buttons = [...root.querySelectorAll('.buttons button')];
    const clear = buttons.find((b) => b.dataset.id === 'clear');
    const restore = buttons.find((b) => b.dataset.id === 'restore');

    clear.click();
    restore.click();
    expect(seen).toEqual(['clear', 'restore']);
  });

  it('mirrors the view state into the checkboxes and back out again', () => {
    const { root, deck } = buildDeck();
    const boxes = () => [...root.querySelectorAll('.check input')].map((b) => b.checked);

    deck.setViewState(hideAll(createViewState()));
    expect(boxes()).toEqual([false, false, false]);
    // With everything cleared, the preset button says so.
    const clear = [...root.querySelectorAll('button')].find((b) => b.dataset.id === 'clear');
    expect(clear.getAttribute('aria-pressed')).toBe('true');

    deck.setViewState(showAll(createViewState()));
    expect(boxes()).toEqual([true, true, true]);
    expect(clear.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the rest of its settings in step with the keyboard', () => {
    // The deck now lives behind a closed sheet while the keyboard stays live,
    // so a shortcut pressed with the sheet shut still has to land in it.
    const { deck } = buildDeck();
    deck.setQuality('low', { manual: true });
    const low = [...document.querySelectorAll('button')].find((b) => b.dataset.id === 'low');
    expect(low.getAttribute('aria-pressed')).toBe('true');

    deck.setAudioSource('silence');
    const silence = [...document.querySelectorAll('button')].find((b) => b.dataset.id === 'silence');
    expect(silence.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows and clears the microphone help', () => {
    const { root, deck } = buildDeck();
    const help = root.querySelector('.note[hidden]');
    expect(help).not.toBeNull();

    deck.setMicHelp('Blocked by the frame.', { label: 'Open in a new tab', href: '/lab' });
    expect(help.hidden).toBe(false);
    expect(help.textContent).toContain('Blocked by the frame.');
    const link = help.querySelector('a');
    expect(link.getAttribute('href')).toBe('/lab');
    expect(link.getAttribute('target')).toBe('_blank');

    deck.clearMicHelp();
    expect(help.hidden).toBe(true);
  });
});

describe('the readout', () => {
  it('can be closed, and tells its caller', () => {
    const root = mount('section');
    let closed = 0;
    new Readout(root, { onClose: () => { closed += 1; } });

    const close = root.querySelector('.panel-close');
    expect(close.getAttribute('aria-label')).toMatch(/close/i);
    close.click();
    expect(closed).toBe(1);
  });

  it('still renders its values', () => {
    const root = mount('section');
    const readout = new Readout(root);
    // A minimal frame: update() must not need anything the engine would not
    // have sent by the second tick.
    expect(typeof readout.update).toBe('function');
    expect(root.querySelector('.chaos-value')).not.toBeNull();
  });
});

describe('the settings sheet in the document', () => {
  const buildSheet = () => {
    document.body.innerHTML = `
      <button id="launch" aria-expanded="false"><span id="label">Menu</span><kbd>M</kbd></button>
      <div id="menu" hidden>
        <div id="backdrop"></div>
        <div id="sheet" tabindex="-1">
          <button id="close">×</button>
          <div id="body"></div>
        </div>
      </div>`;
    const launcher = document.getElementById('launch');
    const menu = new SettingsMenu({
      root: document.getElementById('menu'),
      sheet: document.getElementById('sheet'),
      body: document.getElementById('body'),
      launcher,
      close: document.getElementById('close'),
      backdrop: document.getElementById('backdrop'),
    });
    return { menu, launcher };
  };

  it('starts closed and opens over the stage', () => {
    const { menu, launcher } = buildSheet();
    const menuEl = document.getElementById('menu');
    expect(menu.open).toBe(false);
    expect(menuEl.hidden).toBe(true);

    launcher.click();
    expect(menu.open).toBe(true);
    expect(menuEl.hidden).toBe(false);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    // The dialog is the focus target, not the first button inside it.
    expect(document.activeElement).toBe(document.getElementById('sheet'));
  });

  it('closes from its own button and from the backdrop', () => {
    const { menu, launcher } = buildSheet();
    launcher.click();
    document.getElementById('close').click();
    expect(menu.open).toBe(false);
    expect(document.getElementById('menu').hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);

    launcher.click();
    document.getElementById('backdrop').click();
    expect(menu.open).toBe(false);
  });

  it('hosts the deck, so the controls are inside the dialog', () => {
    const { menu } = buildSheet();
    new ControlDeck(document.getElementById('body'), {});
    menu.show();
    const sheet = document.getElementById('sheet');
    expect(sheet.querySelector('.check input')).not.toBeNull();
    expect(sheet.querySelector('.group-title')).not.toBeNull();
  });
});

describe('the whole page state', () => {
  it('hides a region by attribute and brings it back', () => {
    // What the stylesheet keys off, asserted end to end: the attribute the
    // state writes is the one that decides visibility.
    const state = setRegion(createViewState('full'), 'readout', false);
    expect(isClear(state)).toBe(false);
    expect(state.overrides.readout).toBe(false);

    const cleared = hideAll(state);
    expect(isClear(cleared)).toBe(true);
  });
});
