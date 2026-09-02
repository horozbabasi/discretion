/**
 * benchmark.ts — score one NER model+dtype against the corpus.
 *
 * The benchmark exercises the exact code that ships: Stage 0 normalize →
 * core's NerEngine (windowing, alignment, BIO decode) → runStage2 → the
 * same span-level scorer M3's baseline used, restricted to
 * PERSON/ORG/LOCATION. The corpus is the seeded M3 generator with the M6
 * NER extension, plus the hard-negative set (documentation, code,
 * German-noun prose …) where every NER prediction is a false positive by
 * construction.
 *
 * The engine runs with a benchmarking time budget (accuracy measurement,
 * not runtime enforcement); per-document latency is recorded separately
 * and reported — the runtime budget question is settled by those numbers,
 * not by truncating the benchmark.
 */

import { NerEngine, normalize, runStage2 } from '@discretion/core';
import type { TokenClassifier } from '@discretion/core';
import { generateCorpus } from '../corpus/builder.js';
import { generateHardNegatives } from '../corpus/hardNegatives.js';
import type { EvalResult, ScoredCandidate } from '../metrics.js';
import { runEvalAsync } from '../metrics.js';

export const NER_TYPES = ['PERSON', 'ORG', 'LOCATION'] as const;

export interface NerBenchOptions {
  /** Labeled documents to generate (positive corpus). */
  readonly documents: number;
  /** Hard-negative documents. */
  readonly negatives: number;
  readonly seed: number;
  /** Generous per-document budget: accuracy first, latency reported. */
  readonly timeBudgetMs?: number;
}

export interface NerBenchReport {
  readonly result: EvalResult;
  /** Documents that carry at least one NER ground-truth entity. */
  readonly nerDocuments: number;
  readonly nerGroundTruth: number;
}

export async function runNerBench(
  classifier: TokenClassifier,
  options: NerBenchOptions,
): Promise<NerBenchReport> {
  const engine = new NerEngine(classifier, {
    timeBudgetMs: options.timeBudgetMs ?? 120_000,
  });
  await engine.warmup();

  const positives = generateCorpus({ documents: options.documents, seed: options.seed, minPerKind: 0 });
  const negatives = generateHardNegatives({ documents: options.negatives, seed: options.seed ^ 0xbad });
  const docs = [...positives, ...negatives];

  const detect = async (doc: { text: string }): Promise<readonly ScoredCandidate[]> =>
    runStage2(normalize(doc.text), engine);

  const result = await runEvalAsync(docs, detect, { types: NER_TYPES });

  const nerDocs = positives.filter((d) =>
    d.entities.some((e) => (NER_TYPES as readonly string[]).includes(e.type)),
  );
  return {
    result,
    nerDocuments: nerDocs.length,
    nerGroundTruth: nerDocs.reduce(
      (n, d) => n + d.entities.filter((e) => (NER_TYPES as readonly string[]).includes(e.type)).length,
      0,
    ),
  };
}
