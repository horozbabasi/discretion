/**
 * ICAO 9303 machine-readable-zone check digits.
 *
 * One weighting for every MRZ field on every document type: cycle the
 * weights 7, 3, 1 across the field, mapping '0'–'9' to their value, 'A'–'Z'
 * to 10–35, and the filler '<' to 0; the check digit is the sum mod 10.
 *
 * Lives in the checksum library rather than in the MRZ detector because
 * SPEC.md wants each algorithm implemented and tested once, and TD1, TD2,
 * TD3 and the composite check all call it with different slices.
 */

const WEIGHTS: readonly number[] = [7, 3, 1];

/**
 * Character value under the MRZ scheme: digits are themselves, letters are
 * 10 + their alphabet position, '<' is 0. Returns null for anything else.
 */
export function mrzCharValue(ch: string): number | null {
  if (ch === '<') return 0;
  const code = ch.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41 + 10;
  return null;
}

/**
 * The ICAO check digit for a field. Returns null if the field contains a
 * character outside the MRZ alphabet.
 */
export function mrzCheckDigit(field: string): number | null {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const v = mrzCharValue(field[i]!);
    if (v === null) return null;
    sum += v * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

/**
 * Verify a field against its trailing check character.
 *
 * The check character may itself be '<' in the optional-data field of some
 * documents, which ICAO treats as zero — handled by `mrzCharValue`.
 */
export function mrzCheckValid(field: string, check: string): boolean {
  if (check.length !== 1) return false;
  const expected = mrzCheckDigit(field);
  if (expected === null) return false;
  const actual = mrzCharValue(check);
  return actual !== null && actual === expected;
}
