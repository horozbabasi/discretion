/**
 * Croatia: OIB — eleven digits closed by ISO 7064 MOD 11,10, straight from
 * the shared library.
 */

import { mod11_10Valid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-hr-oib',
  entityType: 'NATIONAL_ID',
  regions: ['HR'],
  pattern: /\b\d{11}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Croatian OIB: ISO 7064 MOD 11,10.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const value = ctx.match[0];
    if (!mod11_10Valid(value.slice(0, 10), value[10]!)) return invalid('MOD 11,10 failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'oib', country: 'HR' },
      validator: 'iso7064-11-10',
    });
  },
});
