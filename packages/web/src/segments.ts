/**
 * segments.ts — pure span arithmetic for the two panes.
 *
 * The input pane highlights the candidates DETECTION found; the output pane
 * highlights the replacements MASKING made. Both are built as ordered
 * segment lists (plain slice / annotated slice) so rendering is a safe walk
 * over Text nodes — never markup injection. All offsets are UTF-16 code-unit
 * indices into the ORIGINAL text, the same coordinate system core reports
 * through the Stage 0 offset map, consumed with String.slice only.
 */

import { resolveForMasking } from '@privacyshield/core';
import type { MaskedEntity, Stage1Candidate } from '@privacyshield/core';

export interface InputSegment {
  readonly text: string;
  /** Present when this slice is a detected candidate span. */
  readonly candidate?: Stage1Candidate;
}

export interface OutputSegment {
  readonly text: string;
  /** Present when this slice is a masked replacement. */
  readonly entity?: MaskedEntity;
}

/**
 * The candidate set the UI shows, which must correspond 1:1 with what
 * masking uses: the resolved sensitive set (same pre-fusion overlap stopgap
 * as the masker), plus any non-sensitive candidates — known test values,
 * detected but never masked — that fit without overlapping. Overlap-shadowed
 * candidates are dropped from display exactly as they are from masking;
 * Stage 4 (M8) owns real overlap resolution.
 */
export function resolveForDisplay(candidates: readonly Stage1Candidate[]): Stage1Candidate[] {
  const kept: Stage1Candidate[] = resolveForMasking(candidates);
  const nonSensitive = candidates
    .filter((c) => !c.sensitive)
    .sort((a, b) => {
      if (b.rawConfidence !== a.rawConfidence) return b.rawConfidence - a.rawConfidence;
      const lenA = a.originalEnd - a.originalStart;
      const lenB = b.originalEnd - b.originalStart;
      if (lenB !== lenA) return lenB - lenA;
      return a.detectorId < b.detectorId ? -1 : 1;
    });
  for (const c of nonSensitive) {
    if (!kept.some((k) => c.originalStart < k.originalEnd && k.originalStart < c.originalEnd)) {
      kept.push(c);
    }
  }
  return kept.sort((a, b) => a.originalStart - b.originalStart);
}

/** Split the original text into plain/candidate segments (concat-identity). */
export function buildInputSegments(
  text: string,
  displayed: readonly Stage1Candidate[],
): InputSegment[] {
  const segments: InputSegment[] = [];
  let cursor = 0;
  for (const c of displayed) {
    if (c.originalStart > cursor) segments.push({ text: text.slice(cursor, c.originalStart) });
    segments.push({ text: text.slice(c.originalStart, c.originalEnd), candidate: c });
    cursor = c.originalEnd;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/**
 * Rebuild the masked text as plain/replacement segments from the original
 * text and the masker's entity list (already ordered and non-overlapping).
 * Joining the segments MUST reproduce `MaskResult.maskedText` exactly —
 * the test suite pins that invariant.
 */
export function buildOutputSegments(
  original: string,
  entities: readonly MaskedEntity[],
): OutputSegment[] {
  const segments: OutputSegment[] = [];
  let cursor = 0;
  for (const e of entities) {
    if (e.originalStart > cursor) segments.push({ text: original.slice(cursor, e.originalStart) });
    segments.push({ text: e.replacement, entity: e });
    cursor = e.originalEnd;
  }
  if (cursor < original.length) segments.push({ text: original.slice(cursor) });
  return segments;
}

export interface TypeCount {
  readonly type: Stage1Candidate['type'];
  readonly masked: number;
  readonly testValues: number;
}

/** Counts by entity type over the displayed set, masked vs test values. */
export function countByType(displayed: readonly Stage1Candidate[]): TypeCount[] {
  const byType = new Map<Stage1Candidate['type'], { masked: number; testValues: number }>();
  for (const c of displayed) {
    const bucket = byType.get(c.type) ?? { masked: 0, testValues: 0 };
    if (c.sensitive) bucket.masked += 1;
    else bucket.testValues += 1;
    byType.set(c.type, bucket);
  }
  return [...byType.entries()]
    .map(([type, counts]) => ({ type, ...counts }))
    .sort((a, b) => b.masked - a.masked || b.testValues - a.testValues || (a.type < b.type ? -1 : 1));
}
