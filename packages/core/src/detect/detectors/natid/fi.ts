/**
 * Finland: Henkilötunnus (HETU) — DDMMYY, a century sign, a 3-digit
 * individual number, and a base-31 check character over the nine digits:
 * "0123456789ABCDEFHJKLMNPRSTUVWXY"[DDMMYYNNN mod 31] (G, I, O, Q and Z are
 * excluded from the alphabet). Century signs: '+' 1800s, '-' 1900s, and the
 * letters A–F for the 2000s (the 2023 reform made U–Y valid for the 1900s;
 * accepted).
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const HETU_ALPHABET = '0123456789ABCDEFHJKLMNPRSTUVWXY';
const CENTURY_SIGNS = /^[-+A-FU-Y]$/;

registerDetector({
  id: 'national-id-fi-hetu',
  entityType: 'NATIONAL_ID',
  regions: ['FI'],
  pattern: /\b(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-Y])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Finnish HETU with the base-31 check character verified.',
  validate(ctx): ValidationResult {
    const day = Number(ctx.match[1]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    if (!CENTURY_SIGNS.test(ctx.match[4]!)) return invalid('not a century sign');

    const nine = Number(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[5]}`);
    const expected = HETU_ALPHABET[nine % 31]!;
    if (ctx.match[6] !== expected) return invalid('base-31 check character failed');

    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'hetu', country: 'FI' },
      validator: 'hetu-mod31',
    });
  },
});
