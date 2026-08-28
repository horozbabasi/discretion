/**
 * Stage 4 — CALIBRATION.
 *
 * SPEC.md: "Combine scores from all stages into a single calibrated confidence
 * per candidate. Calibrate against the eval corpus so that a confidence of 0.8
 * empirically means roughly 80% precision. Document the calibration method and
 * the resulting reliability curve."
 *
 * THE METHOD: ISOTONIC REGRESSION, fitted per entity type.
 *
 * Isotonic rather than Platt scaling (a fitted logistic) for two reasons that
 * matter here. First, the raw scores are not a logistic function of the truth
 * and there is no reason to expect them to be: they are a base confidence plus
 * a handful of additive Stage 3 contributions, so the shape of the mapping is
 * unknown and a two-parameter family would impose one. Second, isotonic
 * regression is EXPLAINABLE — the fitted model is a step function over score
 * bins whose steps are empirical precisions, so "0.8 means 80%" can be read
 * directly off the table rather than inferred from coefficients.
 *
 * What isotonic buys over raw binned precision is MONOTONICITY. A bin with few
 * samples can easily show lower precision than the bin below it, which would
 * make calibrated confidence non-monotonic in the evidence and produce the
 * absurd result that adding evidence lowers confidence. Pool-adjacent-
 * violators merges such bins, so the mapping never decreases.
 *
 * PER TYPE, because the types are not comparable. A validated IBAN and a
 * shape-only postal code can carry the same raw score and mean entirely
 * different things — that non-comparability is stated in the eval's own
 * header and is exactly what calibration exists to remove. Types with too few
 * samples to fit fall back to a pooled curve rather than to an overfitted one.
 *
 * FITTED AND EVALUATED ON DISJOINT DOCUMENTS. A curve fitted and scored on the
 * same corpus measures nothing; the split is stated in BENCHMARKS.md.
 */

import type { EntityType } from '../types.js';

/** One step of a fitted curve: scores in [from, to) map to `precision`. */
export interface CalibrationBin {
  readonly from: number;
  readonly to: number;
  /** Empirical precision of candidates whose raw score fell in this bin. */
  readonly precision: number;
  /** How many candidates the step was fitted on, for reporting weight. */
  readonly samples: number;
}

export interface CalibrationCurve {
  readonly bins: readonly CalibrationBin[];
  readonly samples: number;
}

export interface CalibrationModel {
  /** Per-type curves. Types absent here use `pooled`. */
  readonly perType: Readonly<Partial<Record<EntityType, CalibrationCurve>>>;
  /** Fallback for types with too little data to fit their own curve. */
  readonly pooled: CalibrationCurve;
  /** Documents the model was fitted on, for the split statement. */
  readonly fittedOn: string;
}

/** One observation: a candidate's raw score and whether it was correct. */
export interface CalibrationSample {
  readonly type: EntityType;
  readonly score: number;
  readonly correct: boolean;
}

/** Bins per curve. Ten keeps each step readable and populated. */
const BIN_COUNT = 10;

/**
 * Minimum samples before a type gets its own curve.
 *
 * Below this the per-type curve would be fitted on noise, and a confidently
 * wrong calibration is worse than an honest pooled one.
 */
const MIN_SAMPLES_PER_TYPE = 200;

/**
 * Pool adjacent violators: the isotonic regression fit.
 *
 * Walks left to right merging any bin whose precision is below its left
 * neighbour, which yields the closest non-decreasing sequence in least
 * squares. The merge is sample-weighted, so a large well-measured bin is not
 * dragged by a tiny noisy one.
 */
function poolAdjacentViolators(
  raw: readonly { from: number; to: number; correct: number; total: number }[],
): CalibrationBin[] {
  const stack: { from: number; to: number; correct: number; total: number }[] = [];

  for (const bin of raw) {
    if (bin.total === 0) continue;
    stack.push({ ...bin });
    // Merge backwards while the sequence decreases.
    while (stack.length > 1) {
      const right = stack[stack.length - 1]!;
      const left = stack[stack.length - 2]!;
      if (left.correct / left.total <= right.correct / right.total) break;
      stack.splice(stack.length - 2, 2, {
        from: left.from,
        to: right.to,
        correct: left.correct + right.correct,
        total: left.total + right.total,
      });
    }
  }

  return stack.map((b) => ({
    from: b.from,
    to: b.to,
    precision: b.correct / b.total,
    samples: b.total,
  }));
}

