/**
 * Digit and character helpers shared by every checksum implementation.
 *
 * These exist so that the algorithm modules (luhn, mod97, verhoeff, …) deal
 * only in `number[]` and never re-implement parsing. Every function here is
 * total: it returns `null` on malformed input rather than throwing, because
 * checksum code runs on arbitrary user text where malformed input is the
 * common case, not an exceptional one.
 */

/** ASCII '0'–'9'. */
const ZERO = 0x30;
const NINE = 0x39;

/**
 * Parse a string of ASCII digits into numeric digit values.
 *
 * Returns `null` if the string is empty or contains any non-digit character.
 * Deliberately rejects non-ASCII digits (Arabic-Indic ٤, fullwidth ４, …):
 * Stage 0 normalization already folds fullwidth forms to ASCII, and a
 * genuinely non-ASCII digit run is not an identifier in any scheme we
 * validate.
 */
export function toDigits(value: string): number[] | null {
  if (value.length === 0) return null;
  const digits: number[] = new Array<number>(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < ZERO || code > NINE) return null;
    digits[i] = code - ZERO;
  }
  return digits;
}

/**
 * Remove every character in `separators` from `value`.
 *
 * Identifiers are routinely written with grouping punctuation (`4111 1111
 * 1111 1111`, `123-45-6789`, `AB-12-CD`). Detectors strip before validating
 * and keep the raw span for offset reporting.
 */
export function stripSeparators(value: string, separators = ' \t-.–—/'): string {
  let out = '';
  for (const ch of value) {
    if (!separators.includes(ch)) out += ch;
  }
  return out;
}

/**
 * Value of an alphanumeric character in base 36: '0'–'9' → 0–9,
 * 'A'/'a'–'Z'/'z' → 10–35. Returns `null` for anything else.
 *
 * This is the mapping IBAN's mod-97 and several VAT schemes use to fold
 * letters into the numeric checksum.
 */
export function alphanumericValue(ch: string): number | null {
  if (ch.length !== 1) return null;
  const code = ch.charCodeAt(0);
  if (code >= ZERO && code <= NINE) return code - ZERO;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41 + 10; // A-Z
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 10; // a-z
  return null;
}

/**
 * Expand every character of `value` to its base-36 value and concatenate the
 * decimal representations, the transformation IBAN mod-97 requires.
 *
 * "GB82" → "161182"  (G=16, B=11, 8, 2)
 *
 * Returns `null` if any character is not alphanumeric.
 */
export function toNumericString(value: string): string | null {
  let out = '';
  for (const ch of value) {
    const v = alphanumericValue(ch);
    if (v === null) return null;
    out += v.toString(10);
  }
  return out;
}

/** True when every character is an ASCII digit and the string is non-empty. */
export function isAllDigits(value: string): boolean {
  if (value.length === 0) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < ZERO || code > NINE) return false;
  }
  return true;
}

/**
 * True when every digit is identical ("0000000000", "1111111111").
 *
 * Repdigits pass several national checksums by construction (a weighted sum
 * of identical digits often lands on a valid remainder) yet are never issued.
 * Schemes that exclude them say so in their own validator.
 */
export function isRepdigit(digits: readonly number[]): boolean {
  if (digits.length === 0) return false;
  const first = digits[0]!;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== first) return false;
  }
  return true;
}
