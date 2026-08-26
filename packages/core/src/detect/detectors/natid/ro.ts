/**
 * Romania: CNP — thirteen digits: S YYMMDD JJ NNN C, where S encodes
 * sex+century (1–9, never 0), JJ is a county code 01–52 (or 70/80-series
 * special allocations — 01–52 plus 70..80 accepted), and C closes with the
 * constant weight vector 2,7,9,1,4,6,3,5,8,2,7,9 mod 11 with 10 → 1.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

registerDetector({
  id: 'national-id-ro-cnp',
  entityType: 'NATIONAL_ID',
  regions: ['RO'],
  pattern: /\b([1-9])(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Romanian CNP with its constant-weight mod-11 check (10 folds to 1).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[3]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[4]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const county = Number(ctx.match[5]);
    if (!((county >= 1 && county <= 52) || (county >= 70 && county <= 80))) {
      return invalid('county code out of range');
    }

    const digits = toDigits(ctx.match[0])!;
    let check = weightedMod(digits.slice(0, 12), CNP_WEIGHTS, 11)!;
    if (check === 10) check = 1;
    if (check !== digits[12]) return invalid('CNP checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'cnp', country: 'RO' },
      validator: 'cnp-mod11',
    });
  },
});
