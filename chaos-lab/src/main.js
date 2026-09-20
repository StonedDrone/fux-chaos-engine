/**
 * FuX Chaos Lab — entry point.
 *
 * Wires the engine to the interface: readout, control deck, pointer input,
 * keyboard shortcuts, and the session recorder.
 *
 * Keyboard shortcuts echo the WaveScope workflow named in the README, so the
 * two tools feel like one pipeline:
 *   1  audio input (WaveScope: taps system audio)
 *   3  demo signal (WaveScope: silent demo signal)
 *   S  silence / low-stim toggle when held with shift
 *   R  record a session (WaveScope: records reference clips)
 */

import * as THREE from 'three';
import { FuXEngine } from './engine.js';
import { Readout } from './ui/readout.js';
import { ControlDeck } from './ui/deck.js';
import { SessionRecorder } from './core/recorder.js';
import { MOOD_ORDER, MOODS, moodForChaos } from './core/moods.js';
import { BridgeSocket, captureEnvironment, captureBlocker } from './audio/analysis.js';
import {
  applyViewState,
  createViewState,
  cycleMode,
  hideAll,
  isClear,
  panelModeMessage,
  setRegion,
  showAll,
} from './ui/panels.js';
import { MENU_KEY, SettingsMenu, closesMenu } from './ui/menu.js';

const stage = document.getElementById('stage');
const readoutRoot = document.getElementById('readout');
const banner = document.getElementById('banner');
const intro = document.getElementById('intro');
const introStart = document.getElementById('introStart');
const uiToggle = document.getElementById('uiToggle');
const uiToggleLabel = document.getElementById('uiToggleLabel');
const menuRoot = document.getElementById('menu');
const menuSheet = document.getElementById('menuSheet');
const menuBody = document.getElementById('menuBody');
const menuClose = document.getElementById('menuClose');
const menuBackdrop = document.getElementById('menuBackdrop');

const recorder = new SessionRecorder({ seconds: 120 });
let engine;
let readout;
let deck;
let bridgeSocket;
let bannerTimer;
let menu;
let view = createViewState('full');

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function say(html, ms = 2600) {
  banner.innerHTML = html;
  banner.dataset.show = 'true';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    banner.dataset.show = 'false';
  }, ms);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  engine = new FuXEngine({
    container: stage,
    quality: 'high',
    onEvent: handleEngineEvent,
  });

  deck = new ControlDeck(menuBody, {
    onViewRegion: (region, visible) => setViewRegion(region, visible),
    onViewPreset: (id) => applyViewPreset(id),
    onAudioSource: (id) => selectAudioSource(id),
    onMoodMode: (id) => selectMoodMode(id),
    onSignal: (id) => injectSignal(id),
    onObserverSpeed: (v) => {
      engine.setObserverMotion(v);
      say(v > 0 ? `Observer motion <b>×${v.toFixed(2)}</b>` : 'Observer still — FuX idles and watches.');
    },
    onFilamentBias: (v) => {
      engine.filamentBias = v;
      say(`Filament bias <b>×${v.toFixed(2)}</b> (budget 8–16)`);
    },
    onExposure: (v) => {
      engine.setExposure(v);
      say(`Exposure <b>×${v.toFixed(2)}</b>`);
    },
    onToggle: (id) => toggleSystem(id),
    onQuality: (id) => {
      engine.setQuality(id);
      deck.setQuality(id, { manual: true });
      say(`Quality pinned to <b>${id}</b>`);
    },
    onExport: () => exportSession(),
    onBridgeConnect: (url) => toggleBridge(url),
  });

  readout = new Readout(readoutRoot, {
    onClose: () => setViewRegion('readout', false),
  });

  // The sheet owns what opens and closes it; the stage keeps its own keys.
  menu = new SettingsMenu({
    root: menuRoot,
    sheet: menuSheet,
    body: menuBody,
    launcher: uiToggle,
    close: menuClose,
    backdrop: menuBackdrop,
  });

  bindPointer();
  bindKeys();
  // The chip is the settings launcher; its key badge never changes.
  uiToggle.querySelector('kbd').textContent = MENU_KEY;
  syncView();

  engine.start();
  engine.setObserverMotion(0.45);
  say('FuX is awake. Click the mass to touch him.', 4200);

  // The first telemetry frame also fills the performance block.
  requestAnimationFrame(() => {
    readout.update(engine.lastFrame, engine.frameStats, engine.memory);
  });
}

