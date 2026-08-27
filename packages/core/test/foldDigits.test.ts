/**
 * Stage 0 decimal-digit folding.
 *
 * NFKC folds FULLWIDTH digits, because those are compatibility variants of
 * ASCII. It leaves Arabic-Indic, Devanagari, Bengali and Thai digits alone,
 * correctly — they are the ordinary digits of living scripts, not variants of
 * anything. Every Stage 1 detector matches `\d`, so before this transform a
 * national identity number written in native digits was reported as a clean
 * document.
 *
 * The tests below are in two halves. The first is the security property: real,
 * checksum-valid identifiers must detect in native digits exactly as they do
 * in ASCII. The second is the offset-map contract, because a transform that
 * finds the identifier but maps it to the wrong span would redact the wrong
 * characters — and one of these blocks is astral, so this is not a
 * length-preserving transform.
 */
import { describe, expect, it } from 'vitest';

import { normalize, runStage1 } from '../src/index.js';
import { asciiDigitFor, foldDigits } from '../src/transforms/foldDigits.js';
import { assertNormalizationInvariants } from './helpers.js';

/** First code point of each script's decimal-digit block. */
const ZERO = {
  arabic: 0x660,
  extendedArabic: 0x6f0,
  devanagari: 0x966,
  bengali: 0x9e6,
  thai: 0xe50,
  tamil: 0xbe6,
  telugu: 0xc66,
  myanmar: 0x1040,
  khmer: 0x17e0,
} as const;

/** Rewrite an ASCII-digit string into a script's own digits. */
function inScript(value: string, zero: number): string {
  return value.replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
}

describe('foldDigits — the detection failure it exists to fix', () => {
  // Each value is checksum-valid, so a miss can only be the folding.
  const values: readonly [string, string, string][] = [
    ['Turkish national identity number', '30214566412', 'NATIONAL_ID'],
    ['Visa card passing Luhn', '4111111111111111', 'CREDIT_CARD'],
    ['US social security number', '123-45-6789', 'NATIONAL_ID'],
    ['US routing number', '021000021', 'US_ROUTING_NUMBER'],
    ['IPv4 address', '192.168.100.200', 'IP_ADDRESS'],
  ];

  for (const [label, ascii, type] of values) {
    it(`detects a ${label} written in any script's digits`, () => {
      // The ASCII form is the control: if this fails the fixture is wrong.
      expect(runStage1(normalize(ascii)).some((c) => c.type === type), 'ascii control').toBe(true);

      for (const [script, zero] of Object.entries(ZERO)) {
        const native = inScript(ascii, zero);
        expect(
          runStage1(normalize(native)).some((c) => c.type === type),
          `${label} in ${script} digits`,
        ).toBe(true);
      }
    });
  }

  it('finds an identifier introduced by a native-language label', () => {
    // The shape a real user actually pastes.
    const persian = `کد ملی: ${inScript('30214566412', ZERO.extendedArabic)}`;
    expect(runStage1(normalize(persian)).some((c) => c.type === 'NATIONAL_ID')).toBe(true);
  });
});

describe('foldDigits — the transform itself', () => {
  it('leaves ASCII digits untouched, reporting identity', () => {
    expect(foldDigits('1234567890')).toBeNull();
    expect(foldDigits('no digits here at all')).toBeNull();
  });

  it('folds each script to the same ASCII value', () => {
    for (const zero of Object.values(ZERO)) {
      expect(normalize(inScript('0123456789', zero)).normalizedText).toBe('0123456789');
    }
  });

  it('maps a code point to its value within its own block', () => {
    expect(asciiDigitFor(0x660)).toBe('0');
    expect(asciiDigitFor(0x669)).toBe('9');
    expect(asciiDigitFor(0x96b)).toBe('5');
    // ASCII is skipped: it is already the fold target.
    expect(asciiDigitFor(0x30)).toBeUndefined();
    // Not a decimal digit.
    expect(asciiDigitFor(0x41)).toBeUndefined();
    expect(asciiDigitFor(0x2160)).toBeUndefined(); // ROMAN NUMERAL ONE
  });

  it('folds an astral digit block, which is not length-preserving', () => {
    // Osmanya digits are outside the BMP, so a surrogate PAIR folds to one
    // character. This is why the transform goes through MappedTextBuilder
    // rather than assuming equal lengths.
    const osmanya = String.fromCodePoint(0x104a0, 0x104a1, 0x104a2);
    expect(osmanya.length).toBe(6);
    const result = normalize(osmanya);
    expect(result.normalizedText).toBe('012');
    assertNormalizationInvariants(osmanya, result);
  });

  it('does not touch non-decimal number characters', () => {
    // Roman numerals and circled digits are numbers but not decimal digits;
    // NFKC already handles the compatibility ones on its own terms.
    expect(normalize('Ⅷ').normalizedText).not.toBe('8');
  });
});

describe('foldDigits — the offset-map contract', () => {
  it('holds every normalization invariant across scripts', () => {
    for (const zero of Object.values(ZERO)) {
      const text = `Reference ${inScript('4111111111111111', zero)} filed.`;
      assertNormalizationInvariants(text, normalize(text));
    }
  });

  it('maps a folded span back to the ORIGINAL native digits', () => {
    // The user's own text is never rewritten: masking edits the original
    // through the map, so a Persian user gets their own digits back.
    const original = `کد ملی: ${inScript('30214566412', ZERO.extendedArabic)}`;
    const result = normalize(original);
    const candidate = runStage1(result).find((c) => c.type === 'NATIONAL_ID');

    expect(candidate).toBeDefined();
    const slice = original.slice(candidate!.originalStart, candidate!.originalEnd);
    // The mapped-back span must be the native digits, not ASCII.
    expect(slice).toBe(inScript('30214566412', ZERO.extendedArabic));
    expect(/[0-9]/.test(slice)).toBe(false);
  });

  it('is idempotent: folding folded text changes nothing', () => {
    const once = normalize(inScript('987654321', ZERO.devanagari)).normalizedText;
    expect(normalize(once).normalizedText).toBe(once);
  });

  it('survives digits mixed with text and invisibles', () => {
    const mixed = `شماره‌${inScript('12345', ZERO.arabic)} تماس`;
    assertNormalizationInvariants(mixed, normalize(mixed));
  });
});
