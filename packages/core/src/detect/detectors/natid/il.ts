/**
 * Israel: Teudat Zehut — nine digits closed by the Luhn variant SPEC.md
 * references: double every second digit from the LEFT, sum the digit sums,
 * divisible by 10. On a nine-digit number that parity coincides exactly
 * with standard right-anchored Luhn, so the shared library applies —
 * verified by the tests rather than assumed. Short older numbers are
 * written zero-padded to nine.
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-il-teudat-zehut',
  entityType: 'NATIONAL_ID',
  regions: ['IL'],
  pattern: /\b\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Israeli Teudat Zehut: nine digits under the left-anchored Luhn variant.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const value = ctx.match[0];
    if (value === '000000000') return invalid('all zeros');
    if (!luhnValid(value)) return invalid('checksum failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'teudat-zehut', country: 'IL' },
      validator: 'luhn',
    });
  },
});