function fitCurve(samples: readonly CalibrationSample[]): CalibrationCurve {
  const raw = Array.from({ length: BIN_COUNT }, (_, i) => ({
    from: i / BIN_COUNT,
    to: (i + 1) / BIN_COUNT,
    correct: 0,
    total: 0,
  }));

  for (const s of samples) {
    const index = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(s.score * BIN_COUNT)));
    const bin = raw[index]!;
    bin.total += 1;
    if (s.correct) bin.correct += 1;
  }

  return { bins: poolAdjacentViolators(raw), samples: samples.length };
}

/** Fit a calibration model from labelled observations. */
export function fitCalibration(
  samples: readonly CalibrationSample[],
  fittedOn: string,
): CalibrationModel {
  const byType = new Map<EntityType, CalibrationSample[]>();
  for (const s of samples) {
    const list = byType.get(s.type) ?? [];
    list.push(s);
    byType.set(s.type, list);
  }

  const perType: Partial<Record<EntityType, CalibrationCurve>> = {};
  for (const [type, list] of byType) {
    if (list.length >= MIN_SAMPLES_PER_TYPE) perType[type] = fitCurve(list);
  }

  return { perType, pooled: fitCurve(samples), fittedOn };
}

/**
 * Map a raw score to a calibrated probability.
 *
 * PIECEWISE CONSTANT — the containing step's empirical precision, which is the
 * standard prediction for an isotonic fit. An earlier revision interpolated
 * between step midpoints to smooth the output, and that was an embellishment
 * with no justification behind it: because the step function is coarse where
 * data is sparse, interpolating systematically pulled predictions toward the
 * step below and left the model under-confident through 0.7-0.8. Returning the
 * step's own measured precision is both the standard method and the one whose
 * meaning is readable — "candidates in this band were right this often".
 */
export function calibrate(model: CalibrationModel, type: EntityType, score: number): number {
  const curve = model.perType[type] ?? model.pooled;
  if (curve.bins.length === 0) return score;

  const clamped = Math.min(1, Math.max(0, score));
  const index = curve.bins.findIndex((b) => clamped < b.to);
  const bin = curve.bins[index === -1 ? curve.bins.length - 1 : index]!;
  return bin.precision;
}

/** A reliability-curve row: what the model promised versus what happened. */
export interface ReliabilityPoint {
  readonly bucket: string;
  readonly predicted: number;
  readonly observed: number;
  readonly samples: number;
}

/**
 * Measure a fitted model against HELD-OUT observations.
 *
 * This is the number that means something: a curve scored on the documents it
 * was fitted on measures memorisation, not calibration.
 */
export function reliability(
  model: CalibrationModel,
  heldOut: readonly CalibrationSample[],
  buckets = 10,
): { readonly points: readonly ReliabilityPoint[]; readonly expectedCalibrationError: number } {
  const acc = Array.from({ length: buckets }, () => ({ predicted: 0, correct: 0, total: 0 }));

  for (const s of heldOut) {
    const p = calibrate(model, s.type, s.score);
    const index = Math.min(buckets - 1, Math.max(0, Math.floor(p * buckets)));
    const bucket = acc[index]!;
    bucket.predicted += p;
    bucket.total += 1;
    if (s.correct) bucket.correct += 1;
  }

  const points: ReliabilityPoint[] = [];
  let error = 0;
  for (const [i, b] of acc.entries()) {
    if (b.total === 0) continue;
    const predicted = b.predicted / b.total;
    const observed = b.correct / b.total;
    points.push({
      bucket: `${(i / buckets).toFixed(1)}–${((i + 1) / buckets).toFixed(1)}`,
      predicted,
      observed,
      samples: b.total,
    });
    error += (b.total / heldOut.length) * Math.abs(predicted - observed);
  }

  return { points, expectedCalibrationError: error };
}
