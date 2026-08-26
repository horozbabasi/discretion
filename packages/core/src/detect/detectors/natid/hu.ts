/**
 * Hungary: Személyi szám — eleven digits: a 1–8 gender/century digit,
 * YYMMDD, a 3-digit serial, and a positional check: Σ dᵢ·(i+1) over the
 * first ten (1-based weights 1..10), mod 11; remainder 10 unissuable.
 */

import { toDigits, weightedModBy } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-hu-szemelyi',
  entityType: 'NATIONAL_ID',
  regions: ['HU'],
  pattern: /\b([1-8])(\d{2})(\d{2})(\d{2})[- ]?(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Hungarian személyi szám with its positional mod-11 check.',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[3]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[4]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const eleven = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}${ctx.match[5]}`;
    const digits = toDigits(eleven)!;
    const remainder = weightedModBy(digits.slice(0, 10), (i) => i + 1, 11)!;
    if (remainder === 10) return invalid('remainder 10 never issued');
    if (remainder !== digits[10]) return invalid('checksum failed');
    return valid({
      canonical: eleven,
      metadata: { scheme: 'szemelyi-szam', country: 'HU' },
      validator: 'szemelyi-mod11',
    });
  },
});
