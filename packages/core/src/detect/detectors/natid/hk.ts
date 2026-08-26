/**
 * Hong Kong: HKID — one or two prefix letters, six digits, and a check
 * character (0–9 or A). Values: letters A=10…Z=35; a single-letter id is
 * computed as if preceded by a space valued 36. Weights 9,8 for the prefix,
 * 7..2 for the digits, 1 for the check (A counts as 10); the total must be
 * divisible by 11.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const letterValue = (ch: string): number => ch.charCodeAt(0) - 65 + 10;

registerDetector({
  id: 'national-id-hk-hkid',
  entityType: 'NATIONAL_ID',
  regions: ['HK'],
  pattern: /\b([A-Z]{1,2})(\d{6})[([]?([0-9A])[)\]]?(?![\w])/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Hong Kong HKID with its mod-11 check character (bracketed writing accepted).',
  validate(ctx): ValidationResult {
    const prefix = ctx.match[1]!;
    const digits = ctx.match[2]!;
    const check = ctx.match[3]!;

    let sum = 0;
    if (prefix.length === 2) {
      sum += letterValue(prefix[0]!) * 9 + letterValue(prefix[1]!) * 8;
    } else {
      sum += 36 * 9 + letterValue(prefix[0]!) * 8;
    }
    for (let i = 0; i < 6; i++) sum += Number(digits[i]) * (7 - i);
    sum += check === 'A' ? 10 : Number(check);
    if (sum % 11 !== 0) return invalid('mod-11 check failed');
    return valid({
      canonical: `${prefix}${digits}${check}`,
      metadata: { scheme: 'hkid', country: 'HK' },
      validator: 'hkid-mod11',
    });
  },
});
