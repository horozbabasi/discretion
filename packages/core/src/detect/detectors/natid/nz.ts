/**
 * New Zealand: IRD number — eight or nine digits in the issued range
 * (10,000,000–150,000,000), with the IRD's two-phase mod-11: primary
 * weights 3,2,7,6,5,4,3,2 over the zero-padded first eight; check =
 * 11 − remainder (0 stays 0); a result of 10 triggers the secondary
 * weights 7,4,3,2,5,2,7,6, and a second 10 is unissuable.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const PRIMARY = [3, 2, 7, 6, 5, 4, 3, 2];
const SECONDARY = [7, 4, 3, 2, 5, 2, 7, 6];

function irdCheck(payload: readonly number[], weights: readonly number[]): number {
  const remainder = weightedMod(payload, weights, 11)!;
  return remainder === 0 ? 0 : 11 - remainder;
}

registerDetector({
  id: 'national-id-nz-ird',
  entityType: 'TAX_ID',
  regions: ['NZ'],
  pattern: /\b(\d{2,3})-(\d{3})-(\d{3})\b|\b(\d{8,9})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'New Zealand IRD numbers: issued range plus the two-phase mod-11.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digitsStr = ctx.match[0].replace(/-/g, '');
    const value = Number(digitsStr);
    if (value < 10_000_000 || value > 150_000_000) return invalid('outside the issued range');

    const padded = digitsStr.padStart(9, '0');
    const digits = toDigits(padded)!;
    let check = irdCheck(digits.slice(0, 8), PRIMARY);
    if (check === 10) {
      check = irdCheck(digits.slice(0, 8), SECONDARY);
      if (check === 10) return invalid('unissuable (double remainder 10)');
    }
    if (check !== digits[8]) return invalid('IRD check digit failed');
    return valid({
      canonical: digitsStr,
      metadata: { scheme: 'ird', country: 'NZ' },
      validator: 'ird-two-phase-mod11',
    });
  },
});
