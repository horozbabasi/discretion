/**
 * China: Resident Identity Card — eighteen characters: a six-digit
 * administrative division whose PROVINCE prefix must be real, an eight-digit
 * birth date validated as a date, three serial digits, and the ISO 7064
 * MOD 11-2 check character (0–9 or X) from the shared library — the
 * combination SPEC.md names.
 */

import { mod11_2Valid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

/** Published province-level division prefixes. */
const PROVINCES = new Set([
  '11', '12', '13', '14', '15', '21', '22', '23',
  '31', '32', '33', '34', '35', '36', '37',
  '41', '42', '43', '44', '45', '46',
  '50', '51', '52', '53', '54',
  '61', '62', '63', '64', '65',
  '71', '81', '82', '91',
]);

registerDetector({
  id: 'national-id-cn-ric',
  entityType: 'NATIONAL_ID',
  regions: ['CN'],
  pattern: /\b(\d{2})(\d{4})(\d{4})(\d{2})(\d{2})(\d{3})([0-9Xx])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Chinese Resident Identity Card: province, birth date, ISO 7064 MOD 11-2.',
  validate(ctx): ValidationResult {
    if (!PROVINCES.has(ctx.match[1]!)) return invalid('not a province prefix');
    const year = Number(ctx.match[3]);
    if (year < 1900 || year > 2029) return invalid('implausible birth year');
    const month = Number(ctx.match[4]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[5]);
    if (day < 1 || day > 31) return invalid('day out of range');

    const value = ctx.match[0].toUpperCase();
    if (!mod11_2Valid(value.slice(0, 17), value[17]!)) return invalid('MOD 11-2 check failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'ric', country: 'CN' },
      validator: 'iso7064-11-2',
    });
  },
});
