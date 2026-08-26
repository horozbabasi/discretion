/**
 * AU_BSB — Australian Bank-State-Branch codes, XXX-XXX.
 *
 * There is NO checksum, and the folk "third digit is the state" rule has
 * real exceptions (640-xxx and 80x-xxx exist), so encoding it would reject
 * genuine BSBs. What remains trustworthy is the notation itself: the
 * hyphenated 3-3 grouping is banking convention and little else. MEDIUM,
 * structure-only, stated plainly — Stage 3 triggers ("BSB") do the rest.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateBsb(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer sequence');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer sequence');

  const digits = ctx.match[0].replace(/-/g, '');
  return valid({
    canonical: digits,
    validator: 'bsb-structural',
  });
}

registerDetector({
  id: 'au-bsb',
  entityType: 'AU_BSB',
  regions: ['AU'],
  pattern: /\b\d{3}-\d{3}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Australian BSB codes in XXX-XXX notation. No checksum exists; capped at MEDIUM.',
  validate: validateBsb,
});
