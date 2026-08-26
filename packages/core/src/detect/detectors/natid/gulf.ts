/**
 * Gulf states: Saudi Arabia, UAE, Qatar, Kuwait.
 *
 * SA National ID / Iqama: ten digits, first digit 1 (citizen) or 2
 * (resident), Luhn-closed → HIGH.
 * AE Emirates ID: 784-YYYY-NNNNNNN-C, fifteen digits beginning 784 (the
 * UAE's ISO 3166 numeric code) with a plausible birth year, Luhn-closed →
 * HIGH.
 * QA QID: eleven digits, first digit 2 or 3 (century), digits 2–3 a
 * plausible birth year — NO public checksum → MEDIUM, stated.
 * KW Civil ID: twelve digits: century+YYMMDD then serials, closed by
 * weights 2,1,6,3,7,9,10,5,8,4,3 mod 11, check = 11 − remainder
 * (remainders 0 and 1 unissuable) → HIGH.
 */

import { luhnValid, toDigits, weightedMod } from '../../../checksums/index.js';
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

registerDetector({
  id: 'national-id-sa',
  entityType: 'NATIONAL_ID',
  regions: ['SA'],
  pattern: /\b[12]\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Saudi National ID / Iqama: leading 1 or 2, Luhn-closed.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    if (!luhnValid(ctx.match[0])) return invalid('Luhn checksum failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'saudi-id', country: 'SA', resident: ctx.match[0][0] === '2' },
      validator: 'luhn',
    });
  },
});

registerDetector({
  id: 'national-id-ae-emirates-id',
  entityType: 'NATIONAL_ID',
  regions: ['AE'],
  pattern: /\b784[- ]?(\d{4})[- ]?(\d{7})[- ]?(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Emirates ID: 784 prefix, plausible birth year, Luhn-closed.',
  validate(ctx): ValidationResult {
    const year = Number(ctx.match[1]);
    if (year < 1900 || year > 2029) return invalid('implausible birth year');
    const digits = `784${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`;
    if (!luhnValid(digits)) return invalid('Luhn checksum failed');
    return valid({
      canonical: digits,
      metadata: { scheme: 'emirates-id', country: 'AE' },
      validator: 'luhn',
    });
  },
});

registerDetector({
  id: 'national-id-qa-qid',
  entityType: 'NATIONAL_ID',
  regions: ['QA'],
  pattern: /\b[23]\d{10}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Qatari QID: century digit and birth-year structure (no public checksum).',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const value = ctx.match[0];
    // Digits 2-3 are the two-digit birth year; nothing further is checkable.
    return valid({
      canonical: value,
      metadata: { scheme: 'qid', country: 'QA' },
      validator: 'qid-structure',
    });
  },
});

const KW_WEIGHTS = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 3];

registerDetector({
  id: 'national-id-kw-civil-id',
  entityType: 'NATIONAL_ID',
  regions: ['KW'],
  pattern: /\b[123]\d{11}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Kuwaiti Civil ID with its weighted mod-11 check digit.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const value = ctx.match[0];
    const month = Number(value.slice(3, 5));
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(value.slice(5, 7));
    if (day < 1 || day > 31) return invalid('day out of range');
    const d = toDigits(value)!;
    const remainder = weightedMod(d.slice(0, 11), KW_WEIGHTS, 11)!;
    const check = 11 - remainder;
    if (check >= 10) return invalid('unissuable remainder');
    if (check !== d[11]) return invalid('Civil ID check failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'civil-id', country: 'KW' },
      validator: 'civilid-mod11',
    });
  },
});
