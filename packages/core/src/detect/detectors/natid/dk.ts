/**
 * Denmark: CPR-nummer — DDMMYY-SSSS. The historical mod-11 check was
 * OFFICIALLY ABANDONED in 2007 (serial capacity ran out), so enforcing it
 * would reject genuine numbers issued since. What remains checkable is the
 * date, so this is a structural detector at MEDIUM, hyphenated writing
 * only, and says so — the same honest posture as the UK sort code.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-dk-cpr',
  entityType: 'NATIONAL_ID',
  regions: ['DK'],
  pattern: /\b(\d{2})(\d{2})(\d{2})-(\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Danish CPR numbers: date-validated structure (the mod-11 check was abolished in 2007).',
  validate(ctx): ValidationResult {
    const day = Number(ctx.match[1]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    return valid({
      canonical: ctx.match[0].replace('-', ''),
      metadata: { scheme: 'cpr', country: 'DK' },
      validator: 'cpr-date-structure',
    });
  },
});
