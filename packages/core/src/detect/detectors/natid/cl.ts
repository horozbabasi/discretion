/**
 * Chile: RUT/RUN — digits (usually dotted in groups of three) plus a check
 * character 0–9 or K: cycling weights 2,3,4,5,6,7 from the RIGHT, check =
 * 11 − (sum mod 11), with 11 → 0 and 10 → 'K'. Bijective, hard-mutation
 * tested.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

/** The RUT check character for a digit body. */
export function rutCheckChar(body: string): string | null {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    const d = Number(body[i]);
    if (Number.isNaN(d)) return null;
    sum += d * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const result = 11 - (sum % 11);
  if (result === 11) return '0';
  if (result === 10) return 'K';
  return String(result);
}

registerDetector({
  id: 'national-id-cl-rut',
  entityType: 'NATIONAL_ID',
  regions: ['CL'],
  pattern: /\b(\d{1,2}(?:\.\d{3}){2}|\d{7,8})-([\dKk])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Chilean RUT with its right-cycling mod-11 check (K for 10).',
  validate(ctx): ValidationResult {
    const body = ctx.match[1]!.replace(/\./g, '');
    const expected = rutCheckChar(body);
    if (expected === null || expected !== ctx.match[2]!.toUpperCase()) {
      return invalid('RUT check character failed');
    }
    return valid({
      canonical: `${body}-${expected}`,
      metadata: { scheme: 'rut', country: 'CL' },
      validator: 'rut-mod11',
    });
  },
});
