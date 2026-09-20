/**
 * Live readout — the tuning surface.
 *
 * Everything shown here comes from the resolved frame state, so the panel is
 * a direct window onto what the UE5 actor would be sending to its materials
 * and Niagara systems. If a value is not visible in the build kit's material
 * parameter table, it does not belong here.
 */

import { MOODS, MOOD_ORDER } from '../core/moods.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class Readout {
  constructor(root) {
    this.root = root;
    this.build();
  }

  build() {
    this.root.innerHTML = '';

    // --- Chaos ------------------------------------------------------------
    const chaosBlock = el('div', 'block');
    const head = el('div', 'chaos-head');
    this.chaosValue = el('span', 'chaos-value', '0');
    this.chaosUnit = el('span', 'chaos-unit', '/ 100');
    this.chaosBand = el('span', 'chaos-band band-calm', 'calm');
    head.append(this.chaosValue, this.chaosUnit, this.chaosBand);

    this.chaosMeter = el('div', 'meter');
    this.chaosFill = el('div', 'meter-fill');
    this.chaosFill.style.width = '0%';
    this.chaosMeter.appendChild(this.chaosFill);

    const ticks = el('div', 'meter-ticks');
    // Band edges from the Chaos feed table: 25 / 60 / 90.
    [25, 60, 90].forEach((edge) => {
      const t = el('span');
      t.style.width = `${edge}%`;
      ticks.appendChild(t);
    });
    // Trim the final tick so the flex row fills exactly 100%.
    const rest = el('span');
    rest.style.width = '10%';
    ticks.appendChild(rest);
    this.chaosMeter.appendChild(ticks);

    const scale = el('div', 'band-scale');
    const bands = [
      ['calm', 25],
      ['stirring', 35],
      ['surging', 30],
      ['unleashed', 10],
    ];
    for (const [label, width] of bands) {
      const s = el('span', null, label);
      s.style.width = `${width}%`;
      scale.appendChild(s);
    }

    chaosBlock.append(head, this.chaosMeter, scale);
    this.root.appendChild(chaosBlock);

    // --- Mood -------------------------------------------------------------
    const moodBlock = el('div', 'block');
    moodBlock.appendChild(this.titled('Mood', 'DA_EntityMood'));
    this.moodGrid = el('div', 'moods');
    this.moodNodes = {};
    for (const id of MOOD_ORDER) {
      const mood = MOODS[id];
      const chip = el('div', 'mood');
      chip.appendChild(el('span', null, mood.label));
      chip.appendChild(el('span', 'm-desc', `${mood.breathRate.toFixed(2)}λ · ${mood.filamentCount}f`));
      this.moodGrid.appendChild(chip);
      this.moodNodes[id] = chip;
    }
    moodBlock.appendChild(this.moodGrid);
    this.moodModeNote = el('div', 'note', 'auto — mood follows chaos');
    moodBlock.appendChild(this.moodModeNote);
    this.root.appendChild(moodBlock);

    // --- Materials --------------------------------------------------------
    const matBlock = el('div', 'block');
    matBlock.appendChild(this.titled('Master material', 'M_FuX_Chaos_Master'));
    this.matRows = el('div', 'rows');
    this.matValues = {};
    const matParams = [
      ['glow', 'Glow'],
      ['displace', 'Displace'],
      ['flowSpeed', 'FlowSpeed'],
      ['breathRate', 'BreathRate'],
      ['opacity', 'Opacity'],
      ['edgeSharpness', 'EdgeSharp'],
      ['spikes', 'Spikes'],
      ['filamentCount', 'Filaments'],
    ];
    for (const [key, label] of matParams) {
      const row = el('div', 'row');
      row.appendChild(el('span', 'k', label));
      const v = el('span', 'v');
      row.appendChild(v);
      this.matRows.appendChild(row);
      this.matValues[key] = v;
    }
    matBlock.appendChild(this.matRows);
    this.root.appendChild(matBlock);

    // --- Signals ----------------------------------------------------------
    const sigBlock = el('div', 'block');
    sigBlock.appendChild(this.titled('Reaction packet', 'ST_FuXReactionPacket'));
    this.sigRows = el('div', 'rows');
    this.sigValues = {};
    const sigParams = [
      ['energy', 'Energy', 'energy'],
      ['low', 'Low', 'low'],
      ['mid', 'Mid', 'mid'],
      ['high', 'High', 'high'],
      ['pressure', 'Pressure', null],
      ['attention', 'Attention', null],
      ['storyCharge', 'Story', null],
    ];
    for (const [key, label, barClass] of sigParams) {
      const row = el('div', 'row');
      row.appendChild(el('span', 'k', label));
      const bar = el('div', `bar${barClass ? ` ${barClass}` : ''}`);
      const fill = el('i');
      fill.style.width = '0%';
      bar.appendChild(fill);
      row.appendChild(bar);
      const v = el('span', 'v muted', '0.00');
      v.style.minWidth = '34px';
      v.style.textAlign = 'right';
      row.appendChild(v);
      this.sigRows.appendChild(row);
      this.sigValues[key] = { fill, v };
    }
    sigBlock.appendChild(this.sigRows);
    this.priorityRow = el('div', 'note', 'priority: idle');
    sigBlock.appendChild(this.priorityRow);
    this.root.appendChild(sigBlock);

    // --- Chaos trace ------------------------------------------------------
    const traceBlock = el('div', 'block');
    traceBlock.appendChild(this.titled('Chaos trace', 'last 8s'));
    this.traceCanvas = document.createElement('canvas');
    this.traceCanvas.className = 'trace';
    this.traceCanvas.width = 540;
    this.traceCanvas.height = 92;
    traceBlock.appendChild(this.traceCanvas);
    this.traceCtx = this.traceCanvas.getContext('2d');
    this.root.appendChild(traceBlock);

    // --- Memory -----------------------------------------------------------
    const memBlock = el('div', 'block');
    memBlock.appendChild(this.titled('Reaction memory', 'build kit p.8'));
    this.memoryList = el('div', 'memory');
    this.memoryList.appendChild(el('div', 'empty', 'no signals yet'));
    memBlock.appendChild(this.memoryList);
    this.root.appendChild(memBlock);

    // --- Performance ------------------------------------------------------
    const perfBlock = el('div', 'block');
    perfBlock.appendChild(this.titled('Performance', 'Intel UHD 620 budget'));
    this.perfRows = el('div', 'rows');
    this.perfValues = {};
    for (const [key, label] of [
      ['fps', 'Frame rate'],
      ['frameMs', 'Frame time'],
      ['quality', 'Quality tier'],
      ['paramHz', 'Param rate'],
      ['drawCalls', 'Draw calls'],
      ['triangles', 'Triangles'],
      ['particles', 'Particles'],
      ['tendrils', 'Tendrils'],
      ['coreVerts', 'Core verts'],
    ]) {
      const row = el('div', 'row');
      row.appendChild(el('span', 'k', label));
      const v = el('span', 'v muted', '—');
      v.style.marginLeft = 'auto';
      row.appendChild(v);
      this.perfRows.appendChild(row);
      this.perfValues[key] = v;
    }
    perfBlock.appendChild(this.perfRows);
    this.root.appendChild(perfBlock);
  }

  titled(title, hint) {
    const node = el('div', 'block-title');
    node.appendChild(el('span', null, title));
    if (hint) node.appendChild(el('span', 'hint', hint));
    return node;
  }

  /** Update everything from one resolved frame plus engine stats. */
  update(frame, stats, memory) {
    if (!frame) return;

    // Chaos
    this.chaosValue.textContent = frame.chaos.toFixed(1);
    this.chaosFill.style.width = `${frame.chaos}%`;
    this.chaosBand.textContent = frame.band;
    this.chaosBand.className = `chaos-band band-${frame.band}`;

    // Mood
    for (const id of MOOD_ORDER) {
      const chip = this.moodNodes[id];
      chip.dataset.active = String(frame.toMood === id);
      chip.dataset.blending = String(frame.fromMood !== frame.toMood && (frame.mood === id));
    }
    const modeText =
      frame.toMood !== frame.fromMood
        ? `blending ${frame.fromMood} → ${frame.toMood} (${(frame.moodBlend * 100).toFixed(0)}%) · ${frame.moodBlend < 1 ? 'easing' : 'settled'}`
        : `${frame.moodLabel} settled · response delay ${frame.responseDelay.toFixed(2)}s`;
    this.moodModeNote.textContent = modeText;

    // Materials
    const mat = this.matValues;
    mat.glow.textContent = frame.glow.toFixed(2);
    mat.displace.textContent = `${frame.displace.toFixed(2)} cm`;
    mat.flowSpeed.textContent = frame.flowSpeed.toFixed(3);
    mat.breathRate.textContent = frame.breathRate.toFixed(2);
    mat.opacity.textContent = frame.opacity.toFixed(2);
    mat.edgeSharpness.textContent = frame.edgeSharpness.toFixed(2);
    mat.spikes.textContent = frame.spikes.toFixed(3);
    mat.filamentCount.textContent = `${frame.filamentCount}`;

    // Signals
    for (const key of ['energy', 'low', 'mid', 'high', 'pressure', 'attention', 'storyCharge']) {
      const raw =
        key === 'energy' || key === 'low' || key === 'mid' || key === 'high'
          ? frame.audio[key]
          : frame[key];
      const value = raw ?? 0;
      const node = this.sigValues[key];
      node.fill.style.width = `${Math.min(100, value * 100)}%`;
      node.v.textContent = value.toFixed(2);
    }
    this.priorityRow.textContent = `priority: ${frame.priority} · threat ${frame.threat.toFixed(2)} · idle ${frame.idle.toFixed(1)}s`;

    // Trace
    this.drawTrace(memory);

    // Memory
    this.renderMemory(memory);

    // Performance
    if (stats) {
      const p = this.perfValues;
      p.fps.textContent = `${stats.fps.toFixed(0)} fps`;
      p.frameMs.textContent = `${stats.frameMs.toFixed(1)} ms`;
      p.quality.textContent = stats.quality;
      p.paramHz.textContent = `${stats.parameterHz} Hz`;
      p.drawCalls.textContent = `${stats.drawCalls}`;
      p.triangles.textContent = compact(stats.triangles);
      p.particles.textContent = `${stats.particles ?? '—'}`;
      p.tendrils.textContent = `${stats.tendrils ?? '—'} / 16`;
      p.coreVerts.textContent = compact(stats.coreVertices);
    }
  }

  drawTrace(memory) {
    const ctx = this.traceCtx;
    const { width, height } = this.traceCanvas;
    ctx.clearRect(0, 0, width, height);

    const data = memory?.orderedTrace?.() ?? [];
    if (data.length < 2) return;

    // Band guides at 25 / 60 / 90 so the trace lines up with the Chaos feed.
    ctx.strokeStyle = 'rgba(138, 43, 255, 0.16)';
    ctx.lineWidth = 1;
    for (const edge of [25, 60, 90]) {
      const y = height - (edge / 100) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Filled area.
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(182, 255, 26, 0.30)');
    gradient.addColorStop(0.55, 'rgba(138, 43, 255, 0.24)');
    gradient.addColorStop(1, 'rgba(20, 224, 200, 0.03)');

    ctx.beginPath();
    ctx.moveTo(0, height);
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (Math.min(100, Math.max(0, v)) / 100) * height;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The line itself, colored by the current band.
    const last = data[data.length - 1] ?? 0;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (Math.min(100, Math.max(0, v)) / 100) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle =
      last >= 90 ? '#b6ff1a' : last >= 60 ? '#8a2bff' : last >= 25 ? '#6a2cff' : '#14e0c8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Head marker.
    const hx = width;
    const hy = height - (Math.min(100, Math.max(0, last)) / 100) * height;
    ctx.beginPath();
    ctx.arc(hx - 2, hy, 3, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  renderMemory(memory) {
    const recent = memory?.recent ?? [];
    if (!recent.length) {
      this.memoryList.innerHTML = '';
      this.memoryList.appendChild(el('div', 'empty', 'no signals yet'));
      return;
    }
    this.memoryList.innerHTML = '';
    for (const packet of recent.slice(0, 6)) {
      const row = document.createElement('div');
      row.appendChild(el('span', 't', packet.label.slice(0, 12)));
      row.appendChild(el('span', 's', packet.strength.toFixed(2)));
      const type = el('span', null, packet.type);
      type.style.color = '#6f6a8c';
      row.appendChild(type);
      this.memoryList.appendChild(row);
    }
  }
}

function compact(n) {
  if (n === undefined || n === null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
