/**
 * Kazakhstan: IIN (ЖСН/ИИН) — twelve digits: YYMMDD, a century/sex digit
 * (1–6), four serial digits, and a two-phase mod-11 check: weights 1..11;
 * if the remainder is 10, reweigh with the rotated vector 3,4,…,11,1,2;
 * a second 10 makes the number unissuable.
 */

import { toDigits, weightedModBy } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-kz-iin',
  entityType: 'NATIONAL_ID',
  regions: ['KZ'],
  pattern: /\b(\d{2})(\d{2})(\d{2})([1-6])(\d{4})(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Kazakh IIN with the two-phase rotated mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const d = toDigits(ctx.match[0])!;
    let check = weightedModBy(d.slice(0, 11), (i) => i + 1, 11)!;
    if (check === 10) {
      check = weightedModBy(d.slice(0, 11), (i) => ((i + 2) % 11) + 1, 11)!;
      if (check === 10) return invalid('unissuable (double remainder 10)');
    }
    if (check !== d[11]) return invalid('IIN check failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'iin', country: 'KZ' },
      validator: 'iin-two-phase-mod11',
    });
  },
});
