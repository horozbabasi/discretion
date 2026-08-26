/**
 * ISO/IEC 7064 check character systems.
 *
 * A family of standardized checksums, of which Stage 1 needs several:
 *   • MOD 11-2  — China's Resident Identity Card (check char 0-9 or 'X')
 *   • MOD 97-10 — the system underlying IBAN and several VAT schemes
 *   • MOD 37-36 — alphanumeric identifiers
 *   • MOD 11-10 — a hybrid system used by some national registries
 *
 * The "pure" systems (MOD M-R, where R is a power used as a multiplier) all
 * share one recurrence, so it is written once here and parameterized by
 * modulus and radix. That is exactly the reuse SPEC.md asks for: these are
 * the same algorithm with different constants, and implementing MOD 11-2 by
 * hand per country is how transcription bugs get in.
 *
 * Pure system recurrence, over the payload characters:
 *     P ← ((P + aᵢ) × R) mod M
 * The check value is then (M + 1 − P) mod M. Verification appends the check
 * value with a final addition instead of a multiplication and requires the
 * result to be 1.
 */

import { alphanumericValue } from './digits.js';

/** Character set for MOD 37-36: 0-9, A-Z, then '*' for the value 36. */
const MOD37_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ*';

/**
 * Run the pure-system recurrence over a sequence of character values.
 * Returns the interim value P after the final multiplication.
 */
function pureInterim(values: readonly number[], modulus: number, radix: number): number {
  let p = 0;
  for (const v of values) {
    p = ((p + v) * radix) % modulus;
  }
  return p;
}

/**
 * The check value for a payload under a pure ISO 7064 system.
 *
 * Returns a number in `[0, modulus)`. Callers map it to a character according
 * to their scheme's alphabet (10 → 'X' for MOD 11-2, for instance).
 */
export function iso7064PureCheckValue(
  values: readonly number[],
  modulus: number,
  radix: number,
): number {
  return (modulus + 1 - pureInterim(values, modulus, radix)) % modulus;
}

/**
 * Verify a payload plus its check value under a pure ISO 7064 system.
 *
 * The standard verification processes the payload with the multiplying
 * recurrence, then adds the check value once and requires a result of 1.
 */
export function iso7064PureValid(
  payloadValues: readonly number[],
  checkValue: number,
  modulus: number,
  radix: number,
): boolean {
  const p = pureInterim(payloadValues, modulus, radix);
  return (p + checkValue) % modulus === 1;
}

/**
 * ISO 7064 MOD 11-2 over a decimal payload.
 *
 * `payload` must be all ASCII digits; `check` is the trailing check character,
 * either a digit or 'X'/'x' representing 10. This is China's Resident
 * Identity Card checksum.
 */
export function mod11_2Valid(payload: string, check: string): boolean {
  const values: number[] = [];
  for (const ch of payload) {
    const v = alphanumericValue(ch);
    if (v === null || v > 9) return false; // digits only
    values.push(v);
  }
  if (values.length === 0) return false;

  const checkValue = parseCheckChar(check, 11);
  if (checkValue === null) return false;

  return iso7064PureValid(values, checkValue, 11, 2);
}

/**
 * The MOD 11-2 check character for a decimal payload: '0'–'9' or 'X'.
 * Returns `null` if the payload contains a non-digit.
 */
export function mod11_2CheckChar(payload: string): string | null {
  const values: number[] = [];
  for (const ch of payload) {
    const v = alphanumericValue(ch);
    if (v === null || v > 9) return null;
    values.push(v);
  }
  if (values.length === 0) return null;
  const check = iso7064PureCheckValue(values, 11, 2);
  return check === 10 ? 'X' : check.toString(10);
}

/**
 * ISO 7064 MOD 37-36 over an alphanumeric payload, with a check character
 * drawn from 0-9, A-Z, '*'.
 */
export function mod37_36Valid(payload: string, check: string): boolean {
  const values: number[] = [];
  for (const ch of payload) {
    const v = alphanumericValue(ch);
    if (v === null) return false;
    values.push(v);
  }
  if (values.length === 0) return false;

  const checkValue = MOD37_ALPHABET.indexOf(check.toUpperCase());
  if (checkValue < 0) return false;

  return iso7064PureValid(values, checkValue, 37, 36);
}

/**
 * ISO 7064 MOD 11-10, a hybrid system. Unlike the pure systems this carries
 * the running value through a different recurrence and closes with a single
 * decimal check digit.
 *
 *     P ← 10  (seed)
 *     for each digit d:  P ← ((P mod 11) + d) mod 10, folding 0 to 10, ×2 mod 11
 *
 * Expressed in the standard's own terms below.
 */
export function mod11_10CheckDigit(payload: string): number | null {
  let p = 10;
  for (const ch of payload) {
    const v = alphanumericValue(ch);
    if (v === null || v > 9) return null;
    let sum = (p + v) % 10;
    if (sum === 0) sum = 10;
    p = (sum * 2) % 11;
  }
  const check = (11 - p) % 10;
  return check;
}

/** Verify a decimal payload plus trailing check digit under MOD 11-10. */
export function mod11_10Valid(payload: string, check: string): boolean {
  const expected = mod11_10CheckDigit(payload);
  if (expected === null) return false;
  const actual = parseCheckChar(check, 10);
  return actual !== null && actual === expected;
}

/**
 * Parse a single check character to its numeric value.
 * 'X'/'x' maps to 10 only when the modulus admits it (MOD 11-2).
 */
function parseCheckChar(check: string, modulus: number): number | null {
  if (check.length !== 1) return null;
  if (modulus === 11 && (check === 'X' || check === 'x')) return 10;
  const v = alphanumericValue(check);
  if (v === null || v >= modulus || v > 9) return null;
  return v;
}
