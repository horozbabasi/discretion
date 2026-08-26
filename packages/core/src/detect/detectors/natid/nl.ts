/**
 * Netherlands: BSN — nine digits under the "11-proef":
 * (9·d₁ + 8·d₂ + … + 2·d₈ − d₉) mod 11 must be 0. The MINUS on the last
 * digit is what separates the BSN test from the plain divisibility tests —
 * transcribing it as +1 accepts a different (wrong) fifth of all numbers.
 */

import { toDigits } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-nl-bsn',
  entityType: 'NATIONAL_ID',
  regions: ['NL'],
  pattern: /\b\d{9}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Dutch BSNs under the 11-proef (negative final weight).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d.-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^[.-]\d/.test(after)) return invalid('fragment of a longer number');

    const digits = toDigits(ctx.match[0])!;
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i]! * (9 - i);
    sum -= digits[8]!;
    if (sum % 11 !== 0) return invalid('11-proef failed');
    if (digits.every((d) => d === 0)) return invalid('all zeros');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'bsn', country: 'NL' },
      validator: '11-proef',
    });
  },
});
