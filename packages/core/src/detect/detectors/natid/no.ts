/**
 * Norway: Fødselsnummer — eleven digits with TWO chained mod-11 checks
 * (SPEC.md: "dual mod 11"). k1 closes the first nine digits, k2 closes the
 * first ten including k1; a remainder of 1 in either makes the number
 * unissuable. D-numbers (day+40, for temporary residents) are accepted and
 * flagged.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const K1_WEIGHTS = [3, 7, 6, 1, 8, 9, 4, 5, 2];
const K2_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

registerDetector({
  id: 'national-id-no-fodselsnummer',
  entityType: 'NATIONAL_ID',
  regions: ['NO'],
  pattern: /\b(\d{2})(\d{2})(\d{2})[ ]?(\d{5})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Norwegian fødselsnummer: dual mod-11 check digits, D-numbers included.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const day = Number(ctx.match[1]);
    const dNumber = day >= 41 && day <= 71;
    if (!(day >= 1 && day <= 31) && !dNumber) return invalid('day out of range');
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');

    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`)!;
    let k1 = 11 - weightedMod(digits.slice(0, 9), K1_WEIGHTS, 11)!;
    if (k1 === 11) k1 = 0;
    if (k1 === 10 || k1 !== digits[9]) return invalid('first mod-11 check failed');
    let k2 = 11 - weightedMod(digits.slice(0, 10), K2_WEIGHTS, 11)!;
    if (k2 === 11) k2 = 0;
    if (k2 === 10 || k2 !== digits[10]) return invalid('second mod-11 check failed');

    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'fodselsnummer', country: 'NO', dNumber },
      validator: 'dual-mod11',
    });
  },
});
