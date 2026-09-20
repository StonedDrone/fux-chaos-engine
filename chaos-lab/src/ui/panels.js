/**
 * Panel visibility.
 *
 * FuX is the point of the page, and the readout, the deck, the masthead and
 * the message banner together cover most of it. This is the small state
 * machine behind "get the chrome out of the way", kept apart from the DOM so
 * it can be tested without a browser and so the button and the keyboard can
 * never disagree about which state comes next.
 *
 * Three states, in the order they cycle:
 *
 *   full     everything visible — the working layout
 *   compact  the two side panels are hidden, masthead and message bar stay
 *   hidden   nothing but the entity and one small chip to bring it back
 *
 * `hidden` keeps the chip on screen on purpose. A view mode you can only leave
 * by remembering a keystroke is a trap, not a feature.
 */

export const PANEL_MODES = ['full', 'compact', 'hidden'];

/** The button label names what clicking it *does*, not where you are. */
export const PANEL_ACTION_LABELS = {
  full: 'Hide panels',
  compact: 'Hide all',
  hidden: 'Show UI',
};

/** The keyboard shortcut, shown on the chip and unchanged by mode. */
export const PANEL_KEY = 'H';

/** Which regions are visible in each mode. CSS does the hiding. */
export const PANEL_VISIBILITY = {
  full: { masthead: true, readout: true, deck: true, banner: true, chip: true },
  compact: { masthead: true, readout: false, deck: false, banner: true, chip: true },
  hidden: { masthead: false, readout: false, deck: false, banner: false, chip: true },
};

/** The mode after this one. Unknown values fall back to `full`. */
export function nextPanelMode(mode) {
  const index = PANEL_MODES.indexOf(mode);
  return PANEL_MODES[(index + 1) % PANEL_MODES.length];
}

/**
 * Apply a mode to a document root by setting one attribute; all of the
 * styling lives in the stylesheet, so this stays a one-line function.
 */
export function applyPanelMode(root, mode) {
  const resolved = PANEL_MODES.includes(mode) ? mode : 'full';
  root.dataset.panels = resolved;
  return resolved;
}

/** The message shown after a change, or null when everything is visible. */
export function panelModeMessage(mode) {
  if (mode === 'compact') return 'Side panels hidden. <b>H</b> again hides everything.';
  if (mode === 'hidden') return 'Chrome hidden — just FuX. <b>H</b> brings it back.';
  return null;
}
