/**
 * Stage 4 — EXPLANATIONS.
 *
 * SPEC.md: "Every emitted entity carries an EXPLANATION: which stages fired,
 * which triggers were found, which validator passed. This drives the review UI
 * and makes failures diagnosable."
 *
 * The last clause is the one that shapes this module. An explanation is not
 * decoration for the UI — it is how a wrong detection gets diagnosed without
 * re-running the pipeline under a debugger. So it records what actually
 * happened rather than a summary of it: which stages contributed, which named
 * Stage 3 signals fired and with what sign, and what the profile decided.
 *
 * NO PLAINTEXT IN EXPLANATIONS, which is why triggers are lexicon terms and
 * signal names rather than document text. Explanations flow into eval reports,
 * the review panel, and the popup; a value that reached any of those would
 * breach SPEC's third non-negotiable. The one exception is the entity's own
 * text, which the caller already holds and which `DetectedEntity` carries in
 * its own field.
 */

import type { DetectedEntity, DetectionStage, EntityExplanation, EntityType } from '../types.js';
import type { ContextScoredCandidate } from '../context/types.js';
import type { ProfileDecision } from './profiles.js';

/** What Stage 4 knows about one candidate as it becomes an entity. */
export interface FusionInput {
  readonly scored: ContextScoredCandidate;
  /** Confidence after calibration; comparable across types. */
  readonly calibratedConfidence: number;
  /** Whether the entity's span was widened by overlap resolution. */
  readonly absorbedOverlap?: boolean;
  /** Types this candidate won an overlap against. */
  readonly wonAgainst?: readonly EntityType[];
}

/**
 * Build the explanation for one entity.
 *
 * `triggers` carries the Stage 3 signal names rather than only lexicon
 * matches, because "why was this reported" is answered as much by
 * `structure:key-names-API_KEY` as by a trigger word — and a reviewer chasing
 * a false positive needs the negative signals too, which is why suppression
 * and penalty signals appear with their sign rather than being filtered out.
 */
export function explain(input: FusionInput): EntityExplanation {
  const { scored } = input;
  const stages: DetectionStage[] = [scored.candidate.stage];

  // Stage 3 fired if it contributed anything at all.
  if (scored.contributions.length > 0) stages.push('stage3-context');
  stages.push('stage4-fusion');

  const triggers = scored.contributions.map((c) => {
    const sign = c.delta >= 0 ? '+' : '';
    const detail = c.detail === undefined ? '' : ` (${c.detail})`;
    return `${c.signal}${detail} ${sign}${c.delta.toFixed(2)}`;
  });

  if (input.absorbedOverlap === true) {
    triggers.push('stage4:absorbed-overlapping-span +0.00');
  }
  for (const type of input.wonAgainst ?? []) {
    triggers.push(`stage4:more-specific-than-${type} +0.00`);
  }

  return {
    stages,
    triggers,
    ...(scored.candidate.validatorPassed !== undefined
      ? { validatorPassed: scored.candidate.validatorPassed }
      : {}),
  };
}

/** Assemble the entity a consumer actually receives. */
export function toDetectedEntity(input: FusionInput): DetectedEntity {
  const { candidate } = input.scored;
  return {
    text: candidate.text,
    type: candidate.type,
    start: candidate.start,
    end: candidate.end,
    calibratedConfidence: input.calibratedConfidence,
    explanation: explain(input),
  };
}

/**
 * A one-line reason a candidate was NOT reported.
 *
 * SPEC's explanation requirement covers emitted entities, but the review UI
 * has to answer "why did you miss this?" too, and a suppression with no
 * recorded reason is exactly the failure D18 was written about. Kept in the
 * same module so the two stay consistent.
 */
export function explainOmission(
  scored: ContextScoredCandidate,
  decision?: ProfileDecision,
): string {
  if (scored.suppressed) {
    return `suppressed by ${scored.suppressionReason ?? 'an unnamed rule'}`;
  }
  switch (decision?.reason) {
    case 'allowlist':
      return 'on the user allowlist';
    case 'type-out-of-profile':
      return 'entity type is outside the active sensitivity profile';
    case 'below-threshold':
      return 'calibrated confidence below the profile threshold';
    default:
      return 'not reported';
  }
}
