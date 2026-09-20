/**
 * What is on screen, and how the settings sheet behaves.
 *
 * These exist because of how the prototype actually gets used: from a preview
 * frame, on somebody else's screen, with the chrome covering the thing they
 * came to watch. Every window has to be closable, everything has to come back,
 * and the sheet's checkboxes must never describe a different page from the one
 * being looked at. None of that is a rendering concern, so all of it is plain
 * functions tested without a browser.
 */

import { describe, it, expect } from 'vitest';
import {
  MODE_VISIBILITY,
  PANEL_ACTION_LABELS,
  PANEL_MODES,
  REGION_LABELS,
  VIEW_REGIONS,
  applyViewState,
  createViewState,
  cycleMode,
  hideAll,
  isClear,
  nextPanelMode,
  panelModeMessage,
  regionVisible,
  setMode,
  setRegion,
  showAll,
  visibilityMap,
} from '../src/ui/panels.js';
import { SettingsMenu, closesMenu, MENU_KEY } from '../src/ui/menu.js';
import {
  captureBlocker,
  captureEnvironment,
  describeMediaError,
  needsOwnTab,
} from '../src/audio/analysis.js';

describe('view state', () => {
  it('starts with everything on screen', () => {
    const state = createViewState();
    expect(visibilityMap(state)).toEqual({ masthead: true, readout: true, banner: true });
    expect(isClear(state)).toBe(false);
  });

  it('hides more with each press, and cycles back to everything', () => {
    let state = createViewState('full');
    state = cycleMode(state);
    expect(state.mode).toBe('compact');
    expect(visibilityMap(state)).toEqual({ masthead: true, readout: false, banner: true });

    state = cycleMode(state);
    expect(state.mode).toBe('hidden');
    expect(visibilityMap(state)).toEqual({ masthead: false, readout: false, banner: false });
    expect(isClear(state)).toBe(true);

    expect(cycleMode(state).mode).toBe('full');
    expect(nextPanelMode('nonsense')).toBe('full');
  });

  it('toggles a single region without disturbing the others', () => {
    let state = createViewState('compact');
    state = setRegion(state, 'readout', true);
    expect(visibilityMap(state)).toEqual({ masthead: true, readout: true, banner: true });

    state = setRegion(state, 'masthead', false);
    expect(visibilityMap(state)).toEqual({ masthead: false, readout: true, banner: true });
    // Still the compact preset underneath: the mode is where the cycle resumes.
    expect(state.mode).toBe('compact');
  });

  it('treats an override as a deviation, and forgets it when the mode changes', () => {
    let state = setRegion(createViewState('compact'), 'readout', true);
    expect(regionVisible(state, 'readout')).toBe(true);
    // Choosing a mode means "give me this preset", so overrides are cleared;
    // otherwise compact would stop meaning compact the second time.
    state = setMode(state, 'compact');
    expect(regionVisible(state, 'readout')).toBe(false);
  });

  it('ignores a region it does not know about', () => {
    const state = createViewState();
    expect(setRegion(state, 'sidebar', false)).toBe(state);
    expect(regionVisible(state, 'sidebar')).toBe(false);
  });

  it('clears everything and puts it all back', () => {
    const cleared = hideAll(createViewState());
    expect(isClear(cleared)).toBe(true);
    expect(visibilityMap(cleared)).toEqual({ masthead: false, readout: false, banner: false });

    const restored = showAll(cleared);
    expect(isClear(restored)).toBe(false);
    expect(visibilityMap(restored)).toEqual({ masthead: true, readout: true, banner: true });
  });

  it('never mutates the state it is given', () => {
    const before = createViewState('full');
    const snapshot = JSON.stringify(before);
    setRegion(before, 'readout', false);
    cycleMode(before);
    hideAll(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('writes the resolved visibility onto the root as attributes', () => {
    // The sheet renders the same map, so what the checkboxes show and what the
    // stylesheet hides come from one source.
    const root = { dataset: {} };
    const state = hideAll(createViewState());
    applyViewState(root, state);
    expect(root.dataset.panels).toBe('full');
    expect(root.dataset.regionMasthead).toBe('off');
    expect(root.dataset.regionReadout).toBe('off');
    expect(root.dataset.regionBanner).toBe('off');

    applyViewState(root, showAll(state));
    expect(root.dataset.regionReadout).toBe('on');
  });

  it('names every region, so no checkbox is unlabelled', () => {
    for (const region of VIEW_REGIONS) {
      expect(REGION_LABELS[region], `${region} has no label`).toBeTruthy();
    }
  });

  it('labels the preset button with what the next press does', () => {
    for (const mode of PANEL_MODES) expect(PANEL_ACTION_LABELS[mode]).toBeTruthy();
    expect(PANEL_ACTION_LABELS.hidden).toMatch(/show/i);
    expect(PANEL_ACTION_LABELS.full).toMatch(/hide/i);
  });

  it('explains a preset change, but stays quiet when everything is visible', () => {
    expect(panelModeMessage('full')).toBeNull();
    expect(panelModeMessage('compact')).toContain('H');
    expect(panelModeMessage('hidden')).toContain('H');
  });

  it('keeps the presets and the individual regions in step', () => {
    // Every mode's map must name every region, or a mode would leave a region
    // in whatever state it happened to be in.
    for (const mode of PANEL_MODES) {
      expect(Object.keys(MODE_VISIBILITY[mode]).sort()).toEqual([...VIEW_REGIONS].sort());
    }
  });
});

/** A stub element that records what is done to it. */
function stubElement() {
  const listeners = new Map();
  return {
    hidden: true,
    dataset: {},
    attributes: {},
    focused: false,
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    dispatch(type) {
      for (const fn of listeners.get(type) ?? []) fn({ type });
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focused = true;
    },
  };
}

describe('the settings sheet', () => {
  const build = () => {
    const refs = {
      root: stubElement(),
      sheet: stubElement(),
      body: stubElement(),
      launcher: stubElement(),
      close: stubElement(),
      backdrop: stubElement(),
    };
    return { menu: new SettingsMenu(refs), ...refs };
  };

  it('is closed until the launcher is pressed', () => {
    const { menu, root, launcher } = build();
    expect(menu.open).toBe(false);
    expect(root.hidden).toBe(true);

    launcher.dispatch('click');
    expect(menu.open).toBe(true);
    expect(root.hidden).toBe(false);
    expect(root.dataset.open).toBe('true');
    expect(launcher.attributes['aria-expanded']).toBe('true');
  });

  it('closes on the launcher, the close button, or the backdrop', () => {
    const { menu, launcher, close, backdrop } = build();
    launcher.dispatch('click');
    launcher.dispatch('click');
    expect(menu.open).toBe(false);

    launcher.dispatch('click');
    close.dispatch('click');
    expect(menu.open).toBe(false);

    launcher.dispatch('click');
    backdrop.dispatch('click');
    expect(menu.open).toBe(false);
  });

  it('moves focus into the sheet, and back to the launcher', () => {
    const { menu, sheet, launcher } = build();
    menu.show();
    expect(sheet.focused).toBe(true);

    sheet.focused = false;
    launcher.focused = false;
    menu.close();
    expect(launcher.focused).toBe(true);
    expect(sheet.focused).toBe(false);
  });

  it('is idempotent, so a double press cannot wedge it open', () => {
    const { menu, root } = build();
    menu.show();
    menu.show();
    expect(menu.open).toBe(true);
    expect(root.dataset.open).toBe('true');

    menu.close();
    menu.close();
    expect(menu.open).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('has a key, and only Escape closes it', () => {
    expect(MENU_KEY).toBe('M');
    expect(closesMenu({ key: 'Escape' })).toBe(true);
    expect(closesMenu({ key: 'm' })).toBe(false);
    expect(closesMenu()).toBe(false);
  });
});

describe('microphone environment', () => {
  it('reports a plain top-level page as supported and unblocked', () => {
    const environment = { embedded: false, secure: true, supported: true };
    expect(needsOwnTab(environment)).toBe(false);
    expect(captureBlocker(environment)).toBeNull();
  });

  it('names the frame as the blocker when embedded', () => {
    const environment = { embedded: true, secure: true, supported: true };
    expect(needsOwnTab(environment)).toBe(true);
    expect(captureBlocker(environment)).toMatch(/frame/i);
  });

  it('names the missing secure context when served over plain http', () => {
    const environment = { embedded: false, secure: false, supported: true };
    expect(needsOwnTab(environment)).toBe(true);
    expect(captureBlocker(environment)).toMatch(/https/i);
  });

  it('names the missing API when the browser has no capture at all', () => {
    const environment = { embedded: false, secure: true, supported: false };
    expect(captureBlocker(environment)).toMatch(/mediaDevices/);
  });

  it('tells somebody in a frame to open a tab, not to allow a prompt they never saw', () => {
    const inside = describeMediaError({ name: 'NotAllowedError' },
      { embedded: true, secure: true, supported: true });
    expect(inside).toMatch(/tab/i);

    const topLevel = describeMediaError({ name: 'NotAllowedError' },
      { embedded: false, secure: true, supported: true });
    expect(topLevel).toMatch(/allow microphone access/i);
    expect(topLevel).not.toMatch(/tab/i);
  });

  it('keeps the device errors specific', () => {
    const environment = { embedded: false, secure: true, supported: true };
    expect(describeMediaError({ name: 'NotFoundError' }, environment)).toMatch(/no audio input/i);
    expect(describeMediaError({ name: 'NotReadableError' }, environment)).toMatch(/in use/i);
    expect(describeMediaError({ name: 'SecurityError' }, environment)).toMatch(/https|localhost/i);
    expect(describeMediaError({ name: 'WeirdError', message: 'boom' }, environment)).toBe('boom');
  });

  it('is safe to call where there is no window', () => {
    // The analyser is constructed in node by the test suite; it must not throw
    // while working out what it is allowed to do.
    const environment = captureEnvironment();
    expect(environment).toHaveProperty('embedded');
    expect(environment).toHaveProperty('secure');
    expect(environment).toHaveProperty('supported');
    expect(typeof captureBlocker(environment)).toBe('string');
  });
});
