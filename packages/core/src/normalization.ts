/**
 * Stage 0 normalization: the composed transform pipeline.
 *
 * Order (each step optional via NormalizationOptions, all on by default):
 *
 *   1. strip invisibles      — zero-width & bidi controls are pure noise and
 *                              interfere with everything downstream
 *   2. NFKC (per grapheme)   — compatibility folding with an exact map
 *   3. selective homoglyph   — fold ONLY script-anomalous characters
 *      folding                 (see homoglyphFold.ts for the full rationale)
 *   3b. NFKC again, only when folding changed something: a folded character
 *       must compose with a following combining mark exactly as a native one
 *       would (e.g. Cyrillic а + U+0301 → folded "a" + U+0301 → "á"),
 *       otherwise normalizing already-normalized text would not be a no-op
 *   4. whitespace/punct      — exotic spaces, dashes, quotes → ASCII forms
 *
 * Each transform independently produces { text, map }; the final offset map
 * is the COMPOSITION of the per-stage maps (see offsetMap.ts for the map
 * format and its invariants). Composing small verified maps is far easier to
 * get right than building one map through four simultaneous transforms.
 */
import type { NormalizationOptions, NormalizationResult, TransformationRecord } from './types.js';
import {
  composeMaps,
  identityMap,
  buildReverseMap,
  mapNormalizedSpan,
  type TransformStepResult,
} from './offsetMap.js';
import { detectScripts } from './scripts.js';
import { stripInvisibles } from './transforms/stripInvisibles.js';
import { nfkcByGrapheme } from './transforms/nfkc.js';
import { foldHomoglyphs } from './transforms/homoglyphFold.js';
import { normalizeWhitespacePunct } from './transforms/whitespacePunct.js';

export function normalize(text: string, options?: NormalizationOptions): NormalizationResult {
  const opts = {
    stripInvisibles: true,
    nfkc: true,
    homoglyphFold: true,
    whitespacePunct: true,
    ...options,
  };

  /** The text after the transforms applied so far. */
  let current = text;
  /**
   * Composed map: current index → ORIGINAL index. null means "identity so
   * far" — kept symbolic so untouched text (the common case) never pays for
   * map allocation or composition.
   */
  let cumulative: Int32Array | null = null;
  const transformations: TransformationRecord[] = [];

  const apply = (step: (input: string) => TransformStepResult | null): boolean => {
    const result = step(current);
    if (result === null) return false;
    for (const change of result.changes) {
      // The step reports ranges in ITS input's coordinates; map them back to
      // original-text coordinates through the maps of the earlier steps.
      // mapNormalizedSpan (not plain lookup) so a change inside an earlier
      // expansion widens to the whole original cluster.
      const span = cumulative
        ? mapNormalizedSpan(cumulative, change.start, change.end)
        : { start: change.start, end: change.end };
      transformations.push({
        kind: change.kind,
        originalStart: span.start,
        originalEnd: span.end,
        original: text.slice(span.start, span.end),
        replacement: change.after,
      });
    }
    cumulative = cumulative ? composeMaps(cumulative, result.map) : result.map;
    current = result.text;
    return true;
  };

  // Per-cluster NFKC must run to a FIXPOINT: one pass's output can contain
  // clusters that only became composable by being placed next to each other
  // (the canonical case is Hangul compatibility jamo — ㅍ and ㅓ are separate
  // clusters, normalize to the conjoining jamo ᄑ + ᅥ, and only THOSE form a
  // single cluster that composes to 퍼 on the next look). One extra pass
  // settles it in practice; the cap is a defensive bound, and the fuzz suite
  // asserts both termination and idempotency.
  const applyNfkcToFixpoint = (): void => {
    for (let i = 0; i < 8 && apply(nfkcByGrapheme); i++) {
      // apply() advanced the pipeline; loop until it reports no change.
    }
  };

  if (opts.stripInvisibles) apply(stripInvisibles);
  if (opts.nfkc) applyNfkcToFixpoint();
  if (opts.homoglyphFold) {
    const folded = apply(foldHomoglyphs);
    // 3b — see the file header. Only needed when a fold actually happened,
    // and only meaningful when the NFKC step is enabled at all.
    if (folded && opts.nfkc) applyNfkcToFixpoint();
  }
  if (opts.whitespacePunct) apply(normalizeWhitespacePunct);

  const offsetMap = cumulative ?? identityMap(text.length);
  return {
    normalizedText: current,
    offsetMap,
    reverseMap: buildReverseMap(offsetMap, text.length),
    scripts: detectScripts(current),
    transformations,
    originalLength: text.length,
    normalizedLength: current.length,
  };
}
