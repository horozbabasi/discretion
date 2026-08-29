/**
 * Stage 2b lives with Stage 2, and Stage 3 still emits the same signal.
 *
 * SPEC.md: "Bundled compressed lookup sets, checked in parallel with the
 * model." The lookup had drifted into Stage 3's scorer; moving it back to
 * Stage 2 is what lets the gazetteers live on the same side of a process
 * boundary as the model that needs them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 *
 * The full suite passed immediately after the move — and proved nothing. The
 * only gazetteer tests called `lookupGazetteer` directly, which the move did
 * not touch; NO test covered the path from a gazetteer hit to a Stage 3
 * contribution, which is the entire thing that moved. A green suite over code
 * nothing exercises is not evidence, so the coverage is written here rather
 * than claimed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from 'vitest';

import { analyzeContext } from '../src/context/score.js';
import type { PipelineCandidate } from '../src/context/types.js';
import { NerEngine } from '../src/ner/engine.js';
import { runStage2 } from '../src/ner/runStage2.js';
import { attachGazetteerHits } from '../src/ner/stage2b.js';
import type { GazetteerHit } from '../src/gazetteer/index.js';
import { lookupGazetteer } from '../src/gazetteer/index.js';
import type { NerSpan, TokenClassifier, TokenPrediction } from '../src/ner/types.js';
import { normalize } from '../src/normalization.js';

/** These deltas are the contract Stage 3 emitted before the move. */
const GAZETTEER_WHOLE = 0.2;
const GAZETTEER_PARTIAL = 0.1;

function stage2Candidate(
  text: string,
  type: 'PERSON' | 'ORG' | 'LOCATION',
  start: number,
  gazetteer?: GazetteerHit,
): PipelineCandidate {
  return {
    text,
    type,
    start,
    end: start + text.length,
    originalStart: start,
    originalEnd: start + text.length,
    rawConfidence: 0.9,
    stage: 'stage2-ner',
    detectorId: 'ner:test',
    sensitive: true,
    canonical: text,
    ...(gazetteer === undefined ? {} : { gazetteer }),
  };
}

function contributions(candidate: PipelineCandidate, text: string): readonly string[] {
  const scored = analyzeContext(text).score([candidate]);
  return (scored[0]?.contributions ?? []).map(
    (c) => `${c.signal}|${c.delta}|${c.detail ?? ''}`,
  );
}

describe('Stage 3 reads the corroboration it used to look up', () => {
  it('emits the same signal, delta and detail for a WHOLE hit', () => {
    const hit: GazetteerHit = { type: 'PERSON', whole: true, matchedWords: 2, totalWords: 2 };
    const text = 'Please contact Anna Kowalska about the invoice.';
    const got = contributions(stage2Candidate('Anna Kowalska', 'PERSON', 15, hit), text);
    expect(got).toContain(`gazetteer:PERSON|${GAZETTEER_WHOLE}|full name known`);
  });

  it('emits the partial form with the word counts, unchanged', () => {
    const hit: GazetteerHit = { type: 'PERSON', whole: false, matchedWords: 1, totalWords: 3 };
    const text = 'Please contact Anna Q Kowalska about the invoice.';
    const got = contributions(stage2Candidate('Anna Q Kowalska', 'PERSON', 15, hit), text);
    expect(got).toContain(`gazetteer:PERSON|${GAZETTEER_PARTIAL}|1/3 words known`);
  });

  it('emits NOTHING when no hit is attached', () => {
    // A miss and "the gazetteers were not consulted" are deliberately
    // indistinguishable here: both justify the same conclusion, and a field
    // that told them apart would invite a caller to read a miss as evidence
    // AGAINST a name. The sets are large; they are nowhere near complete.
    const text = 'Please contact Zzzqx Vvvbn about the invoice.';
    const got = contributions(stage2Candidate('Zzzqx Vvvbn', 'PERSON', 15, undefined), text);
    expect(got.some((c) => c.startsWith('gazetteer:'))).toBe(false);
  });

  it('never emits for a Stage 1 candidate, which is why the move is safe', () => {
    // No Stage 1 detector declares PERSON, ORG or LOCATION - 31 types,
    // enumerated - so no Stage 1 candidate could ever have reached the lookup
    // that used to live in Stage 3. This pins the premise rather than trusting
    // the enumeration to stay true.
    const stage1: PipelineCandidate = {
      text: 'anna@example.org',
      type: 'EMAIL',
      start: 0,
      end: 16,
      originalStart: 0,
      originalEnd: 16,
      rawConfidence: 0.9,
      stage: 'stage1-validated-identifier',
      detectorId: 'email',
      sensitive: true,
      canonical: 'anna@example.org',
    };
    const got = contributions(stage1, 'anna@example.org is the address');
    expect(got.some((c) => c.startsWith('gazetteer:'))).toBe(false);
  });
});

