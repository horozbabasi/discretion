/**
 * Argentina: CUIT/CUIL and DNI.
 *
 * CUIT — XX-XXXXXXXX-X with a real mod-11 check: type prefix from the
 * issued set (20/23/24/25/26/27 people, 30/33/34 companies), weights
 * 5,4,3,2,7,6,5,4,3,2, check = 11 − remainder with 11→0 and 10 unissuable
 * — a bijective mapping, so the hard mutation property applies.
 *
 * DNI — seven or eight digits with NO checksum; only the labeled dotted
 * notation ("DNI 12.345.678") is claimed, span narrowed to the number,
 * MEDIUM — the same posture as the Brazilian agência.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const CUIT_PREFIXES = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34']);
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

registerDetector({
  id: 'national-id-ar-cuit',
  entityType: 'TAX_ID',
  regions: ['AR'],
  pattern: /\b(\d{2})-(\d{8})-(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Argentine CUIT/CUIL with prefix set and mod-11 check.',
  validate(ctx): ValidationResult {
    if (!CUIT_PREFIXES.has(ctx.match[1]!)) return invalid('not an issued type prefix');
    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}`)!;
    const remainder = weightedMod(digits, CUIT_WEIGHTS, 11)!;
    let check = 11 - remainder;
    if (check === 11) check = 0;
    if (check === 10) return invalid('remainder 1 is unissuable');
    if (check !== Number(ctx.match[3])) return invalid('CUIT check digit failed');
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`,
      metadata: { scheme: 'cuit', country: 'AR' },
      validator: 'cuit-mod11',
    });
  },
});

registerDetector({
  id: 'national-id-ar-dni',
  entityType: 'NATIONAL_ID',
  regions: ['AR'],
  pattern: /\bDNI:?\s*(\d{1,2}\.\d{3}\.\d{3})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Argentine DNI in labeled dotted notation (no checksum exists).',
  validate(ctx): ValidationResult {
    const numberPart = ctx.match[1]!;
    const start = ctx.start + ctx.match[0].indexOf(numberPart);
    return valid({
      canonical: numberPart.replace(/\./g, ''),
      metadata: { scheme: 'dni', country: 'AR' },
      validator: 'dni-labeled',
      span: { start, end: start + numberPart.length },
    });
  },
});
