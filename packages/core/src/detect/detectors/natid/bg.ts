/**
 * Bulgaria: EGN (ЕГН) — ten digits: YYMMDD NNN C. The month encodes the
 * century (+20 → born 1800s, +40 → 2000s). Check: weights
 * 2,4,8,5,10,9,7,3,6 mod 11 with 10 → 0.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const EGN_WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6];

registerDetector({
  id: 'national-id-bg-egn',
  entityType: 'NATIONAL_ID',
  regions: ['BG'],
  pattern: /\b(\d{2})(\d{2})(\d{2})(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Bulgarian EGN: century-banded month plus the mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[2]);
    const monthValid =
      (month >= 1 && month <= 12) || (month >= 21 && month <= 32) || (month >= 41 && month <= 52);
    if (!monthValid) return invalid('month outside century bands');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const digits = toDigits(ctx.match[0])!;
    let check = weightedMod(digits.slice(0, 9), EGN_WEIGHTS, 11)!;
    if (check === 10) check = 0;
    if (check !== digits[9]) return invalid('EGN checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'egn', country: 'BG' },
      validator: 'egn-mod11',
    });
  },
});
