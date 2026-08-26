/**
 * Financial core family: CREDIT_CARD, IBAN, SWIFT_BIC.
 *
 * IBAN and credit cards carry real checksums, so their property tests
 * include the single-character-mutation half of the standard. Mutations are
 * same-character-class (digit→digit, letter→letter) so they pass structural
 * gates and prove the CHECKSUM catches them: for mod-97 a same-class
 * substitution changes the value by Δ·10^k with 0 < Δ < 97, never ≡ 0
 * (97 is prime); Luhn catches all single-digit substitutions by design.
 * BIC has no checksum → mutation half omitted there.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/financial/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import { ibanCheckDigits } from '../src/checksums/index.js';
import { IBAN_REGISTRY } from '../src/detect/detectors/financial/ibanRegistry.js';
import {
  generateValidIban,
  groupIban,
  generateValidCard,
  generateValidBic,
} from './generators/financial.js';

const card = getDetector('credit-card')!;
const iban = getDetector('iban')!;
const bic = getDetector('swift-bic')!;

function scan(text: string, detector: Detector): Stage1Candidate[] {
  return runStage1(normalize(text), { detectors: [detector] });
}

function only(text: string, detector: Detector): Stage1Candidate {
  const found = scan(text, detector);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string, detector: Detector): void {
  expect(scan(text, detector), `expected no candidate in: ${text}`).toHaveLength(0);
}

/** Replace the character at `i` with a different one of the same class. */
function mutateSameClass(value: string, i: number, salt: number): string {
  const ch = value[i]!;
  let replacement: string;
  if (/[0-9]/.test(ch)) {
    replacement = String((Number(ch) + 1 + (salt % 8)) % 10);
    if (replacement === ch) replacement = String((Number(ch) + 1) % 10);
  } else if (/[A-Z]/.test(ch)) {
    const code = ((ch.charCodeAt(0) - 65 + 1 + (salt % 24)) % 26) + 65;
    replacement = String.fromCharCode(code === ch.charCodeAt(0) ? ((code - 65 + 1) % 26) + 65 : code);
  } else {
    return value; // separator — caller skips
  }
  return value.slice(0, i) + replacement + value.slice(i + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT_CARD
// ─────────────────────────────────────────────────────────────────────────────

describe('credit-card', () => {
  it('accepts Luhn-valid PANs with recognized issuers, with separators', () => {
    const c = only('pay 4539 1488 0343 6467 now', card);
    expect(c.metadata?.['issuer']).toBe('visa');
    expect(c.canonical).toBe('4539148803436467');
    only('n 5274-5763-9425-9961 k', card);
    expect(only('amex 371449635398431 here', card).metadata?.['issuer']).toBe('amex');
  });

  it('classifies known test cards non-sensitive (SPEC.md: "matched but classified as non-sensitive")', () => {
    expect(only('card 4111111111111111 test', card).sensitive).toBe(false);
    expect(only('card 5555 5555 5555 4444 test', card).sensitive).toBe(false);
    expect(only('card 378282246310005 test', card).sensitive).toBe(false);
    expect(only('card 2223003122003222 test', card).sensitive).toBe(false);
    expect(only('card 6200000000000005 test', card).sensitive).toBe(false);
    expect(only('card 4222222222222 test', card).sensitive).toBe(false); // 13-digit Visa
  });

  it('resolves contested BIN ranges longest-prefix-first', () => {
    // 6221 26… is Discover's UnionPay-processed block, not generic 62.
    expect(only('c 6221261111111116 x', card).metadata?.['issuer']).toBe('discover');
    expect(only('c 6250941006528599 x', card).metadata?.['issuer']).toBe('unionpay');
    expect(only('c 6011111111111117 x', card).metadata?.['issuer']).toBe('discover');
    expect(only('c 2200000000000053 x', card).metadata?.['issuer']).toBe('mir');
    expect(only('c 9792111111111116 x', card).metadata?.['issuer']).toBe('troy');
  });

  it('rejects non-cards (more invalid than valid)', () => {
    none('luhn 4111111111111112 fail', card); // wrong check digit
    none('luhn 4111111111111161 fail', card); // adjacent transposition of ...16
    none('issuer 1234567812345670 none', card); // Luhn-closed, prefix 1: no network
    none('imei 353247104398765 device', card); // JCB window but 15 digits
    none('imei 490154203237518 device', card); // Visa prefix but 15 digits
    none('short 41111111111 run', card); // 11 digits
    none('frag 1234 4111 1111 1111 1111 run', card); // 20-digit run
    none('amex 3714496353984310 wide', card); // Amex must be 15
  });

  it('PROPERTY: generated PANs validate; any single-digit mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const pan = generateValidCard(seed);
        expect(scan(`pay ${pan} ok`, card), pan).toHaveLength(1);
        const idx = idxSeed % pan.length;
        const mutated = mutateSameClass(pan, idx, idxSeed);
        if (mutated !== pan) {
          expect(scan(`pay ${mutated} ok`, card), mutated).toHaveLength(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'inv​ paid with 4539 1488 0343 6467 today';
    const found = runStage1(normalize(original), { detectors: [card] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('4539 1488 0343 6467');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IBAN
// ─────────────────────────────────────────────────────────────────────────────

describe('iban', () => {
  it('accepts registry IBANs, compact and grouped', () => {
    const c = only('to TR330006100519786457841326 pls', iban);
    expect(c.metadata?.['country']).toBe('TR');
    only('iban NO9386011117947 short', iban); // shortest registry entry (15)
    only('iban LC55HEMM000100010012001200023015 long', iban); // longest (32)
    const grouped = only('pay GB82 WEST 1234 5698 7654 32 today', iban);
    expect(grouped.canonical).toBe('GB82WEST12345698765432');
  });

  it('classifies documentation IBANs non-sensitive', () => {
    expect(only('ex GB82WEST12345698765432 doc', iban).sensitive).toBe(false);
    expect(only('ex DE89 3704 0044 0532 0130 00 doc', iban).sensitive).toBe(false);
    expect(only('ex FR1420041010050500013M02606 doc', iban).sensitive).toBe(false);
  });

  it('trims the pattern-absorbed following word, but only at a separator', () => {
    const c = only('send GB82 WEST 1234 5698 7654 32 please', iban);
    expect(c.canonical).toBe('GB82WEST12345698765432');
    expect(c.text.endsWith('32')).toBe(true); // 'please' not in span
    // No separator before the continuation → longer token → rejected.
    none('blob GB82WEST12345698765432999 run', iban);
  });

  it('rejects violations of each gate in turn (more invalid than valid)', () => {
    none('country ZZ89370400440532013000 fake', iban); // not a registry country
    none('short DE8937040044053201300 len', iban); // 21 chars for DE(22)
    none('checksum DE89370400440532013001 off', iban); // mod-97 broken
    none('checksum GB82WEST12345698765433 off', iban);
    none('transposed DE98370400440532013000 pair', iban); // check digits swapped
    none('checkdigits GBAAWEST12345698765432 alpha', iban); // non-numeric check
    // Passes mod-97 (check digits recomputed) but violates GB structure
    // (BBAN must be 4 letters + 14 digits): structure gate must fire.
    const badStructure = `GB${ibanCheckDigits('GB', '12AB345678901234')!}12AB345678901234`;
    none(`crafted ${badStructure} here`, iban);
  });

  it('registry covers all 88 IBAN countries with self-consistent specs', () => {
    expect(IBAN_REGISTRY.size).toBe(88);
    for (const [code, spec] of IBAN_REGISTRY) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      const bbanLen = spec.segments.reduce((s, seg) => s + seg.length, 0);
      expect(bbanLen).toBe(spec.length - 4);
    }
  });

  it('PROPERTY: generated IBANs validate (compact and grouped); same-class mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const value = generateValidIban(seed);
        expect(scan(`acct ${value} ok`, iban), value).toHaveLength(1);
        expect(scan(`acct ${groupIban(value)} ok`, iban), value).toHaveLength(1);
        // Mutate past the country code (positions 2+): check digits or BBAN.
        const idx = 2 + (idxSeed % (value.length - 2));
        const mutated = mutateSameClass(value, idx, idxSeed);
        if (mutated !== value) {
          expect(scan(`acct ${mutated} ok`, iban), mutated).toHaveLength(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'wire​ to DE89 3704 0044 0532 0130 00 ref 77';
    const found = runStage1(normalize(original), { detectors: [iban] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('DE89 3704 0044 0532 0130 00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SWIFT_BIC
// ─────────────────────────────────────────────────────────────────────────────

describe('swift-bic', () => {
  it('accepts real BICs; digits or a branch raise confidence to HIGH', () => {
    expect(only('via DEUTDEFF wire', bic).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(only('via CHASUS33 wire', bic).rawConfidence).toBe(CONFIDENCE.HIGH);
    expect(only('via BARCGB22 wire', bic).rawConfidence).toBe(CONFIDENCE.HIGH);
    const branch = only('via DEUTDEFF500 wire', bic);
    expect(branch.rawConfidence).toBe(CONFIDENCE.HIGH);
    expect(branch.metadata?.['branch']).toBe('500');
    expect(only('via BNPAFRPP wire', bic).metadata?.['country']).toBe('FR');
  });

  it('classifies test BICs (location ending 0) non-sensitive', () => {
    const c = only('env DEUTDEF0 sandbox', bic);
    expect(c.sensitive).toBe(false);
    expect(c.metadata?.['test']).toBe(true);
  });

  it('an 8-letter word that parses as a BIC stays capped at MEDIUM', () => {
    // "FEEDBACK": bank FEED, country BA, location CK — structurally a BIC.
    // No checksum exists to refute it; the honest posture is detection at
    // MEDIUM (never HIGH), with Stage 3 negative context to suppress later.
    expect(only('FEEDBACK', bic).rawConfidence).toBe(CONFIDENCE.MEDIUM);
  });

  it('rejects rule violations (more invalid than valid)', () => {
    none('country DEUTZZFF fake', bic); // ZZ unassigned
    none('country DEUTXXFF fake', bic); // XX unassigned
    none('loc DEUTDE0F zero', bic); // location cannot start 0
    none('loc DEUTDE1F one', bic); // …or 1
    none('case deutdeff lower', bic); // BICs are uppercase
    none('len DEUTDEF wire', bic); // 7 chars
    none('len DEUTDEFF50 wire', bic); // 10 chars
    none('word PASSWORD leak', bic); // country 'WO' unassigned
  });

  it('PROPERTY: generated BICs always validate as sensitive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidBic(seed);
        const found = scan(`route ${value} now`, bic);
        expect(found, value).toHaveLength(1);
        expect(found[0]!.sensitive).toBe(true);
      }),
      { numRuns: 300 },
    );
    // BIC carries no checksum; the mutation half is omitted — a mutated BIC
    // is usually another structurally plausible BIC. Precision rests on the
    // country/location gates tested above.
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'swift​ code DEUTDEFF500 listed';
    const found = runStage1(normalize(original), { detectors: [bic] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('DEUTDEFF500');
  });
});
