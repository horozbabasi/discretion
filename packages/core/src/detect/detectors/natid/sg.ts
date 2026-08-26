/**
 * Singapore: NRIC/FIN — S/T/F/G/M + seven digits + check letter.
 * Weights 2,7,6,5,4,3,2; T and G add 4 to the sum, M adds 3; the letter
 * comes from the series table: S/T → JZIHGFEDCBA, F/G → XWUTRQPNMLK,
 * M → KLJNPQRTUWX, indexed by sum mod 11.
 */

import { toDigits, weightedSum } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const NRIC_WEIGHTS = [2, 7, 6, 5, 4, 3, 2];
const TABLE_ST = 'JZIHGFEDCBA';
const TABLE_FG = 'XWUTRQPNMLK';
const TABLE_M = 'KLJNPQRTUWX';

registerDetector({
  id: 'national-id-sg-nric',
  entityType: 'NATIONAL_ID',
  regions: ['SG'],
  pattern: /\b([STFGM])(\d{7})([A-Z])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Singaporean NRIC/FIN with the series-offset check letter.',
  validate(ctx): ValidationResult {
    const series = ctx.match[1]!;
    let sum = weightedSum(toDigits(ctx.match[2]!)!, NRIC_WEIGHTS)!;
    if (series === 'T' || series === 'G') sum += 4;
    if (series === 'M') sum += 3;
    const index = sum % 11;
    const table = series === 'S' || series === 'T' ? TABLE_ST : series === 'M' ? TABLE_M : TABLE_FG;
    if (ctx.match[3] !== table[index]) return invalid('check letter failed');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'nric', country: 'SG', series },
      validator: 'nric-mod11',
    });
  },
});
