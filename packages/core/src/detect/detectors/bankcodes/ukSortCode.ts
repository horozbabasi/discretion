/**
 * UK_SORT_CODE — six digits in the conventional 00-00-00 writing.
 *
 * NO CHECKSUM EXISTS for sort codes, so this is a structural detector and
 * is capped at MEDIUM by design — SPEC.md forbids high confidence without a
 * validator, and no validator is possible. Only the hyphenated form is
 * matched: a bare six-digit run ("123456") is any quantity in the world,
 * while the 2-2-2 hyphenation is the standard banking notation and rarely
 * anything else. Stage 3 trigger evidence ("sort code", "acct") is what
 * will raise or suppress these later.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateSortCode(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer sequence');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer sequence');

  const digits = ctx.match[0].replace(/-/g, '');
  return valid({
    canonical: digits,
    validator: 'sort-code-structural',
  });
}

registerDetector({
  id: 'uk-sort-code',
  entityType: 'UK_SORT_CODE',
  regions: ['GB'],
  pattern: /\b\d{2}-\d{2}-\d{2}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'UK sort codes in 00-00-00 notation. No checksum exists; capped at MEDIUM.',
  validate: validateSortCode,
});
