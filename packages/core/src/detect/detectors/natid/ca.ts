/**
 * Canada: Social Insurance Number — nine digits closed by Luhn (a real
 * checksum, HIGH). The leading digit encodes the registration region; 0 is
 * unissued and 8 is not used. The canonical test SIN 046 454 286 (used in
 * every CRA developer document) is non-sensitive.
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-ca-sin',
  entityType: 'NATIONAL_ID',
  regions: ['CA'],
  pattern: /\b(\d{3})[- ](\d{3})[- ](\d{3})\b|\b(\d{9})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Canadian SINs: Luhn-checksummed, delimited or contiguous.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

    const digits = ctx.match[0].replace(/[- ]/g, '');
    const first = digits[0]!;
    if (first === '8') return invalid('unissued leading digit');
    if (!luhnValid(digits)) return invalid('Luhn checksum failed');
    // Leading 0 is not issued to people — which is exactly why the CRA's
    // documentation specimens (046 454 286 et al.) use it. A Luhn-valid
    // 0-leading SIN is detected but is definitionally not a real SIN.
    return valid({
      canonical: digits,
      sensitive: first !== '0',
      metadata: { scheme: 'sin', country: 'CA' },
      validator: 'luhn',
    });
  },
});
