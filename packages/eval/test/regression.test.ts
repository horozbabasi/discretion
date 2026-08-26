/**
 * The accuracy regression gate. Runs a fixed-seed corpus through Stage 1
 * inside the normal test suite — `npm test` IS the local CI gate — and
 * fails the build when any entity type drops below its committed floor in
 * gates.config.json.
 *
 * Floors sit below the measured baseline, wide enough for small-sample
 * noise. They are regression tripwires, not targets: the deliberately low
 * floors on the context-awaiting types are documented Stage-1 weaknesses,
 * and RAISING a floor after a genuine improvement is the intended workflow.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { generateCorpus } from '../src/corpus/builder.js';
import { generateHardNegatives } from '../src/corpus/hardNegatives.js';
import { runEval } from '../src/metrics.js';

interface Gates {
  corpus: {
    positiveDocuments: number;
    negativeDocuments: number;
    seedPositive: number;
    seedNegative: number;
  };
  latency: { maxP95Ms: number };
  perType: Record<string, { minPrecision: number; minRecallPartial: number }>;
}

const gates = JSON.parse(
  readFileSync(new URL('../gates.config.json', import.meta.url), 'utf8'),
) as Gates;

describe('accuracy regression gate', () => {
  const corpus = [
    ...generateCorpus({ documents: gates.corpus.positiveDocuments, seed: gates.corpus.seedPositive }),
    ...generateHardNegatives({ documents: gates.corpus.negativeDocuments, seed: gates.corpus.seedNegative }),
  ];
  const result = runEval(corpus);

  it('every gated entity type meets its precision and recall floors', () => {
    const failures: string[] = [];
    for (const [type, floor] of Object.entries(gates.perType)) {
      const m = result.byType[type];
      if (m === undefined) {
        failures.push(`${type}: no metrics at all (type vanished from the corpus?)`);
        continue;
      }
      if (m.precision < floor.minPrecision) {
        failures.push(`${type}: precision ${(m.precision * 100).toFixed(1)}% < floor ${(floor.minPrecision * 100).toFixed(0)}%`);
      }
      if (m.recallPartial < floor.minRecallPartial) {
        failures.push(`${type}: recall ${(m.recallPartial * 100).toFixed(1)}% < floor ${(floor.minRecallPartial * 100).toFixed(0)}%`);
      }
    }
    expect(failures, failures.join('; ')).toHaveLength(0);
  });

  it('every detected type is gated (a new type must add a floor)', () => {
    const ungated = Object.keys(result.byType).filter((t) => gates.perType[t] === undefined);
    expect(ungated, `add gates.config.json entries for: ${ungated.join(', ')}`).toHaveLength(0);
  });

  it('latency stays within the gate', () => {
    expect(result.latencyMs.p95).toBeLessThan(gates.latency.maxP95Ms);
  });
});
