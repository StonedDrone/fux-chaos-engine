/**
 * The settings sheet.
 *
 * Everything that used to float over the entity now lives behind one launcher:
 * a dialog that opens over the stage, holds the whole control deck, and closes
 * again. The lab is for watching FuX, so the default page has no chrome on it
 * at all beyond the live readout and one small button.
 *
 * The behaviour that matters is all in here rather than in `main.js`: what
 * opens it, what closes it, and where focus goes. Opening moves focus into the
 * sheet, closing puts it back on the launcher, `Escape` and a click on the
 * backdrop both close, and the stage keeps its own keyboard shortcuts either
 * way — none of it depends on the entity being paused.
 */

/** The key that opens and closes the sheet, shown on the launcher. */
export const MENU_KEY = 'M';

export class SettingsMenu {
  /**
   * @param {Object} refs
   * @param {HTMLElement} refs.root       the overlay, hidden when closed
   * @param {HTMLElement} refs.sheet      the dialog itself
   * @param {HTMLElement} refs.body       where the control deck is mounted
   * @param {HTMLElement} refs.launcher   the always-visible button
   * @param {HTMLElement} [refs.close]    the dialog's own close button
   * @param {HTMLElement} [refs.backdrop] click-outside target
   */
  constructor({ root, sheet, body, launcher, close, backdrop }) {
    this.root = root;
    this.sheet = sheet;
    this.body = body;
    this.launcher = launcher;
    this.open = false;

    launcher.addEventListener('click', () => this.toggle());
    close?.addEventListener('click', () => this.close());
    backdrop?.addEventListener('click', () => this.close());
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.root.dataset.open = 'true';
    this.launcher.setAttribute('aria-expanded', 'true');
    // Focus lands on the dialog rather than its first control: the deck opens
    // with buttons, and tabbing from the top is less surprising than landing
    // on "Demo".
    this.sheet.focus?.();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.dataset.open = 'false';
    this.root.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.focus?.();
  }
}

/**
 * Should this key event close the menu? Kept separate from the DOM so the rule
 * is explicit: `Escape` closes, and nothing else does.
 */
export function closesMenu(event) {
  return event?.key === 'Escape';
}
