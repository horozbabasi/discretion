/**
 * Poland: PESEL, NIP, REGON — all genuinely checksummed.
 *
 * PESEL: weights 1,3,7,9 cycling over ten digits, check = (10 − sum) mod 10;
 * the month field encodes the century (+20 → 2000s, +40 → 2100s, +60 →
 * 2200s, +80 → 1800s) and is validated as such. NIP: weights
 * 6,5,7,2,3,4,5,6,7 mod 11, remainder 10 never issued. REGON (9-digit):
 * weights 8,9,2,3,4,5,6,7 mod 11 with 10→0.
 */

import { toDigits, cyclicWeightedMod, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function digitFragmentGuard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return 'fragment of a longer number';
  return null;
}

registerDetector({
  id: 'national-id-pl-pesel',
  entityType: 'NATIONAL_ID',
  regions: ['PL'],
  pattern: /\b\d{11}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Polish PESEL: century-encoded date plus the 1-3-7-9 checksum.',
  validate(ctx): ValidationResult {
    const guard = digitFragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    const digits = toDigits(ctx.match[0])!;
    const month = Number(ctx.match[0].slice(2, 4));
    const monthValid =
      (month >= 1 && month <= 12) || (month >= 21 && month <= 32) || (month >= 41 && month <= 52) ||
      (month >= 61 && month <= 72) || (month >= 81 && month <= 92);
    if (!monthValid) return invalid('month field outside all century bands');
    const day = Number(ctx.match[0].slice(4, 6));
    if (day < 1 || day > 31) return invalid('day field out of range');
    const sum = cyclicWeightedMod(digits.slice(0, 10), [1, 3, 7, 9], 10)!;
    if ((10 - sum) % 10 !== digits[10]) return invalid('PESEL checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'pesel', country: 'PL' },
      validator: 'pesel-mod10',
    });
  },
});

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

registerDetector({
  id: 'national-id-pl-nip',
  entityType: 'TAX_ID',
  regions: ['PL'],
  pattern: /\b\d{3}[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Polish NIP tax ids: mod-11 checksum, remainder 10 never issued.',
  validate(ctx): ValidationResult {
    const guard = digitFragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    const digitsStr = ctx.match[0].replace(/[- ]/g, '');
    if (digitsStr.length !== 10) return invalid('not ten digits');
    const digits = toDigits(digitsStr)!;
    const remainder = weightedMod(digits.slice(0, 9), NIP_WEIGHTS, 11)!;
    if (remainder === 10) return invalid('remainder 10 never issued');
    if (remainder !== digits[9]) return invalid('NIP checksum failed');
    return valid({
      canonical: digitsStr,
      metadata: { scheme: 'nip', country: 'PL' },
      validator: 'nip-mod11',
    });
  },
});

const REGON_WEIGHTS = [8, 9, 2, 3, 4, 5, 6, 7];

registerDetector({
  id: 'national-id-pl-regon',
  entityType: 'TAX_ID',
  regions: ['PL'],
  pattern: /\b\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Polish REGON business registry numbers (9-digit form), mod-11 checked.',
  validate(ctx): ValidationResult {
    const guard = digitFragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    const digits = toDigits(ctx.match[0])!;
    let check = weightedMod(digits.slice(0, 8), REGON_WEIGHTS, 11)!;
    if (check === 10) check = 0;
    if (check !== digits[8]) return invalid('REGON checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'regon', country: 'PL' },
      validator: 'regon-mod11',
    });
  },
});
