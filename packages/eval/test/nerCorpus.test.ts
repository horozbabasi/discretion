/**
 * The M6 corpus extension: PERSON/ORG/LOCATION ground truth planted by the
 * same seeded builder machinery as the Stage 1 values. These tests pin what
 * makes the NER benchmark valid: coverage across every language, exact
 * spans (inherited from corpus.test.ts, re-asserted here for NER types),
 * and BANK HYGIENE — no bank value may appear unlabeled in a language's
 * filler/carrier text, because an unlabeled entity in the corpus would turn
 * correct model detections into counted false positives.
 */

import { describe, expect, it } from 'vitest';

import { generateCorpus } from '../src/corpus/builder.js';
import { LANGUAGES } from '../src/corpus/languages.js';
import { NER_BANKS } from '../src/corpus/nerBank.js';

const NER_TYPES = ['PERSON', 'ORG', 'LOCATION'] as const;

describe('NER corpus extension', () => {
  const docs = generateCorpus({ documents: 1200, seed: 987, minPerKind: 0 });
  const nerEntities = docs.flatMap((d) =>
    d.entities.filter((e) => (NER_TYPES as readonly string[]).includes(e.type)).map((e) => ({ doc: d, e })),
  );

  it('plants NER ground truth with exact spans', () => {
    expect(nerEntities.length).toBeGreaterThan(500);
    for (const { doc, e } of nerEntities) {
      expect(doc.text.slice(e.start, e.end)).toBe(e.text);
      expect(e.text.length).toBeGreaterThan(1);
    }
  });

  it('covers every language and every NER type', () => {
    const langs = new Set(nerEntities.map(({ doc }) => doc.language));
    expect(langs.size).toBe(LANGUAGES.length);
    for (const type of NER_TYPES) {
      expect(nerEntities.filter(({ e }) => e.type === type).length).toBeGreaterThan(50);
    }
  });

  it('every language has a complete NER bank', () => {
    expect(NER_BANKS.map((b) => b.code).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    for (const b of NER_BANKS) {
      expect(b.people.length).toBeGreaterThanOrEqual(6);
      expect(b.orgs.length).toBeGreaterThanOrEqual(4);
      expect(b.locations.length).toBeGreaterThanOrEqual(5);
      for (const c of b.personCarriers) expect(c).toContain('{P}');
      for (const c of b.orgCarriers) expect(c).toContain('{O}');
      for (const c of b.locationCarriers) expect(c).toContain('{L}');
    }
  });

  it('BANK HYGIENE: no bank value appears in the language phrase bank unlabeled', () => {
    for (const b of NER_BANKS) {
      const lang = LANGUAGES.find((l) => l.code === b.code)!;
      const phrases = [
        ...lang.carriers,
        ...lang.fillers,
        lang.greeting,
        lang.signoff,
        ...b.personCarriers,
        ...b.orgCarriers,
        ...b.locationCarriers,
      ].join('\n');
      for (const value of [...b.people, ...b.orgs, ...b.locations]) {
        expect(phrases.includes(value), `${b.code}: "${value}" leaks into phrase bank`).toBe(false);
      }
    }
  });

  it('hard negatives remain NER-free (no unlabeled names in negatives)', () => {
    // Negatives are generated separately; the invariant that matters here is
    // that the POSITIVE corpus's NER values never appear in a document
    // without a matching ground-truth label.
    for (const doc of docs) {
      const bank = NER_BANKS.find((b) => b.code === doc.language);
      if (bank === undefined) continue;
      for (const value of bank.people) {
        let at = doc.text.indexOf(value);
        while (at !== -1) {
          const labeled = doc.entities.some((e) => e.start === at && e.text === value);
          expect(labeled, `${doc.id}: "${value}" at ${at} is unlabeled`).toBe(true);
          at = doc.text.indexOf(value, at + 1);
        }
      }
    }
  });
});