describe('Stage 2b attaches what Stage 3 reads', () => {
  it('attaches a real hit for a name the gazetteer knows', () => {
    const spans: NerSpan[] = [
      { type: 'PERSON', start: 0, end: 5, text: 'Maria', score: 0.9 },
      { type: 'PERSON', start: 6, end: 17, text: 'Zzzqxvvvbnn', score: 0.9 },
    ];
    const attached = attachGazetteerHits(spans);
    // Corroboration for the known name, nothing for the invented one. The
    // lookup itself is asserted independently so this does not merely restate
    // whatever attachGazetteerHits happens to do.
    expect(attached[0]?.gazetteer).toEqual(lookupGazetteer('Maria', 'PERSON'));
    expect(attached[0]?.gazetteer).toBeDefined();
    expect(attached[1]?.gazetteer).toBeUndefined();
  });

  it('attaches nothing to a name no gazetteer knows', () => {
    // There is no "non-gazetteer NER type" to test: the model's label set and
    // the gazetteer's are the same three, which stage2b.ts now asserts at
    // compile time rather than guarding for at run time. Writing this test
    // with a fourth type is what surfaced that - it did not typecheck.
    const spans: NerSpan[] = [
      { type: 'ORG', start: 0, end: 20, text: 'Qxzzvv Bnnmwqx Ltd', score: 0.9 },
    ];
    expect(attachGazetteerHits(spans)[0]?.gazetteer).toBeUndefined();
  });
});

describe('end to end: model output reaches Stage 3 carrying its corroboration', () => {
  /** A classifier that labels one known first name, with no model involved. */
  const classifier: TokenClassifier = {
    id: 'fake',
    maxInputChars: 400,
    classify: (text: string): Promise<readonly TokenPrediction[]> => {
      const predictions: TokenPrediction[] = [];
      for (const piece of text.split(/(\s+)/u)) {
        if (piece.trim().length === 0) continue;
        predictions.push({
          label: piece === 'Maria' ? 'B-PER' : 'O',
          score: 0.97,
          piece,
        });
      }
      return Promise.resolve(predictions);
    },
  };

  it('carries the hit from the engine, through runStage2, into the contribution', async () => {
    const engine = new NerEngine(classifier);
    const normalization = normalize('Maria signed the contract.');
    const candidates = await runStage2(normalization, engine);

    const person = candidates.find((c) => c.type === 'PERSON');
    expect(person).toBeDefined();
    expect(person?.gazetteer).toBeDefined();

    const got = contributions(person as PipelineCandidate, normalization.normalizedText);
    expect(got.some((c) => c.startsWith('gazetteer:PERSON|'))).toBe(true);
  });

  it('useGazetteers:false on the ENGINE suppresses it, where the option now lives', async () => {
    const engine = new NerEngine(classifier, { useGazetteers: false });
    const normalization = normalize('Maria signed the contract.');
    const candidates = await runStage2(normalization, engine);

    const person = candidates.find((c) => c.type === 'PERSON');
    expect(person).toBeDefined();
    expect(person?.gazetteer).toBeUndefined();
    const got = contributions(person as PipelineCandidate, normalization.normalizedText);
    expect(got.some((c) => c.startsWith('gazetteer:'))).toBe(false);
  });
});
