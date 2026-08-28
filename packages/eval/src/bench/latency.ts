/**
 * Detection latency against SPEC.md's budget.
 *
 * SPEC.md, Performance: "Budget: p50 under 250ms and p95 under 600ms for a
 * 2000-character input on a mid-range laptop, excluding model warmup." and
 * "Publish measured numbers in the README. If a budget is missed, say so and
 * explain why rather than removing the target."
 *
 * WHY THIS EXISTS SEPARATELY FROM THE EVAL'S LATENCY LINE. The eval reports
 * per-document latency over a corpus whose documents vary in length, which is
 * a different quantity from the budget and not comparable to it. A number that
 * looks compliant while measuring something adjacent is worse than a clean
 * miss, because nothing prompts an investigation. This measures exactly what
 * SPEC specifies: fixed 2000-character inputs, warmup discarded.
 *
 * The inputs are built from the eval corpus rather than from Lorem Ipsum, so
 * they contain the identifiers, scripts and document shapes detection actually
 * has to work through. A 2000-character input of empty prose would measure
 * nothing but the regex engine's idle cost.
 *
 * Run:  node packages/eval/dist/bench/latency.js [--samples 200] [--ner <model>]
 */

import { cpus, totalmem } from 'node:os';
import process from 'node:process';

import { detect, normalize, NerEngine } from '@privacyshield/core';
import { generateCorpus } from '../corpus/builder.js';
import { generateHardNegatives } from '../corpus/hardNegatives.js';

/** SPEC.md's budget, in milliseconds, for a 2000-character input. */
const BUDGET = { p50: 250, p95: 600 } as const;

/** The input size the budget is defined against. */
const INPUT_CHARS = 2000;

/** Discarded before timing: JIT warmup, lexicon compilation, filter decode. */
const WARMUP_ITERATIONS = 30;

function arg(name: string, fallback?: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
}

/**
 * Build inputs of EXACTLY 2000 characters from real corpus text.
 *
 * Documents are concatenated until the window is full and then cut, so each
 * sample carries a realistic density of identifiers rather than one document
 * padded with filler.
 */
function buildInputs(count: number): string[] {
  const source = [
    ...generateCorpus({ documents: 600, seed: 0xbe4c }),
    ...generateHardNegatives({ documents: 200, seed: 0xbe4d }),
  ].map((d) => d.text);

  const inputs: string[] = [];
  let cursor = 0;
  while (inputs.length < count) {
    let buffer = '';
    while (buffer.length < INPUT_CHARS) {
      buffer += `${source[cursor % source.length]!}\n`;
      cursor += 1;
    }
    inputs.push(buffer.slice(0, INPUT_CHARS));
  }
  return inputs;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

interface Timing {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
  readonly max: number;
}

function summarize(samples: readonly number[]): Timing {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    max: sorted[sorted.length - 1]!,
  };
}

async function time(
  inputs: readonly string[],
  run: (text: string) => Promise<unknown>,
): Promise<Timing> {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    await run(inputs[i % inputs.length]!);
  }
  const samples: number[] = [];
  for (const input of inputs) {
    const started = performance.now();
    await run(input);
    samples.push(performance.now() - started);
  }
  return summarize(samples);
}

function row(label: string, t: Timing, budget?: { p50: number; p95: number }): string {
  const verdict =
    budget === undefined
      ? ''
      : t.p50 <= budget.p50 && t.p95 <= budget.p95
        ? '  WITHIN BUDGET'
        : '  *** OVER BUDGET ***';
  return `${label.padEnd(34)} p50 ${t.p50.toFixed(1).padStart(7)}  p95 ${t.p95.toFixed(1).padStart(7)}  p99 ${t.p99.toFixed(1).padStart(7)}  max ${t.max.toFixed(1).padStart(7)}${verdict}`;
}

async function main(): Promise<void> {
  const samples = Number(arg('samples', '200'));
  const inputs = buildInputs(samples);

  const cpu = cpus()[0]?.model ?? 'unknown';
  console.log('SPEC.md budget: p50 < 250ms, p95 < 600ms for a 2000-character input,');
  console.log('excluding model warmup.\n');
  console.log(`hardware   : ${cpu.trim()} (${cpus().length} logical cores, ${(totalmem() / 1073741824).toFixed(0)} GB RAM)`);
  console.log(`runtime    : Node ${process.version} on ${process.platform}`);
  console.log(`inputs     : ${samples} × exactly ${INPUT_CHARS} characters, built from the eval corpus`);
  console.log(`warmup     : ${WARMUP_ITERATIONS} iterations, discarded\n`);

  // The main-thread path. SPEC: "Pattern and gazetteer stages may run on the
  // main thread if they meet budget", so this is the number that decides that.
  const mainThread = await time(inputs, (text) => detect(normalize(text)));
  console.log(row('Stages 0-3 (main thread)', mainThread, BUDGET));

  const model = arg('ner');
  if (model !== undefined) {
    const { createTransformersClassifier } = await import('@privacyshield/core/ner-transformers');
    const classifier = await createTransformersClassifier({
      model,
      dtype: arg('dtype', 'q8')!,
      cacheDir: arg('cache', '.hf-cache')!,
      allowRemoteModels: true,
    });
    const engine = new NerEngine(classifier, { timeBudgetMs: 120_000 });
    await engine.warmup();
    const withNer = await time(inputs, (text) => detect(normalize(text), { ner: engine }));
    console.log(row('Stages 0-3 + Stage 2 NER', withNer, BUDGET));
    console.log('\nNER runs in a dedicated Web Worker in the extension (SPEC.md), so the');
    console.log('main-thread row is what governs UI responsiveness; the combined row is');
    console.log('end-to-end time to a result.');
  }

  // The corpus distribution, so the eval's per-document latency line and this
  // benchmark can be related instead of confused for each other.
  const lengths = [
    ...generateCorpus({ documents: 600, seed: 0xbe4c }),
    ...generateHardNegatives({ documents: 200, seed: 0xbe4d }),
  ]
    .map((d) => d.text.length)
    .sort((a, b) => a - b);
  console.log(
    `\ncorpus document length: p50 ${percentile(lengths, 50)}, p95 ${percentile(lengths, 95)}, ` +
      `max ${lengths[lengths.length - 1]} characters (mean ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)})`,
  );
  console.log('The eval report\'s per-document latency is measured over THAT distribution,');
  console.log('not over fixed 2000-character inputs, and the two are not comparable.');
}

await main();
