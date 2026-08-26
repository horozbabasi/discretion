/**
 * PHONE — libphonenumber-js with the FULL metadata bundle.
 *
 * SPEC.md: "use libphonenumber-js with the full metadata bundle, not the
 * minimal one. Never hand-roll phone regex. Parse and validate, with region
 * inference from surrounding text and a user-set default region."
 *
 * The regex below is a candidate harvester only — it collects digit runs with
 * phone-ish punctuation and hands them to libphonenumber, which is the
 * validator. Region inference from SURROUNDING TEXT is a Stage 3 concern
 * (trigger lexicons carry language/region evidence); in M2 the sources of
 * region are the number's own +prefix or the user's configured default.
 *
 * Known false-positive shapes are rejected before parsing: year ranges
 * ("2019-2023") and calendar dates, both of which are 8-digit runs that
 * genuinely validate as subscriber numbers in 8-digit national plans
 * (Denmark's 20 19 20 23 is a real mobile shape). The date guard is cheap
 * and kills the whole class.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { CountryCode } from 'libphonenumber-js/max';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** "2019-2023", "1999/2001" — year ranges, never phone numbers. */
const YEAR_RANGE = /^(?:19|20)\d{2}\s?[-/]\s?(?:19|20)\d{2}$/;

/** Calendar dates: 2023-08-26, 26/08/2023, 08.26.23 and friends. */
const DATE_LIKE = /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;

function validatePhone(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  const trimmed = raw.trim();
  if (YEAR_RANGE.test(trimmed)) return invalid('year range');
  if (DATE_LIKE.test(trimmed)) return invalid('date-like');

  const digitCount = raw.replace(/\D/g, '').length;
  // E.164 caps national significant numbers at 15 digits; anything shorter
  // than 7 is a short code or fragment we do not report.
  if (digitCount < 7) return invalid('too few digits');
  if (digitCount > 16) return invalid('too many digits');

  const hasPlus = trimmed.startsWith('+');

  let parsed;
  if (hasPlus) {
    parsed = parsePhoneNumberFromString(trimmed);
  } else if (ctx.defaultRegion !== undefined) {
    parsed = parsePhoneNumberFromString(trimmed, ctx.defaultRegion as CountryCode);
  } else {
    // A national-format number with no region context cannot be validated,
    // and emitting unvalidated digit runs is the false-positive machine
    // SPEC.md forbids. Stage 3's trigger evidence will widen this later.
    return invalid('national format with no region context');
  }

  if (parsed === undefined || !parsed.isValid()) return invalid('not a valid number for any plan');

  return valid({
    canonical: parsed.number,
    metadata: {
      ...(parsed.country !== undefined ? { country: parsed.country } : {}),
      countryCallingCode: parsed.countryCallingCode,
      viaDefaultRegion: !hasPlus,
    },
    validator: 'libphonenumber-isvalid',
  });
}

registerDetector({
  id: 'phone',
  entityType: 'PHONE',
  regions: [GLOBAL_REGION],
  pattern: /[+(]?\d[\d \t()./-]{4,22}\d/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Phone numbers in all international formats, validated by libphonenumber (full metadata).',
  validate: validatePhone,
});
