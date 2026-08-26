/**
 * Sweden: Personnummer — YYMMDD±NNNC, Luhn over the ten digits (shared
 * library). '+' as the separator means the person is over 100. The 12-digit
 * century-prefixed writing is also accepted; Luhn always runs on the final
 * ten. Date plausibility gates first (day 61–91 is the samordningsnummer
 * coordination range, day+60, and is accepted as such).
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-se-personnummer',
  entityType: 'NATIONAL_ID',
  regions: ['SE'],
  pattern: /\b(?:\d{2})?(\d{2})(\d{2})(\d{2})([-+]?)(\d{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Swedish personnummer: Luhn over the final ten digits, coordination numbers included.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[3]);
    const ordinaryDay = day >= 1 && day <= 31;
    const coordinationDay = day >= 61 && day <= 91;
    if (!ordinaryDay && !coordinationDay) return invalid('day out of range');

    const ten = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[5]}`;
    if (!luhnValid(ten)) return invalid('Luhn checksum failed');
    return valid({
      canonical: ten,
      metadata: { scheme: 'personnummer', country: 'SE', coordination: coordinationDay },
      validator: 'luhn',
    });
  },
});
