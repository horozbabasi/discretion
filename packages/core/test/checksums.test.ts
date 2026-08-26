/**
 * Tests for the shared checksum library.
 *
 * SPEC.md TESTS: "Every validator: valid cases, and above all invalid cases.
 * Wrong checksums must not match."
 *
 * These algorithms are the foundation every national identifier detector
 * stands on, so they are tested to a higher bar than spot vectors:
 *
 *  • published vectors, so a transcription error in a table is caught
 *  • self-consistency: a generated check digit always validates
 *  • the ERROR-DETECTION PROPERTIES the algorithms are chosen for — Luhn
 *    catches every single-digit error, Verhoeff catches those plus every
 *    adjacent transposition. These are asserted over generated input with
 *    fast-check rather than assumed from the literature.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  toDigits,
  stripSeparators,
  alphanumericValue,
  toNumericString,
  isAllDigits,
  isRepdigit,
} from '../src/checksums/digits.js';
import { weightedSum, weightedMod, cyclicWeightedMod, complement } from '../src/checksums/weighted.js';
import { luhnValid, luhnCheckDigit } from '../src/checksums/luhn.js';
import { verhoeffValid, verhoeffCheckDigit } from '../src/checksums/verhoeff.js';
import { modString, ibanMod97Valid, ibanCheckDigits, mod97Key } from '../src/checksums/mod97.js';
import { mod11_2Valid, mod11_2CheckChar, mod11_10CheckDigit, mod11_10Valid } from '../src/checksums/iso7064.js';
import { abaValid, abaCheckDigit } from '../src/checksums/aba.js';

/** A digit string of a given length. */
const arbDigits = (min: number, max: number): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: min, maxLength: max })
    .map((ds) => ds.join(''));

