/**
 * Colombia: NIT — a digit body (typically dotted) plus a DIAN check digit:
 * prime weights 3,7,13,17,19,23,29,37,41,43,47,53,59,67,71 applied from
 * the RIGHT; remainder r = sum mod 11; check = r > 1 ? 11 − r : r. The
 * r ∈ {0,1} identity branch is a fold (check 1 ⇐ r=1 or r=10), so the
 * mutation property is validation-only.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** The DIAN check digit for a NIT body. */
export function nitCheckDigit(body: string): number | null {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    if (Number.isNaN(d)) return null;
    sum += d * NIT_WEIGHTS[i]!;
  }
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

registerDetector({
  id: 'national-id-co-nit',
  entityType: 'TAX_ID',
  regions: ['CO'],
  pattern: /\b(\d{1,3}(?:\.\d{3}){2,3}|\d{8,10})-(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Colombian NIT with the DIAN prime-weight check digit.',
  validate(ctx): ValidationResult {
    const body = ctx.match[1]!.replace(/\./g, '');
    const expected = nitCheckDigit(body);
    if (expected === null || expected !== Number(ctx.match[2])) {
      return invalid('NIT check digit failed');
    }
    return valid({
      canonical: `${body}${ctx.match[2]}`,
      metadata: { scheme: 'nit', country: 'CO' },
      validator: 'nit-mod11',
    });
  },
});
