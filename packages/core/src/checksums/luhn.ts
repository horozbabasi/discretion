/**
 * The Luhn algorithm (ISO/IEC 7812-1), also called mod-10 double-add-double.
 *
 * Used by far more than credit cards: Canada's SIN, Sweden's Personnummer,
 * South Africa's ID number, Israel's Teudat Zehut, the US NPI (over a
 * prefixed string), Greece's AFM and IMEI all close with a Luhn digit.
 *
 * The algorithm, right to left over the FULL number including its check
 * digit: double every second digit, subtract 9 from any result above 9, sum
 * everything. The number is valid when that total is divisible by 10.
 *
 * Luhn catches every single-digit error and every adjacent transposition
 * except 09↔90 — a property the tests assert directly rather than trusting.
 */

import { toDigits } from './digits.js';

/**
 * Validate a digit string against Luhn.
 *
 * `value` must already be stripped of separators and contain only ASCII
 * digits; anything else returns `false`. A single digit is rejected: a
 * one-character "identifier" carries no payload, and accepting "0" would make
 * every scheme that closes with Luhn match a bare zero.
 */
export function luhnValid(value: string): boolean {
  const digits = toDigits(value);
  if (digits === null || digits.length < 2) return false;
  return luhnSum(digits) % 10 === 0;
}

/**
 * The Luhn check digit for a payload that does NOT yet include one.
 *
 * Returns `null` if the payload is not all digits. Used by the test-vector
 * generators — and later by M4's surrogate substitution, which must emit
 * replacement values that still pass the validator.
 */
export function luhnCheckDigit(payload: string): number | null {
  const digits = toDigits(payload);
  if (digits === null) return null;
  // Append a placeholder 0, compute the sum, and take the complement.
  const sum = luhnSum([...digits, 0]);
  return (10 - (sum % 10)) % 10;
}

/**
 * Sum the Luhn-transformed digits of a complete number.
 *
 * Doubling starts at the second digit from the right, i.e. positions of the
 * same parity as the check digit are NOT doubled.
 */
function luhnSum(digits: readonly number[]): number {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i]!;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum;
}
