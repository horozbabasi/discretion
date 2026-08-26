/**
 * The ABA routing transit number checksum (US_ROUTING_NUMBER).
 *
 * A nine-digit number whose positional weights cycle 3, 7, 1. The number is
 * valid when the weighted sum is divisible by 10.
 *
 * Kept in its own module rather than inlined in the detector because the same
 * 3-7-1 pattern appears in other North American banking identifiers, and
 * because "which weight goes first" is exactly the kind of detail that is
 * worth pinning with its own tests.
 */

import { toDigits } from './digits.js';
import { cyclicWeightedMod } from './weighted.js';

/** ABA positional weights, cycling across the nine digits. */
const ABA_WEIGHTS: readonly number[] = [3, 7, 1];

/**
 * Validate a nine-digit ABA routing number.
 *
 * Length is enforced here because the checksum alone is weak — a shorter or
 * longer digit run can satisfy it by chance, and every real routing number is
 * exactly nine digits.
 */
export function abaValid(value: string): boolean {
  if (value.length !== 9) return false;
  const digits = toDigits(value);
  if (digits === null) return false;
  return cyclicWeightedMod(digits, ABA_WEIGHTS, 10) === 0;
}

/**
 * The final ABA check digit for the first eight digits of a routing number.
 * Returns `null` if the payload is not exactly eight digits.
 */
export function abaCheckDigit(payload: string): number | null {
  if (payload.length !== 8) return null;
  const digits = toDigits(payload);
  if (digits === null) return null;
  const partial = cyclicWeightedMod(digits, ABA_WEIGHTS, 10);
  if (partial === null) return null;
  // The ninth position carries weight 1 (index 8 → 8 % 3 === 2 → weight 1).
  return (10 - partial) % 10;
}
