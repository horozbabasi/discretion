/**
 * South Africa: ID number — thirteen digits: YYMMDD SSSS C A Z, validated
 * as SPEC.md specifies ("Luhn + date validity"): a real calendar date, the
 * citizenship digit 0/1/2, and Luhn over all thirteen digits. Bijective →
 * hard mutation property (a date-field mutation may fail either gate;
 * both are rejections).
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-za',
  entityType: 'NATIONAL_ID',
  regions: ['ZA'],
  pattern: /\b(\d{2})(\d{2})(\d{2})(\d{4})(\d)(\d)(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'South African ID numbers: date validity, citizenship digit, Luhn.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const citizenship = Number(ctx.match[5]);
    if (citizenship > 2) return invalid('citizenship digit out of range');

    const digits = ctx.match[0];
    if (!luhnValid(digits)) return invalid('Luhn checksum failed');
    return valid({
      canonical: digits,
      metadata: { scheme: 'za-id', country: 'ZA', citizen: citizenship === 0 },
      validator: 'luhn-date',
    });
  },
});
