// Per-stage wall-clock timing for the pipeline. Railway's plain log output
// strips timestamps, so without this the only way to see where a run spent
// its time is to pull the JSON logs and diff consecutive lines by hand.
//
// `now` and `log` are injectable so the arithmetic is testable with a fake
// clock; production callers take the defaults.

function fmt(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function createStageTimer({ now = () => performance.now(), log = console.log } = {}) {
  const stages = [];

  return {
    // Runs fn and records how long it took under `label`. The timing is kept
    // even when fn throws — a failing stage is exactly the one you want a
    // number for — and the error is rethrown so callers keep their own
    // per-stage error handling.
    async stage(label, fn) {
      const t0 = now();
      try {
        return await fn();
      } finally {
        stages.push({ label, ms: now() - t0 });
      }
    },

    stages() {
      return stages.map(s => ({ ...s }));
    },

    // Slowest first, so the answer to "where did the time go" is line one.
    report() {
      const total = stages.reduce((sum, s) => sum + s.ms, 0);
      log(`  ⏱  Pipeline stages (total ${fmt(total)}):`);
      for (const s of [...stages].sort((a, b) => b.ms - a.ms)) {
        const pct = total > 0 ? Math.round((s.ms / total) * 100) : 0;
        log(`     ${fmt(s.ms).padStart(6)}  ${String(pct).padStart(2)}%  ${s.label}`);
      }
    },
  };
}
