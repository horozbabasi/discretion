/**
 * The Verhoeff check digit algorithm.
 *
 * Required by India's Aadhaar. Unlike Luhn it is built on the dihedral group
 * D₅ rather than modular arithmetic, which is why it catches ALL single-digit
 * errors and ALL adjacent transpositions — including 09↔90, the one case Luhn
 * misses. That completeness is the whole reason Aadhaar chose it, so the
 * tests assert both properties exhaustively over generated inputs rather than
 * spot-checking a few vectors.
 *
 * The three tables below are the standard published ones:
 *   d — the D₅ Cayley (multiplication) table
 *   p — the permutation table, applied position-dependently
 *   inv — the multiplicative inverse used to derive a check digit
 */

import { toDigits } from './digits.js';

/** D₅ multiplication table. */
const D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

/** Permutation table; row index is position mod 8. */
const P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Multiplicative inverse in D₅. */
const INV: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validate a complete digit string (payload plus trailing check digit).
 *
 * Returns `false` for non-digit input or fewer than two digits.
 */
export function verhoeffValid(value: string): boolean {
  const digits = toDigits(value);
  if (digits === null || digits.length < 2) return false;
  return verhoeffInterim(digits) === 0;
}

/**
 * The Verhoeff check digit for a payload that does NOT include one.
 *
 * Returns `null` if the payload is not all digits.
 */
export function verhoeffCheckDigit(payload: string): number | null {
  const digits = toDigits(payload);
  if (digits === null) return null;
  // Shift by one position by appending a zero, then invert the interim value.
  const c = verhoeffInterim([...digits, 0]);
  return INV[c]!;
}

/**
 * Fold the digits right-to-left through the permutation and D₅ tables.
 * The result is 0 exactly when the number carries a correct check digit.
 */
function verhoeffInterim(digits: readonly number[]): number {
  let c = 0;
  const reversed = [...digits].reverse();
  for (let i = 0; i < reversed.length; i++) {
    const permuted = P[i % 8]![reversed[i]!]!;
    c = D[c]![permuted]!;
  }
  return c;
}
