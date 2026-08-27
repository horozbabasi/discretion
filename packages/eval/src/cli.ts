/**
 * The full-eval CLI: build the corpus, run detection, write reports.
 * Invoked via `npm run eval` from the repository root.
 *
 *   node cli.js                 → Stage 1 baseline (baseline.md/json)
 *   node cli.js --ner <model>   → additionally the COMBINED Stage 1+2 run
 *                                 (stage2-baseline.md/json) plus an
 *                                 NER-only per-language table, gated by
 *                                 gates.config.json's nerPerType floors.
 *                                 [--dtype q8] [--cache .hf-cache]
 *
 * Fixed seeds keep the run reproducible: the same commit always produces
 * the same numbers, so a diff in the report means a change in behaviour,
 * never in the dice. The NER model is loaded from the local cache
 * (downloads allowed here — build-time tooling).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { NerEngine, detect, normalize } from '@privacyshield/core';
import type { LabeledDocument } from './corpus/types.js';
import { generateCorpus } from './corpus/builder.js';
import { generateHardNegatives } from './corpus/hardNegatives.js';
import type { EvalResult, ScoredCandidate } from './metrics.js';
import { runEval, runEvalAsync } from './metrics.js';
import { renderReport } from './report.js';

const POSITIVE_DOCS = 2000;
const NEGATIVE_DOCS = 600;
const SEED_POSITIVE = 0xc0ffee;
const SEED_NEGATIVE = 0xbeef;
const NER_TYPES = ['PERSON', 'ORG', 'LOCATION'] as const;

function arg(name: string, fallback?: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
}

function printByType(result: EvalResult): void {
  for (const [type, m] of Object.entries(result.byType)) {
    console.log(
      `${type.padEnd(20)} P=${(m.precision * 100).toFixed(1).padStart(5)}% R=${(m.recallPartial * 100).toFixed(1).padStart(5)}% F1=${(m.f1 * 100).toFixed(1).padStart(5)}% (GT ${m.groundTruth}, FP ${m.falsePositives})`,
    );
  }
}

function nerLanguageTable(nerOnly: EvalResult): string {
  const lines = [
    '',
    '## Stage 2 per-language (PERSON/ORG/LOCATION only)',
    '',
    '| language | GT | precision | recall (partial) | recall (exact) | F1 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [lang, m] of Object.entries(nerOnly.byLanguage)) {
    if (m.groundTruth === 0 && m.predictions === 0) continue;
    lines.push(
      `| ${lang} | ${m.groundTruth} | ${(m.precision * 100).toFixed(1)}% | ${(m.recallPartial * 100).toFixed(1)}% | ${(m.recallExact * 100).toFixed(1)}% | ${(m.f1 * 100).toFixed(1)}% |`,
    );
  }
  return lines.join('\n');
}

interface NerGate {
  readonly minPrecision: number;
  readonly minRecallPartial: number;
}

function enforceNerGates(nerOnly: EvalResult, gatesPath: string): string[] {
  const gates = JSON.parse(readFileSync(gatesPath, 'utf8')) as {
    nerPerType?: Readonly<Record<string, NerGate>>;
  };
  if (gates.nerPerType === undefined) return [];
  const failures: string[] = [];
  for (const [type, gate] of Object.entries(gates.nerPerType)) {
    const m = nerOnly.byType[type];
    if (m === undefined) {
      failures.push(`${type}: no metrics produced`);
      continue;
    }
    if (m.precision < gate.minPrecision) {
      failures.push(`${type}: precision ${m.precision.toFixed(3)} < floor ${gate.minPrecision}`);
    }
    if (m.recallPartial < gate.minRecallPartial) {
      failures.push(`${type}: recallPartial ${m.recallPartial.toFixed(3)} < floor ${gate.minRecallPartial}`);
    }
  }
  return failures;
}

async function main(): Promise<void> {
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
  printByType(result);

  const nerModel = arg('ner');
  if (nerModel === undefined) return;

  // ── Combined Stage 1 + Stage 2 run ────────────────────────────────────────
  const dtype = arg('dtype', 'q8')!;
  const cacheDir = resolve(arg('cache', '.hf-cache')!);
  const { createTransformersClassifier } = await import('@privacyshield/core/ner-transformers');
  const classifier = await createTransformersClassifier({
    model: nerModel,
    dtype,
    cacheDir,
    allowRemoteModels: true,
  });
  const engine = new NerEngine(classifier, { timeBudgetMs: 120_000 });
  await engine.warmup();

  const combinedStarted = performance.now();
  // The full pipeline: Stages 0-3, including Stage 3 context scoring and the
  // Stage 2b gazetteers. `detect` is the supported entry point, so measuring
  // anything else would measure a configuration nobody ships.
  const detectAll = async (doc: LabeledDocument): Promise<readonly ScoredCandidate[]> => {
    const { emitted } = await detect(normalize(doc.text), { ner: engine });
    return emitted.map((s) => s.candidate);
  };
  const combined = await runEvalAsync(corpus, detectAll, { maxExamples: 60 });
  const nerOnly = await runEvalAsync(corpus, detectAll, { maxExamples: 60, types: NER_TYPES });
  const combinedElapsed = ((performance.now() - combinedStarted) / 1000).toFixed(1);

  const combinedTitle = `Stage 1+2 combined — model ${nerModel} (${dtype}), same corpus and seeds as the Stage 1 baseline`;
  writeFileSync(
    join(outDir, 'stage2-baseline.md'),
    renderReport(combined, combinedTitle) + '\n' + nerLanguageTable(nerOnly) + '\n',
    'utf8',
  );
  writeFileSync(join(outDir, 'stage2-baseline.json'), JSON.stringify({ combined, nerOnly }, null, 2), 'utf8');

  console.log(`\ncombined Stage 1+2 eval in ${combinedElapsed}s (model ${nerModel} ${dtype}):`);
  printByType(combined);

  const failures = enforceNerGates(nerOnly, join(import.meta.dirname, '..', 'gates.config.json'));
  if (failures.length > 0) {
    console.error(`\nNER GATE FAILURES:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nNER gates: pass');
  }
}

await main();
