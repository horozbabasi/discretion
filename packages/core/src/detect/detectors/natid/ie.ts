/**
 * Ireland: PPS Number — 7 digits + 1–2 letters with a real mod-23 check.
 *
 * Check: Σ(digitᵢ × weight 8..2) + 9 × value(second letter, if any, A=1…),
 * mod 23, mapped 0→'W', 1→'A' … 22→'V'. The second letter (post-2013
 * format, only 'A' or 'H' issued) participates in the sum. HIGH.
 */

import { toDigits, weightedSum } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const PPS_WEIGHTS = [8, 7, 6, 5, 4, 3, 2];
const MOD23 = 'WABCDEFGHIJKLMNOPQRSTUV';

registerDetector({
  id: 'national-id-ie-pps',
  entityType: 'NATIONAL_ID',
  regions: ['IE'],
  pattern: /\b(\d{7})([A-W])([AH])?\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Irish PPS Numbers with the mod-23 check letter verified.',
  validate(ctx): ValidationResult {
    const digits = toDigits(ctx.match[1]!)!;
    let sum = weightedSum(digits, PPS_WEIGHTS)!;
    const second = ctx.match[3];
    if (second !== undefined) sum += 9 * (second.charCodeAt(0) - 64);
    const expected = MOD23[sum % 23]!;
    if (ctx.match[2] !== expected) return invalid('mod-23 check letter failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'pps', country: 'IE' },
      validator: 'pps-mod23',
    });
  },
});
