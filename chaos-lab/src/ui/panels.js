/**
 * What is on screen.
 *
 * The entity is the point of the page, so every piece of chrome around it has
 * to be dismissable: the readout, the masthead, the message bar. This is the
 * state behind that, kept apart from the DOM so it can be tested without a
 * browser and so the menu's checkboxes and the `H` key can never disagree
 * about what is visible.
 *
 * Two layers, deliberately:
 *
 *   a mode       full / compact / hidden — one press changes everything
 *   a region     masthead / readout / banner — each one toggled on its own
 *
 * A mode is a starting point, not a cage: toggling a region records an
 * override, and choosing a mode again clears the overrides so the presets stay
 * predictable. The settings sheet shows the result of both, so what you see in
 * the menu is always what is on screen.
 */

/** The parts of the chrome that can be hidden. */
export const VIEW_REGIONS = ['masthead', 'readout', 'banner'];

/** Human labels for the settings sheet. */
export const REGION_LABELS = {
  masthead: 'Title bar',
  readout: 'Live readout',
  banner: 'Message bar',
};

export const PANEL_MODES = ['full', 'compact', 'hidden'];

/** The button label names what clicking it *does*, not where you are. */
export const PANEL_ACTION_LABELS = {
  full: 'Hide panels',
  compact: 'Hide all',
  hidden: 'Show UI',
};

/** The keyboard shortcut for cycling the modes, shown on the chip. */
export const PANEL_KEY = 'H';

/** What each mode shows before any manual overrides. */
export const MODE_VISIBILITY = {
  full: { masthead: true, readout: true, banner: true },
  compact: { masthead: true, readout: false, banner: true },
  hidden: { masthead: false, readout: false, banner: false },
};

/** A fresh view state. Overrides start empty, so the mode alone decides. */
export function createViewState(mode = 'full') {
  return { mode: PANEL_MODES.includes(mode) ? mode : 'full', overrides: {} };
}

/** The mode after this one. Unknown values fall back to `full`. */
export function nextPanelMode(mode) {
  const index = PANEL_MODES.indexOf(mode);
  return PANEL_MODES[(index + 1) % PANEL_MODES.length];
}

/** Is one region visible, taking the override into account? */
export function regionVisible(state, region) {
  if (region in state.overrides) return state.overrides[region];
  return Boolean(MODE_VISIBILITY[state.mode]?.[region]);
}

/** Every region's visible state, as the settings sheet renders it. */
export function visibilityMap(state) {
  return Object.fromEntries(VIEW_REGIONS.map((region) => [region, regionVisible(state, region)]));
}

/** Show or hide one region. Returns a new state; the old one is untouched. */
export function setRegion(state, region, visible) {
  if (!VIEW_REGIONS.includes(region)) return state;
  return { ...state, overrides: { ...state.overrides, [region]: Boolean(visible) } };
}

/** Switch modes, clearing overrides so the presets mean the same thing twice. */
export function setMode(state, mode) {
  return createViewState(mode);
}

/** Cycle to the next mode. */
export function cycleMode(state) {
  return setMode(state, nextPanelMode(state.mode));
}

/** True when nothing but the entity and the launcher is left. */
export function isClear(state) {
  return VIEW_REGIONS.every((region) => !regionVisible(state, region));
}

/** Turn every region off, leaving only FuX and the way back. */
export function hideAll(state) {
  return setRegion(setRegion(setRegion(state, 'masthead', false), 'readout', false), 'banner', false);
}

/** Turn every region on. */
export function showAll(state) {
  return setRegion(setRegion(setRegion(state, 'masthead', true), 'readout', true), 'banner', true);
}

/**
 * Write the state onto a document root as attributes, so all of the hiding
 * stays in the stylesheet and this reads as a one-line function.
 */
export function applyViewState(root, state) {
  root.dataset.panels = state.mode;
  const visible = visibilityMap(state);
  for (const region of VIEW_REGIONS) {
    root.dataset[`region${region[0].toUpperCase()}${region.slice(1)}`] = visible[region] ? 'on' : 'off';
  }
  return state;
}

/** The message shown after a mode change, or null when everything is visible. */
export function panelModeMessage(mode) {
  if (mode === 'compact') return 'Side panels hidden. <b>H</b> again hides everything.';
  if (mode === 'hidden') return 'Chrome hidden — just FuX. <b>H</b> brings it back.';
  return null;
}
