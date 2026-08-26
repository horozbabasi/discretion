/**
 * Germany: Steuerliche Identifikationsnummer and Personalausweis number.
 *
 * Steuer-ID: 11 digits, leading digit nonzero, closed by ISO 7064 MOD 11,10
 * (shared library), plus the distinctive digit-frequency rule: among the
 * first ten digits, one digit appears exactly twice or thrice and at least
 * one digit does not appear at all — that rule alone rejects most random
 * digit runs before the checksum even speaks. HIGH.
 *
 * Personalausweis (ID card document number): 9 characters from the
 * C-through-Z-minus-vowels+digits alphabet followed by an ICAO 9303 7-3-1
 * check digit — the same algorithm as the MRZ, reused from the shared
 * library. HIGH.
 */

import { mod11_10Valid, mrzCheckValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-de-steuerid',
  entityType: 'TAX_ID',
  regions: ['DE'],
  pattern: /\b[1-9]\d{2} ?\d{3} ?\d{3} ?\d{2}\b|\b[1-9]\d{10}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'German Steuer-IDs: digit-frequency rule plus ISO 7064 MOD 11,10.',
  validate(ctx): ValidationResult {
    const digits = ctx.match[0].replace(/ /g, '');
    if (digits.length !== 11) return invalid('not eleven digits');

    const counts = new Map<string, number>();
    for (const d of digits.slice(0, 10)) counts.set(d, (counts.get(d) ?? 0) + 1);
    const multiples = [...counts.values()].filter((c) => c > 1);
    if (counts.size === 10) return invalid('all ten digits distinct — rule requires a repeat');
    if (multiples.length !== 1) return invalid('exactly one digit may repeat');
    if (multiples[0]! > 3) return invalid('a digit repeats more than three times');

    if (!mod11_10Valid(digits.slice(0, 10), digits[10]!)) {
      return invalid('ISO 7064 MOD 11,10 check failed');
    }
    return valid({
      canonical: digits,
      metadata: { scheme: 'steuer-id', country: 'DE' },
      validator: 'iso7064-11-10',
    });
  },
});

/** Document-number alphabet: digits and consonants C–Z (no vowels, no B/Q/S? —
 *  the BSI alphabet excludes A, E, I, O, U and B, D, Q, S for legibility). */
const AUSWEIS_ALPHABET = /^[0-9CFGHJKLMNPRTVWXYZ]{9}$/;

registerDetector({
  id: 'national-id-de-personalausweis',
  entityType: 'NATIONAL_ID',
  regions: ['DE'],
  pattern: /\b[0-9CFGHJKLMNPRTVWXYZ]{9}\d\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'German Personalausweis document numbers with the ICAO 7-3-1 check digit.',
  validate(ctx): ValidationResult {
    const value = ctx.match[0];
    const payload = value.slice(0, 9);
    if (!AUSWEIS_ALPHABET.test(payload)) return invalid('character outside the BSI alphabet');
    // All-digit payloads are indistinct from arbitrary ten-digit numbers
    // even with a passing check digit; require at least one letter.
    if (!/[A-Z]/.test(payload)) return invalid('no letter in document number');
    if (!mrzCheckValid(payload, value[9]!)) return invalid('ICAO check digit failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'personalausweis', country: 'DE' },
      validator: 'icao-731',
    });
  },
});
