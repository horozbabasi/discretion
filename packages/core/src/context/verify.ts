/**
 * Stage 2c — the VERIFICATION PASS.
 *
 * SPEC.md: "Candidates whose fused confidence falls in an ambiguous band …
 * are re-checked by an independent method: a second model with different
 * training data, a targeted classification prompt against a small bundled
 * model, or a rule-based cross-check, whichever the eval shows performs best.
 * Only the ambiguous band is verified, so latency stays bounded. Measure and
 * report what fraction of candidates enter verification and what it costs.
 * Report the precision improvement this stage delivers. If the eval shows it
 * does not improve results, remove it and document why."
 *
 * THE METHOD CHOSEN, and why it is genuinely independent. Bundling a second
 * NER model was rejected on measurement, not taste: M6 benchmarked five and
 * the runner-up (XLM-R large) scored WORSE overall while costing 2.8× the
 * latency and 2× the size, so a disagreement between them would carry little
 * information. The gazetteer is already consumed as a Stage 3 signal, so
 * re-using it here would double-count one piece of evidence rather than add
 * one.
 *
 * What is left, and what this implements, is re-inference over a DIFFERENT
 * CONTEXT WINDOW. A transformer's prediction for a span is a function of the
 * tokens around it, and Stage 2 necessarily saw the span at some arbitrary
 * position inside a 400-character chunk — possibly near an edge, possibly
 * split from the sentence that explains it. Re-running the same model on a
 * window centred on the candidate asks the model the same question with
 * different evidence. Agreement is corroboration; disagreement means the
 * original prediction depended on chunk placement, which is exactly the
 * fragility worth catching.
 *
 * Whether that is worth its latency is an empirical question, and the answer
 * is reported in BENCHMARKS.md rather than assumed here.
 */

import { mapNormalizedSpan } from '../offsetMap.js';
import type { NormalizationResult } from '../types.js';
import type { NerEngine } from '../ner/engine.js';
import { isGazetteerType } from '../gazetteer/index.js';
import type { ContextContribution, ContextScoredCandidate } from './types.js';

/** Confidence range in which a candidate is neither clearly right nor wrong. */
export const AMBIGUOUS_LOW = 0.3;
export const AMBIGUOUS_HIGH = 0.7;

/** Characters of context on each side of the candidate when re-inferring. */
const WINDOW_PADDING = 140;

/** The model confirmed the span on independent evidence. */
const CONFIRMED = 0.15;
/** The model did not reproduce the span when re-asked with different context. */
const REFUTED = -0.2;

export interface VerificationStats {
  /** Candidates considered. */
  readonly total: number;
  /** Candidates whose confidence fell in the ambiguous band. */
  readonly entered: number;
  readonly confirmed: number;
  readonly refuted: number;
  /** Wall-clock cost of the pass. */
  readonly elapsedMs: number;
}

export interface VerificationResult {
  readonly candidates: readonly ContextScoredCandidate[];
  readonly stats: VerificationStats;
}

function inBand(confidence: number): boolean {
  return confidence >= AMBIGUOUS_LOW && confidence <= AMBIGUOUS_HIGH;
}

/**
 * Re-check ambiguous named-entity candidates against a recentred window.
 *
 * Only Stage 2 types are verified. A Stage 1 candidate in the band got there
 * through a validator and a set of context signals, and re-running a named-
 * entity model over it would not be an independent check of a checksum — it
 * would be an unrelated model with no view on the question.
 */
export async function verifyAmbiguous(
  normalization: NormalizationResult,
  scored: readonly ContextScoredCandidate[],
  engine: NerEngine,
): Promise<VerificationResult> {
  const started = Date.now();
  const text = normalization.normalizedText;

  let entered = 0;
  let confirmed = 0;
  let refuted = 0;

  const out: ContextScoredCandidate[] = [];
  for (const item of scored) {
    const { candidate } = item;
    const eligible =
      !item.suppressed &&
      candidate.stage === 'stage2-ner' &&
      isGazetteerType(candidate.type) &&
      inBand(item.contextConfidence);

    if (!eligible) {
      out.push(item);
      continue;
    }

    entered += 1;
    const from = Math.max(0, candidate.start - WINDOW_PADDING);
    const to = Math.min(text.length, candidate.end + WINDOW_PADDING);
    const window = text.slice(from, to);

    // A failure here must not be swallowed: SPEC.md's fail-closed rule applies
    // to every stage, so a thrown timeout propagates to the caller.
    const spans = await engine.recognize(window);
    const wanted = { start: candidate.start - from, end: candidate.end - from };
    const agreed = spans.some(
      (s) => s.type === candidate.type && s.start < wanted.end && wanted.start < s.end,
    );

    const contribution: ContextContribution = agreed
      ? { signal: 'verify:confirmed', delta: CONFIRMED, detail: 'recentred window agrees' }
      : { signal: 'verify:refuted', delta: REFUTED, detail: 'recentred window disagrees' };
    if (agreed) confirmed += 1;
    else refuted += 1;

    out.push({
      ...item,
      contextConfidence: Math.min(1, Math.max(0, item.contextConfidence + contribution.delta)),
      contributions: [...item.contributions, contribution],
    });
  }

  return {
    candidates: out,
    stats: {
      total: scored.length,
      entered,
      confirmed,
      refuted,
      elapsedMs: Date.now() - started,
    },
  };
}

/**
 * Map a verified candidate's span back to the original text.
 *
 * Exported for callers that re-derive original offsets after verification;
 * verification never moves a span, so this is the same mapping Stage 1 and
 * Stage 2 already applied.
 */
export function originalSpanOf(
  normalization: NormalizationResult,
  candidate: ContextScoredCandidate,
): { readonly start: number; readonly end: number } {
  return mapNormalizedSpan(
    normalization.offsetMap,
    candidate.candidate.start,
    candidate.candidate.end,
  );
}
