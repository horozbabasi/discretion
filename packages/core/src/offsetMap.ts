/**
 * Offset-map machinery for Stage 0 normalization.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Detection runs on normalized text; substitution edits the ORIGINAL text.
 * Every transform therefore produces, alongside its output text, an exact map
 * back to its input. The final map for a whole pipeline is the composition of
 * each stage's map — composing small verified maps is far easier to get right
 * than building one map through four simultaneous transforms.
 *
 * MAP REPRESENTATION
 * ──────────────────
 * A map for a transform `input → output` is an Int32Array of length
 * output.length + 1 (all indices are UTF-16 code units):
 *
 *   map[i]             = input index where the cluster that produced output
 *                        index i begins
 *   map[output.length] = input.length                            (sentinel)
 *
 * The sentinel entry is the classic off-by-one: without it, the end of a span
 * covering the last character could not be mapped. With it, an output span
 * [s, e) maps to the input span [map[s], map[e]).
 *
 * DELETION ATTRIBUTION (a deliberate choice — read before editing)
 * ───────────────────────────────────────────────────────────────
 * Deleted input (stripped invisibles) produces no output index, so it cannot
 * appear in the map directly. Each deleted run is attributed to the cluster
 * that FOLLOWS it; a deleted run at the very end of the input falls under the
 * sentinel. Consequences:
 *   • map[0] === 0 always holds when the output is non-empty, even if the
 *     input began with deleted characters — a stated invariant of the format.
 *   • A mapped span silently includes any deleted (invisible) characters
 *     immediately before the characters it covers, and — via the sentinel —
 *     any deleted characters at the end of the input. Substituting such a
 *     span removes those invisibles along with it, which is exactly what a
 *     masking pipeline wants: they are noise we would strip anyway.
 *   • Values are STRICTLY increasing across real cluster boundaries; equal
 *     adjacent values occur only inside a single cluster's multi-unit output
 *     (an expansion). mapNormalizedSpan() relies on this.
 *
 * EDGE CASE — everything deleted: when the output is empty the map is the
 * single sentinel entry [inputLength], so map[0] === inputLength, not 0.
 * That is the one place the "map[0] === 0" invariant cannot hold; every
 * consumer and test conditions that invariant on a non-empty output.
 */

import type { TransformKind } from './types.js';

/** The identity map for a text of the given length: [0, 1, …, length]. */
export function identityMap(length: number): Int32Array {
  const map = new Int32Array(length + 1);
  for (let i = 0; i <= length; i++) map[i] = i;
  return map;
}

/**
 * Compose two offset maps.
 *
 *   outer: maps indices of text B to indices of text A  (length |B| + 1)
 *   inner: maps indices of text C to indices of text B  (length |C| + 1)
 *   result: maps indices of text C to indices of text A (length |C| + 1)
 *
 * Because inner[|C|] = |B| and outer[|B|] = |A|, the sentinel composes for
 * free, and the composition of monotone maps is monotone — both facts are
 * covered by tests.
 */
export function composeMaps(outer: Int32Array, inner: Int32Array): Int32Array {
  const result = new Int32Array(inner.length);
  const outerMax = outer.length - 1;
  for (let i = 0; i < inner.length; i++) {
    const via = inner[i]!;
    if (via < 0 || via > outerMax) {
      throw new Error(
        `composeMaps: inner map value ${via} at index ${i} is outside the outer map's domain [0, ${outerMax}]`,
      );
    }
    result[i] = outer[via]!;
  }
  return result;
}

/**
 * Build the reverse map (original index → normalized index) from a forward
 * map.
 *
 *   reverseMap[j]              = normalized index of the start of the cluster
 *                                whose original extent contains j; for a
 *                                deleted character this is the normalized
 *                                position where it was removed
 *   reverseMap[originalLength] = normalizedLength                (sentinel)
 *
 * "Extent" is the half-open range [offsetMap[i], nextDistinctValue), i.e. it
 * includes any deleted characters attributed to the cluster. The walk below
 * precomputes each cluster's extent end (`ends`), then assigns every original
 * index the FIRST normalized index whose extent reaches past it — which lands
 * on the first unit of the covering cluster, also for expansions where several
 * normalized units share one original cluster.
 */
export function buildReverseMap(offsetMap: Int32Array, originalLength: number): Int32Array {
  const normalizedLength = offsetMap.length - 1;
  const reverse = new Int32Array(originalLength + 1);

  // ends[i] = original index one past the extent of the cluster covering
  // normalized index i (= the next distinct map value, or originalLength).
  const ends = new Int32Array(normalizedLength);
  let nextDistinct = originalLength;
  for (let i = normalizedLength - 1; i >= 0; i--) {
    ends[i] = nextDistinct;
    if (i === 0 || offsetMap[i - 1]! !== offsetMap[i]!) {
      nextDistinct = offsetMap[i]!;
    }
  }

  let i = 0;
  for (let j = 0; j < originalLength; j++) {
    while (i < normalizedLength && ends[i]! <= j) i++;
    // If every cluster ends at or before j (possible only when the trailing
    // input was deleted and absorbed by the sentinel), i === normalizedLength,
    // which is exactly "the position where it was removed".
    reverse[j] = i;
  }
  reverse[originalLength] = normalizedLength;
  return reverse;
}

