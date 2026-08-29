/**
 * runStage2.ts — produce Stage 2 candidates in the pipeline's shared shape.
 *
 * Mirrors the Stage 1 runner's contract: detection runs on NORMALIZED text
 * and every candidate carries its exact ORIGINAL span, resolved through the
 * Stage 0 offset map with mapNormalizedSpan (never raw map indexing — see
 * the M1 offset-map contract).
 *
 * rawConfidence is the model's softmax score, unchanged and explicitly
 * uncalibrated — the eval measures what those scores are worth per bucket,
 * and Stage 4 (M8) calibrates. Inventing a mapping here would launder an
 * unmeasured number into a measured-looking one.
 */

import type { NormalizationResult } from '../types.js';
import { mapNormalizedSpan } from '../offsetMap.js';
import type { NerRecognizer, Stage2Candidate } from './types.js';

/** Collapse interior whitespace so trivial layout variants share a key. */
function canonicalName(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function runStage2(
  normalization: NormalizationResult,
  engine: NerRecognizer,
): Promise<Stage2Candidate[]> {
  const { normalizedText, offsetMap } = normalization;
  const spans = await engine.recognize(normalizedText);

  return spans.map((span) => {
    const original = mapNormalizedSpan(offsetMap, span.start, span.end);
    return {
      text: span.text,
      type: span.type,
      start: span.start,
      end: span.end,
      originalStart: original.start,
      originalEnd: original.end,
      rawConfidence: span.score,
      stage: 'stage2-ner' as const,
      detectorId: `ner:${engine.id}`,
      sensitive: true,
      canonical: canonicalName(span.text),
      metadata: { model: engine.id },
      // Carried rather than re-looked-up: the hit was computed where the
      // gazetteers live, which may be a different process from this one.
      ...(span.gazetteer === undefined ? {} : { gazetteer: span.gazetteer }),
    };
  });
}
