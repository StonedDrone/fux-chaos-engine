/**
 * Quality tiers, mapped onto the prototype budgets from build kit p.10.
 *
 * "Start conservative on the Intel UHD 620. A stable, intentional FuX looks
 *  more alive than a dense effect that stutters."
 *
 * The tiers are ordered: the engine auto-degrades down the list when frame
 * time slips, and the UI can pin a tier manually.
 */

export const QUALITY = {
  high: {
    id: 'high',
    label: 'High',
    note: 'Discrete GPU / desktop',
    coreDetail: 16,
    skinDetail: 6,
    tendrilRows: 24,
    tendrilCount: 16,
    // Smoke + sparks together must stay under 500 visible (p.10).
    smoke: 330,
    sparks: 140,
    bloom: true,
    bloomStrength: 0.62,
    pixelRatio: 1,
    parameterHz: 30,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    note: 'Integrated GPU',
    coreDetail: 12,
    skinDetail: 4,
    tendrilRows: 18,
    tendrilCount: 12,
    smoke: 220,
    sparks: 90,
    bloom: true,
    bloomStrength: 0.42,
    pixelRatio: 0.9,
    parameterHz: 30,
  },
  low: {
    id: 'low',
    label: 'Low',
    note: 'Intel UHD 620 class',
    coreDetail: 8,
    skinDetail: 3,
    tendrilRows: 12,
    tendrilCount: 8,
    smoke: 130,
    sparks: 50,
    bloom: false,
    bloomStrength: 0,
    pixelRatio: 0.75,
    parameterHz: 20,
  },
};

export const QUALITY_ORDER = ['high', 'medium', 'low'];

/** Combined visible particle population for a tier. */
export function particleCount(tier) {
  const t = QUALITY[tier] ?? QUALITY.high;
  return t.smoke + t.sparks;
}

/** The next tier down, or null if already at the floor. */
export function degradeFrom(tier) {
  const i = QUALITY_ORDER.indexOf(tier);
  if (i < 0 || i === QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[i + 1];
}

/**
 * Watches frame time and recommends a tier change.
 *
 * Deliberately conservative: it needs a sustained problem before it acts, so
 * a single hitch (a shader compile, a garbage collection) never drops the
 * visual quality out from under a performance.
 */
export class PerformanceGuard {
  constructor({ window = 90, degradeBelowFps = 34, upgradeAboveFps = 58, cooldown = 4 } = {}) {
    this.samples = [];
    this.window = window;
    this.degradeBelowFps = degradeBelowFps;
    this.upgradeAboveFps = upgradeAboveFps;
    this.cooldown = cooldown;
    this.timeSinceChange = 99;
    this.badStreak = 0;
    this.goodStreak = 0;
    this.frameMs = 16.7;
    this.fps = 60;
  }

  /** @returns {number} latest frame time in milliseconds */
  sample(dtSeconds) {
    const ms = dtSeconds * 1000;
    this.samples.push(ms);
    if (this.samples.length > this.window) this.samples.shift();

    // Use a high percentile rather than the mean: consistent frame times
    // matter more than an occasional fast frame.
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? ms;
    this.frameMs = p90;
    this.fps = p90 > 0 ? 1000 / p90 : 60;
    this.timeSinceChange += dtSeconds;

    if (this.fps < this.degradeBelowFps) {
      this.badStreak += dtSeconds;
      this.goodStreak = 0;
    } else if (this.fps > this.upgradeAboveFps) {
      this.goodStreak += dtSeconds;
      this.badStreak = 0;
    } else {
      this.badStreak = 0;
      this.goodStreak = 0;
    }

    return p90;
  }

  /**
   * @param {string} currentTier
   * @returns {{tier:string, reason:string}|null}
   */
  recommend(currentTier) {
    if (this.timeSinceChange < this.cooldown) return null;

    if (this.badStreak > 3) {
      const next = degradeFrom(currentTier);
      if (next) {
        this.badStreak = 0;
        this.timeSinceChange = 0;
        return { tier: next, reason: `${this.fps.toFixed(0)} fps sustained — easing the load` };
      }
    }

    if (this.goodStreak > 6) {
      const i = QUALITY_ORDER.indexOf(currentTier);
      if (i > 0) {
        const next = QUALITY_ORDER[i - 1];
        this.goodStreak = 0;
        this.timeSinceChange = 0;
        return { tier: next, reason: `headroom available at ${this.fps.toFixed(0)} fps — raising quality` };
      }
    }

    return null;
  }

  reset() {
    this.samples.length = 0;
    this.badStreak = 0;
    this.goodStreak = 0;
    this.timeSinceChange = 99;
  }
}
