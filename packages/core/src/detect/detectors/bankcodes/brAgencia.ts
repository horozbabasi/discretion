/**
 * BR_AGENCIA — Brazilian bank branch codes.
 *
 * A bare four-digit agência is indistinguishable from any other four-digit
 * number, and its optional check digit follows PER-BANK rules (Banco do
 * Brasil mod-11, Bradesco a mod-10 variant) that cannot be verified without
 * knowing the bank. So the FORMAT here includes the label — "ag.", "agência",
 * "agencia" — which is part of how the identifier is actually written, the
 * same way a URL's scheme is part of a URL. This is not Stage 3 context
 * scoring; it is the notation. The span is narrowed to the number so the
 * label is never masked. MEDIUM: the label plus shape is real evidence, but
 * no checksum was verified.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateAgencia(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const numberPart = ctx.match[1];
  if (numberPart === undefined) return invalid('no branch number captured');

  const numberStart = ctx.start + raw.lastIndexOf(numberPart);
  const after = ctx.text[ctx.end];
  if (after !== undefined && /[\d-]/.test(after)) return invalid('fragment of a longer sequence');

  const [branch, check] = numberPart.split('-') as [string, string | undefined];
  return valid({
    canonical: numberPart,
    metadata: { branch, ...(check !== undefined ? { checkDigit: check } : {}) },
    validator: 'agencia-labeled',
    span: { start: numberStart, end: ctx.start + raw.length },
  });
}

registerDetector({
  id: 'br-agencia',
  entityType: 'BR_AGENCIA',
  regions: ['BR'],
  // The label is part of the notation; accents survive normalization.
  pattern: /\b[Aa]g(?:ência|encia|\.)?\s*:?\s*(\d{4}(?:-\d)?)\b/gu,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Brazilian agência branch codes in their labeled notation; span covers the number only.',
  validate: validateAgencia,
});
