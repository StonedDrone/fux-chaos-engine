/**
 * Control deck.
 *
 * "Do not expose 40 sliders. Tune complex values inside four mood Data
 *  Assets; expose only the controls needed during a live test."
 *                                              — build kit p.3
 *
 * So this deck is short on purpose: signal sources, mood direction, the two
 * behaviours that need a hand on them during a test (observer motion, filament
 * budget), safety, and quality.
 */

import { MOODS, MOOD_ORDER } from '../core/moods.js';
import {
  PANEL_KEY,
  REGION_LABELS,
  VIEW_REGIONS,
  isClear,
  visibilityMap,
} from './panels.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class ControlDeck {
  /**
   * @param {HTMLElement} root
   * @param {Object} handlers Callbacks the deck fires.
   */
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.state = {
      audioSource: 'demo',
      moodMode: 'auto',
      safety: false,
      quality: 'high',
      observerSpeed: 0.45,
      filamentBias: 1,
      exposure: 1,
    };
    this.build();
  }

  build() {
    this.root.innerHTML = '';
    this.root.appendChild(this.groupView());
    this.root.appendChild(this.groupAudio());
    this.root.appendChild(this.groupMood());
    this.root.appendChild(this.groupSignals());
    this.root.appendChild(this.groupObserver());
    this.root.appendChild(this.groupEntity());
    this.root.appendChild(this.groupSystem());
  }

  titled(text) {
    return el('div', 'group-title', text);
  }

  /**
   * View — the same state the `H` key drives, as checkboxes.
   *
   * A box here and a press of `H` go through one state object in `main.js`, so
   * the tick marks cannot end up describing a different page from the one on
   * screen.
   */
  groupView() {
    const g = el('div', 'group');
    g.appendChild(this.titled('On screen'));

    this.viewBoxes = {};
    for (const region of VIEW_REGIONS) {
      const row = el('label', 'check');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.addEventListener('change', () => {
        this.h.onViewRegion?.(region, box.checked);
      });
      row.appendChild(box);
      row.appendChild(el('span', null, REGION_LABELS[region]));
      g.appendChild(row);
      this.viewBoxes[region] = box;
    }

    const { wrap, nodes } = this.buttons(
      [
        { id: 'clear', label: 'Just FuX', key: PANEL_KEY },
        { id: 'restore', label: 'Show all' },
      ],
      (id) => this.h.onViewPreset?.(id),
    );
    g.appendChild(wrap);
    this.viewNodes = nodes;
    return g;
  }

  /** Reflect the view state the engine of the UI is actually in. */
  setViewState(state) {
    const visible = visibilityMap(state);
    for (const region of VIEW_REGIONS) {
      if (this.viewBoxes?.[region]) this.viewBoxes[region].checked = visible[region];
    }
    this.setPressed(this.viewNodes, isClear(state) ? 'clear' : null);
  }

  /**
   * Build a button row.
   * @param {Array<{id:string,label:string,key?:string,pressed?:boolean,violet?:boolean}>} options
   * @param {(id:string)=>void} onPick
   */
  buttons(options, onPick) {
    const wrap = el('div', 'buttons');
    const nodes = {};
    for (const opt of options) {
      const b = el('button', `ctl${opt.violet ? ' violet' : ''}`);
      b.type = 'button';
      b.appendChild(document.createTextNode(opt.label));
      if (opt.key) {
        const k = el('span', 'kb', opt.key);
        b.appendChild(k);
      }
      b.dataset.id = opt.id;
      b.setAttribute('aria-pressed', String(Boolean(opt.pressed)));
      b.addEventListener('click', () => onPick(opt.id));
      wrap.appendChild(b);
      nodes[opt.id] = b;
    }
    return { wrap, nodes };
  }

  setPressed(nodes, activeId) {
    for (const [id, node] of Object.entries(nodes)) {
      node.setAttribute('aria-pressed', String(id === activeId));
    }
  }

  groupAudio() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Signal source'));
    const { wrap, nodes } = this.buttons(
      [
        { id: 'demo', label: 'Demo', key: '3', pressed: true },
        { id: 'live', label: 'Audio in', key: '1' },
        { id: 'silence', label: 'Silence', key: 'S' },
      ],
      (id) => {
        this.h.onAudioSource?.(id);
      },
    );
    this.audioNodes = nodes;
    g.appendChild(wrap);
    this.audioNote = el('div', 'note', 'Demo signal: calibrated loop, drops every 36s.');
    g.appendChild(this.audioNote);
    // Room for the one thing a blocked microphone needs: a link to the tab
    // that can actually ask for permission.
    this.micHelp = el('div', 'note');
    this.micHelp.hidden = true;
    g.appendChild(this.micHelp);

    // MilkDrop-Shake bridge — the adapter boundary from p.5, made real.
    g.appendChild(this.titled('MilkDrop-Shake bridge'));
    this.bridgeInput = document.createElement('input');
    this.bridgeInput.type = 'text';
    this.bridgeInput.placeholder = 'ws://127.0.0.1:8765';
    this.bridgeInput.value = '';
    this.bridgeInput.setAttribute('aria-label', 'Bridge WebSocket URL');
    g.appendChild(this.bridgeInput);
    const { wrap: bw, nodes: bn } = this.buttons(
      [{ id: 'connect', label: 'Connect' }],
      () => this.h.onBridgeConnect?.(this.bridgeInput.value.trim()),
    );
    g.appendChild(bw);
    this.bridgeNodes = bn;
    this.bridgeNote = el('div', 'note', 'Send {energy, low, mid, high, beat, presetId}.');
    g.appendChild(this.bridgeNote);
    return g;
  }

  groupMood() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Mood direction'));
    const options = [{ id: 'auto', label: 'Auto', key: 'A', pressed: true, violet: true }];
    for (const id of MOOD_ORDER) {
      options.push({ id, label: MOODS[id].label, key: MOOD_ORDER.indexOf(id) === 0 ? 'C' : id[0].toUpperCase() });
    }
    const { wrap, nodes } = this.buttons(options, (id) => this.h.onMoodMode?.(id));
    this.moodNodes = nodes;
    this.moodOptions = options;
    g.appendChild(wrap);
    this.moodNote = el('div', 'note', MOODS.calm.motion);
    g.appendChild(this.moodNote);
    return g;
  }

  groupSignals() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Inject a signal'));
    const { wrap } = this.buttons(
      [
        { id: 'touch', label: 'Touch', key: 'T' },
        { id: 'proximity', label: 'Proximity', key: 'P' },
        { id: 'system', label: 'Spike', key: 'X' },
        { id: 'voice', label: 'Voice', key: 'V' },
      ],
      (id) => this.h.onSignal?.(id),
    );
    g.appendChild(wrap);
    g.appendChild(
      el(
        'div',
        'note',
        'Every source sends the same packet — type, strength, point, decay (p.6).',
      ),
    );
    return g;
  }

  groupObserver() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Observer'));
    g.appendChild(
      this.slider('Motion', 0, 1.4, 0.02, this.state.observerSpeed, '×', (v) => {
        this.state.observerSpeed = v;
        this.h.onObserverSpeed?.(v);
      }),
    );
    g.appendChild(this.titled('Attention'));
    g.appendChild(
      this.slider('Filament bias', 0.5, 1.5, 0.05, 1, '×', (v) => {
        this.state.filamentBias = v;
        this.h.onFilamentBias?.(v);
      }),
    );
    return g;
  }

  groupEntity() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Entity'));
    g.appendChild(
      this.slider('Exposure', 0.4, 2.0, 0.05, this.state.exposure, '×', (v) => {
        this.state.exposure = v;
        this.h.onExposure?.(v);
      }),
    );
    return g;
  }

  groupSystem() {
    const g = el('div', 'group');
    g.appendChild(this.titled('Safety · quality · take'));
    const { wrap, nodes } = this.buttons(
      [
        { id: 'safety', label: 'Low-stim', key: 'S' },
        { id: 'record', label: 'Record', key: 'R' },
        { id: 'export', label: 'Export', key: 'E' },
      ],
      (id) => {
        if (id === 'export') this.h.onExport?.();
        else this.h.onToggle?.(id);
      },
    );
    this.sysNodes = nodes;
    g.appendChild(wrap);

    const { wrap: qw, nodes: qn } = this.buttons(
      [
        { id: 'high', label: 'High', pressed: true },
        { id: 'medium', label: 'Med' },
        { id: 'low', label: 'UHD620' },
      ],
      (id) => this.h.onQuality?.(id),
    );
    g.appendChild(qw);
    this.qualityNodes = qn;

    this.autoQualityNote = el('div', 'note', 'Auto quality: on — tier adjusts to frame time.');
    g.appendChild(this.autoQualityNote);
    return g;
  }

  slider(label, min, max, step, value, unit, onInput) {
    const wrap = el('div', 'slider');
    const l = document.createElement('label');
    l.appendChild(el('span', null, label));
    const out = el('b', null, `${value.toFixed(2)}${unit}`);
    l.appendChild(out);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = `${v.toFixed(2)}${unit}`;
      onInput(v);
    });
    wrap.append(l, input);
    return wrap;
  }

  // ---- external state setters ---------------------------------------------
  setAudioSource(id) {
    this.setPressed(this.audioNodes, id);
    const notes = {
      demo: 'Demo signal: calibrated loop, drops every 36s.',
      live: 'Reading live input — FuX answers the room.',
      silence: 'No source. Silence still breathes (p.10 QA).',
      bridge: 'Bridge packets are FuX\u2019s nervous system — preset, energy, bands, beat.',
    };
    this.audioNote.textContent = notes[id] ?? '';
    this.audioNote.className = 'note';
  }

  setAudioNote(text, isError = false) {
    this.audioNote.textContent = text;
    this.audioNote.className = isError ? 'note err' : 'note';
  }

  /**
   * Show the way out of a blocked microphone.
   *
   * `href` opens in a new tab on purpose: a preview frame that blocks the
   * microphone prompt cannot be talked into showing it, but the same URL
   * loaded top-level can.
   *
   * @param {string} text
   * @param {{label: string, href: string}} [link]
   */
  setMicHelp(text, link) {
    this.micHelp.innerHTML = '';
    this.micHelp.className = 'note';
    this.micHelp.appendChild(document.createTextNode(text));
    if (link) {
      this.micHelp.appendChild(document.createTextNode(' '));
      const a = el('a', null, link.label);
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener';
      this.micHelp.appendChild(a);
    }
    this.micHelp.hidden = false;
  }

  clearMicHelp() {
    this.micHelp.hidden = true;
    this.micHelp.innerHTML = '';
  }

  setBridgeNote(text, isError = false) {
    this.bridgeNote.textContent = text;
    this.bridgeNote.className = isError ? 'note err' : 'note';
  }

  setMoodMode(id) {
    this.setPressed(this.moodNodes, id);
    this.moodNote.textContent =
      id === 'auto' ? 'Auto — mood follows chaos through the four bands.' : MOODS[id].motion;
  }

  setSafety(on) {
    this.sysNodes.safety.setAttribute('aria-pressed', String(on));
    this.state.safety = on;
  }

  setRecording(on) {
    this.sysNodes.record.setAttribute('aria-pressed', String(on));
  }

  setQuality(id, { manual } = {}) {
    this.setPressed(this.qualityNodes, id);
    if (manual !== undefined) {
      this.autoQualityNote.textContent = manual
        ? 'Auto quality: off — tier pinned by hand.'
        : 'Auto quality: on — tier adjusts to frame time.';
    }
  }

  setBridgeConnected(connected) {
    this.bridgeNodes.connect.textContent = connected ? 'Disconnect' : 'Connect';
    this.bridgeNodes.connect.setAttribute('aria-pressed', String(connected));
  }
}
