/**
 * Hard-negative corpus integrity.
 *
 * The label-hygiene test matters most: the checksum-failure category is
 * built ONLY from schemes whose checksum provably rejects every single-digit
 * substitution, so a same-type sensitive detection over those documents
 * would mean the corpus planted a value that is not actually invalid — a
 * labeling bug, not a detector finding. The general FP behaviour of the
 * other categories is deliberately NOT asserted here; that is the baseline
 * run's measurement, not a test expectation.
 */

import { describe, it, expect } from 'vitest';

import { normalize, runStage1, generate } from '@privacyshield/core';
import '@privacyshield/core';
import { generateHardNegatives, HARD_NEGATIVE_CATEGORIES } from '../src/corpus/hardNegatives.js';

/**
 * (kind, generator, ITS detector id). The hygiene claim is pinned to the
 * planted scheme's own checksum detector — coincidental hits from OTHER
 * detectors (structural QID over an 11-digit run, the entropy detector over
 * an IBAN body, another country's checksum aligning by chance) are Stage-1
 * behaviour for the baseline to measure, not corpus labeling errors.
 */
const MUTATION_SAFE_FOR_TEST: readonly (readonly [string, (s: number) => string, string])[] = [
  ['card', generate.generateValidCard, 'credit-card'],
  ['iban', generate.generateValidIban, 'iban'],
  ['aadhaar', generate.generateValidAadhaar, 'national-id-in-aadhaar'],
  ['tckn', generate.generateValidTckn, 'national-id-tr-tckn'],
  ['nhs', generate.generateValidNhs, 'national-id-gb-nhs'],
  ['bsn', generate.generateValidBsn, 'national-id-nl-bsn'],
  ['personnummer', generate.generateValidPersonnummer, 'national-id-se-personnummer'],
  ['rut', generate.generateValidRut, 'national-id-cl-rut'],
  ['ric', generate.generateValidRic, 'national-id-cn-ric'],
  ['steuer-id', generate.generateValidSteuerId, 'national-id-de-steuerid'],
  ['pesel', generate.generateValidPesel, 'national-id-pl-pesel'],
  ['nric', generate.generateValidNric, 'national-id-sg-nric'],
  ['vin', generate.generateValidVin, 'vin'],
];

function mutateOneDigit(seed: number, value: string): string {
  const rng = generate.mulberry32(seed ^ 0x5a5a);
  const positions = [...value].flatMap((ch, i) => (/\d/.test(ch) ? [i] : []));
  const i = positions[Math.floor(rng() * positions.length)]!;
  const replacement = String((Number(value[i]) + 1 + Math.floor(rng() * 8)) % 10);
  if (replacement === value[i]) {
    return value.slice(0, i) + String((Number(value[i]) + 1) % 10) + value.slice(i + 1);
  }
  return value.slice(0, i) + replacement + value.slice(i + 1);
}

describe('hard negatives', () => {
  const docs = generateHardNegatives({ documents: 180, seed: 0xbeef });

  it('every document is entity-free and flagged', () => {
    for (const doc of docs) {
      expect(doc.entities).toHaveLength(0);
      expect(doc.hardNegative).toBe(true);
    }
  });

  it('is deterministic and cycles all categories', () => {
    const again = generateHardNegatives({ documents: 180, seed: 0xbeef });
    expect(JSON.stringify(again)).toBe(JSON.stringify(docs));
    for (const cat of HARD_NEGATIVE_CATEGORIES) {
      expect(docs.some((d) => d.id.endsWith(cat)), cat).toBe(true);
    }
  });

  it('LABEL HYGIENE: a mutated value never validates under its OWN scheme (D10 bijective list)', () => {
    // The first run of this test asserted something stronger — that no
    // national/financial detector at all fires over broken plants — and it
    // failed for a REAL reason: a value with its own checksum broken can
    // coincidentally satisfy a DIFFERENT country's checksum (a broken
    // 9-digit plant validated as both a Dutch BSN and an Israeli id).
    // That cross-scheme collision is a genuine Stage-1 behaviour the
    // BASELINE measures; what D10 guarantees, and what corpus labeling
    // relies on, is only that the mutation kills the ORIGINAL scheme.
    for (const [kind, gen, detectorId] of MUTATION_SAFE_FOR_TEST) {
      for (const seed of [11, 222, 3333]) {
        const valid = gen(seed);
        const validHits = runStage1(normalize(`ref ${valid} end`));
        expect(
          validHits.some((c) => c.detectorId === detectorId),
          `${kind} ${valid} should validate under ${detectorId}`,
        ).toBe(true);

        const broken = mutateOneDigit(seed, valid);
        const brokenHits = runStage1(normalize(`ref ${broken} end`));
        expect(
          brokenHits.some((c) => c.detectorId === detectorId),
          `${kind}: ${broken} still validates under ${detectorId}`,
        ).toBe(false);
      }
    }
  });

  it('known test constants in labeled-example docs are detected non-sensitive, never sensitive', () => {
    const exampleDocs = docs.filter((d) => d.id.includes('labeled-examples'));
    for (const doc of exampleDocs) {
      const candidates = runStage1(normalize(doc.text));
      for (const c of candidates.filter((x) => x.type === 'CREDIT_CARD' || x.type === 'IBAN')) {
        expect(c.sensitive, `${doc.id} ${c.canonical}`).toBe(false);
      }
    }
  });
});
