/**
 * Australia: TFN, Medicare number, ABN.
 *
 * TFN — nine digits, weights 1,4,3,7,5,8,6,9,10, valid when the weighted
 * sum is divisible by 11 (SPEC.md: "TFN (mod 11)").
 * Medicare — ten digits + optional IRN: first digit 2–6, weights
 * 1,3,7,9,1,3,7,9 over the first eight, sum mod 10 equals the ninth digit;
 * the tenth is the issue number.
 * ABN — eleven digits: subtract 1 from the first digit, weights
 * 10,1,3,5,7,9,11,13,15,17,19, divisible by 89 (SPEC.md: "ABN (mod 89)").
 */

import { toDigits, weightedSum, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function guard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return 'fragment of a longer number';
  return null;
}

const TFN_WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10];

registerDetector({
  id: 'national-id-au-tfn',
  entityType: 'TAX_ID',
  regions: ['AU'],
  pattern: /\b(\d{3})[ ]?(\d{3})[ ]?(\d{3})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Australian TFNs: nine digits, weighted sum divisible by 11.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`)!;
    if (weightedMod(digits, TFN_WEIGHTS, 11) !== 0) return invalid('TFN sum not divisible by 11');
    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'tfn', country: 'AU' },
      validator: 'tfn-mod11',
    });
  },
});

const MEDICARE_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9];

registerDetector({
  id: 'national-id-au-medicare',
  entityType: 'NATIONAL_ID',
  regions: ['AU'],
  pattern: /\b([2-6]\d{3})[ ]?(\d{5})[ ]?(\d)[ ]?(\d)?\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Australian Medicare numbers with the weighted mod-10 check digit.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const nine = `${ctx.match[1]}${ctx.match[2]}`;
    const digits = toDigits(nine)!;
    const check = weightedMod(digits.slice(0, 8), MEDICARE_WEIGHTS, 10)!;
    if (check !== digits[8]) return invalid('Medicare check digit failed');
    return valid({
      canonical: nine + (ctx.match[4] ?? ''),
      metadata: { scheme: 'medicare', country: 'AU' },
      validator: 'medicare-mod10',
    });
  },
});

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

registerDetector({
  id: 'national-id-au-abn',
  entityType: 'TAX_ID',
  regions: ['AU'],
  pattern: /\b(\d{2})[ ]?(\d{3})[ ]?(\d{3})[ ]?(\d{3})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Australian ABNs: first digit minus one, weighted sum divisible by 89.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`)!;
    if (digits[0] === 0) return invalid('first digit cannot be 0');
    const adjusted = [digits[0]! - 1, ...digits.slice(1)];
    const sum = weightedSum(adjusted, ABN_WEIGHTS)!;
    if (sum % 89 !== 0) return invalid('ABN sum not divisible by 89');
    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'abn', country: 'AU' },
      validator: 'abn-mod89',
    });
  },
});
