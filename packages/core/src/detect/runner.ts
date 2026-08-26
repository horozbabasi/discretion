/**
 * The Stage 1 runner: executes registered detectors over normalized text and
 * emits candidates carrying both normalized and original-text offsets.
 *
 * Three responsibilities, none of which belong in individual detectors:
 *
 *  1. OFFSET RESOLUTION. Detectors match against normalized text; masking
 *     edits the original. Every candidate is resolved through
 *     `mapNormalizedSpan` here, once, so no detector can get it wrong.
 *
 *  2. CONFIDENCE ENFORCEMENT. SPEC.md's rule that "a pattern match without
 *     validation is at most low confidence" is applied mechanically rather
 *     than trusted to 145 separate authors.
 *
 *  3. FAIL-CLOSED ERROR HANDLING. SPEC.md non-negotiable #2: "If detection
 *     errors, exceeds its time budget … BLOCK the send." The runner therefore
 *     never swallows a detector exception and never returns partial results
 *     on timeout — it throws, and the caller blocks.
 *
 * Overlap between candidates is NOT resolved here. SPEC.md assigns that to
 * Stage 4 fusion ("Resolve overlapping candidates: prefer the more specific
 * type, then higher calibrated confidence, then longer span"), which needs
 * calibrated scores this stage cannot produce.
 */

import type { NormalizationResult } from '../types.js';
import { mapNormalizedSpan } from '../offsetMap.js';
import { allDetectors, detectorsForRegion } from './registry.js';
import { CONFIDENCE } from './types.js';
import type { ContextSignal, Detector, RegionCode, Stage1Candidate, ValidationContext } from './types.js';

/** Thrown when detection exceeds its time budget. Callers must fail closed. */
export class DetectionTimeoutError extends Error {
  constructor(
    readonly budgetMs: number,
    readonly elapsedMs: number,
  ) {
    super(`Stage 1 detection exceeded its ${budgetMs}ms budget (took ${elapsedMs}ms).`);
    this.name = 'DetectionTimeoutError';
  }
}

/** Thrown when a detector itself throws. Names the detector; never the value. */
export class DetectorError extends Error {
  constructor(
    readonly detectorId: string,
    override readonly cause: unknown,
  ) {
    super(`Detector "${detectorId}" threw during validation.`);
    this.name = 'DetectorError';
  }
}

export interface Stage1Options {
  /**
   * Restrict to detectors applicable to this region, plus all GLOBAL ones.
   * Omit to run every detector, which is the right default — a user pasting a
   * foreign colleague's identifier still deserves protection.
   */
  readonly region?: RegionCode;
  /** The user's default region, passed to validators for ambiguous formats
   *  such as phone numbers. */
  readonly defaultRegion?: RegionCode;
  /** Explicit detector set, overriding the registry. For focused tests. */
  readonly detectors?: readonly Detector[];
  /** Wall-clock budget in milliseconds. Exceeding it throws. */
  readonly budgetMs?: number;
  /** Stage 3 evidence, per candidate span. Absent until M7. */
  readonly contextFor?: (start: number, end: number) => ContextSignal | undefined;
}

/**
 * Run Stage 1 over an already-normalized text.
 *
 * Takes the whole `NormalizationResult` rather than a bare string because the
 * offset map is not optional: a candidate without a correct original-text span
 * cannot be masked, and accepting a string would let a caller forget it.
 */
export function runStage1(
  normalization: NormalizationResult,
  options: Stage1Options = {},
): Stage1Candidate[] {
  const { normalizedText, offsetMap } = normalization;
  const detectors =
    options.detectors ?? (options.region === undefined ? allDetectors() : detectorsForRegion(options.region));

  const started = Date.now();
  const candidates: Stage1Candidate[] = [];

  for (const detector of detectors) {
    if (options.budgetMs !== undefined) {
      const elapsed = Date.now() - started;
      if (elapsed > options.budgetMs) throw new DetectionTimeoutError(options.budgetMs, elapsed);
    }
    collectFrom(detector, normalizedText, offsetMap, options, candidates);
  }

  return candidates;
}

/** Run one detector over the text, appending every surviving candidate. */
function collectFrom(
  detector: Detector,
  text: string,
  offsetMap: Int32Array,
  options: Stage1Options,
  out: Stage1Candidate[],
): void {
  // Clone the pattern so `lastIndex` is never shared between scans. Module-
  // scope /g regexes that keep state across calls are a classic source of
  // intermittent, order-dependent misses.
  const pattern = new RegExp(detector.pattern.source, detector.pattern.flags);
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // A zero-length match would spin forever; step past it.
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }

    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    const context = options.contextFor?.(matchStart, matchEnd);
    const ctx: ValidationContext = {
      text,
      start: matchStart,
      end: matchEnd,
      match,
      ...(options.defaultRegion !== undefined ? { defaultRegion: options.defaultRegion } : {}),
      ...(context !== undefined ? { context } : {}),
    };

    let result;
    try {
      result = detector.validate(ctx);
    } catch (cause) {
      // Fail closed: surface the fault rather than dropping the candidate and
      // reporting a clean scan of text that was never fully examined.
      throw new DetectorError(detector.id, cause);
    }

    if (!result.valid) continue;

    // A validator may narrow the span to exclude anchoring context that the
    // pattern needed but which must not be masked.
    const start = result.span?.start ?? matchStart;
    const end = result.span?.end ?? matchEnd;
    if (!(start >= 0 && start < end && end <= text.length)) {
      throw new DetectorError(
        detector.id,
        new Error(`validator returned an out-of-range span [${start}, ${end}) for text of length ${text.length}`),
      );
    }

    const original = mapNormalizedSpan(offsetMap, start, end);

    let confidence = result.confidence ?? detector.baseConfidence;
    // SPEC.md: detectors that "require context boost" cannot exceed low
    // confidence until Stage 3 supplies the signal. This is what stops
    // GENERIC_SECRET from firing on entropy alone.
    if (detector.requiresContext === true && context === undefined) {
      confidence = Math.min(confidence, CONFIDENCE.LOW);
    }
    confidence = Math.min(Math.max(confidence, 0), 1);

    const matchedText = text.slice(start, end);

    out.push({
      text: matchedText,
      type: detector.entityType,
      start,
      end,
      originalStart: original.start,
      originalEnd: original.end,
      rawConfidence: confidence,
      stage: 'stage1-validated-identifier',
      detectorId: detector.id,
      sensitive: result.sensitive ?? true,
      canonical: result.canonical ?? matchedText,
      ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
      ...(result.validator !== undefined ? { validatorPassed: result.validator } : {}),
    });
  }
}
