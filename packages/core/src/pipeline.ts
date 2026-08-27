/**
 * The composed detection pipeline.
 *
 * Stages 0–3 in one supported entry point. Before this existed a caller had
 * to run `runStage1`, then `runStage2`, then score the result — and Stage 3's
 * evidence had to be threaded into Stage 1's validators by hand. That is not a
 * detail a consumer should be trusted with: a caller who forgets the context
 * hook silently gets a weaker pipeline, and one who forgets Stage 3 gets every
 * false positive Stage 3 exists to remove.
 *
 * SPEC.md's non-negotiable applies to the whole composition: any detection
 * error, timeout, or adapter failure must BLOCK, never degrade. Nothing here
 * catches an error from a stage — a thrown `DetectionTimeoutError` or
 * `DetectorError` propagates to the caller, which is what fail-closed means.
 *
 * The lower-level stage functions remain exported for tests and tooling that
 * genuinely want one stage; `detect` is what consumers should use.
 */

import { DOMAIN_LEXICONS, TRIGGER_LEXICONS } from '@privacyshield/data';

import type { NormalizationResult } from './types.js';
import { runStage1, type Stage1Options } from './detect/runner.js';
import { runStage2 } from './ner/runStage2.js';
import type { NerEngine } from './ner/engine.js';
import { analyzeContext, type ContextOptions } from './context/score.js';
import type { ContextScoredCandidate, DocumentProfile, PipelineCandidate } from './context/types.js';

export interface DetectOptions {
  /** Stage 1 configuration. The context hook is supplied automatically. */
  readonly stage1?: Omit<Stage1Options, 'contextFor'>;
  /**
   * Stage 2 engine. Omit to run without named-entity recognition — the
   * playground and the Stage-1 eval baseline both do.
   */
  readonly ner?: NerEngine;
  /** Stage 3 configuration. Defaults to the bundled trigger lexicons. */
  readonly context?: ContextOptions;
}

export interface DetectionOutcome {
  /** Candidates Stage 3 kept, with their adjusted confidence and reasons. */
  readonly emitted: readonly ContextScoredCandidate[];
  /**
   * Candidates Stage 3 suppressed, retained for eval and explanation.
   *
   * Kept rather than discarded because a suppression is a decision the
   * pipeline must be able to justify: the review UI explains why something
   * was NOT reported, and the eval measures whether a suppression rule is
   * removing errors or removing detections.
   */
  readonly suppressed: readonly ContextScoredCandidate[];
  readonly profile: DocumentProfile;
}

/**
 * Run Stages 0–3 over an already-normalized document.
 *
 * Takes the `NormalizationResult` rather than a string for the same reason
 * `runStage1` does: without the offset map a candidate cannot be mapped back
 * to the original text, and accepting a bare string would let a caller lose
 * it silently.
 */
export async function detect(
  normalization: NormalizationResult,
  options: DetectOptions = {},
): Promise<DetectionOutcome> {
  const analysis = analyzeContext(normalization.normalizedText, {
    triggerLexicons: TRIGGER_LEXICONS,
    domainLexicon: DOMAIN_LEXICONS,
    ...options.context,
  });

  // Stage 1 validators receive Stage 3 evidence inline, which is what lets a
  // detector that SPEC.md marks "requires context" see the signal at the
  // moment it decides.
  const stage1 = runStage1(normalization, {
    ...options.stage1,
    contextFor: (start, end) => analysis.signalAt(start, end),
  });

  const stage2 = options.ner === undefined ? [] : await runStage2(normalization, options.ner);

  const candidates: PipelineCandidate[] = [...stage1, ...stage2];
  const scored = analysis.score(candidates);

  return {
    emitted: scored.filter((c) => !c.suppressed),
    suppressed: scored.filter((c) => c.suppressed),
    profile: analysis.profile,
  };
}