/**
 * Map a normalized span [start, end) to the original span it covers.
 *
 * For spans whose endpooints sit on cluster boundaries this is exactly
 * [offsetMap[start], offsetMap[end]). When an endpoint lands INSIDE an
 * expansion (one original cluster → several normalized units — e.g. matching
 * only the "f" of the "fi" produced by the ligature U+FB01), the span is
 * widened to cover the WHOLE original cluster: you cannot substitute half a
 * ligature. Widening is the only sound choice for masking — the alternative,
 * an empty or truncated original span, would silently leave sensitive
 * characters behind.
 *
 * NOTE: two non-overlapping normalized spans that split the same expansion
 * both widen to the same original cluster, so mapped spans can overlap in
 * that one case. Substitution must merge overlapping original spans before
 * splicing (covered by the substitution-safety property test).
 */
export function mapNormalizedSpan(
  offsetMap: Int32Array,
  start: number,
  end: number,
): { start: number; end: number } {
  const normalizedLength = offsetMap.length - 1;
  if (!(start >= 0 && start <= end && end <= normalizedLength)) {
    throw new Error(
      `mapNormalizedSpan: invalid span [${start}, ${end}) for normalized length ${normalizedLength}`,
    );
  }
  if (start === end) {
    const at = offsetMap[start]!;
    return { start: at, end: at };
  }
  const origStart = offsetMap[start]!;
  // Find the original end of the cluster containing normalized index end-1:
  // advance past normalized units that still share that cluster's start value.
  // (Equal adjacent values occur only within one cluster — see header.)
  const lastClusterStart = offsetMap[end - 1]!;
  let k = end;
  while (k < normalizedLength && offsetMap[k]! === lastClusterStart) k++;
  return { start: origStart, end: offsetMap[k]! };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform plumbing shared by the individual transforms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One change made by a single transform, in coordinates of THAT TRANSFORM'S
 * INPUT. normalize() re-maps these to original-text coordinates before
 * exposing them as TransformationRecord.
 */
export interface StepChange {
  kind: TransformKind;
  /** Range in the transform's input text. */
  start: number;
  end: number;
  /** input.slice(start, end) — what was there. */
  before: string;
  /** What the transform emitted instead ('' for deletions). */
  after: string;
}

/** What every transform returns; null means "nothing to do" (identity). */
export interface TransformStepResult {
  text: string;
  /** output index → input index, with sentinel (length text.length + 1). */
  map: Int32Array;
  changes: StepChange[];
}

/**
 * Streaming builder used by every transform to produce output text and its
 * offset map in one left-to-right pass. It enforces the deletion-attribution
 * convention documented in the file header, so transforms cannot get it wrong
 * individually.
 *
 * Usage contract: calls must cover the input strictly left to right —
 * copyVerbatim / replaceRange / deleteRange with monotonically increasing,
 * non-overlapping [start, end) ranges, then finish(inputLength) exactly once.
 */
export class MappedTextBuilder {
  private readonly parts: string[] = [];
  private readonly map: number[] = [];
  /** Start of the input region not yet attributed to any output. */
  private claimFrom = 0;
  /** How far the input has been consumed (for misuse detection). */
  private cursor = 0;

  private advance(start: number, end: number): void {
    if (start !== this.cursor || end < start) {
      throw new Error(
        `MappedTextBuilder: ranges must be contiguous and left-to-right ` +
          `(cursor ${this.cursor}, got [${start}, ${end}))`,
      );
    }
    this.cursor = end;
  }

  /**
   * Copy input.slice(start, end) through unchanged. Mapping is fine-grained
   * (each output unit → its own input position), except that the first unit
   * claims any pending deleted region before it.
   */
  copyVerbatim(input: string, start: number, end: number): void {
    this.advance(start, end);
    if (start === end) return;
    this.parts.push(input.slice(start, end));
    this.map.push(this.claimFrom);
    for (let k = start + 1; k < end; k++) this.map.push(k);
    this.claimFrom = end;
  }

  /**
   * Replace input.slice(start, end) with `replacement`. Every output unit
   * maps to the start of the input cluster (including any pending deleted
   * region before it) — a span covering part of the replacement covers the
   * whole original cluster.
   */
  replaceRange(replacement: string, start: number, end: number): void {
    this.advance(start, end);
    const base = this.claimFrom;
    for (let i = 0; i < replacement.length; i++) this.map.push(base);
    if (replacement.length > 0) this.parts.push(replacement);
    this.claimFrom = end;
  }

  /**
   * Delete input.slice(start, end): emits nothing. The region stays
   * unclaimed and will be attributed to the next output (or the sentinel).
   */
  deleteRange(start: number, end: number): void {
    this.advance(start, end);
  }

  /** Finish the map with its sentinel entry and assemble the output text. */
  finish(inputLength: number): { text: string; map: Int32Array } {
    if (this.cursor !== inputLength) {
      throw new Error(
        `MappedTextBuilder: input not fully consumed (cursor ${this.cursor} of ${inputLength})`,
      );
    }
    this.map.push(inputLength);
    return { text: this.parts.join(''), map: Int32Array.from(this.map) };
  }
}
