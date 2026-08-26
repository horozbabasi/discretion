/**
 * Belgium: Rijksregisternummer — YY.MM.DD-xxx.cc with a mod-97 check:
 * cc = 97 − (first nine digits mod 97). For people born in or after 2000
 * the nine digits are checked with a leading '2' prepended; the validator
 * accepts whichever century closes, and reports it.
 */

import { modString } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-be-rijksregister',
  entityType: 'NATIONAL_ID',
  regions: ['BE'],
  pattern: /\b(\d{2})[. ]?(\d{2})[. ]?(\d{2})[- ]?(\d{3})[. ]?(\d{2})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Belgian national register numbers with the century-aware mod-97 check.',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[2]);
    // Ordinary months, plus the +20/+40 BIS-register offsets.
    const monthValid =
      (month >= 1 && month <= 12) || (month >= 21 && month <= 32) || (month >= 41 && month <= 52) || month === 0;
    if (!monthValid) return invalid('implausible month field');
    const day = Number(ctx.match[3]);
    if (day > 31) return invalid('implausible day field');

    const nine = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`;
    const check = Number(ctx.match[5]);

    const r1900 = modString(nine, 97)!;
    const r2000 = modString(`2${nine}`, 97)!;
    let century: number;
    if (97 - r1900 === check) century = 1900;
    else if (97 - r2000 === check) century = 2000;
    else return invalid('mod-97 check failed for both centuries');

    return valid({
      canonical: `${nine}${ctx.match[5]}`,
      metadata: { scheme: 'rijksregister', country: 'BE', century },
      validator: 'rrn-mod97',
    });
  },
});
