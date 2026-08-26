/**
 * Taiwan: National ID — a region letter, a gender digit (1/2; 8/9 for the
 * new resident-certificate format), then eight digits. The letter maps to a
 * two-digit code via the published table; tens digit ×1, ones ×9, then the
 * eight payload digits weighted 8..1 (wait — 8,7,6,5,4,3,2,1) plus the
 * check digit ×1 must sum ≡ 0 (mod 10).
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

/** The published letter→code table (not alphabetical for I, O, W–Z). */
const LETTER_CODES: Readonly<Record<string, number>> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18,
  K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27,
  U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

registerDetector({
  id: 'national-id-tw',
  entityType: 'NATIONAL_ID',
  regions: ['TW'],
  pattern: /\b([A-Z])([1289])(\d{7})(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Taiwanese National ID with the letter-code mod-10 check.',
  validate(ctx): ValidationResult {
    const code = LETTER_CODES[ctx.match[1]!]!;
    const digits = `${ctx.match[2]}${ctx.match[3]}`;
    let sum = Math.floor(code / 10) + (code % 10) * 9;
    const weights = [8, 7, 6, 5, 4, 3, 2, 1];
    for (let i = 0; i < 8; i++) sum += Number(digits[i]) * weights[i]!;
    sum += Number(ctx.match[4]);
    if (sum % 10 !== 0) return invalid('mod-10 check failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'tw-id', country: 'TW' },
      validator: 'tw-mod10',
    });
  },
});
