/**
 * Turkey: TCKN and VKN.
 *
 * TCKN — SPEC.md spells the algorithm out verbatim: eleven digits, first
 * nonzero, d10 = ((d1+d3+d5+d7+d9)·7 − (d2+d4+d6+d8)) mod 10, and
 * d11 = (d1+…+d10) mod 10. Both are enforced exactly.
 *
 * VKN (tax number) — ten digits with the published transform: for each of
 * the first nine digits (1-based position p), tmp = (d + 10 − p) mod 10;
 * contribute tmp === 9 ? 9 : (tmp · 2^(10−p)) mod 9; the check digit is
 * (10 − sum mod 10) mod 10.
 */

import { toDigits } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function guard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return 'fragment of a longer number';
  return null;
}

registerDetector({
  id: 'national-id-tr-tckn',
  entityType: 'NATIONAL_ID',
  regions: ['TR'],
  pattern: /\b[1-9]\d{10}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Turkish TCKN with both check digits per the published algorithm.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const d = toDigits(ctx.match[0])!;
    const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
    const even = d[1]! + d[3]! + d[5]! + d[7]!;
    const d10 = (((odd * 7 - even) % 10) + 10) % 10;
    if (d10 !== d[9]) return invalid('tenth-digit check failed');
    const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
    if (d11 !== d[10]) return invalid('eleventh-digit check failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'tckn', country: 'TR' },
      validator: 'tckn-dual-check',
    });
  },
});

registerDetector({
  id: 'national-id-tr-vkn',
  entityType: 'TAX_ID',
  regions: ['TR'],
  pattern: /\b\d{10}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Turkish VKN tax numbers with the published transform check.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const d = toDigits(ctx.match[0])!;
    let sum = 0;
    for (let p = 1; p <= 9; p++) {
      const tmp = (d[p - 1]! + 10 - p) % 10;
      sum += tmp === 9 ? 9 : (tmp * 2 ** (10 - p)) % 9;
    }
    const check = (10 - (sum % 10)) % 10;
    if (check !== d[9]) return invalid('VKN check digit failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'vkn', country: 'TR' },
      validator: 'vkn-transform',
    });
  },
});
