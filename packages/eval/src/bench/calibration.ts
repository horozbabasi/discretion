/**
 * Fit and evaluate the Stage 4 calibration curve.
 *
 * SPEC.md: "Calibrate against the eval corpus so that a confidence of 0.8
 * empirically means roughly 80% precision. Document the calibration method and
 * the resulting reliability curve."
 *
 * THE SPLIT IS DISJOINT BY CONSTRUCTION, not by sampling. The fit and the
 * evaluation use corpora generated from DIFFERENT SEEDS, so no document — and
 * therefore no planted value — appears in both. Splitting one corpus by index
 * would be weaker: the generator plants the same entity kinds across
 * documents, so two halves of one seeded corpus share value distributions in a
 * way two seeds do not. A curve fitted and scored on the same documents
 * measures memorisation, not calibration.
 *
 * Run: node packages/eval/dist/bench/calibration.js [--fit 1200] [--eval 1200]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import {
  calibrate,
  detect,
  fitCalibration,
  normalize,
  reliability,
  resolveOverlaps,
  type CalibrationSample,
} from '@discretion/core';

import { generateCorpus } from '../corpus/builder.js';
import { generateHardNegatives } from '../corpus/hardNegatives.js';
import type { LabeledDocument } from '../corpus/types.js';

/** Seeds chosen so the fit and evaluation corpora share no document. */
const FIT_SEED = 0x5a1701;
const FIT_NEGATIVE_SEED = 0x5a1702;
const EVAL_SEED = 0xd15101;
const EVAL_NEGATIVE_SEED = 0xd15102;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? (process.argv[at + 1] ?? fallback) : fallback;
}

/**
 * Collect (score, correct) observations by running the real pipeline.
 *
 * Overlap resolution runs BEFORE the observation is recorded, because that is
 * the order the shipped pipeline uses: calibrating on candidates Stage 4 then
 * removes would fit the curve to a distribution that never reaches a user.
 */
async function observe(docs: readonly LabeledDocument[]): Promise<CalibrationSample[]> {
  const samples: CalibrationSample[] = [];

  for (const doc of docs) {
    const { emitted } = await detect(normalize(doc.text));
    const resolved = resolveOverlaps(
      emitted.map((s) => ({ candidate: s.candidate, confidence: s.contextConfidence })),
    );

    for (const item of resolved.emitted) {
      const c = item.candidate;
      const correct = doc.entities.some(
        (e) => e.type === c.type && c.originalStart < e.end && e.start < c.originalEnd,
      );
      samples.push({ type: c.type, score: item.confidence, correct });
    }
  }
  return samples;
}

function corpus(seed: number, negativeSeed: number, documents: number): LabeledDocument[] {
  return [
    ...generateCorpus({ documents, seed }),
    ...generateHardNegatives({ documents: Math.round(documents * 0.3), seed: negativeSeed }),
  ];
}

async function main(): Promise<void> {
  const fitCount = Number(arg('fit', '1200'));
  const evalCount = Number(arg('eval', '1200'));

  const fitDocs = corpus(FIT_SEED, FIT_NEGATIVE_SEED, fitCount);
  const rawEvalDocs = corpus(EVAL_SEED, EVAL_NEGATIVE_SEED, evalCount);

  // Different seeds are NOT sufficient on their own. The hard-negative
  // builders are templated with only a few random fields, so short negatives
  // collide across seeds — measured at 91 identical documents on the first
  // run. Enforce disjointness rather than assuming the seeds deliver it.
  const fitTexts = new Set(fitDocs.map((d) => d.text));
  const collided = rawEvalDocs.filter((d) => fitTexts.has(d.text)).length;
  const evalDocs = rawEvalDocs.filter((d) => !fitTexts.has(d.text));
  const leakage = evalDocs.filter((d) => fitTexts.has(d.text)).length;

  console.log(`documents dropped from the eval split as textual duplicates: ${collided}`);

  console.log(`fit corpus : ${fitDocs.length} documents (seeds ${FIT_SEED}/${FIT_NEGATIVE_SEED})`);
  console.log(`eval corpus: ${evalDocs.length} documents (seeds ${EVAL_SEED}/${EVAL_NEGATIVE_SEED})`);
  console.log(`documents shared between the two splits: ${leakage}  <-- must be 0\n`);

  const fitSamples = await observe(fitDocs);
  const evalSamples = await observe(evalDocs);
  const model = fitCalibration(fitSamples, `${fitDocs.length} documents, seeds ${FIT_SEED}/${FIT_NEGATIVE_SEED}`);

  console.log(`observations: ${fitSamples.length} fit, ${evalSamples.length} held out`);
  console.log(`per-type curves fitted: ${Object.keys(model.perType).length} (others use the pooled curve)\n`);

  const before = reliabilityOfRaw(evalSamples);
  const after = reliability(model, evalSamples);

  console.log('RELIABILITY ON HELD-OUT DOCUMENTS');
  console.log('bucket    | predicted | observed | samples | gap');
  for (const p of after.points) {
    const gap = p.observed - p.predicted;
    console.log(
      `${p.bucket.padEnd(9)} | ${(p.predicted * 100).toFixed(1).padStart(9)} | ${(p.observed * 100).toFixed(1).padStart(8)} | ${String(p.samples).padStart(7)} | ${(gap >= 0 ? '+' : '') + (gap * 100).toFixed(1)}`,
    );
  }
  console.log(`\nexpected calibration error: ${(after.expectedCalibrationError * 100).toFixed(2)}%  (raw scores: ${(before * 100).toFixed(2)}%)`);

  const outDir = join(import.meta.dirname, '..', '..', 'reports');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'calibration.json'),
    JSON.stringify({ model, reliability: after, rawExpectedCalibrationError: before }, null, 2),
    'utf8',
  );
  writeFileSync(join(outDir, 'calibration-model.json'), JSON.stringify(model, null, 2), 'utf8');
  console.log(`\nwrote ${outDir}/calibration.json`);

  // A spot check of the property SPEC actually asks for.
  console.log('\n"a confidence of 0.8 means roughly 80% precision" — held-out check:');
  for (const target of [0.5, 0.7, 0.8, 0.9]) {
    const near = evalSamples.filter((s) => {
      const p = calibrate(model, s.type, s.score);
      return Math.abs(p - target) < 0.05;
    });
    if (near.length === 0) {
      console.log(`  ${target.toFixed(2)} -> no held-out candidates in this band`);
      continue;
    }
    const observed = near.filter((s) => s.correct).length / near.length;
    console.log(`  ${target.toFixed(2)} -> observed ${(observed * 100).toFixed(1)}% over ${near.length} candidates`);
  }
}

/** Expected calibration error of the RAW scores, as the baseline to beat. */
function reliabilityOfRaw(samples: readonly CalibrationSample[]): number {
  const buckets = Array.from({ length: 10 }, () => ({ predicted: 0, correct: 0, total: 0 }));
  for (const s of samples) {
    const index = Math.min(9, Math.max(0, Math.floor(s.score * 10)));
    const b = buckets[index]!;
    b.predicted += s.score;
    b.total += 1;
    if (s.correct) b.correct += 1;
  }
  let error = 0;
  for (const b of buckets) {
    if (b.total === 0) continue;
    error += (b.total / samples.length) * Math.abs(b.predicted / b.total - b.correct / b.total);
  }
  return error;
}

await main();
