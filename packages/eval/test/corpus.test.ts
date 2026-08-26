/**
 * Corpus integrity. These tests prove the corpus is trustworthy AS GROUND
 * TRUTH — spans slice exactly, generation is deterministic, and coverage
 * spans every language, document type, and entity kind — without asserting
 * anything about detector performance, which is the baseline run's job.
 */

import { describe, it, expect } from 'vitest';

import { generateCorpus, ENTITY_BANK, LANGUAGES, DOC_TYPES } from '../src/index.js';

describe('corpus integrity', () => {
  const corpus = generateCorpus({ documents: 800, seed: 0xc0ffee });

  it('every ground-truth span slices to exactly its recorded text', () => {
    for (const doc of corpus) {
      for (const e of doc.entities) {
        expect(doc.text.slice(e.start, e.end), `${doc.id} ${e.scheme}`).toBe(e.text);
        expect(e.end).toBeGreaterThan(e.start);
      }
    }
  });

  it('spans never overlap within a document', () => {
    for (const doc of corpus) {
      const sorted = [...doc.entities].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.start, doc.id).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
      }
    }
  });

  it('is deterministic: same seed reproduces the identical corpus', () => {
    const again = generateCorpus({ documents: 50, seed: 1234 });
    const first = generateCorpus({ documents: 50, seed: 1234 });
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it('different seeds differ', () => {
    const a = generateCorpus({ documents: 10, seed: 1 });
    const b = generateCorpus({ documents: 10, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('covers at least 20 languages and every document type', () => {
    const langs = new Set(corpus.map((d) => d.language));
    const types = new Set(corpus.map((d) => d.docType));
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(20);
    expect(langs.size).toBeGreaterThanOrEqual(20);
    expect(types.size).toBe(DOC_TYPES.length);
  });

  it('covers EVERY entity kind at least minPerKind times (coverage pass)', () => {
    const counts = new Map<string, number>();
    for (const doc of corpus) for (const e of doc.entities) counts.set(e.scheme, (counts.get(e.scheme) ?? 0) + 1);
    const under = ENTITY_BANK.map((k) => k.kind).filter((k) => (counts.get(k) ?? 0) < 3);
    expect(under, `under-covered kinds: ${under.join(', ')}`).toHaveLength(0);
  });

  it('injects interior obfuscation at roughly the configured rate', () => {
    const all = corpus.flatMap((d) => d.entities);
    const obfuscated = all.filter((e) => e.obfuscated);
    expect(obfuscated.length).toBeGreaterThan(0);
    // Obfuscated values contain the zero-width space INSIDE, never at edges.
    for (const e of obfuscated) {
      expect(e.text.includes('​')).toBe(true);
      expect(e.text.startsWith('​')).toBe(false);
      expect(e.text.endsWith('​')).toBe(false);
    }
  });

  it('documents stay within the 2000-character latency-budget size', () => {
    for (const doc of corpus) {
      expect(doc.text.length, doc.id).toBeLessThanOrEqual(2000);
    }
  });
});
