/**
 * Deterministic PRNG for the value generators.
 *
 * mulberry32 — the same generator the fuzz suites use, copied here so the
 * generators are part of core's public API (the eval corpus builder and
 * M4's format-preserving surrogates both consume them) without src code
 * reaching into test code.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
