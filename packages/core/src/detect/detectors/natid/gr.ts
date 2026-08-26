/**
 * Greece: AFM (ΑΦΜ) — nine digits, powers-of-two weights: the i-th of the
 * first eight digits (left to right) is multiplied by 2^(8−i), the sum is
 * taken mod 11, and that result mod 10 must equal the ninth digit.
 */

import { toDigits, weightedModBy } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-gr-afm',
  entityType: 'TAX_ID',
  regions: ['GR'],
  pattern: /\b\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Greek AFM tax numbers with the power-of-two mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digits = toDigits(ctx.match[0])!;
    if (digits.every((d) => d === 0)) return invalid('all zeros');
    const sum = weightedModBy(digits.slice(0, 8), (i) => 2 ** (8 - i), 11)!;
    if (sum % 10 !== digits[8]) return invalid('AFM checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'afm', country: 'GR' },
      validator: 'afm-mod11',
    });
  },
});
