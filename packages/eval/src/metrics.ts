/**
 * Scoring: run Stage 1 over labeled documents and measure it.
 *
 * MATCHING RULES (stated precisely because every number downstream depends
 * on them):
 *  • Only candidates with sensitive === true count as predictions — known
 *    test values are supposed to be detected and classified non-sensitive,
 *    and that classification is what the eval verifies.
 *  • A prediction MATCHES a ground-truth entity when types are equal and
 *    the original-coordinate spans overlap by at least one character;
 *    EXACT additionally requires identical start and end.
 *  • Recall counts each ground-truth entity once, however many predictions
 *    cover it. Precision counts each prediction once: matched if it
 *    overlaps any same-type ground truth, otherwise a false positive.
 *  • F1 is computed from precision and PARTIAL recall; exact recall is
 *    reported separately, never blended.
 *
 * Confidence-vs-accuracy is a FIRST LOOK, not calibration: Stage 1 emits
 * raw per-detector confidences that are only ordered, not comparable.
 * Real calibration arrives with Stage 4 fusion in M8.
 */

import { normalize, runStage1 } from '@privacyshield/core';
import type { Stage1Candidate } from '@privacyshield/core';
import type { GroundTruthEntity, LabeledDocument } from './corpus/types.js';

export interface TypeMetrics {
  groundTruth: number;
  predictions: number;
  matchedPredictions: number;
  falsePositives: number;
  matchedExact: number;
  matchedPartial: number;
  falseNegatives: number;
  precision: number;
  recallExact: number;
  recallPartial: number;
  f1: number;
}

export interface FalsePositiveRecord {
  readonly docId: string;
  readonly language: string;
  readonly docType: string;
  readonly type: string;
  readonly detectorId: string;
  readonly text: string;
  readonly confidence: number;
  readonly context: string;
  readonly hardNegativeCategory?: string;
}

export interface FalseNegativeRecord {
  readonly docId: string;
  readonly language: string;
  readonly docType: string;
  readonly type: string;
  readonly scheme: string;
  readonly text: string;
  readonly obfuscated: boolean;
  readonly context: string;
}

export interface EvalResult {
  readonly documents: number;
  readonly groundTruthEntities: number;
  readonly predictions: number;
  readonly byType: Readonly<Record<string, TypeMetrics>>;
  readonly byLanguage: Readonly<Record<string, TypeMetrics>>;
  readonly byConfidence: Readonly<Record<string, { predictions: number; matched: number; precision: number }>>;
  readonly hardNegativeFalsePositivesByCategory: Readonly<Record<string, number>>;
  readonly latencyMs: { p50: number; p95: number; p99: number; max: number; meanDocLength: number };
  readonly falsePositives: readonly FalsePositiveRecord[];
  readonly falseNegatives: readonly FalseNegativeRecord[];
}

function emptyMetrics(): TypeMetrics {
  return {
    groundTruth: 0, predictions: 0, matchedPredictions: 0, falsePositives: 0,
    matchedExact: 0, matchedPartial: 0, falseNegatives: 0,
    precision: 0, recallExact: 0, recallPartial: 0, f1: 0,
  };
}

function finalize(m: TypeMetrics): void {
  m.precision = m.predictions === 0 ? 1 : m.matchedPredictions / m.predictions;
  m.recallExact = m.groundTruth === 0 ? 1 : m.matchedExact / m.groundTruth;
  m.recallPartial = m.groundTruth === 0 ? 1 : m.matchedPartial / m.groundTruth;
  m.f1 =
    m.precision + m.recallPartial === 0 ? 0 : (2 * m.precision * m.recallPartial) / (m.precision + m.recallPartial);
}

const overlaps = (c: Stage1Candidate, e: GroundTruthEntity): boolean =>
  c.originalStart < e.end && e.start < c.originalEnd;

function confidenceBucket(raw: number): string {
  if (raw >= 0.99) return 'MAXIMUM(0.99)';
  if (raw >= 0.85) return 'HIGH(0.85)';
  if (raw >= 0.6) return 'MEDIUM(0.6)';
  return 'LOW(0.3)';
}

function context(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 40);
  const to = Math.min(text.length, end + 40);
  return text.slice(from, to).replace(/\n/g, '⏎');
}

function negCategory(docId: string): string | undefined {
  const m = /^neg-\d+-\d+-(.+)$/.exec(docId);
  return m?.[1];
}

export interface EvalOptions {
  /** Cap the stored FP/FN example lists (counts are always complete). */
  readonly maxExamples?: number;
}

