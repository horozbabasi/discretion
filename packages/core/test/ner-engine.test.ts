/**
 * The Stage 2 engine: chunking of long inputs (the runtime silently
 * truncates at its token limit — undetected text must be impossible),
 * exactly-once emission across window overlaps, the HARD timeout with
 * fail-closed semantics, load-failure propagation, and runStage2's
 * original-span resolution through the Stage 0 offset map.
 */

import { describe, expect, it } from 'vitest';

import { DetectionTimeoutError, normalize } from '../src/index.js';
import { chunkText } from '../src/ner/chunk.js';
import { NerEngine } from '../src/ner/engine.js';
import { runStage2 } from '../src/ner/runStage2.js';
import type { TokenClassifier, TokenPrediction } from '../src/ner/types.js';

/** Mock classifier: whitespace tokens; words from a fixed name list are
 *  tagged PER — deterministic structure to exercise windowing and merging. */
const NAME_WORDS = new Set(['Anna', 'Kowalska', 'Boris', 'Petrov']);

function nameTagger(maxInputChars: number): TokenClassifier {
  return {
    id: 'mock-tagger',
    maxInputChars,
    classify(text: string): Promise<readonly TokenPrediction[]> {
      const out: TokenPrediction[] = [];
      let open = false;
      for (const m of text.matchAll(/\S+/gu)) {
        const word = m[0];
        if (NAME_WORDS.has(word)) {
          out.push({ piece: word, label: open ? 'I-PER' : 'B-PER', score: 0.9 });
          open = true;
        } else {
          out.push({ piece: word, label: 'O', score: 0.99 });
          open = false;
        }
      }
      return Promise.resolve(out);
    },
  };
}

describe('NerEngine', () => {
  it('recognizes across chunk boundaries and emits each entity exactly once', async () => {
    // Text long enough to need several 120-char windows; names placed so at
    // least one straddles a window edge region.
    const sentence = 'The report was filed on time by the team without issues. ';
    const text =
      sentence.repeat(2) +
      'Contact Anna Kowalska for access. ' +
      sentence.repeat(2) +
      'Contact Boris Petrov for keys. ' +
      sentence;
    const engine = new NerEngine(nameTagger(120), { overlapChars: 40 });
    const spans = await engine.recognize(text);
    expect(spans.map((s) => s.text)).toEqual(['Anna Kowalska', 'Boris Petrov']);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('every character of a long input is inside exactly one chunk core', () => {
    const text = 'x'.repeat(2000);
    const chunks = chunkText(text, 400, 96);
    let covered = 0;
    for (const c of chunks) covered += c.coreEnd - c.coreStart;
    expect(covered).toBe(text.length);
    expect(chunks[0]!.coreStart).toBe(0);
    expect(chunks[chunks.length - 1]!.coreEnd).toBe(text.length);
  });

  it('HARD TIMEOUT: a stalled model rejects with DetectionTimeoutError', async () => {
    const stalled: TokenClassifier = {
      id: 'stalled',
      maxInputChars: 400,
      classify: () => new Promise<never>(() => undefined),
    };
    const engine = new NerEngine(stalled, { timeBudgetMs: 40 });
    await expect(engine.recognize('any text at all')).rejects.toBeInstanceOf(DetectionTimeoutError);
  });

  it('a model failure propagates (fail closed, never an empty success)', async () => {
    const broken: TokenClassifier = {
      id: 'broken',
      maxInputChars: 400,
      classify: () => Promise.reject(new Error('model load failed')),
    };
    const engine = new NerEngine(broken, {});
    await expect(engine.recognize('some text')).rejects.toThrow('model load failed');
  });

  it('warmup runs one inference and only once', async () => {
    let calls = 0;
    const counting: TokenClassifier = {
      id: 'counting',
      maxInputChars: 400,
      classify: () => {
        calls += 1;
        return Promise.resolve([]);
      },
    };
    const engine = new NerEngine(counting, {});
    await engine.warmup();
    await engine.warmup();
    expect(calls).toBe(1);
  });
});

describe('runStage2', () => {
  it('maps spans to exact ORIGINAL offsets through the offset map', async () => {
    // 'ﬁ' (U+FB01) expands to 'fi' under NFKC, shifting every later offset,
    // and the ZWSP inside the surname is stripped by Stage 0 — the original
    // span must still cover the obfuscated run exactly.
    const original = 'ﬁle note: Contact Anna Kowal\u200Bska today';
    const normalization = normalize(original);
    const engine = new NerEngine(nameTagger(400), {});
    const candidates = await runStage2(normalization, engine);

    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.type).toBe('PERSON');
    expect(c.stage).toBe('stage2-ner');
    expect(c.sensitive).toBe(true);
    expect(c.text).toBe('Anna Kowalska'); // normalized-text surface
    expect(original.slice(c.originalStart, c.originalEnd)).toBe('Anna Kowal\u200Bska');
    expect(c.detectorId).toBe('ner:mock-tagger');
  });

  it('produces candidates in the Stage 1 shape (fields the pipeline relies on)', async () => {
    const normalization = normalize('Contact Anna Kowalska now');
    const engine = new NerEngine(nameTagger(400), {});
    const [c] = await runStage2(normalization, engine);
    expect(c).toBeDefined();
    expect(c!.canonical).toBe('Anna Kowalska');
    expect(c!.rawConfidence).toBeGreaterThan(0);
    expect(c!.rawConfidence).toBeLessThanOrEqual(1);
    expect(c!.metadata).toEqual({ model: 'mock-tagger' });
  });
});
