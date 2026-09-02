/**
 * The in-memory session log.
 *
 * SPEC.md, step 9 of the content-script flow: "Record to an in-memory session
 * log: timestamp, types, counts, confidence distribution. Never values." The
 * popup reads it for "session counts by type" and "the session exposure
 * aggregate".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IN MEMORY, AND WHY THAT IS NOT THE SAME RULE AS LOCAL INSIGHTS
 *
 * This log and `storage/insights.ts` look alike and are governed differently.
 * This one lives in the content script, dies with the tab session, and may
 * therefore be finer-grained: per-TYPE counts, a timestamp per run, a
 * confidence histogram. Insights is written to disk and is deliberately
 * coarser — families, months, no timestamps — because what survives a restart
 * is a different exposure from what does not.
 *
 * The rule both obey: never a value, never text. This log holds the type of a
 * detection and the confidence it was given; it never holds what was matched.
 *
 * WHY THE EXPOSURE AGGREGATE IS A PEAK AND A MEAN, NOT A SUM
 *
 * The exposure score is 0-100 for ONE document, so adding them produces a
 * number with no meaning and no ceiling. Two questions are worth answering
 * over a session — "how exposed was the worst thing I sent" and "how exposed
 * is my typical message" — and they are the peak and the mean. The popup
 * leads with the peak, because a single 90 matters more than an average
 * flattened by twenty harmless messages.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityType } from '@privacyshield/core';

/** One masked detection, reduced to what may be recorded. */
export interface LoggedEntity {
  readonly type: EntityType;
  readonly confidence: number;
}

/** Ten buckets, [0.0-0.1) … [0.9-1.0]. Index is `floor(confidence * 10)`. */
export type ConfidenceHistogram = readonly number[];

const BUCKETS = 10;

export interface SessionSummary {
  /** How many masking runs happened, not how many entities were masked. */
  readonly runs: number;
  readonly totalMasked: number;
  /** Counts by type, ordered most-frequent first for display. */
  readonly byType: readonly { readonly type: EntityType; readonly count: number }[];
  readonly confidence: ConfidenceHistogram;
  /** The highest document exposure seen this session, or null if none was. */
  readonly peakExposure: number | null;
  readonly meanExposure: number | null;
  /** When the most recent run happened, epoch ms, or null. */
  readonly lastAt: number | null;
}

export class SessionLog {
  private runs = 0;
  private readonly counts = new Map<EntityType, number>();
  private readonly histogram: number[] = Array.from({ length: BUCKETS }, () => 0);
  private exposureSum = 0;
  private exposureRuns = 0;
  private peak: number | null = null;
  private lastAt: number | null = null;

  /**
   * Records one masking run.
   *
   * `at` is injected rather than read from the clock so the caller — and the
   * tests — decide what "now" is. Nothing here reads Date.now() implicitly.
   */
  record(entities: readonly LoggedEntity[], exposure: number, at: number = Date.now()): void {
    this.runs += 1;
    this.lastAt = at;

    for (const entity of entities) {
      this.counts.set(entity.type, (this.counts.get(entity.type) ?? 0) + 1);
      const bucket = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor(entity.confidence * BUCKETS)),
      );
      this.histogram[bucket] = (this.histogram[bucket] ?? 0) + 1;
    }

    // A run with nothing masked still had an exposure score, and it is
    // usually zero — which is exactly the value that should pull a mean down.
    if (Number.isFinite(exposure)) {
      this.exposureSum += exposure;
      this.exposureRuns += 1;
      this.peak = this.peak === null ? exposure : Math.max(this.peak, exposure);
    }
  }

  summary(): SessionSummary {
    const byType = [...this.counts.entries()]
      .map(([type, count]) => ({ type, count }))
      // Most frequent first, then by name so the order is stable between reads
      // and the popup does not reshuffle while someone is looking at it.
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    return {
      runs: this.runs,
      totalMasked: byType.reduce((sum, entry) => sum + entry.count, 0),
      byType,
      confidence: [...this.histogram],
      peakExposure: this.peak,
      meanExposure: this.exposureRuns === 0 ? null : this.exposureSum / this.exposureRuns,
      lastAt: this.lastAt,
    };
  }

  /**
   * Drops everything.
   *
   * Called from `DetectionSession.clear()`, so the log dies with the vault it
   * describes: navigating away must not leave the popup reporting what the
   * previous conversation contained.
   */
  clear(): void {
    this.runs = 0;
    this.counts.clear();
    this.histogram.fill(0);
    this.exposureSum = 0;
    this.exposureRuns = 0;
    this.peak = null;
    this.lastAt = null;
  }
}
