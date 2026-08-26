/**
 * Czechia & Slovakia: Rodné číslo — the shared Czechoslovak birth number.
 *
 * Ten digits (born 1954 onward): the WHOLE number must be divisible by 11.
 * Women add 50 to the month; the +20/+70 extension bands (used when a
 * day's serials ran out) are accepted. The pre-1954 nine-digit form has no
 * check at all and is deliberately not claimed — a bare nine-digit run
 * belongs to checksummated schemes.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-cz-rodne-cislo',
  entityType: 'NATIONAL_ID',
  regions: ['CZ', 'SK'],
  pattern: /\b(\d{2})(\d{2})(\d{2})\/?(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Czech/Slovak rodné číslo: month bands plus whole-number divisibility by 11.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[2]);
    const monthValid =
      (month >= 1 && month <= 12) || (month >= 51 && month <= 62) ||
      (month >= 21 && month <= 32) || (month >= 71 && month <= 82);
    if (!monthValid) return invalid('month outside all bands');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const ten = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`;
    if (Number(ten) % 11 !== 0) return invalid('not divisible by 11');
    return valid({
      canonical: ten,
      metadata: { scheme: 'rodne-cislo', country: 'CZ' },
      validator: 'mod11-divisibility',
    });
  },
});