// ---------------------------------------------------------------------------
// Engine events
// ---------------------------------------------------------------------------
function handleEngineEvent({ type, detail }) {
  switch (type) {
    case 'touch':
      recorder.event('touch', {
        strength: Number(detail.strength.toFixed(2)),
        point: detail.point.map((v) => Number(v.toFixed(2))),
      });
      break;
    case 'cue':
      recorder.event('story_cue', { mood: detail.moodId, seconds: detail.seconds });
      say(`Story cue — FuX turns <b>${MOODS[detail.moodId]?.label ?? detail.moodId}</b> for ${detail.seconds}s.`);
      break;
    case 'moodMode':
      recorder.event('mood_mode', { mode: detail.mode, mood: detail.moodId });
      break;
    case 'audioSource':
      recorder.event('audio_source', { source: detail.source });
      break;
    case 'safety':
      recorder.event('safety', { enabled: detail.enabled });
      say(detail.enabled ? 'Low-stimulation mode engaged — flash and displacement clamped.' : 'Full range restored.');
      break;
    case 'quality':
      recorder.event('quality', { tier: detail.tier });
      break;
    case 'autoscale':
      deck.setQuality(detail.tier, { manual: false });
      say(`Auto quality → <b>${detail.tier}</b> — ${detail.reason}`);
      break;
    case 'microphone':
      if (detail.ok) {
        deck.clearMicHelp();
        break;
      }
      deck.setAudioNote(detail.error, true);
      if (engine.audio.live.needsOwnTab) {
        deck.setMicHelp('Microphone access cannot be granted from inside this frame.', {
          label: 'Open in a new tab',
          href: window.location.href,
        });
      }
      break;
    case 'frame': {
      // Entity stats first, renderer-reported stats second: the renderer's
      // triangles and draw calls are what actually reached the GPU.
      readout.update(detail.state, { ...engine.entity.stats(), ...detail.stats }, engine.memory);
      recorder.capture(detail.state, 1 / 30);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------
/**
 * Push the view state to the page and to the settings sheet.
 *
 * There is one state object; the `H` key, the chip, the readout's close button
 * and the checkboxes in the sheet all mutate it through this function, so what
 * the menu shows can never disagree with what is on screen.
 */
function syncView() {
  applyViewState(document.body, view);
  deck.setViewState(view);
  const clear = isClear(view);
  uiToggleLabel.textContent = clear ? 'Show UI' : 'Menu';
  uiToggle.setAttribute('aria-pressed', String(clear));
}

/** Cycle the presets: everything, side panels hidden, then just FuX. */
function cyclePanels() {
  const previous = view.mode;
  view = cycleMode(view);
  syncView();
  const message = panelModeMessage(view.mode);
  if (message && previous !== 'hidden') say(message, 3200);
}

/** Show or hide one region, which is what the sheet's checkboxes do. */
function setViewRegion(region, visible) {
  view = setRegion(view, region, visible);
  syncView();
}

function applyViewPreset(id) {
  if (id === 'clear') {
    view = hideAll(view);
    say('Chrome hidden — just FuX. <b>M</b> for the menu, <b>H</b> to step back.', 3600);
  } else {
    view = showAll(view);
    say('Everything back on screen.');
  }
  syncView();
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
async function selectAudioSource(id) {
  if (id === 'live') {
    const environment = captureEnvironment();
    deck.setAudioNote('Requesting audio input…');
    // Say so before the browser declines on the user's behalf: an embedded
    // preview usually never shows a prompt, and an unexplained silence looks
    // like the app is broken.
    if (environment.embedded) {
      deck.setMicHelp(captureBlocker(environment), {
        label: 'Open in a new tab',
        href: window.location.href,
      });
    }

    const ok = await engine.enableMicrophone();
    if (ok) {
      deck.setAudioSource('live');
      deck.clearMicHelp();
      const label = engine.audio.live.labels;
      deck.setAudioNote(`Listening to ${label}. Speak, clap, or play music.`);
      say(`Audio input live — FuX is hearing the room via <b>${label}</b>.`);
      return;
    }

    // Nothing to hear: keep the body moving rather than leaving the demo on a
    // dead input, and be explicit that this is the demo signal, not the room.
    const previous = engine.audio.source;
    if (previous !== 'demo' && previous !== 'bridge') {
      engine.setAudioSource('demo');
      deck.setAudioSource('demo');
      say('No audio input — back on the demo signal so FuX keeps moving.');
    } else {
      say('No audio input — FuX stays on the demo signal.');
    }
    return;
  }
  if (id === 'bridge') {
    engine.setAudioSource('bridge');
    deck.setAudioSource('bridge');
    return;
  }
  engine.setAudioSource(id);
  deck.setAudioSource(id);
}

function selectMoodMode(id) {
  if (id === 'auto') {
    engine.setMoodMode('auto');
    deck.setMoodMode('auto');
    say('Mood back to <b>auto</b> — following chaos through calm → stirring → surging → unleashed.');
  } else {
    engine.setMoodMode('manual', id);
    deck.setMoodMode(id);
    const mood = MOODS[id];
    say(`Pinned to <b>${mood.label}</b> — ${mood.motion}. ${mood.response}.`);
  }
}

function injectSignal(kind) {
  const now = performance.now();
  switch (kind) {
    case 'touch': {
      // Touch at a random point on the body so repeated tests vary.
      const angle = Math.random() * Math.PI * 2;
      const height = Math.random() * 0.8 - 0.2;
      const point = [
        Math.cos(angle) * 0.9,
        height,
        Math.sin(angle) * 0.9,
      ];
      const r = Math.hypot(point[0], point[1], point[2]) || 1;
      const surface = point.map((v) => v / r);
      engine.resolver.registerTouch(surface, 0.85);
      engine.send({ type: 'touch', strength: 0.85, point: surface, label: 'contact', decayTime: 1.8 });
      say('Touch — contact point → ripple → core turns → memory scar.');
      break;
    }
    case 'proximity':
      engine.send({
        type: 'proximity',
        strength: 0.6,
        point: [1.6, 0.4, 1.6],
        label: 'approach',
        decayTime: 1.1,
      });
      say('Proximity — the mass reaches toward something entering the volume.');
      break;
    case 'system':
      engine.send({
        type: 'system',
        strength: 0.9,
        urgency: 1,
        label: 'sys event',
        decayTime: 0.8,
        moodHint: 'wild',
      });
      engine.resolver.sensors.beat = 1;
      say('System event — <b>spike</b>, immediate discharge.');
      break;
    case 'voice':
      engine.send({
        type: 'voice',
        strength: 0.7,
        label: 'voice',
        decayTime: 2.2,
        moodHint: 'ominous',
      });
      say('Voice — mood and charge shift; story charge begins to build.');
      break;
    default:
      break;
  }
  recorder.event('signal_injected', { kind, at: Number(now.toFixed(0)) });
}

function toggleSystem(id) {
  if (id === 'safety') {
    const next = !engine.resolver.safety.enabled;
    engine.setSafety(next);
    deck.setSafety(next);
    return;
  }
  if (id === 'record') {
    if (recorder.recording) {
      const summary = recorder.stop();
      deck.setRecording(false);
      say(
        `Take recorded — ${summary.duration}s, peak chaos <b>${summary.peakChaos}</b>, mean ${summary.meanChaos}. Press <b>E</b> to export.`,
        4200,
      );
      // Autosave every take so a good one is never lost.
      recorder.download();
    } else {
      recorder.start({ quality: engine.quality, moodMode: engine.resolver.moodMode });
      deck.setRecording(true);
      say('Recording — resolved state at 30 Hz. Press <b>R</b> again to stop.', 3600);
    }
    return;
  }
}

function exportSession() {
  if (!recorder.samples.length) {
    say('Nothing recorded yet — press <b>R</b> to start a take.');
    return;
  }
  const name = recorder.download();
  say(`Exported <b>${name}</b> — timeline, events, and summary.`, 4200);
}

// ---------------------------------------------------------------------------
// MilkDrop-Shake bridge
// ---------------------------------------------------------------------------
function toggleBridge(url) {
  if (bridgeSocket?.state === 'open') {
    bridgeSocket.disconnect();
    bridgeSocket = null;
    deck.setBridgeConnected(false);
    deck.setBridgeNote('Disconnected.');
    engine.setAudioSource('demo');
    deck.setAudioSource('demo');
    say('Bridge closed — back to the demo signal.');
    return;
  }
  if (!url) {
    deck.setBridgeNote('Enter a WebSocket URL first, e.g. ws://127.0.0.1:8765', true);
    return;
  }
  bridgeSocket = new BridgeSocket({
    url,
    onStatus: (state, error) => {
      if (state === 'open') {
        deck.setBridgeConnected(true);
        deck.setBridgeNote('Connected — packets feed the audio layer.');
        engine.setAudioSource('bridge');
        deck.setAudioSource('bridge');
        say('Bridge open — <b>MilkDrop-Shake</b> is now FuX’s nervous system.');
      } else if (state === 'error') {
        deck.setBridgeConnected(false);
        deck.setBridgeNote(error ?? 'Connection failed.', true);
        engine.setAudioSource('demo');
        deck.setAudioSource('demo');
      } else if (state === 'closed') {
        deck.setBridgeConnected(false);
        deck.setBridgeNote('Bridge closed.');
      }
    },
  });
  bridgeSocket.connect(url);
  bridgeSocket.attach(engine.audio.bridge);
}

// ---------------------------------------------------------------------------
// Pointer: FuX answers contact
// ---------------------------------------------------------------------------
function bindPointer() {
  const canvas = engine.renderer.domElement;
  let dragging = false;
  let lastTouch = 0;

  const send = (event) => {
    const now = performance.now();
    // Rate-limit during a drag so a sweep reads as one continuous stroke.
    if (now - lastTouch < 55) return;
    lastTouch = now;
    engine.touchAt(event.clientX, event.clientY, 0.9);
  };

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    send(event);
    say('Contact — watch the ripple spread and the scar fade.', 2000);
  });

  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    // Move the attention target wherever the pointer goes.
    engine.impulses.attentionTarget = pointerToLocal(event);
    if (dragging) send(event);
  });

  canvas.addEventListener('pointerleave', () => {
    dragging = false;
  });
}

