/**
 * Ukraine: RNOKPP (РНОКПП, the individual tax number) — ten digits, weights
 * −1,5,7,9,4,6,10,5,7 over the first nine, check = (sum mod 11) mod 10.
 * The negative first weight is genuine, not a transcription error.
 */

import { toDigits } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const RNOKPP_WEIGHTS = [-1, 5, 7, 9, 4, 6, 10, 5, 7];

registerDetector({
  id: 'national-id-ua-rnokpp',
  entityType: 'TAX_ID',
  regions: ['UA'],
  pattern: /\b\d{10}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Ukrainian RNOKPP with its negative-first-weight mod-11 check.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const d = toDigits(ctx.match[0])!;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += d[i]! * RNOKPP_WEIGHTS[i]!;
    const check = ((sum % 11) + 11) % 11 % 10;
    if (check !== d[9]) return invalid('RNOKPP check failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'rnokpp', country: 'UA' },
      validator: 'rnokpp-mod11',
    });
  },
});
