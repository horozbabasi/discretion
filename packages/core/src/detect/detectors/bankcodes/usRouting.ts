/**
 * US_ROUTING_NUMBER — ABA checksum plus Federal Reserve prefix ranges.
 *
 * The checksum (shared library) is necessary but weak alone: one in ten
 * arbitrary 9-digit runs passes. The first two digits must also be a real
 * Federal Reserve routing symbol — 01–12 (primary districts), 21–32
 * (thrift institutions), 61–72 (electronic transaction identifiers), 80
 * (traveler's cheques). 00 is excluded deliberately: 000000000 sums to an
 * ABA-valid zero but routes nowhere.
 */

import { abaValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function prefixValid(p: number): boolean {
  return (p >= 1 && p <= 12) || (p >= 21 && p <= 32) || (p >= 61 && p <= 72) || p === 80;
}

function validateRouting(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d.-]/.test(before ?? '')) return invalid('fragment of a longer number');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^[\d]/.test(after) || /^[.-]\d/.test(after)) return invalid('fragment of a longer number');

  const digits = ctx.match[0];
  const prefix = Number(digits.slice(0, 2));
  if (!prefixValid(prefix)) return invalid('not a Federal Reserve routing prefix');
  if (!abaValid(digits)) return invalid('ABA checksum failed');

  return valid({
    canonical: digits,
    metadata: { prefix },
    validator: 'aba-frb-prefix',
  });
}

registerDetector({
  id: 'us-routing-number',
  entityType: 'US_ROUTING_NUMBER',
  regions: ['US'],
  pattern: /\b\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'US ABA routing numbers: checksum plus Federal Reserve prefix validation.',
  validate: validateRouting,
});
