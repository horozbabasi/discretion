/**
 * PASSPORT_MRZ — TD1, TD2 and TD3 machine-readable zones.
 *
 * SPEC.md: "machine-readable zone lines (TD1, TD2, TD3) with their check
 * digits. MRZ is highly reliable to detect because every field is
 * checksummed; treat a valid MRZ as maximum confidence."
 *
 * So every check digit is verified — document number, date of birth, expiry,
 * and, on TD1/TD3, the COMPOSITE check over the concatenated fields. Only
 * when all of them close does the detector emit, and then at MAXIMUM.
 * A partially-checksummed MRZ is not emitted at reduced confidence: an MRZ
 * with a broken check digit is a transcription artifact, not a passport.
 *
 * Layouts (fixed-width, '<' filler):
 *   TD1  3 lines × 30   — ID cards
 *   TD2  2 lines × 36   — older travel documents
 *   TD3  2 lines × 44   — passports
 */

import { mrzCheckValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

interface MrzFields {
  readonly format: 'TD1' | 'TD2' | 'TD3';
  readonly issuingState: string;
  readonly documentNumber: string;
  readonly nationality: string;
  readonly birthDate: string;
  readonly sex: string;
  readonly expiryDate: string;
}

/** Strip the filler from a fixed-width field. */
const trim = (s: string): string => s.replace(/<+$/, '').replace(/</g, ' ').trim();

/** YYMMDD sanity — a real date, not merely six digits. */
function plausibleDate(yymmdd: string): boolean {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** TD3: two 44-character lines (passport). */
function validateTd3(l1: string, l2: string): MrzFields | string {
  if (!/^P[A-Z<]/.test(l1)) return 'TD3 line 1 is not a passport document code';

  const documentNumber = l2.slice(0, 9);
  const docCheck = l2[9]!;
  const nationality = l2.slice(10, 13);
  const birthDate = l2.slice(13, 19);
  const birthCheck = l2[19]!;
  const sex = l2[20]!;
  const expiryDate = l2.slice(21, 27);
  const expiryCheck = l2[27]!;
  const optional = l2.slice(28, 42);
  const optionalCheck = l2[42]!;
  const compositeCheck = l2[43]!;

  if (!mrzCheckValid(documentNumber, docCheck)) return 'document-number check digit failed';
  if (!plausibleDate(birthDate)) return 'implausible birth date';
  if (!mrzCheckValid(birthDate, birthCheck)) return 'birth-date check digit failed';
  if (!plausibleDate(expiryDate)) return 'implausible expiry date';
  if (!mrzCheckValid(expiryDate, expiryCheck)) return 'expiry-date check digit failed';
  if (!mrzCheckValid(optional, optionalCheck)) return 'optional-data check digit failed';

  const composite = `${documentNumber}${docCheck}${birthDate}${birthCheck}${expiryDate}${expiryCheck}${optional}${optionalCheck}`;
  if (!mrzCheckValid(composite, compositeCheck)) return 'composite check digit failed';

  return {
    format: 'TD3',
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: trim(documentNumber),
    nationality: nationality.replace(/</g, ''),
    birthDate,
    sex,
    expiryDate,
  };
}

/** TD2: two 36-character lines. */
function validateTd2(l1: string, l2: string): MrzFields | string {
  const documentNumber = l2.slice(0, 9);
  const docCheck = l2[9]!;
  const nationality = l2.slice(10, 13);
  const birthDate = l2.slice(13, 19);
  const birthCheck = l2[19]!;
  const sex = l2[20]!;
  const expiryDate = l2.slice(21, 27);
  const expiryCheck = l2[27]!;
  const optional = l2.slice(28, 35);
  const compositeCheck = l2[35]!;

  if (!mrzCheckValid(documentNumber, docCheck)) return 'document-number check digit failed';
  if (!plausibleDate(birthDate)) return 'implausible birth date';
  if (!mrzCheckValid(birthDate, birthCheck)) return 'birth-date check digit failed';
  if (!plausibleDate(expiryDate)) return 'implausible expiry date';
  if (!mrzCheckValid(expiryDate, expiryCheck)) return 'expiry-date check digit failed';

  const composite = `${documentNumber}${docCheck}${birthDate}${birthCheck}${expiryDate}${expiryCheck}${optional}`;
  if (!mrzCheckValid(composite, compositeCheck)) return 'composite check digit failed';

  return {
    format: 'TD2',
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: trim(documentNumber),
    nationality: nationality.replace(/</g, ''),
    birthDate,
    sex,
    expiryDate,
  };
}

/** TD1: three 30-character lines (ID cards). */
function validateTd1(l1: string, l2: string): MrzFields | string {
  const documentNumber = l1.slice(5, 14);
  const docCheck = l1[14]!;
  const optional1 = l1.slice(15, 30);

  const birthDate = l2.slice(0, 6);
  const birthCheck = l2[6]!;
  const sex = l2[7]!;
  const expiryDate = l2.slice(8, 14);
  const expiryCheck = l2[14]!;
  const nationality = l2.slice(15, 18);
  const optional2 = l2.slice(18, 29);
  const compositeCheck = l2[29]!;

  if (!mrzCheckValid(documentNumber, docCheck)) return 'document-number check digit failed';
  if (!plausibleDate(birthDate)) return 'implausible birth date';
  if (!mrzCheckValid(birthDate, birthCheck)) return 'birth-date check digit failed';
  if (!plausibleDate(expiryDate)) return 'implausible expiry date';
  if (!mrzCheckValid(expiryDate, expiryCheck)) return 'expiry-date check digit failed';

  const composite = `${documentNumber}${docCheck}${optional1}${birthDate}${birthCheck}${expiryDate}${expiryCheck}${optional2}`;
  if (!mrzCheckValid(composite, compositeCheck)) return 'composite check digit failed';

  return {
    format: 'TD1',
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: trim(documentNumber),
    nationality: nationality.replace(/</g, ''),
    birthDate,
    sex,
    expiryDate,
  };
}

function validateMrz(ctx: ValidationContext): ValidationResult {
  const lines = ctx.match[0].split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  let result: MrzFields | string;
  if (lines.length >= 3 && lines[0]!.length === 30 && lines[1]!.length === 30 && lines[2]!.length === 30) {
    result = validateTd1(lines[0]!, lines[1]!);
  } else if (lines.length >= 2 && lines[0]!.length === 44 && lines[1]!.length === 44) {
    result = validateTd3(lines[0]!, lines[1]!);
  } else if (lines.length >= 2 && lines[0]!.length === 36 && lines[1]!.length === 36) {
    result = validateTd2(lines[0]!, lines[1]!);
  } else {
    return invalid('no recognized MRZ line geometry');
  }

  if (typeof result === 'string') return invalid(result);

  // The pattern anchors on `(?:^|\n)` and therefore CONSUMES the preceding
  // newline, which belongs to the line before the MRZ rather than to the MRZ
  // itself. Left in the span it would be masked along with the identifier,
  // splicing the zone onto whatever came before it. Narrow past it — this is
  // what `span` exists for: anchoring context the pattern needed but which
  // must not be masked.
  const leading = /^\s+/.exec(ctx.match[0])?.[0].length ?? 0;

  return valid({
    ...(leading > 0 ? { span: { start: ctx.start + leading, end: ctx.end } } : {}),
    confidence: CONFIDENCE.MAXIMUM,
    metadata: {
      format: result.format,
      issuingState: result.issuingState,
      nationality: result.nationality,
      // The document number is the identifier; dates and sex are carried for
      // the review UI and for M4's format-preserving substitution.
      birthDate: result.birthDate,
      expiryDate: result.expiryDate,
      sex: result.sex,
    },
    validator: 'icao9303-all-check-digits',
  });
}

registerDetector({
  id: 'passport-mrz',
  entityType: 'PASSPORT_MRZ',
  regions: [GLOBAL_REGION],
  // Two or three consecutive fixed-width MRZ lines. The alternation pins the
  // exact widths so ordinary uppercase text cannot match.
  pattern:
    /(?:^|\n)(?:[A-Z0-9<]{30}\r?\n[A-Z0-9<]{30}\r?\n[A-Z0-9<]{30}|[A-Z0-9<]{44}\r?\n[A-Z0-9<]{44}|[A-Z0-9<]{36}\r?\n[A-Z0-9<]{36})/g,
  baseConfidence: CONFIDENCE.MAXIMUM,
  description: 'Passport and ID machine-readable zones (TD1/TD2/TD3) with every check digit verified.',
  validate: validateMrz,
});
