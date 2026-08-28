/**
 * Stage 4 calibration.
 *
 * SPEC.md: "Calibrate against the eval corpus so that a confidence of 0.8
 * empirically means roughly 80% precision. Document the calibration method and
 * the resulting reliability curve."
 *
 * The property that carries the most weight here is MONOTONICITY. A calibrated
 * confidence that could fall as the raw score rises would mean more evidence
 * producing less confidence, which is incoherent on its face and would break
 * the exposure score's own monotonicity requirement downstream. Isotonic
 * regression guarantees it by construction; these tests check the guarantee
 * rather than assuming it.
 */
import { describe, expect, it } from 'vitest';

import { calibrate, fitCalibration, reliability, type CalibrationSample } from '../src/fuse/calibrate.js';
import { generate } from '../src/index.js';
import type { EntityType } from '../src/types.js';

/**
 * Observations whose true precision rises with the score, plus noise — the
 * shape a working detector produces.
 */
function syntheticSamples(count: number, type: EntityType = 'NATIONAL_ID'): CalibrationSample[] {
  const rng = generate.mulberry32(20260828);
  const samples: CalibrationSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const score = rng();
    // True precision climbs from ~0.1 to ~0.95 across the score range.
    const truth = 0.1 + 0.85 * score;
    samples.push({ type, score, correct: rng() < truth });
  }
  return samples;
}

describe('calibration — monotonicity', () => {
  it('never decreases as the raw score rises', () => {
    const model = fitCalibration(syntheticSamples(4000), 'synthetic');
    let previous = -1;
    for (let score = 0; score <= 1.0001; score += 0.01) {
      const p = calibrate(model, 'NATIONAL_ID', score);
      expect(p, `at ${score.toFixed(2)}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = p;
    }
  });

  it('holds even when the raw bins are non-monotonic', () => {
    // A small bin can easily show lower precision than the one below it.
    // Pool-adjacent-violators must merge them rather than emit a dip.
    const samples: CalibrationSample[] = [
      ...Array.from({ length: 100 }, () => ({ type: 'EMAIL' as const, score: 0.15, correct: true })),
      // This bin is WORSE than the one below despite a higher score.
      ...Array.from({ length: 10 }, () => ({ type: 'EMAIL' as const, score: 0.25, correct: false })),
      ...Array.from({ length: 100 }, () => ({ type: 'EMAIL' as const, score: 0.85, correct: true })),
    ];
    const model = fitCalibration(samples, 'synthetic');
    expect(calibrate(model, 'EMAIL', 0.25)).toBeGreaterThanOrEqual(calibrate(model, 'EMAIL', 0.15));
  });

  it('stays within [0, 1] for any input, including out-of-range', () => {
    const model = fitCalibration(syntheticSamples(2000), 'synthetic');
    for (const score of [-5, -0.1, 0, 0.5, 1, 1.5, 42]) {
      const p = calibrate(model, 'NATIONAL_ID', score);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('calibration — the promise it makes', () => {
  it('maps a score band to that band\'s measured precision', () => {
    // The point of the whole stage: the number means what it says.
    const samples = syntheticSamples(6000);
    const model = fitCalibration(samples, 'synthetic');

    for (const band of [0.25, 0.55, 0.85]) {
      const inBand = samples.filter((s) => Math.abs(s.score - band) < 0.05);
      const observed = inBand.filter((s) => s.correct).length / inBand.length;
      const predicted = calibrate(model, 'NATIONAL_ID', band);
      expect(Math.abs(predicted - observed), `band ${band}`).toBeLessThan(0.12);
    }
  });

  it('beats the raw scores on expected calibration error', () => {
    // The raw scores are deliberately mis-scaled: true precision is
    // 0.1 + 0.85 * score, so a raw score of 0.1 is right about 18% of the
    // time, not 10%. Calibration should close that gap.
    const fit = syntheticSamples(4000);
    const heldOut = syntheticSamples(4000).map((s) => ({ ...s, score: 1 - s.score }));
    const model = fitCalibration(fit, 'synthetic');

    // Raw ECE: treat the score itself as the predicted probability. Computed
    // here rather than via reliability(), which takes a fitted model — an
    // earlier version of this test passed a constant-0.5 model and so
    // compared against something that was not the raw scores at all.
    const buckets = Array.from({ length: 10 }, () => ({ predicted: 0, correct: 0, total: 0 }));
    for (const s of heldOut) {
      const b = buckets[Math.min(9, Math.floor(s.score * 10))]!;
      b.predicted += s.score;
      b.total += 1;
      if (s.correct) b.correct += 1;
    }
    const rawEce = buckets
      .filter((b) => b.total > 0)
      .reduce((sum, b) => sum + (b.total / heldOut.length) * Math.abs(b.predicted / b.total - b.correct / b.total), 0);

    expect(reliability(model, heldOut).expectedCalibrationError).toBeLessThan(rawEce);
  });
});

describe('calibration — per type versus pooled', () => {
  it('fits a per-type curve only where there is enough data', () => {
    const samples = [
      ...syntheticSamples(1000, 'NATIONAL_ID'),
      // Far below the minimum: must fall back rather than fit noise.
      ...syntheticSamples(5, 'VIN'),
    ];
    const model = fitCalibration(samples, 'synthetic');
    expect(model.perType.NATIONAL_ID).toBeDefined();
    expect(model.perType.VIN).toBeUndefined();
  });

  it('calibrates an unseen type through the pooled curve rather than failing', () => {
    const model = fitCalibration(syntheticSamples(1000), 'synthetic');
    const p = calibrate(model, 'CRYPTO_WALLET', 0.7);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('does not let one type\'s calibration distort another\'s', () => {
    // A validated IBAN and a shape-only postal code can carry the same raw
    // score and mean entirely different things.
    const rng = generate.mulberry32(7);
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 1000; i += 1) {
      samples.push({ type: 'IBAN', score: 0.8, correct: true });
      samples.push({ type: 'POSTAL_CODE', score: 0.8, correct: rng() < 0.2 });
    }
    const model = fitCalibration(samples, 'synthetic');
    expect(calibrate(model, 'IBAN', 0.8)).toBeGreaterThan(0.9);
    expect(calibrate(model, 'POSTAL_CODE', 0.8)).toBeLessThan(0.4);
  });
});
