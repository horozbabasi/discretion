/**
 * Normalization throughput benchmark.
 *
 * Measures normalize() across input sizes (1KB / 10KB / 100KB of characters)
 * and content types (ASCII prose, mixed-script prose, source code, a document
 * full of confusables). Reports p50 and p95 wall-clock per call.
 *
 * Target: 10,000 characters in under 20 ms. If the target is missed, a
 * per-stage breakdown for the failing corpus is printed instead of quietly
 * lowering the bar.
 *
 * Run with:  npm run bench   (from the repo root; builds first)
 */
import {
  normalize,
  stripInvisibles,
  nfkcByGrapheme,
  foldHomoglyphs,
  normalizeWhitespacePunct,
} from '@discretion/core';

const cc = (cp: number): string => String.fromCharCode(cp);
const ZWSP = cc(0x200b);
const NBSP = cc(0x00a0);
const CYR_A = cc(0x0430);
const CYR_O = cc(0x043e);
const GREEK_O = cc(0x03bf);

// ── Corpora ──────────────────────────────────────────────────────────────────

const ASCII_SENTENCE =
  'The quick brown fox jumps over the lazy dog while carefully reviewing pull requests. ';

const MIXED_SENTENCES = [
  'The meeting is scheduled for Monday at nine. ',
  'Встреча назначена на понедельник в девять утра. ',
  '会议定于周一上午九点举行，请准时参加。',
  'الاجتماع مقرر يوم الاثنين الساعة التاسعة صباحا. ',
  'Η συνάντηση έχει προγραμματιστεί για τη Δευτέρα. ',
  'ミーティングは月曜日の午前九時に予定されています。',
];

const SOURCE_CODE = [
  'export function distance(a: Point, b: Point): number {\n',
  '  const dx = a.x - b.x;\n',
  '  const dy = a.y - b.y;\n',
  '  return Math.sqrt(dx * dx + dy * dy); // euclidean\n',
  '}\n\n',
  'const cache = new Map<string, number>();\n',
  'if (!cache.has(key)) { cache.set(key, distance(p, q)); }\n\n',
].join('');

// Every token carries an anomalous confusable, plus exotic punctuation.
const CONFUSABLE_SENTENCE =
  `p${CYR_A}ssword` +
  ZWSP +
  ` — “l${GREEK_O}gin”` +
  NBSP +
  `t${CYR_O}ken ½ Ａccount ﬁle${cc(0x2014)}n${CYR_A}me. `;

function corpus(base: string, chars: number): string {
  return base.repeat(Math.ceil(chars / base.length)).slice(0, chars);
}

const CONTENT: ReadonlyArray<readonly [string, (chars: number) => string]> = [
  ['ascii prose', (n) => corpus(ASCII_SENTENCE, n)],
  ['mixed-script prose', (n) => corpus(MIXED_SENTENCES.join(''), n)],
  ['source code', (n) => corpus(SOURCE_CODE, n)],
  ['confusables-heavy', (n) => corpus(CONFUSABLE_SENTENCE, n)],
];

const SIZES: ReadonlyArray<readonly [string, number, number]> = [
  // [label, characters, timed runs]
  ['1KB', 1_000, 200],
  ['10KB', 10_000, 60],
  ['100KB', 100_000, 15],
];

// ── Measurement ──────────────────────────────────────────────────────────────

function percentile(sortedSamples: readonly number[], q: number): number {
  const index = Math.min(sortedSamples.length - 1, Math.ceil(q * sortedSamples.length) - 1);
  return sortedSamples[Math.max(0, index)]!;
}

function measure(fn: () => void, runs: number): { p50: number; p95: number } {
  for (let i = 0; i < 3; i++) fn(); // warmup
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

const fmt = (ms: number): string => ms.toFixed(3).padStart(9);

console.log('normalize() throughput — p50 / p95 in ms per call');
console.log('─'.repeat(72));
console.log(
  'content'.padEnd(20) +
    SIZES.map(([label]) => `${label} p50`.padStart(10) + `${label} p95`.padStart(10)).join(''),
);

let targetP50 = Number.NaN;
for (const [name, make] of CONTENT) {
  let row = name.padEnd(20);
  for (const [, chars, runs] of SIZES) {
    const text = make(chars);
    const { p50, p95 } = measure(() => normalize(text), runs);
    row += fmt(p50) + ' ' + fmt(p95);
    if (name === 'mixed-script prose' && chars === 10_000) targetP50 = p50;
  }
  console.log(row);
}

console.log('─'.repeat(72));
const TARGET_MS = 20;
if (targetP50 < TARGET_MS) {
  console.log(
    `TARGET MET: 10,000 chars (mixed-script prose) normalized in ${targetP50.toFixed(3)} ms p50 (< ${TARGET_MS} ms).`,
  );
} else {
  console.log(
    `TARGET MISSED: 10,000 chars (mixed-script prose) took ${targetP50.toFixed(3)} ms p50 (target ${TARGET_MS} ms).`,
  );
  console.log('Per-stage breakdown @10KB mixed-script prose:');
  const text = CONTENT[1]![1](10_000);
  const stages: ReadonlyArray<readonly [string, (t: string) => unknown]> = [
    ['stripInvisibles', stripInvisibles],
    ['nfkcByGrapheme', nfkcByGrapheme],
    ['foldHomoglyphs', foldHomoglyphs],
    ['whitespacePunct', normalizeWhitespacePunct],
  ];
  for (const [label, stage] of stages) {
    const { p50, p95 } = measure(() => stage(text), 40);
    console.log(`  ${label.padEnd(18)} p50 ${fmt(p50)}  p95 ${fmt(p95)}`);
  }
}
