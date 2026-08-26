/**
 * Mexico: CURP and RFC.
 *
 * CURP — eighteen characters with a REAL check digit: the first seventeen
 * are valued through the RENAPO alphabet (0–9 then A–Z with Ñ between N
 * and O), weighted 18 down to 2, and the check is (10 − sum mod 10) mod 10.
 * The state field must be one of the 32 states or NE (born abroad).
 *
 * RFC — the persona-física 4-letter + date + 3-char homoclave form. The
 * homoclave's final character is derived from an SAT table with unpublished
 * collision-resolution quirks, so RFC validates structurally (date gate) at
 * MEDIUM and says so.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const CURP_ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

const MX_STATES = new Set([
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR',
  'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP',
  'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE',
]);

/** The RENAPO check digit over the first seventeen characters. */
export function curpCheckDigit(seventeen: string): number | null {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = CURP_ALPHABET.indexOf(seventeen[i]!);
    if (value < 0) return null;
    sum += value * (18 - i);
  }
  return (10 - (sum % 10)) % 10;
}

registerDetector({
  id: 'national-id-mx-curp',
  entityType: 'NATIONAL_ID',
  regions: ['MX'],
  pattern: /\b([A-ZÑ]{4})(\d{2})(\d{2})(\d{2})([HM])([A-Z]{2})([A-ZÑ]{3})([0-9A-Z])(\d)\b/gu,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Mexican CURP: state code, date, sex and the RENAPO check digit.',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[3]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[4]);
    if (day < 1 || day > 31) return invalid('day out of range');
    if (!MX_STATES.has(ctx.match[6]!)) return invalid('not a state code');

    const value = ctx.match[0];
    const expected = curpCheckDigit(value.slice(0, 17));
    if (expected === null || expected !== Number(value[17])) {
      return invalid('RENAPO check digit failed');
    }
    return valid({
      canonical: value,
      metadata: { scheme: 'curp', country: 'MX', state: ctx.match[6] },
      validator: 'curp-mod10',
    });
  },
});

registerDetector({
  id: 'national-id-mx-rfc',
  entityType: 'TAX_ID',
  regions: ['MX'],
  pattern: /\b([A-ZÑ&]{4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{3})\b/gu,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Mexican RFC (persona física): date-gated structure; the SAT homoclave table is unpublished.',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[3]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[4]);
    if (day < 1 || day > 31) return invalid('day out of range');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'rfc', country: 'MX' },
      validator: 'rfc-structure',
    });
  },
});
