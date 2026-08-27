/**
 * engine.ts — Stage 2 orchestration: window → classify → align → decode,
 * under a HARD deadline with fail-closed semantics.
 *
 * The deadline covers the whole recognize() call (all windows), not one
 * inference: SPEC.md's budget is per user action. On exceed the engine
 * throws DetectionTimeoutError — the same fail-closed contract the Stage 1
 * runner enforces; callers treat it as "block the send", never as "send
 * what we found so far", because a partial scan is indistinguishable from
 * a clean scan on exactly the text that was never reached.
 *
 * warmup() runs one tiny inference so the first real interaction does not
 * absorb model-initialization latency (SPEC: warm at init, not first use).
 */

import { DetectionTimeoutError } from '../detect/runner.js';
import { alignPieces } from './align.js';
import { chunkText } from './chunk.js';
import { decodeEntities } from './merge.js';
import type { NerSpan, TokenClassifier } from './types.js';

export interface NerEngineOptions {
  /** Hard deadline for one recognize() call. Default 2000 ms. */
  readonly timeBudgetMs?: number;
  /** Window overlap in characters. Default 96. */
  readonly overlapChars?: number;
}

const DEFAULT_BUDGET_MS = 2000;
const DEFAULT_OVERLAP = 96;

export class NerEngine {
  private readonly classifier: TokenClassifier;
  private readonly budgetMs: number;
  private readonly overlap: number;
  private warmedUp = false;

  constructor(classifier: TokenClassifier, options: NerEngineOptions = {}) {
    this.classifier = classifier;
    this.budgetMs = options.timeBudgetMs ?? DEFAULT_BUDGET_MS;
    this.overlap = options.overlapChars ?? DEFAULT_OVERLAP;
  }

  get id(): string {
    return this.classifier.id;
  }

  /** One tiny inference so model init cost is paid before first real use. */
  async warmup(): Promise<void> {
    if (this.warmedUp) return;
    await this.classifier.classify('warmup.');
    this.warmedUp = true;
  }

  /**
   * Recognize entities in (normalized) `text`. Spans are in the text's own
   * coordinates; runStage2 maps them back through the Stage 0 offset map.
   */
  async recognize(text: string): Promise<NerSpan[]> {
    if (text.length === 0) return [];
    const started = Date.now();
    const deadline = started + this.budgetMs;

    const chunks = chunkText(text, this.classifier.maxInputChars, this.overlap);
    const spans: NerSpan[] = [];

    for (const chunk of chunks) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new DetectionTimeoutError(this.budgetMs, Date.now() - started);
      }
      const predictions = await withDeadline(
        this.classifier.classify(chunk.text),
        remaining,
        () => new DetectionTimeoutError(this.budgetMs, Date.now() - started),
      );
      const aligned = alignPieces(chunk.text, predictions.map((p) => p.piece));
      for (const span of decodeEntities(chunk.text, predictions, aligned)) {
        const mid = chunk.offset + (span.start + span.end) / 2;
        // The owning-core rule from chunk.ts: emit each entity exactly once.
        if (mid >= chunk.coreStart && mid < chunk.coreEnd) {
          spans.push({ ...span, start: chunk.offset + span.start, end: chunk.offset + span.end });
        }
      }
    }

    return spans.sort((a, b) => a.start - b.start);
  }
}

/** Race a promise against a deadline; the loser's result is discarded. */
async function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
