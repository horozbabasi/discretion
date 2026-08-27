/**
 * Stage 2c — the verification pass.
 *
 * SPEC.md: "Only the ambiguous band is verified, so latency stays bounded.
 * Measure and report what fraction of candidates enter verification and what
 * it costs."
 *
 * The tests below pin the band (a confident candidate must not pay for a
 * second inference), the direction of each verdict, and the fail-closed rule —
 * a verification timeout must propagate, never be swallowed into "unverified
 * but fine".
 */
import { describe, expect, it } from 'vitest';

import { DetectionTimeoutError, normalize } from '../src/index.js';
import { NerEngine } from '../src/ner/engine.js';
import { AMBIGUOUS_HIGH, AMBIGUOUS_LOW, verifyAmbiguous } from '../src/context/verify.js';
import type { ContextScoredCandidate, PipelineCandidate } from '../src/context/types.js';
import type { TokenClassifier, TokenPrediction } from '../src/ner/types.js';

/** Tags every listed word as PER. `absent` words are never tagged. */
function tagger(known: ReadonlySet<string>): TokenClassifier {
  return {
    id: 'verify-mock',
    maxInputChars: 400,
    classify(text: string): Promise<readonly TokenPrediction[]> {
      const out: TokenPrediction[] = [];
      for (const m of text.matchAll(/\S+/gu)) {
        const word = m[0];
        out.push({ piece: word, label: known.has(word) ? 'B-PER' : 'O', score: 0.9 });
      }
      return Promise.resolve(out);
    },
  };
}

function nerCandidate(text: string, value: string): PipelineCandidate {
  const start = text.indexOf(value);
  expect(start).toBeGreaterThanOrEqual(0);
  return {
    text: value,
    type: 'PERSON',
    start,
    end: start + value.length,
    originalStart: start,
    originalEnd: start + value.length,
    rawConfidence: 0.5,
    stage: 'stage2-ner',
    detectorId: 'ner:verify-mock',
    sensitive: true,
    canonical: value,
  };
}

function scored(candidate: PipelineCandidate, confidence: number): ContextScoredCandidate {
  return { candidate, contextConfidence: confidence, contributions: [], suppressed: false };
}

const DOC = 'The report was filed by Kowalska after the meeting on Tuesday afternoon.';

describe('Stage 2c — the ambiguous band', () => {
  it('verifies a candidate inside the band', async () => {
    const engine = new NerEngine(tagger(new Set(['Kowalska'])));
    const result = await verifyAmbiguous(normalize(DOC), [scored(nerCandidate(DOC, 'Kowalska'), 0.5)], engine);

    expect(result.stats.entered).toBe(1);
    expect(result.stats.confirmed).toBe(1);
    expect(result.candidates[0]!.contributions.map((c) => c.signal)).toContain('verify:confirmed');
  });

  it('leaves confident and weak candidates alone, so latency stays bounded', async () => {
    const engine = new NerEngine(tagger(new Set(['Kowalska'])));
    const candidates = [
      scored(nerCandidate(DOC, 'Kowalska'), AMBIGUOUS_HIGH + 0.2),
      scored(nerCandidate(DOC, 'Kowalska'), AMBIGUOUS_LOW - 0.2),
    ];
    const result = await verifyAmbiguous(normalize(DOC), candidates, engine);
    expect(result.stats.entered).toBe(0);
  });

  it('penalises a candidate the recentred window does not reproduce', async () => {
    // The model no longer tags the word when asked with different context,
    // which means the original prediction depended on chunk placement.
    const engine = new NerEngine(tagger(new Set(['Petrov'])));
    const result = await verifyAmbiguous(normalize(DOC), [scored(nerCandidate(DOC, 'Kowalska'), 0.5)], engine);

    expect(result.stats.refuted).toBe(1);
    const entry = result.candidates[0]!;
    expect(entry.contributions.map((c) => c.signal)).toContain('verify:refuted');
    expect(entry.contextConfidence).toBeLessThan(0.5);
  });

  it('does not verify Stage 1 candidates', async () => {
    // A checksum-validated candidate is not a question a named-entity model
    // has any view on, so re-inference would be noise, not evidence.
    const engine = new NerEngine(tagger(new Set(['Kowalska'])));
    const stage1 = { ...nerCandidate(DOC, 'Kowalska'), stage: 'stage1-validated-identifier' as const };
    const result = await verifyAmbiguous(normalize(DOC), [scored(stage1, 0.5)], engine);
    expect(result.stats.entered).toBe(0);
  });

  it('reports what it cost', async () => {
    const engine = new NerEngine(tagger(new Set(['Kowalska'])));
    const result = await verifyAmbiguous(normalize(DOC), [scored(nerCandidate(DOC, 'Kowalska'), 0.5)], engine);
    expect(result.stats.total).toBe(1);
    expect(result.stats.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Stage 2c — fail closed', () => {
  it('propagates a verification timeout rather than reporting unverified-but-fine', async () => {
    const slow: TokenClassifier = {
      id: 'slow',
      maxInputChars: 400,
      classify(): Promise<readonly TokenPrediction[]> {
        return new Promise((resolve) => setTimeout(() => resolve([]), 50));
      },
    };
    const engine = new NerEngine(slow, { timeBudgetMs: 1 });
    await expect(
      verifyAmbiguous(normalize(DOC), [scored(nerCandidate(DOC, 'Kowalska'), 0.5)], engine),
    ).rejects.toBeInstanceOf(DetectionTimeoutError);
  });
});
