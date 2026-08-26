/**
 * Mod-97 checksums.
 *
 * Two distinct users in Stage 1:
 *   • IBAN (ISO 13616) — rearrange, transliterate, remainder must be 1.
 *   • France's NIR and Belgium's Rijksregisternummer — a two-digit key that
 *     is the complement of the payload mod 97.
 *
 * Both need modular arithmetic over numbers far wider than a JS `number`: a
 * 34-character IBAN transliterates to as many as 68 decimal digits. Rather
 * than reach for BigInt — which allocates per operation and is markedly
 * slower in the hot path of scanning arbitrary text — this computes the
 * remainder by streaming the digit string in chunks that always stay inside
 * the 2^53 safe-integer range.
 */

import { isAllDigits, toNumericString } from './digits.js';

/**
 * Remainder of a decimal string modulo `modulus`, for arbitrarily long input.
 *
 * Processes at most 13 new digits per step. The running remainder is below
 * `modulus` (≤ 97 here, but the bound holds for any modulus under 10^4), so
 * `remainder × 10^13 + chunk` stays well under Number.MAX_SAFE_INTEGER.
 *
 * Returns `null` if the string is empty or contains a non-digit.
 */
export function modString(numeric: string, modulus: number): number | null {
  if (modulus <= 0 || modulus > 10_000) return null;
  if (!isAllDigits(numeric)) return null;

  const CHUNK = 13;
  let remainder = 0;
  let i = 0;
  while (i < numeric.length) {
    const slice = numeric.slice(i, i + CHUNK);
    remainder = Number(`${remainder}${slice}`) % modulus;
    i += slice.length;
  }
  return remainder;
}

/**
 * Validate an IBAN's mod-97 checksum (ISO 13616 / ISO 7064 MOD 97-10).
 *
 * Expects an IBAN already stripped of spaces and uppercased. Country-specific
 * length and structure rules are NOT checked here — that is the IBAN
 * detector's per-country table. This function answers exactly one question:
 * does the checksum close?
 *
 * Procedure: move the first four characters (country code + check digits) to
 * the end, replace each letter with its base-36 value, and take mod 97. A
 * valid IBAN yields 1.
 */
export function ibanMod97Valid(iban: string): boolean {
  if (iban.length < 5) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = toNumericString(rearranged);
  if (numeric === null) return false;
  return modString(numeric, 97) === 1;
}

/**
 * The two IBAN check digits for a country code and BBAN with no check digits
 * yet. Returns a zero-padded two-character string, or `null` on bad input.
 *
 * Used by the test-vector generators and, from M4, by IBAN surrogate
 * substitution — SPEC.md requires a substituted IBAN to have a "valid
 * checksum, same country".
 */
export function ibanCheckDigits(countryCode: string, bban: string): string | null {
  if (countryCode.length !== 2) return null;
  const numeric = toNumericString(`${bban}${countryCode}00`);
  if (numeric === null) return null;
  const remainder = modString(numeric, 97);
  if (remainder === null) return null;
  const check = 98 - remainder;
  return check.toString(10).padStart(2, '0');
}

/**
 * The "97 minus remainder" key used by France's NIR and Belgium's national
 * register number: `97 − (payload mod 97)`, in the range 1..97.
 *
 * Returns `null` if the payload is not a decimal string.
 */
export function mod97Key(payload: string): number | null {
  const remainder = modString(payload, 97);
  if (remainder === null) return null;
  return 97 - remainder;
}