/** Run Stage 1 over the corpus and score it. */
export function runEval(docs: readonly LabeledDocument[], options: EvalOptions = {}): EvalResult {
  const maxExamples = options.maxExamples ?? 50;
  const byType = new Map<string, TypeMetrics>();
  const byLanguage = new Map<string, TypeMetrics>();
  const byConfidence = new Map<string, { predictions: number; matched: number; precision: number }>();
  const negFps = new Map<string, number>();
  const latencies: number[] = [];
  const falsePositives: FalsePositiveRecord[] = [];
  const falseNegatives: FalseNegativeRecord[] = [];
  let groundTruthEntities = 0;
  let predictionsTotal = 0;
  let totalLength = 0;

  const metricFor = (map: Map<string, TypeMetrics>, key: string): TypeMetrics => {
    let m = map.get(key);
    if (m === undefined) {
      m = emptyMetrics();
      map.set(key, m);
    }
    return m;
  };

  for (const doc of docs) {
    totalLength += doc.text.length;
    const started = performance.now();
    const candidates = runStage1(normalize(doc.text));
    latencies.push(performance.now() - started);

    const predictions = candidates.filter((c) => c.sensitive);
    predictionsTotal += predictions.length;
    groundTruthEntities += doc.entities.length;

    const langM = metricFor(byLanguage, doc.language);
    langM.groundTruth += doc.entities.length;
    langM.predictions += predictions.length;

    // Ground-truth side.
    for (const e of doc.entities) {
      const typeM = metricFor(byType, e.type);
      typeM.groundTruth += 1;
      const covering = predictions.filter((c) => c.type === e.type && overlaps(c, e));
      if (covering.length > 0) {
        typeM.matchedPartial += 1;
        langM.matchedPartial += 1;
        if (covering.some((c) => c.originalStart === e.start && c.originalEnd === e.end)) {
          typeM.matchedExact += 1;
          langM.matchedExact += 1;
        }
      } else {
        typeM.falseNegatives += 1;
        langM.falseNegatives += 1;
        if (falseNegatives.length < maxExamples) {
          falseNegatives.push({
            docId: doc.id, language: doc.language, docType: doc.docType,
            type: e.type, scheme: e.scheme, text: e.text, obfuscated: e.obfuscated,
            context: context(doc.text, e.start, e.end),
          });
        }
      }
    }

    // Prediction side.
    for (const c of predictions) {
      const typeM = metricFor(byType, c.type);
      typeM.predictions += 1;
      const bucket = confidenceBucket(c.rawConfidence);
      let b = byConfidence.get(bucket);
      if (b === undefined) {
        b = { predictions: 0, matched: 0, precision: 0 };
        byConfidence.set(bucket, b);
      }
      b.predictions += 1;

      const matched = doc.entities.some((e) => e.type === c.type && overlaps(c, e));
      if (matched) {
        typeM.matchedPredictions += 1;
        langM.matchedPredictions += 1;
        b.matched += 1;
      } else {
        typeM.falsePositives += 1;
        langM.falsePositives += 1;
        const category = negCategory(doc.id);
        if (category !== undefined) negFps.set(category, (negFps.get(category) ?? 0) + 1);
        if (falsePositives.length < maxExamples * 4) {
          falsePositives.push({
            docId: doc.id, language: doc.language, docType: doc.docType,
            type: c.type, detectorId: c.detectorId, text: c.text, confidence: c.rawConfidence,
            context: context(doc.text, c.originalStart, c.originalEnd),
            ...(category !== undefined ? { hardNegativeCategory: category } : {}),
          });
        }
      }
    }
  }

  for (const m of byType.values()) finalize(m);
  for (const m of byLanguage.values()) finalize(m);
  for (const b of byConfidence.values()) b.precision = b.predictions === 0 ? 1 : b.matched / b.predictions;

  latencies.sort((a, b) => a - b);
  const q = (p: number): number => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;

  falsePositives.sort((a, b) => b.confidence - a.confidence);

  return {
    documents: docs.length,
    groundTruthEntities,
    predictions: predictionsTotal,
    byType: Object.fromEntries([...byType.entries()].sort()),
    byLanguage: Object.fromEntries([...byLanguage.entries()].sort()),
    byConfidence: Object.fromEntries([...byConfidence.entries()].sort()),
    hardNegativeFalsePositivesByCategory: Object.fromEntries([...negFps.entries()].sort()),
    latencyMs: {
      p50: q(0.5), p95: q(0.95), p99: q(0.99),
      max: latencies[latencies.length - 1] ?? 0,
      meanDocLength: docs.length === 0 ? 0 : Math.round(totalLength / docs.length),
    },
    falsePositives,
    falseNegatives,
  };
}
