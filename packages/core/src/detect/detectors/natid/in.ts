/**
 * India: Aadhaar and PAN.
 *
 * Aadhaar — twelve digits, first digit 2–9 (0 and 1 are never issued),
 * closed by Verhoeff from the shared library (the algorithm Aadhaar chose
 * precisely because it catches every single error and transposition) →
 * HIGH, hard mutation property.
 *
 * PAN — AAAPA1234A: the fourth letter is the holder-type code (P person,
 * C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority,
 * J artificial juridical person, G government) and the fifth the name
 * initial. The final letter is a check whose algorithm the Income Tax
 * Department has never published, so PAN validates structurally at MEDIUM
 * and says so.
 */

import { verhoeffValid } from '../../../checksums/index.js';
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
  id: 'national-id-in-aadhaar',
  entityType: 'NATIONAL_ID',
  regions: ['IN'],
  pattern: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Indian Aadhaar numbers, Verhoeff-verified (SPEC.md names the algorithm).',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const digits = ctx.match[0].replace(/[ -]/g, '');
    if (!verhoeffValid(digits)) return invalid('Verhoeff checksum failed');
    return valid({
      canonical: digits,
      metadata: { scheme: 'aadhaar', country: 'IN' },
      validator: 'verhoeff',
    });
  },
});

const PAN_HOLDER_TYPES = new Set([...'PCHFATBLJG']);

registerDetector({
  id: 'national-id-in-pan',
  entityType: 'TAX_ID',
  regions: ['IN'],
  pattern: /\b([A-Z]{3})([A-Z])([A-Z])(\d{4})([A-Z])\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Indian PAN: holder-type letter validated; the check letter is unpublished, hence MEDIUM.',
  validate(ctx): ValidationResult {
    if (!PAN_HOLDER_TYPES.has(ctx.match[2]!)) return invalid('fourth letter is not a holder type');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'pan', country: 'IN', holderType: ctx.match[2] },
      validator: 'pan-structure',
    });
  },
});
