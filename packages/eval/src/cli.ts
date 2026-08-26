/**
 * The full-eval CLI: build the corpus, run Stage 1, write the baseline
 * report. Invoked via `npm run eval` from the repository root.
 *
 * Fixed seeds keep the run reproducible: the same commit always produces
 * the same numbers, so a diff in the report means a change in behaviour,
 * never in the dice.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateCorpus } from './corpus/builder.js';
import { generateHardNegatives } from './corpus/hardNegatives.js';
import { runEval } from './metrics.js';
import { renderReport } from './report.js';

const POSITIVE_DOCS = 2000;
const NEGATIVE_DOCS = 600;
const SEED_POSITIVE = 0xc0ffee;
const SEED_NEGATIVE = 0xbeef;

function main(): void {
  const started = performance.now();
  const positives = generateCorpus({ documents: POSITIVE_DOCS, seed: SEED_POSITIVE });
  const negatives = generateHardNegatives({ documents: NEGATIVE_DOCS, seed: SEED_NEGATIVE });
  const corpus = [...positives, ...negatives];

  const result = runEval(corpus, { maxExamples: 60 });
  const elapsed = ((performance.now() - started) / 1000).toFixed(1);

  const outDir = join(import.meta.dirname, '..', 'reports');
  mkdirSync(outDir, { recursive: true });

  const title = `Stage 1 baseline — ${corpus.length} documents (${POSITIVE_DOCS} labeled + ${NEGATIVE_DOCS} hard-negative), seeds ${SEED_POSITIVE}/${SEED_NEGATIVE}`;
  writeFileSync(join(outDir, 'baseline.md'), renderReport(result, title), 'utf8');
  writeFileSync(join(outDir, 'baseline.json'), JSON.stringify(result, null, 2), 'utf8');

  // Console summary only — never candidate values.
  console.log(`eval complete in ${elapsed}s: ${result.documents} docs, ${result.groundTruthEntities} GT entities, ${result.predictions} predictions`);
  console.log(`reports written to ${outDir}`);
  for (const [type, m] of Object.entries(result.byType)) {
    console.log(
      `${type.padEnd(20)} P=${(m.precision * 100).toFixed(1).padStart(5)}% R=${(m.recallPartial * 100).toFixed(1).padStart(5)}% F1=${(m.f1 * 100).toFixed(1).padStart(5)}% (GT ${m.groundTruth}, FP ${m.falsePositives})`,
    );
  }
}

main();
