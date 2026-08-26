/**
 * Japan: My Number (個人番号) — twelve digits. Check: over the eleven
 * payload digits counted 1..11 from the RIGHT, weight = n+1 for n ≤ 6 and
 * n−5 for n ≥ 7; remainder = sum mod 11; check digit = 0 when the
 * remainder ≤ 1, else 11 − remainder.
 */

import { toDigits } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

/** The check digit for the eleven payload digits (left to right). */
export function myNumberCheckDigit(payload: readonly number[]): number {
  let sum = 0;
  for (let n = 1; n <= 11; n++) {
    const digit = payload[11 - n]!; // n-th from the right
    const weight = n <= 6 ? n + 1 : n - 5;
    sum += digit * weight;
  }
  const remainder = sum % 11;
  return remainder <= 1 ? 0 : 11 - remainder;
}

registerDetector({
  id: 'national-id-jp-my-number',
  entityType: 'NATIONAL_ID',
  regions: ['JP'],
  pattern: /\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Japanese My Number with its positional mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digits = toDigits(ctx.match[0].replace(/[ -]/g, ''))!;
    if (myNumberCheckDigit(digits.slice(0, 11)) !== digits[11]) {
      return invalid('My Number check failed');
    }
    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'my-number', country: 'JP' },
      validator: 'mynumber-mod11',
    });
  },
});
