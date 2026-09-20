/**
 * Panel visibility and the microphone's environment checks.
 *
 * Both of these exist because of how the prototype gets run in practice: from
 * a preview frame, on somebody else's screen, with the chrome covering the
 * thing they came to look at. Neither is a rendering concern, so both are
 * plain functions and both are testable without a browser — which matters,
 * because the failure mode of a view mode is being trapped in it.
 */

import { describe, it, expect } from 'vitest';
import {
  PANEL_ACTION_LABELS,
  PANEL_MODES,
  PANEL_VISIBILITY,
  applyPanelMode,
  nextPanelMode,
  panelModeMessage,
} from '../src/ui/panels.js';
import {
  captureBlocker,
  captureEnvironment,
  describeMediaError,
  needsOwnTab,
} from '../src/audio/analysis.js';

describe('panel modes', () => {
  it('cycles full -> compact -> hidden -> full', () => {
    expect(nextPanelMode('full')).toBe('compact');
    expect(nextPanelMode('compact')).toBe('hidden');
    expect(nextPanelMode('hidden')).toBe('full');
  });

  it('returns to the start from an unknown mode rather than getting stuck', () => {
    expect(nextPanelMode(undefined)).toBe('full');
    expect(nextPanelMode('nonsense')).toBe('full');
  });

  it('reaches every mode by pressing the button repeatedly', () => {
    const seen = new Set();
    let mode = 'full';
    for (let i = 0; i < PANEL_MODES.length; i += 1) {
      mode = nextPanelMode(mode);
      seen.add(mode);
    }
    expect([...seen].sort()).toEqual([...PANEL_MODES].sort());
  });

  it('sets one attribute on the root, and only that', () => {
    const root = { dataset: {} };
    applyPanelMode(root, 'hidden');
    expect(root.dataset).toEqual({ panels: 'hidden' });
    expect(applyPanelMode(root, 'compact')).toBe('compact');
    expect(root.dataset.panels).toBe('compact');
  });

  it('falls back to the full layout for a mode it does not know', () => {
    const root = { dataset: { panels: 'hidden' } };
    expect(applyPanelMode(root, 'sideways')).toBe('full');
    expect(root.dataset.panels).toBe('full');
  });

  it('hides progressively more, and never hides the way back', () => {
    for (const mode of PANEL_MODES) {
      expect(PANEL_VISIBILITY[mode], `${mode} has no visibility rule`).toBeDefined();
      // The chip is the escape hatch: no mode may hide it.
      expect(PANEL_VISIBILITY[mode].chip, `${mode} hides the chip`).toBe(true);
    }

    // Full shows everything.
    expect(Object.entries(PANEL_VISIBILITY.full).filter(([, v]) => !v)).toEqual([]);
    // Compact drops the two side panels and keeps the banner that explains it.
    expect(PANEL_VISIBILITY.compact.readout).toBe(false);
    expect(PANEL_VISIBILITY.compact.deck).toBe(false);
    expect(PANEL_VISIBILITY.compact.banner).toBe(true);
    // Hidden keeps only the entity and the chip.
    const shown = Object.entries(PANEL_VISIBILITY.hidden).filter(([, v]) => v).map(([k]) => k);
    expect(shown).toEqual(['chip']);
  });

  it('labels the button with what the next press does', () => {
    expect(PANEL_ACTION_LABELS.full).toMatch(/hide/i);
    expect(PANEL_ACTION_LABELS.hidden).toMatch(/show/i);
    expect(PANEL_ACTION_LABELS.compact).toMatch(/hide/i);
    for (const mode of PANEL_MODES) {
      expect(PANEL_ACTION_LABELS[mode]).toBeTruthy();
    }
  });

  it('explains a change, but stays quiet when everything is visible', () => {
    expect(panelModeMessage('full')).toBeNull();
    expect(panelModeMessage('compact')).toContain('H');
    expect(panelModeMessage('hidden')).toContain('H');
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
    const embedded = { embedded: true, secure: true, supported: true };
    const inside = describeMediaError({ name: 'NotAllowedError' }, embedded);
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
