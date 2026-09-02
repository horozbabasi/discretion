/**
 * benchCli.ts — run one model+dtype benchmark and write a JSON report.
 *
 *   node packages/eval/dist/ner/benchCli.js \
 *     --model Xenova/distilbert-base-multilingual-cased-ner-hrl \
 *     --dtype q8 [--docs 1200] [--negatives 300] [--seed 20260827] \
 *     [--cache .hf-cache] [--out reports/ner-bench/<auto>.json]
 *
 * Downloads are allowed HERE (build-time tooling); the production
 * classifier default is zero-network.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { createTransformersClassifier } from '@discretion/core/ner-transformers';
import { NER_TYPES, runNerBench } from './benchmark.js';

function arg(name: string, fallback?: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
}

const model = arg('model');
if (model === undefined) {
  console.error('usage: benchCli --model <hf-repo> [--dtype q8] [--docs N] [--negatives N] [--seed N] [--out file]');
  process.exit(2);
}
const dtype = arg('dtype', 'q8')!;
const documents = Number(arg('docs', '1200'));
const negatives = Number(arg('negatives', '300'));
const seed = Number(arg('seed', '20260827'));
const cacheDir = resolve(arg('cache', '.hf-cache')!);
const safeName = `${model.split('/').pop()}-${dtype}`.replace(/[^\w.-]+/g, '_');
const out = resolve(arg('out', `packages/eval/reports/ner-bench/${safeName}.json`)!);

const startedLoad = Date.now();
const classifier = await createTransformersClassifier({
  model,
  dtype,
  cacheDir,
  allowRemoteModels: true,
});
const loadMs = Date.now() - startedLoad;

console.log(`model ${model} (${dtype}) loaded in ${loadMs} ms; scoring ${documents}+${negatives} docs…`);
const started = Date.now();
const report = await runNerBench(classifier, { documents, negatives, seed });
const wallMs = Date.now() - started;

const summary = {
  model,
  dtype,
  seed,
  documents,
  negatives,
  nerDocuments: report.nerDocuments,
  nerGroundTruth: report.nerGroundTruth,
  loadMs,
  wallMs,
  byType: Object.fromEntries(
    (NER_TYPES as readonly string[]).map((t) => [t, report.result.byType[t] ?? null]),
  ),
  byLanguage: report.result.byLanguage,
  latencyMs: report.result.latencyMs,
  hardNegativeFalsePositivesByCategory: report.result.hardNegativeFalsePositivesByCategory,
  falsePositives: report.result.falsePositives.slice(0, 25),
  falseNegatives: report.result.falseNegatives.slice(0, 25),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(summary, null, 2));

for (const t of NER_TYPES) {
  const m = report.result.byType[t];
  if (m === undefined) continue;
  console.log(
    `${t.padEnd(9)} P=${m.precision.toFixed(3)} R(part)=${m.recallPartial.toFixed(3)} R(exact)=${m.recallExact.toFixed(3)} F1=${m.f1.toFixed(3)} (gt=${m.groundTruth})`,
  );
}
console.log(`latency p50=${summary.latencyMs.p50.toFixed(1)}ms p95=${summary.latencyMs.p95.toFixed(1)}ms | wall ${Math.round(wallMs / 1000)}s | wrote ${out}`);
