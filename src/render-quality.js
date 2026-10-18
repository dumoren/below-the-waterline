// Intervals are uncapped active wall time. Pauses belong to the scheduler, not this policy.
export const QUALITY_POLICY = Object.freeze({
  warmupSeconds: 2,
  windowSeconds: 2,
  cooldownSeconds: 8,
  slowInterval: 0.025,
  fastInterval: 0.018,
  downshiftWindows: 2,
  upshiftWindows: 4,
  downStep: 0.25,
  upStep: 0.125,
});

export function createRenderQuality({ initialDpr, maxDpr, minDpr = 1, ...options }) {
  if (![initialDpr, maxDpr, minDpr].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Render quality requires positive finite DPR bounds');
  }
  const policy = { ...QUALITY_POLICY, ...options };
  let maximum = maxDpr;
  const minimum = () => Math.min(minDpr, maximum);
  const clamp = (value) => Math.min(maximum, Math.max(minimum(), value));
  let dpr = clamp(initialDpr);
  let warmup, active, elapsed, count, slow, fast;

  function clearEvidence() {
    warmup = active = elapsed = count = slow = fast = 0;
  }
  clearEvidence();

  return {
    get dpr() { return dpr; },
    reset({ maxDpr: nextMaximum = maximum } = {}) {
      if (!Number.isFinite(nextMaximum) || nextMaximum <= 0) throw new RangeError('Invalid maximum DPR');
      maximum = nextMaximum;
      const previous = dpr;
      dpr = clamp(dpr);
      clearEvidence();
      return dpr === previous ? null : dpr;
    },
    sample(interval) {
      if (!Number.isFinite(interval) || interval <= 0) return null;
      active += interval;
      if (warmup + 1e-9 < policy.warmupSeconds) {
        warmup += interval;
        return null;
      }
      elapsed += interval;
      count++;
      if (elapsed + 1e-9 < policy.windowSeconds) return null;
      const mean = elapsed / count;
      elapsed = count = 0;
      slow = mean > policy.slowInterval ? slow + 1 : 0;
      fast = mean < policy.fastInterval ? fast + 1 : 0;
      if (active + 1e-9 < policy.cooldownSeconds) return null;
      const next = slow >= policy.downshiftWindows ? clamp(dpr - policy.downStep)
        : fast >= policy.upshiftWindows ? clamp(dpr + policy.upStep) : dpr;
      if (next === dpr) return null;
      dpr = next;
      clearEvidence();
      return dpr;
    },
  };
}
