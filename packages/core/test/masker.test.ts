/**
 * Surrogate substitution and the masker.
 *
 * The property tests carry the weight: a surrogate for a checksummed type
 * must ITSELF validate (SPEC.md: "downstream validation in the model's
 * reasoning still behaves"); every substitution is consistent, collision-
 * free, and reversible.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { normalize } from '../src/normalization.js';
import { runStage1 } from '../src/detect/runner.js';
import { Vault } from '../src/mask/vault.js';
import { mask, maskOriginal, resolveForMasking } from '../src/mask/masker.js';
import { chooseSurrogate } from '../src/mask/surrogates.js';
import { generate } from '../src/index.js';

describe('surrogate format validity', () => {
  it('a surrogate for a checksummed type is itself a valid instance', () => {
    // Detect a real value, mask it, and re-run detection on the surrogate:
    // it must be detected as the same type and be sensitive (valid).
    const cases: readonly [string, string][] = [
      [`pay ${generate.generateValidIban(1)} now`, 'IBAN'],
      [`card ${generate.generateValidCard(2)} ok`, 'CREDIT_CARD'],
      [`tc ${generate.generateValidTckn(3)} x`, 'NATIONAL_ID'],
      [`n ${generate.generateValidAadhaar(4)} x`, 'NATIONAL_ID'],
      [`v ${generate.generateValidEuVat(5)} x`, 'VAT_NUMBER'],
      [`w ${generate.generateValidBtc(6)} x`, 'CRYPTO_WALLET'],
    ];
    for (const [text, type] of cases) {
      const vault = new Vault();
      const result = mask(text, vault);
      expect(result.entities.length, text).toBeGreaterThanOrEqual(1);
      const ent = result.entities.find((e) => e.type === type)!;
      expect(ent.fallback, `${type} fell back to a token`).toBe(false);
      // The surrogate, scanned on its own, validates as the same type.
      const reDetected = runStage1(normalize(ent.replacement));
      expect(
        reDetected.some((c) => c.type === type && c.sensitive),
        `surrogate ${ent.replacement} should validate as ${type}`,
      ).toBe(true);
    }
  });

  it('IBAN surrogate keeps the same country; card surrogate keeps the issuer', () => {
    const iban = generate.generateValidIbanForCountry('DE', 9);
    const s = chooseSurrogate({ type: 'IBAN', text: iban, metadata: { country: 'DE' } }, 123)!;
    expect(s.slice(0, 2)).toBe('DE');
    const card = chooseSurrogate({ type: 'CREDIT_CARD', text: '4539148803436467', metadata: { issuer: 'visa' } }, 7)!;
    expect(card[0]).toBe('4'); // Visa
  });
});

describe('maskOriginal', () => {
  const scan = (text: string) => runStage1(normalize(text));

  it('replaces exactly the sensitive spans, leaving surrounding text intact', () => {
    const text = 'Contact john.doe@gmail.com about invoice 42.';
    const vault = new Vault();
    const r = maskOriginal(text, scan(text), vault);
    expect(r.maskedText.startsWith('Contact ')).toBe(true);
    expect(r.maskedText.endsWith(' about invoice 42.')).toBe(true);
    expect(r.maskedText).not.toContain('john.doe@gmail.com');
    expect(r.entities).toHaveLength(1);
  });

  it('CONSISTENT: a repeated original maps to one surrogate', () => {
    const email = generate.generateValidEmail(1);
    const text = `From ${email}. Reply to ${email} please.`;
    const vault = new Vault();
    const r = maskOriginal(text, scan(text), vault);
    // Two occurrences, one vault entry, both replaced identically.
    expect(r.vaultEntries).toHaveLength(1);
    const surrogate = r.vaultEntries[0]!.replacement;
    expect(r.maskedText.split(surrogate)).toHaveLength(3); // appears twice
  });

  it('COLLISION-SAFE: surrogates never collide with source or vault', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 20 }), (seed) => {
        const parts = [
          generate.generateValidEmail(seed),
          generate.generateValidIban(seed + 1),
          generate.generateValidCard(seed + 2),
          generate.generateValidBtc(seed + 3),
        ];
        const text = `a ${parts[0]} b ${parts[1]} c ${parts[2]} d ${parts[3]} e`;
        const vault = new Vault();
        const r = maskOriginal(text, scan(text), vault, { seed });
        const replacements = r.vaultEntries.map((e) => e.replacement);
        // No replacement appears in the ORIGINAL text.
        for (const rep of replacements) {
          expect(text.toLowerCase().includes(rep.toLowerCase()), `${rep} collides with source`).toBe(false);
        }
        // Replacements are pairwise distinct.
        expect(new Set(replacements).size).toBe(replacements.length);
      }),
      { numRuns: 200 },
    );
  });

  it('REVERSIBLE: every masked entity round-trips through the vault', () => {
    const text = `IBAN ${generate.generateValidIban(5)}, card ${generate.generateValidCard(6)}.`;
    const vault = new Vault();
    const r = maskOriginal(text, scan(text), vault);
    for (const e of r.entities) {
      expect(vault.getBySurrogate(e.replacement)!.original).toBe(e.original);
    }
  });

  it('token mode emits bracket tokens, not surrogates', () => {
    const text = `Reach me at ${generate.generateValidEmail(2)} today.`;
    const vault = new Vault();
    const r = maskOriginal(text, scan(text), vault, { mode: 'token' });
    expect(r.entities[0]!.replacement).toMatch(/^\[EMAIL_\d+\]$/);
    expect(r.entities[0]!.fallback).toBe(false);
  });

  it('falls back to a recorded token when no surrogate exists for the type', () => {
    // Feed a DATE_OF_BIRTH candidate directly — no surrogate strategy exists.
    const vault = new Vault();
    const fakeCandidate = {
      text: '1990-01-01', type: 'DATE_OF_BIRTH' as const, start: 0, end: 10,
      originalStart: 6, originalEnd: 16, rawConfidence: 0.85,
      stage: 'stage1-validated-identifier' as const, detectorId: 'test-dob',
      sensitive: true, canonical: '1990-01-01',
    };
    const r = maskOriginal('born  1990-01-01 today', [fakeCandidate], vault);
    expect(r.entities[0]!.replacement).toMatch(/^\[DATE_OF_BIRTH_\d+\]$/);
    expect(r.entities[0]!.fallback).toBe(true);
    expect(r.vaultEntries[0]!.fallback).toBe(true);
  });

  it('resolveForMasking drops overlaps and non-sensitive candidates', () => {
    const text = `db redis://app:s3cretpw@10.0.3.4:6379 cache`;
    // The connection string overlaps an IP and a URL over the same span.
    const candidates = runStage1(normalize(text));
    const resolved = resolveForMasking(candidates);
    for (let i = 1; i < resolved.length; i++) {
      expect(resolved[i]!.originalStart).toBeGreaterThanOrEqual(resolved[i - 1]!.originalEnd);
    }
    expect(resolved.every((c) => c.sensitive)).toBe(true);
  });

  it('handles empty input, no-entity input, and entity-only input', () => {
    const vault = new Vault();
    expect(maskOriginal('', [], vault).maskedText).toBe('');
    expect(maskOriginal('nothing here at all', [], vault).maskedText).toBe('nothing here at all');
    const email = generate.generateValidEmail(3);
    const only = maskOriginal(email, runStage1(normalize(email)), new Vault());
    expect(only.maskedText).not.toBe(email);
    expect(only.entities).toHaveLength(1);
  });

  it('PROPERTY: masked text preserves the non-sensitive remainder exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 20 }), (seed) => {
        const email = generate.generateValidEmail(seed);
        const prefix = 'The quick brown fox ';
        const suffix = ' jumps over the lazy dog';
        const text = `${prefix}${email}${suffix}`;
        const vault = new Vault();
        const r = maskOriginal(text, runStage1(normalize(text)), vault, { seed });
        expect(r.maskedText.startsWith(prefix)).toBe(true);
        expect(r.maskedText.endsWith(suffix)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
