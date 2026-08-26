/**
 * Peru: DNI — eight digits with no public checksum; only the labeled
 * writing ("DNI 12345678", "DNI: 12345678", "DNI N° 12345678") is claimed,
 * span narrowed to the number, MEDIUM.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-pe-dni',
  entityType: 'NATIONAL_ID',
  regions: ['PE'],
  pattern: /\bDNI(?:\s*(?:N[°º.]?|No\.?))?:?\s*(\d{8})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Peruvian DNI in labeled notation (no public checksum).',
  validate(ctx): ValidationResult {
    const numberPart = ctx.match[1]!;
    const start = ctx.start + ctx.match[0].lastIndexOf(numberPart);
    return valid({
      canonical: numberPart,
      metadata: { scheme: 'dni', country: 'PE' },
      validator: 'dni-labeled',
      span: { start, end: start + numberPart.length },
    });
  },
});
