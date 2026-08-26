/**
 * South Korea: RRN (주민등록번호) — YYMMDD-SCCCCCK: the seventh digit
 * encodes sex and century (1–8; 5–8 for foreign residents), and the check
 * is weights 2,3,4,5,6,7,8,9,2,3,4,5 with check = (11 − sum mod 11) mod
 * 10. RRNs issued from October 2020 randomized the regional digits but
 * KEPT the check digit for the pre-existing stock; new issues no longer
 * compute it, so numbers failing the check with a plausible date are NOT
 * emitted (precision wins — a wrong RRN hit is a phone number or a date).
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const RRN_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];

registerDetector({
  id: 'national-id-kr-rrn',
  entityType: 'NATIONAL_ID',
  regions: ['KR'],
  pattern: /\b(\d{2})(\d{2})(\d{2})-([1-8])(\d{5})(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Korean RRN with its weighted mod-11 check digit.',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}${ctx.match[5]}${ctx.match[6]}`)!;
    const remainder = weightedMod(digits.slice(0, 12), RRN_WEIGHTS, 11)!;
    const check = (11 - remainder) % 10;
    if (check !== digits[12]) return invalid('RRN check failed');
    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'rrn', country: 'KR' },
      validator: 'rrn-mod11',
    });
  },
});
