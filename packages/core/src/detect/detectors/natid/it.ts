/**
 * Italy: Codice Fiscale — 16 characters closed by the full CIN algorithm.
 *
 * Odd positions (1st, 3rd, … 1-based) use the published odd-value table,
 * even positions the even table; the sum mod 26 indexes A–Z for the check
 * letter. The month letter must be one of ABCDEHLMPRST and the day field
 * 01–31 or 41–71 (women add 40). Both tables are transcribed in full from
 * the Agenzia delle Entrate specification.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const ODD: Readonly<Record<string, number>> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const EVEN: Readonly<Record<string, number>> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const MONTH_LETTERS = new Set([...'ABCDEHLMPRST']);

/** The published CIN check letter for the first fifteen characters. */
export function codiceFiscaleCin(fifteen: string): string | null {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = fifteen[i]!;
    const table = i % 2 === 0 ? ODD : EVEN; // i is 0-based; 1-based odd = 0-based even index
    const v = table[ch];
    if (v === undefined) return null;
    sum += v;
  }
  return String.fromCharCode(65 + (sum % 26));
}

registerDetector({
  id: 'national-id-it-codice-fiscale',
  entityType: 'NATIONAL_ID',
  regions: ['IT'],
  pattern: /\b([A-Z]{6})(\d{2})([A-Z])(\d{2})([A-Z]\d{3})([A-Z])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Italian Codice Fiscale with the full CIN check-letter algorithm.',
  validate(ctx): ValidationResult {
    const month = ctx.match[3]!;
    if (!MONTH_LETTERS.has(month)) return invalid('not a month letter');
    const day = Number(ctx.match[4]);
    const dayValid = (day >= 1 && day <= 31) || (day >= 41 && day <= 71);
    if (!dayValid) return invalid('day field out of range');

    const value = ctx.match[0];
    const expected = codiceFiscaleCin(value.slice(0, 15));
    if (expected === null || value[15] !== expected) return invalid('CIN check letter failed');

    return valid({
      canonical: value,
      metadata: { scheme: 'codice-fiscale', country: 'IT', female: day >= 41 },
      validator: 'cin',
    });
  },
});