function pointerToLocal(event) {
  const rect = engine.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  engine.raycaster.setFromCamera(ndc, engine.camera);

  const hits = engine.raycaster.intersectObject(engine.entity.reactionVolume, false);
  if (hits.length) {
    const local = engine.entity.group.worldToLocal(hits[0].point.clone());
    return [local.x, local.y, local.z];
  }

  // Outside the reaction volume: project onto the plane through the origin
  // that faces the camera, so FuX still leans toward the pointer without the
  // target flying off to infinity at grazing angles.
  const normal = engine.camera.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3());
  const point = new THREE.Vector3();
  if (!engine.raycaster.ray.intersectPlane(plane, point)) return [0, 0, 0];
  // Damp the reach so a pointer at the edge of the screen is a lean, not a lunge.
  return [point.x * 0.35, point.y * 0.35, point.z * 0.35];
}

// ---------------------------------------------------------------------------
// Keyboard — the WaveScope muscle memory
// ---------------------------------------------------------------------------
function bindKeys() {
  window.addEventListener('keydown', (event) => {
    // The settings sheet owns Escape, and text fields keep their own keys.
    if (closesMenu(event) && menu.open) {
      menu.close();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();

    switch (key) {
      case '1':
        selectAudioSource('live');
        break;
      case '3':
        selectAudioSource('demo');
        say('Demo signal — <b>3</b> plays the calibrated loop.');
        break;
      case 's':
        if (engine.audio.source === 'silence') {
          selectAudioSource('demo');
        } else if (event.shiftKey) {
          toggleSystem('safety');
        } else {
          selectAudioSource('silence');
          say('Silence — FuX breathes and stays aware.');
        }
        break;
      case 'a':
        selectMoodMode('auto');
        break;
      case 'c':
      case 'j':
      case 'o':
      case 'w': {
        const map = { c: 'calm', j: 'joyful', o: 'ominous', w: 'wild' };
        engine.cue(map[key], 8);
        deck.setMoodMode(map[key]);
        break;
      }
      case 't':
        injectSignal('touch');
        break;
      case 'p':
        injectSignal('proximity');
        break;
      case 'x':
        injectSignal('system');
        break;
      case 'v':
        injectSignal('voice');
        break;
      case 'r':
        toggleSystem('record');
        break;
      case 'e':
        exportSession();
        break;
      case 'q': {
        const order = ['high', 'medium', 'low'];
        const next = order[(order.indexOf(engine.quality) + 1) % order.length];
        engine.setQuality(next);
        deck.setQuality(next, { manual: true });
        say(`Quality → <b>${next}</b>`);
        break;
      }
      case 'h':
        cyclePanels();
        break;
      case 'm':
        menu.toggle();
        break;
      case ' ':
        event.preventDefault();
        if (engine.running) {
          engine.stop();
          say('Paused.');
        } else {
          engine.start();
          say('Running.');
        }
        break;
      default:
        return;
    }
  });
}

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------
introStart.addEventListener('click', () => {
  intro.dataset.hidden = 'true';
  engine.audio.demo.reset();
  say('FuX is awake. Click the mass to touch him.', 4200);
});

// The chip, and the key that does the same thing. Both call one function, so
// the label on the button is always the truth about what happens next.
uiToggle.addEventListener('click', cyclePanels);

window.addEventListener('beforeunload', () => {
  engine?.dispose();
});

boot();
