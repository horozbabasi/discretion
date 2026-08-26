/**
 * Slovenia: EMŠO — thirteen digits (shared with the other ex-Yugoslav
 * unique master citizen numbers): DDMMYYY RR NNN C, check with weights
 * 7,6,5,4,3,2 repeated over the twelve payload digits, k = 11 − (sum mod
 * 11), with k ≥ 10 folding to 0.
 */

import { toDigits, cyclicWeightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-si-emso',
  entityType: 'NATIONAL_ID',
  regions: ['SI'],
  pattern: /\b(\d{2})(\d{2})(\d{3})(\d{2})(\d{3})(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Slovenian EMŠO with the 7-6-5-4-3-2 cyclic mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const day = Number(ctx.match[1]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');

    const digits = toDigits(ctx.match[0])!;
    const sum = cyclicWeightedMod(digits.slice(0, 12), [7, 6, 5, 4, 3, 2], 11)!;
    let k = 11 - sum;
    if (k >= 10) k = 0;
    if (k !== digits[12]) return invalid('EMŠO checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'emso', country: 'SI' },
      validator: 'emso-mod11',
    });
  },
});
