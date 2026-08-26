/**
 * United Kingdom: National Insurance Number and NHS Number.
 *
 * NINO has no checksum — validation is the published prefix rules — so it
 * caps at MEDIUM. The NHS Number closes with a real mod-11 check digit
 * (weights 10..2; remainder 10 means the number is never issued) → HIGH.
 * The NHS test range 999xxxxxxx is non-sensitive.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

/** Letters never used in NINO prefixes, by position. */
const NINO_BANNED_ANY = /[DFIQUV]/;
const NINO_BANNED_SECOND = /[DFIQUVO]/;
const NINO_BANNED_PAIRS = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);

registerDetector({
  id: 'national-id-gb-nino',
  entityType: 'NATIONAL_ID',
  regions: ['GB'],
  pattern: /\b([A-Z]{2})[ ]?(\d{2})[ ]?(\d{2})[ ]?(\d{2})[ ]?([A-D])\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'UK National Insurance Numbers: prefix validity rules (no checksum exists).',
  validate(ctx): ValidationResult {
    const prefix = ctx.match[1]!;
    if (NINO_BANNED_ANY.test(prefix[0]!)) return invalid('banned first prefix letter');
    if (NINO_BANNED_SECOND.test(prefix[1]!)) return invalid('banned second prefix letter');
    if (NINO_BANNED_PAIRS.has(prefix)) return invalid('banned prefix pair');
    const digits = `${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`;
    return valid({
      canonical: `${prefix}${digits}${ctx.match[5]}`,
      metadata: { scheme: 'nino', country: 'GB' },
      validator: 'nino-prefix-rules',
    });
  },
});

const NHS_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2];

registerDetector({
  id: 'national-id-gb-nhs',
  entityType: 'NATIONAL_ID',
  regions: ['GB'],
  pattern: /\b(\d{3})[ -]?(\d{3})[ -]?(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'NHS Numbers: mod-11 check digit (remainder 10 never issued).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digits = ctx.match[0].replace(/[ -]/g, '');
    const payload = toDigits(digits.slice(0, 9))!;
    const remainder = weightedMod(payload, NHS_WEIGHTS, 11)!;
    let check = 11 - remainder;
    if (check === 11) check = 0;
    if (check === 10) return invalid('remainder 10 is never issued');
    if (check !== Number(digits[9])) return invalid('mod-11 check digit failed');
    return valid({
      canonical: digits,
      sensitive: !digits.startsWith('999'), // NHS test range
      metadata: { scheme: 'nhs', country: 'GB' },
      validator: 'nhs-mod11',
    });
  },
});