/** Change exactly one digit of `s` at `index` to `replacement`. */
function substituteAt(s: string, index: number, replacement: number): string {
  return s.slice(0, index) + replacement.toString(10) + s.slice(index + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// digits.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('digits', () => {
  it('toDigits parses ASCII digits and rejects everything else', () => {
    expect(toDigits('0123456789')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(toDigits('')).toBeNull();
    expect(toDigits('12a4')).toBeNull();
    expect(toDigits('12 4')).toBeNull();
    expect(toDigits('-14')).toBeNull();
  });

  it('toDigits rejects non-ASCII digits', () => {
    // Arabic-Indic ٤ (U+0664) and fullwidth ４ (U+FF14). Stage 0 folds
    // fullwidth forms to ASCII before detection ever runs; a raw non-ASCII
    // digit reaching a checksum is not an identifier we validate.
    expect(toDigits('٤')).toBeNull();
    expect(toDigits('４')).toBeNull();
  });

  it('stripSeparators removes grouping punctuation only', () => {
    expect(stripSeparators('4111 1111 1111 1111')).toBe('4111111111111111');
    expect(stripSeparators('123-45-6789')).toBe('123456789');
    expect(stripSeparators('GB82 WEST 1234')).toBe('GB82WEST1234');
    expect(stripSeparators('abc', 'x')).toBe('abc');
  });

  it('alphanumericValue maps base-36 characters, case-insensitively', () => {
    expect(alphanumericValue('0')).toBe(0);
    expect(alphanumericValue('9')).toBe(9);
    expect(alphanumericValue('A')).toBe(10);
    expect(alphanumericValue('a')).toBe(10);
    expect(alphanumericValue('Z')).toBe(35);
    expect(alphanumericValue('z')).toBe(35);
    expect(alphanumericValue('-')).toBeNull();
    expect(alphanumericValue('AB')).toBeNull();
    expect(alphanumericValue('')).toBeNull();
  });

  it('toNumericString expands letters to their base-36 values', () => {
    // The IBAN transliteration: G=16, B=11.
    expect(toNumericString('GB82')).toBe('161182');
    expect(toNumericString('DE89')).toBe('131489');
    expect(toNumericString('123')).toBe('123');
    expect(toNumericString('A-1')).toBeNull();
  });

  it('isAllDigits and isRepdigit', () => {
    expect(isAllDigits('000')).toBe(true);
    expect(isAllDigits('')).toBe(false);
    expect(isAllDigits('1a')).toBe(false);
    expect(isRepdigit([0, 0, 0])).toBe(true);
    expect(isRepdigit([1, 1, 2])).toBe(false);
    expect(isRepdigit([])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// weighted.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('weighted sums', () => {
  it('weightedSum multiplies positionally', () => {
    expect(weightedSum([1, 2, 3], [4, 5, 6])).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });

  it('weightedSum tolerates extra trailing weights but not too few', () => {
    expect(weightedSum([1, 2], [1, 2, 3, 4])).toBe(5);
    expect(weightedSum([1, 2, 3], [1, 2])).toBeNull();
  });

  it('weightedMod reduces by the modulus', () => {
    expect(weightedMod([1, 2, 3], [4, 5, 6], 7)).toBe(32 % 7);
    expect(weightedMod([1], [1], 0)).toBeNull();
  });

  it('cyclicWeightedMod repeats the weight vector', () => {
    // Weights 3,7,1 over six digits === 3,7,1,3,7,1.
    expect(cyclicWeightedMod([1, 1, 1, 1, 1, 1], [3, 7, 1], 100)).toBe((3 + 7 + 1) * 2);
    expect(cyclicWeightedMod([1], [], 10)).toBeNull();
  });

  it('complement returns 0 rather than the modulus when the sum is exact', () => {
    // The classic off-by-one: (m - 0 % m) % m must be 0, not m.
    expect(complement(0, 11)).toBe(0);
    expect(complement(11, 11)).toBe(0);
    expect(complement(1, 11)).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Luhn
// ─────────────────────────────────────────────────────────────────────────────

describe('Luhn', () => {
  it('accepts published valid numbers', () => {
    expect(luhnValid('79927398713')).toBe(true); // canonical Luhn example
    expect(luhnValid('4111111111111111')).toBe(true); // Visa test number
    expect(luhnValid('5500005555555559')).toBe(true);
    expect(luhnValid('378282246310005')).toBe(true); // Amex test number
  });

  it('rejects the neighbours of a valid number', () => {
    // Every other final digit must fail — the check digit is unique.
    for (let d = 0; d <= 9; d++) {
      const candidate = `7992739871${d}`;
      expect(luhnValid(candidate)).toBe(d === 3);
    }
  });

  it('rejects malformed input', () => {
    expect(luhnValid('')).toBe(false);
    expect(luhnValid('7')).toBe(false); // single digit carries no payload
    expect(luhnValid('4111-1111-1111-1111')).toBe(false); // caller must strip
    expect(luhnValid('411111111111111a')).toBe(false);
  });

  it('luhnCheckDigit closes any payload', () => {
    fc.assert(
      fc.property(arbDigits(1, 24), (payload) => {
        const check = luhnCheckDigit(payload);
        expect(check).not.toBeNull();
        expect(luhnValid(`${payload}${check}`)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('PROPERTY: catches every single-digit substitution', () => {
    fc.assert(
      fc.property(arbDigits(2, 20), fc.nat(), fc.integer({ min: 0, max: 9 }), (payload, idxSeed, repl) => {
        const number = `${payload}${luhnCheckDigit(payload)!}`;
        const idx = idxSeed % number.length;
        if (number.charCodeAt(idx) - 0x30 === repl) return; // not a change
        expect(luhnValid(substituteAt(number, idx, repl))).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('PROPERTY: catches adjacent transpositions except 09 <-> 90', () => {
    // Luhn's one documented blind spot. Asserting it explicitly means a
    // future "optimization" that breaks a different transposition is caught.
    fc.assert(
      fc.property(arbDigits(2, 20), fc.nat(), (payload, idxSeed) => {
        const number = `${payload}${luhnCheckDigit(payload)!}`;
        if (number.length < 2) return;
        const i = idxSeed % (number.length - 1);
        const a = number[i]!;
        const b = number[i + 1]!;
        if (a === b) return;
        const swapped = number.slice(0, i) + b + a + number.slice(i + 2);
        const isBlindSpot = (a === '0' && b === '9') || (a === '9' && b === '0');
        expect(luhnValid(swapped)).toBe(isBlindSpot);
      }),
      { numRuns: 500 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verhoeff
// ─────────────────────────────────────────────────────────────────────────────

describe('Verhoeff', () => {
  it('generated check digits validate', () => {
    fc.assert(
      fc.property(arbDigits(1, 20), (payload) => {
        const check = verhoeffCheckDigit(payload);
        expect(check).not.toBeNull();
        expect(verhoeffValid(`${payload}${check}`)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('rejects the neighbours of a valid number', () => {
    const payload = '236';
    const check = verhoeffCheckDigit(payload)!;
    for (let d = 0; d <= 9; d++) {
      expect(verhoeffValid(`${payload}${d}`)).toBe(d === check);
    }
  });

  it('rejects malformed input', () => {
    expect(verhoeffValid('')).toBe(false);
    expect(verhoeffValid('1')).toBe(false);
    expect(verhoeffValid('12a4')).toBe(false);
  });

  it('PROPERTY: catches every single-digit substitution', () => {
    fc.assert(
      fc.property(arbDigits(2, 20), fc.nat(), fc.integer({ min: 0, max: 9 }), (payload, idxSeed, repl) => {
        const number = `${payload}${verhoeffCheckDigit(payload)!}`;
        const idx = idxSeed % number.length;
        if (number.charCodeAt(idx) - 0x30 === repl) return;
        expect(verhoeffValid(substituteAt(number, idx, repl))).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('PROPERTY: catches EVERY adjacent transposition, including 09 <-> 90', () => {
    // This is the property Luhn lacks and the reason Aadhaar uses Verhoeff.
    fc.assert(
      fc.property(arbDigits(2, 20), fc.nat(), (payload, idxSeed) => {
        const number = `${payload}${verhoeffCheckDigit(payload)!}`;
        const i = idxSeed % (number.length - 1);
        const a = number[i]!;
        const b = number[i + 1]!;
        if (a === b) return;
        const swapped = number.slice(0, i) + b + a + number.slice(i + 2);
        expect(verhoeffValid(swapped)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mod 97 / IBAN
// ─────────────────────────────────────────────────────────────────────────────

describe('mod 97', () => {
  it('modString matches native arithmetic on values that fit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), (n) => {
        expect(modString(n.toString(10), 97)).toBe(n % 97);
      }),
      { numRuns: 300 },
    );
  });

  it('modString handles strings far wider than a JS number', () => {
    // 68 digits — the widest an IBAN transliterates to.
    const wide = '1'.repeat(68);
    const result = modString(wide, 97);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(97);
    // Cross-check against BigInt, which the implementation deliberately avoids.
    expect(result).toBe(Number(BigInt(wide) % 97n));
  });

  it('modString rejects malformed input', () => {
    expect(modString('12a', 97)).toBeNull();
    expect(modString('', 97)).toBeNull();
    expect(modString('123', 0)).toBeNull();
  });

  it('accepts published valid IBANs', () => {
    expect(ibanMod97Valid('GB82WEST12345698765432')).toBe(true);
    expect(ibanMod97Valid('DE89370400440532013000')).toBe(true);
    expect(ibanMod97Valid('FR1420041010050500013M02606')).toBe(true);
    expect(ibanMod97Valid('TR330006100519786457841326')).toBe(true);
  });

  it('rejects IBANs with a corrupted character', () => {
    expect(ibanMod97Valid('GB82WEST12345698765433')).toBe(false);
    expect(ibanMod97Valid('GB83WEST12345698765432')).toBe(false);
    expect(ibanMod97Valid('DE89370400440532013001')).toBe(false);
    expect(ibanMod97Valid('')).toBe(false);
    expect(ibanMod97Valid('GB82')).toBe(false);
  });

  it('ibanCheckDigits reconstructs the published check digits', () => {
    expect(ibanCheckDigits('GB', 'WEST12345698765432')).toBe('82');
    expect(ibanCheckDigits('DE', '370400440532013000')).toBe('89');
    expect(ibanCheckDigits('GB', 'not-alphanumeric!')).toBeNull();
    expect(ibanCheckDigits('G', 'WEST')).toBeNull();
  });

  it('generated check digits always close the IBAN', () => {
    fc.assert(
      fc.property(arbDigits(10, 20), (bban) => {
        const check = ibanCheckDigits('DE', bban);
        expect(check).not.toBeNull();
        expect(ibanMod97Valid(`DE${check}${bban}`)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('mod97Key returns a value in 1..97', () => {
    fc.assert(
      fc.property(arbDigits(1, 15), (payload) => {
        const key = mod97Key(payload);
        expect(key).not.toBeNull();
        expect(key!).toBeGreaterThanOrEqual(1);
        expect(key!).toBeLessThanOrEqual(97);
      }),
      { numRuns: 300 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISO 7064
// ─────────────────────────────────────────────────────────────────────────────

describe('ISO 7064', () => {
  it('MOD 11-2 generated check characters validate', () => {
    fc.assert(
      fc.property(arbDigits(1, 20), (payload) => {
        const check = mod11_2CheckChar(payload);
        expect(check).not.toBeNull();
        expect(mod11_2Valid(payload, check!)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('MOD 11-2 produces X for the value 10 and accepts it back', () => {
    // Find a payload whose check character is X, then round-trip it.
    let found: string | null = null;
    for (let i = 0; i < 1000 && found === null; i++) {
      const payload = i.toString(10).padStart(17, '0');
      if (mod11_2CheckChar(payload) === 'X') found = payload;
    }
    expect(found).not.toBeNull();
    expect(mod11_2Valid(found!, 'X')).toBe(true);
    expect(mod11_2Valid(found!, 'x')).toBe(true);
    expect(mod11_2Valid(found!, '0')).toBe(false);
  });

  it('MOD 11-2 rejects a wrong check character', () => {
    const payload = '11010519491231002';
    const correct = mod11_2CheckChar(payload)!;
    const alternatives = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X'];
    for (const alt of alternatives) {
      expect(mod11_2Valid(payload, alt)).toBe(alt === correct);
    }
  });

  it('MOD 11-2 rejects malformed input', () => {
    expect(mod11_2Valid('', '0')).toBe(false);
    expect(mod11_2Valid('12a', '0')).toBe(false);
    expect(mod11_2Valid('123', 'Z')).toBe(false);
    expect(mod11_2Valid('123', '')).toBe(false);
    expect(mod11_2CheckChar('12a')).toBeNull();
  });

  it('MOD 11-10 generated check digits validate', () => {
    fc.assert(
      fc.property(arbDigits(1, 20), (payload) => {
        const check = mod11_10CheckDigit(payload);
        expect(check).not.toBeNull();
        expect(mod11_10Valid(payload, check!.toString(10))).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('MOD 11-10 rejects a wrong check digit', () => {
    const payload = '12345';
    const correct = mod11_10CheckDigit(payload)!;
    for (let d = 0; d <= 9; d++) {
      expect(mod11_10Valid(payload, d.toString(10))).toBe(d === correct);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ABA
// ─────────────────────────────────────────────────────────────────────────────

describe('ABA routing', () => {
  it('accepts published valid routing numbers', () => {
    expect(abaValid('021000021')).toBe(true);
    expect(abaValid('011401533')).toBe(true);
    expect(abaValid('121000248')).toBe(true);
  });

  it('rejects wrong checksums and wrong lengths', () => {
    expect(abaValid('021000022')).toBe(false);
    expect(abaValid('02100002')).toBe(false); // 8 digits
    expect(abaValid('0210000210')).toBe(false); // 10 digits
    expect(abaValid('12100024a')).toBe(false);
    expect(abaValid('')).toBe(false);
  });

  it('abaCheckDigit closes any eight-digit prefix', () => {
    fc.assert(
      fc.property(arbDigits(8, 8), (prefix) => {
        const check = abaCheckDigit(prefix);
        expect(check).not.toBeNull();
        expect(abaValid(`${prefix}${check}`)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('abaCheckDigit rejects a payload of the wrong length', () => {
    expect(abaCheckDigit('1234567')).toBeNull();
    expect(abaCheckDigit('123456789')).toBeNull();
  });

  it('PROPERTY: catches every single-digit substitution', () => {
    fc.assert(
      fc.property(arbDigits(8, 8), fc.nat(), fc.integer({ min: 0, max: 9 }), (prefix, idxSeed, repl) => {
        const number = `${prefix}${abaCheckDigit(prefix)!}`;
        const idx = idxSeed % 9;
        if (number.charCodeAt(idx) - 0x30 === repl) return;
        expect(abaValid(substituteAt(number, idx, repl))).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});
