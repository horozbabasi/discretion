/**
 * Iceland: Kennitala — DDMMYY-NNCX where C is a mod-11 check over the first
 * eight digits (weights 3,2,7,6,5,4,3,2; remainder result 10 unissuable)
 * and X is the century digit (9 → 1900s, 0 → 2000s, 8 → 1800s). Company
 * kennitölur add 40 to the day and are accepted as such.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const KT_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

registerDetector({
  id: 'national-id-is-kennitala',
  entityType: 'NATIONAL_ID',
  regions: ['IS'],
  pattern: /\b(\d{2})(\d{2})(\d{2})-?(\d{2})(\d)(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Icelandic kennitala with its mod-11 check digit; company numbers included.',
  validate(ctx): ValidationResult {
    const day = Number(ctx.match[1]);
    const company = day >= 41 && day <= 71;
    if (!(day >= 1 && day <= 31) && !company) return invalid('day out of range');
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const century = ctx.match[6]!;
    if (century !== '8' && century !== '9' && century !== '0') return invalid('not a century digit');

    const eight = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`)!;
    let check = 11 - weightedMod(eight, KT_WEIGHTS, 11)!;
    if (check === 11) check = 0;
    if (check === 10 || check !== Number(ctx.match[5])) return invalid('mod-11 check failed');

    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}${ctx.match[5]}${century}`,
      metadata: { scheme: 'kennitala', country: 'IS', company },
      validator: 'kennitala-mod11',
    });
  },
});
