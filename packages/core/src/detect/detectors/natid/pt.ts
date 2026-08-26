/**
 * Portugal: NIF — nine digits, weights 9..2 over the first eight, check =
 * 0 when the remainder is below 2, else 11 − remainder.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const NIF_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2];

registerDetector({
  id: 'national-id-pt-nif',
  entityType: 'TAX_ID',
  regions: ['PT'],
  pattern: /\b[1-9]\d{8}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Portuguese NIF with its mod-11 check digit.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digits = toDigits(ctx.match[0])!;
    const remainder = weightedMod(digits.slice(0, 8), NIF_WEIGHTS, 11)!;
    const check = remainder < 2 ? 0 : 11 - remainder;
    if (check !== digits[8]) return invalid('NIF checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'nif', country: 'PT' },
      validator: 'nif-mod11',
    });
  },
});
