/**
 * Transform 2: UNICODE NFKC, applied PER GRAPHEME CLUSTER.
 *
 * Normalizing cluster-by-cluster is what makes an exact offset map possible:
 * each cluster's output is recorded against that cluster's input range as we
 * go. (Normalizing the whole string at once and reconstructing the alignment
 * afterwards is guesswork — expansions, contractions and reorderings make the
 * aligned diff ambiguous — so it is deliberately NOT done that way.)
 *
 * Cluster-local NFKC is sound because canonical composition only happens
 * between a base and its combining marks, and UAX #29 never splits a base
 * from its marks (nor a Hangul jamo sequence) across cluster boundaries.
 *
 * Expansions (ﬁ → "fi", ½ → "1⁄2"): every output unit maps to the cluster
 * start. Contractions (e + U+0301 → é): the single output unit maps to the
 * cluster start and the sentinel/next cluster provides the end.
 */
import { MappedTextBuilder, type TransformStepResult, type StepChange } from '../offsetMap.js';
import { graphemeSegmenter } from './graphemes.js';

export function nfkcByGrapheme(text: string): TransformStepResult | null {
  // Fast path: already NFKC-normalized (covers pure ASCII instantly).
  if (text.normalize('NFKC') === text) return null;

  const builder = new MappedTextBuilder();
  const changes: StepChange[] = [];

  for (const { segment, index } of graphemeSegmenter.segment(text)) {
    const segmentEnd = index + segment.length;
    const normalized = segment.normalize('NFKC');
    if (normalized === segment) {
      builder.copyVerbatim(text, index, segmentEnd);
    } else {
      builder.replaceRange(normalized, index, segmentEnd);
      changes.push({
        kind: 'nfkc',
        start: index,
        end: segmentEnd,
        before: segment,
        after: normalized,
      });
    }
  }

  if (changes.length === 0) return null;
  const { text: out, map } = builder.finish(text.length);
  return { text: out, map, changes };
}
