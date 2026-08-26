/**
 * Pin fast-check's global seed so property tests are deterministic.
 *
 * Without this, every run draws a fresh random seed: a rare counterexample
 * surfaces once, fails that one run, and is gone before anyone reads the
 * report — which is a flaky CI gate, the one thing a regression gate must
 * never be. The repo already takes this stance for the fuzz suite (seeded
 * mulberry32, 0xc0ffee); this extends it to the property suites.
 *
 * The tradeoff is explicit: a fixed seed explores a fixed set of inputs, so
 * we trade coverage-over-repeated-runs for reproducibility. The fuzz suites
 * with their tens of thousands of iterations carry the exploratory load.
 * On failure, fast-check still prints the counterexample and path, and the
 * failure reproduces every time until fixed.
 */

import fc from 'fast-check';

fc.configureGlobal({ seed: 0xc0ffee });
