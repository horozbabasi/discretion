/**
 * Africa beyond South Africa: Nigeria, Kenya, Egypt, Morocco.
 *
 * None of these publishes a verifiable checksum, so all four are
 * structural/labeled at MEDIUM, each stating its gates:
 *  • NG NIN — eleven digits, labeled ("NIN"), since a bare 11-digit run
 *    belongs to the checksummed schemes.
 *  • KE National ID — eight digits behind an explicit "ID No/Number" label.
 *  • EG National ID — fourteen digits with REAL structure: century digit
 *    2/3, a valid birth date, and a governorate code from the published
 *    table. (A final check digit exists but its algorithm is not officially
 *    published — stated here, structural only.)
 *  • MA CNIE — one or two letters + six digits, labeled ("CNIE"/"CIN"),
 *    since the bare shape collides with order numbers everywhere.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-ng-nin',
  entityType: 'NATIONAL_ID',
  regions: ['NG'],
  pattern: /\bNIN:?\s*(\d{11})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Nigerian NIN in labeled notation (no public checksum).',
  validate(ctx): ValidationResult {
    const numberPart = ctx.match[1]!;
    const start = ctx.start + ctx.match[0].indexOf(numberPart);
    return valid({
      canonical: numberPart,
      metadata: { scheme: 'nin', country: 'NG' },
      validator: 'nin-labeled',
      span: { start, end: start + numberPart.length },
    });
  },
});

registerDetector({
  id: 'national-id-ke',
  entityType: 'NATIONAL_ID',
  regions: ['KE'],
  pattern: /\bID\s?(?:No\.?|Number):?\s*(\d{8})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Kenyan National ID behind an explicit ID-number label (no checksum).',
  validate(ctx): ValidationResult {
    const numberPart = ctx.match[1]!;
    const start = ctx.start + ctx.match[0].lastIndexOf(numberPart);
    return valid({
      canonical: numberPart,
      metadata: { scheme: 'ke-id', country: 'KE' },
      validator: 'ke-id-labeled',
      span: { start, end: start + numberPart.length },
    });
  },
});

/** Egyptian governorate codes (the published table, 88 = born abroad). */
const EG_GOVERNORATES = new Set([
  '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '34', '35', '88',
]);

registerDetector({
  id: 'national-id-eg',
  entityType: 'NATIONAL_ID',
  regions: ['EG'],
  pattern: /\b([23])(\d{2})(\d{2})(\d{2})(\d{2})(\d{4})(\d)\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Egyptian National ID: century, date and governorate gates (check algorithm unpublished).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const month = Number(ctx.match[3]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[4]);
    if (day < 1 || day > 31) return invalid('day out of range');
    if (!EG_GOVERNORATES.has(ctx.match[5]!)) return invalid('not a governorate code');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'eg-id', country: 'EG' },
      validator: 'eg-id-structure',
    });
  },
});

registerDetector({
  id: 'national-id-ma-cnie',
  entityType: 'NATIONAL_ID',
  regions: ['MA'],
  pattern: /\b(?:CNIE|CIN):?\s*([A-Z]{1,2}\d{6})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Moroccan CNIE in labeled notation (no public checksum).',
  validate(ctx): ValidationResult {
    const numberPart = ctx.match[1]!;
    const start = ctx.start + ctx.match[0].indexOf(numberPart);
    return valid({
      canonical: numberPart,
      metadata: { scheme: 'cnie', country: 'MA' },
      validator: 'cnie-labeled',
      span: { start, end: start + numberPart.length },
    });
  },
});
