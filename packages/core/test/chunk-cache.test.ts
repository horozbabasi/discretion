/**
 * The Stage 2 chunk cache.
 *
 * ARCHITECTURE.md D28 reasons about window size using "the content-hash cache
 * keys on chunk text", and BENCHMARKS.md's incremental figures were measured
 * against that behaviour — by a harness that SIMULATED it. The cache did not
 * exist; `recognize()` re-inferred every chunk on every call. These tests pin
 * the real one, and above all pin that a hit and a miss produce the same
 * answer, because a cache that is merely fast is worthless.
 */

import { describe, expect, it, vi } from 'vitest';

import { ChunkCache } from '../src/ner/chunkCache.js';
import { NerEngine } from '../src/ner/engine.js';
import type { TokenClassifier, TokenPrediction } from '../src/ner/types.js';

/** Labels the word "Maria" wherever it appears, and counts its calls. */
function countingClassifier(): TokenClassifier & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    id: 'fake',
    maxInputChars: 400,
    classify: (text: string): Promise<readonly TokenPrediction[]> => {
      calls.push(text);
      const predictions: TokenPrediction[] = [];
      for (const piece of text.split(/(\s+)/u)) {
        if (piece.trim().length === 0) continue;
        predictions.push({ label: piece === 'Maria' ? 'B-PER' : 'O', score: 0.97, piece });
      }
      return Promise.resolve(predictions);
    },
  };
}

describe('a hit and a miss give the same answer', () => {
  it('returns identical spans on the second call', async () => {
    const classifier = countingClassifier();
    const engine = new NerEngine(classifier);
    const cache = new ChunkCache();
    const text = 'Maria signed the contract on Tuesday.';

    const first = await engine.recognize(text, cache);
    const callsAfterFirst = classifier.calls.length;
    const second = await engine.recognize(text, cache);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    // The point of the thing: no inference the second time.
    expect(classifier.calls.length).toBe(callsAfterFirst);
  });

  it('agrees with an uncached run', async () => {
    const cachedEngine = new NerEngine(countingClassifier());
    const plainEngine = new NerEngine(countingClassifier());
    const cache = new ChunkCache();
    const text = 'Maria met Maria and then Maria left. '.repeat(20);

    await cachedEngine.recognize(text, cache);
    const cached = await cachedEngine.recognize(text, cache);
    const plain = await plainEngine.recognize(text);
    expect(cached).toEqual(plain);
  });

  it('re-slices the text rather than replaying a stored copy', async () => {
    // Spans are stored without their text. A stored `text` could drift from the
    // chunk it is served against; re-slicing makes that impossible.
    const engine = new NerEngine(countingClassifier());
    const cache = new ChunkCache();
    const text = 'Maria signed it.';
    await engine.recognize(text, cache);
    const again = await engine.recognize(text, cache);
    for (const span of again) {
      expect(span.text).toBe(text.slice(span.start, span.end));
    }
  });
});

describe('the cache stores chunk-local coordinates', () => {
  it('gives correct offsets when the same chunk text appears elsewhere', async () => {
    // The trap: cache the spans AFTER the document-offset shift and the same
    // chunk text served from a different position reports entities at the
    // position it first appeared. Silent, and wrong by exactly the shift.
    const classifier = countingClassifier();
    const engine = new NerEngine(classifier);
    const cache = new ChunkCache();

    const short = 'Maria signed it.';
    const padded = `Yesterday, ${short}`;

    const a = await engine.recognize(short, cache);
    const b = await engine.recognize(padded, cache);

    const inA = a.find((s) => s.text === 'Maria');
    const inB = b.find((s) => s.text === 'Maria');
    expect(inA?.start).toBe(short.indexOf('Maria'));
    expect(inB?.start).toBe(padded.indexOf('Maria'));
    expect(inB?.start).not.toBe(inA?.start);
  });
});

describe('an unchanged chunk is not re-inferred after an edit', () => {
  it('re-infers only the chunks whose text actually changed', async () => {
    // This is the incremental path BENCHMARKS.md's figures describe. Before
    // the cache existed, every chunk was re-inferred on every keystroke.
    const classifier = countingClassifier();
    const engine = new NerEngine(classifier);
    const cache = new ChunkCache();

    // Long enough to chunk: the classifier's window is 400 characters.
    const document = 'Maria and Boris wrote to Anna about the contract. '.repeat(30);
    await engine.recognize(document, cache);
    const afterCold = classifier.calls.length;
    expect(afterCold).toBeGreaterThan(1);

    // One character changed near the end.
    const edited = `${document.slice(0, -2)}X.`;
    classifier.calls.length = 0;
    await engine.recognize(edited, cache);

    expect(classifier.calls.length).toBeGreaterThan(0);
    expect(classifier.calls.length).toBeLessThan(afterCold);
  });
});

describe('it holds nothing longer than the session it belongs to', () => {
  it('clear() drops every entry', async () => {
    const classifier = countingClassifier();
    const engine = new NerEngine(classifier);
    const cache = new ChunkCache();
    const text = 'Maria signed it.';

    await engine.recognize(text, cache);
    expect(cache.stats.size).toBeGreaterThan(0);
    cache.clear();
    expect(cache.stats.size).toBe(0);

    // And the next call really does infer again.
    classifier.calls.length = 0;
    await engine.recognize(text, cache);
    expect(classifier.calls.length).toBeGreaterThan(0);
  });

  it('is bounded, so a long session cannot accumulate everything typed', () => {
    const cache = new ChunkCache();
    for (let i = 0; i < 400; i += 1) cache.set(`chunk ${String(i)}`, []);
    expect(cache.stats.size).toBeLessThanOrEqual(256);
    // The oldest went first, the newest is still there.
    expect(cache.get('chunk 0')).toBeUndefined();
    expect(cache.get('chunk 399')).toEqual([]);
  });

  it('reports counts only, never keys or values', () => {
    const cache = new ChunkCache();
    cache.set('a secret chunk', []);
    const serialized = JSON.stringify(cache.stats);
    expect(serialized).not.toContain('secret');
    expect(Object.keys(cache.stats).sort()).toEqual(['hits', 'misses', 'size']);
  });
});

describe('a cache hit does not consume the inference deadline', () => {
  it('serves a fully cached document even with the budget exhausted', async () => {
    // The budget bounds MODEL time. A cached document does no model work, so
    // checking the deadline before the lookup would time out a call that was
    // never going to be slow - and on the incremental path that is every call.
    const classifier = countingClassifier();
    const engine = new NerEngine(classifier, { timeBudgetMs: 50 });
    const cache = new ChunkCache();
    const text = 'Maria signed the contract. '.repeat(40);

    const first = await engine.recognize(text, cache);

    // The clock must ADVANCE past the deadline DURING the call, not merely be
    // set far ahead: `recognize` reads Date.now() to compute its own deadline,
    // so a frozen clock moves the deadline along with it and expires nothing.
    // Written the frozen way first, this test passed with the deadline checked
    // BEFORE the cache lookup - the exact defect it exists to catch.
    const frozen = Date.now();
    let reads = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      reads += 1;
      return reads === 1 ? frozen : frozen + 10_000;
    });
    try {
      await expect(engine.recognize(text, cache)).resolves.toEqual(first);
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
  });
});
