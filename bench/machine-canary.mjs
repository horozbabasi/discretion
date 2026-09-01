/**
 * A machine-speed canary, for D27a.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROBLEM IT ADDRESSES
 *
 * D27a records an unexplained state this machine enters in which inference is
 * 4-5x slower - cold p50 3022/3024/3056 ms where the normal figure is
 * 562/887/691. It reproduced three times consecutively, so it is a STATE
 * rather than a blip, and it will recur. The damage is not the slowness: it is
 * that NOTHING IN THE NUMBERS SAYS WHICH STATE PRODUCED THEM. A figure taken
 * during it looks exactly like a figure taken outside it, and gets compared
 * against one.
 *
 * Resolving the cause needs host instrumentation of things that may not
 * reproduce on demand - OEM power profiles, Defender scans, thermal limits.
 * Flagging does not. This measures whether the MACHINE is slow, independently
 * of the thing under test, so any measurement can say which state it was taken
 * in.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS WORKLOAD
 *
 * Integer mixing in a tight loop: no allocation, no GC, no I/O, no WASM, no
 * model. It shares nothing with what the benchmarks measure except the CPU, so
 * a canary that slows when the benchmark slows points at the machine rather
 * than at the code under test. Deterministic, so its cost does not vary with
 * input.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT ESTABLISH, stated because it would otherwise be assumed:
 * that a slow canary IS D27a's state. The canary detects "this machine is
 * slower than its own calibrated baseline". Whether that is the same condition
 * as D27a's 4-5x inference slowdown is UNCONFIRMED, and stays unconfirmed
 * until the anomaly recurs and the canary is observed firing during it. Until
 * then it is a necessary condition being tested, not a diagnosis.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Iterations per sample. Sized to ~1-3 ms on a healthy machine. */
const ITERATIONS = 2_000_000;

/** Samples per measurement; the median is reported. */
const SAMPLES = 9;

/**
 * How many times slower than baseline counts as the machine being degraded.
 *
 * 2.0 sits well above ordinary run-to-run variance and well below the 4-5x
 * D27a recorded, so it catches the state with room on both sides. It is a
 * THRESHOLD ON A RATIO rather than an absolute time, so the same number works
 * on any machine once calibrated.
 */
export const DEGRADED_RATIO = 2.0;

/** One deterministic pass. Returns a value so nothing can be optimised away. */
function mix(iterations) {
  let a = 0x9e3779b9;
  let b = 0x85ebca6b;
  for (let i = 0; i < iterations; i += 1) {
    a = (Math.imul(a ^ i, 0x01000193) >>> 0) ^ (b >>> 3);
    b = (Math.imul(b + i, 0x85ebca6b) >>> 0) ^ (a >>> 5);
  }
  return (a ^ b) >>> 0;
}

/** Median wall-clock milliseconds for one pass. */
export function measureCanary() {
  const samples = [];
  let sink = 0;
  // One discarded pass: the first is JIT warm-up and would report the compiler
  // rather than the machine.
  sink ^= mix(ITERATIONS);
  for (let i = 0; i < SAMPLES; i += 1) {
    const start = performance.now();
    sink ^= mix(ITERATIONS);
    samples.push(performance.now() - start);
  }
  samples.sort((x, y) => x - y);
  return { ms: samples[(SAMPLES - 1) >> 1], samples, sink };
}

/**
 * Score a canary reading against a calibrated baseline.
 *
 * `baselineMs` is null when the machine has never been calibrated, and the
 * verdict is then explicitly UNKNOWN rather than "fine". A missing baseline is
 * the one case where silently passing would be worst: every measurement would
 * look validated and none would be.
 */
export function scoreCanary(ms, baselineMs) {
  if (baselineMs === null || baselineMs === undefined || baselineMs <= 0) {
    return { verdict: 'unknown', ratio: null, ms };
  }
  const ratio = ms / baselineMs;
  return { verdict: ratio >= DEGRADED_RATIO ? 'degraded' : 'healthy', ratio, ms };
}
