/**
 * VIN — ISO 3779 vehicle identification number with its check digit.
 *
 * 17 characters, no I/O/Q anywhere (they are excluded to avoid confusion
 * with 1/0). Position 9 is a check digit computed by transliterating each
 * character to a value, weighting by position, and taking mod 11 — where a
 * remainder of 10 is written 'X'.
 *
 * The check is mandatory in North America and, while technically optional
 * elsewhere, is populated by essentially every manufacturer; requiring it
 * keeps 17-character part numbers and order references out.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** ISO 3779 transliteration; I, O and Q are absent by design. */
const VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

const WEIGHTS: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** The ISO 3779 check character for a 17-character VIN. */
export function vinCheckChar(vin: string): string | null {
  if (vin.length !== 17) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = VALUES[vin[i]!];
    if (v === undefined) return null;
    sum += v * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

function validateVin(ctx: ValidationContext): ValidationResult {
  const vin = ctx.match[0].toUpperCase();
  if (/[IOQ]/.test(vin)) return invalid('VIN alphabet excludes I, O and Q');

  const expected = vinCheckChar(vin);
  if (expected === null) return invalid('character outside the VIN alphabet');
  if (vin[8] !== expected) return invalid('check digit failed');

  return valid({
    canonical: vin,
    metadata: {
      wmi: vin.slice(0, 3), // world manufacturer identifier
      modelYearCode: vin[9],
    },
    validator: 'iso3779',
  });
}

registerDetector({
  id: 'vin',
  entityType: 'VIN',
  regions: [GLOBAL_REGION],
  pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Vehicle identification numbers with the ISO 3779 check digit verified.',
  validate: validateVin,
});
