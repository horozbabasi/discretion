/**
 * The EXPOSURE SCORE.
 *
 * SPEC.md: "A document-level, user-facing sensitivity summary, computed in
 * core … EXPLAINABLE BY CONSTRUCTION: a deterministic aggregation of
 * calibrated confidence × category severity weight × per-type factors, and the
 * report decomposes the total into named contributions. A score that cannot
 * show its work is not acceptable."
 *
 * MONOTONICITY IS STRUCTURAL, NOT INCIDENTAL. SPEC requires that adding a
 * detected entity never lowers the score and removing one never raises it. The
 * aggregation below is a sum of non-negative per-entity contributions passed
 * through a saturating transform that is strictly increasing. Both halves
 * matter: if a contribution could be negative, or the transform could
 * decrease, the property would fail. It is therefore not something to test for
 * and hope — it holds because of the shape of the arithmetic, and the test
 * exists to catch a future change that breaks the shape.
 *
 * WHY SATURATION AT ALL. A raw sum is unbounded and unreadable: a document
 * with forty identifiers would score in the thousands and mean nothing to a
 * user. The score is mapped into 0–100 by a saturating curve so that "how
 * exposed is this document" stays comparable between a short message and a
 * long one. Saturation is strictly increasing, so monotonicity survives it —
 * a fortieth entity adds less than the first, but it never adds less than
 * nothing.
 *
 * THE LIMITATION, which SPEC requires be stated wherever the score is shown,
 * travels with the report itself rather than living only in the UI: see
 * `ExposureReport.limitation`.
 */

import { CATEGORY_OF, SEVERITY_WEIGHTS, TYPE_FACTORS, type SeverityCategory } from '@privacyshield/data';
import type { EntityType } from '../types.js';

/** The minimum an entity needs to contribute anything at all. */
const MIN_CONFIDENCE = 0.05;

/**
 * Sum at which the score reaches ~63 of 100.
 *
 * Chosen so that ONE maximally severe, fully confident entity — a certain
 * national identity number, contributing 100 — already lands near 63, i.e.
 * "seriously exposed". A document does not need to be full of identifiers to
 * read as dangerous, because it is not: one leaked identity number is the
 * whole problem.
 */
const SATURATION_SCALE = 100;

export interface ExposureContribution {
  readonly type: EntityType;
  readonly category: SeverityCategory;
  /** The entity's calibrated confidence, as it entered the sum. */
  readonly confidence: number;
  /** Category severity weight, 0–100. */
  readonly weight: number;
  /** Per-type factor applied within the category. */
  readonly factor: number;
  /** confidence × weight × factor — this entity's share of the raw sum. */
  readonly points: number;
  /** Short human-readable text for the report. */
  readonly detail: string;
}

export interface CategoryBreakdown {
  readonly category: SeverityCategory;
  readonly entities: number;
  readonly points: number;
  /** Share of the raw total, 0–1. */
  readonly share: number;
}

export interface ExposureReport {
  /** Overall exposure, 0–100. */
  readonly score: number;
  /** The un-saturated sum, so the transform can be checked by a reader. */
  readonly rawPoints: number;
  readonly byCategory: readonly CategoryBreakdown[];
  /** Highest-contributing entities first. */
  readonly topContributors: readonly ExposureContribution[];
  /** Every contribution, so the total demonstrably decomposes. */
  readonly contributions: readonly ExposureContribution[];
  /** Stated wherever the score is shown, per SPEC. */
  readonly limitation: string;
}

/** What the engine needs from an entity. Deliberately minimal. */
export interface ExposureInput {
  readonly type: EntityType;
  readonly calibratedConfidence: number;
}

export const EXPOSURE_LIMITATION =
  'This score summarizes what detection found. It inherits every detection ' +
  'limitation, and a low score is not a guarantee of safety.';

/** How many contributors the report highlights. */
const TOP_N = 5;

function contributionFor(entity: ExposureInput): ExposureContribution | undefined {
  const confidence = Math.min(1, Math.max(0, entity.calibratedConfidence));
  if (confidence < MIN_CONFIDENCE) return undefined;

  const category = CATEGORY_OF[entity.type];
  if (category === undefined) return undefined;

  const weight = SEVERITY_WEIGHTS[category].weight;
  const factor = TYPE_FACTORS[entity.type]?.factor ?? 1;
  const points = confidence * weight * factor;

  return {
    type: entity.type,
    category,
    confidence,
    weight,
    factor,
    points,
    detail: `${entity.type} at ${(confidence * 100).toFixed(0)}% confidence × ${weight} (${category})${factor === 1 ? '' : ` × ${factor}`}`,
  };
}

/**
 * Saturating map from an unbounded points sum to 0–100.
 *
 * `1 - e^(-x/scale)` is strictly increasing on x ≥ 0 and asymptotic to 1, so
 * it bounds the score without ever letting an added entity reduce it. Strict
 * increase is the property monotonicity depends on; a curve that plateaued
 * exactly would satisfy "never lowers" but would stop distinguishing
 * documents, and one that overshot would break it.
 */
function saturate(points: number): number {
  return 100 * (1 - Math.exp(-points / SATURATION_SCALE));
}

/**
 * Compute a document's exposure.
 *
 * Deterministic: the same entities in any order produce the same score, which
 * matters because the report is shown to a user and must not flicker as
 * detection order changes.
 */
export function computeExposure(entities: readonly ExposureInput[]): ExposureReport {
  const contributions = entities
    .map(contributionFor)
    .filter((c): c is ExposureContribution => c !== undefined);

  const rawPoints = contributions.reduce((sum, c) => sum + c.points, 0);

  const byCategoryMap = new Map<SeverityCategory, { entities: number; points: number }>();
  for (const c of contributions) {
    const acc = byCategoryMap.get(c.category) ?? { entities: 0, points: 0 };
    acc.entities += 1;
    acc.points += c.points;
    byCategoryMap.set(c.category, acc);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, acc]) => ({
      category,
      entities: acc.entities,
      points: acc.points,
      share: rawPoints === 0 ? 0 : acc.points / rawPoints,
    }))
    .sort((a, b) => b.points - a.points || a.category.localeCompare(b.category));

  const topContributors = [...contributions]
    .sort((a, b) => b.points - a.points || a.type.localeCompare(b.type))
    .slice(0, TOP_N);

  return {
    score: saturate(rawPoints),
    rawPoints,
    byCategory,
    topContributors,
    contributions,
    limitation: EXPOSURE_LIMITATION,
  };
}

/**
 * A band for presentation. Thresholds are presentational only — every decision
 * the pipeline makes uses calibrated confidence, never this label.
 */
export function exposureBand(score: number): 'none' | 'low' | 'moderate' | 'high' | 'severe' {
  if (score <= 0) return 'none';
  if (score < 20) return 'low';
  if (score < 45) return 'moderate';
  if (score < 70) return 'high';
  return 'severe';
}
