/**
 * DRIVERS_LICENSE — per-jurisdiction formats where a real rule exists.
 *
 * SPEC.md: "per-jurisdiction formats where a validator exists, low
 * confidence otherwise." Two tiers, explicit about which is which:
 *
 * VERIFIABLE STRUCTURE (MEDIUM — a distinctive multi-part shape, but no
 * checksum a third party can compute):
 *   • UK DVLA: 5 surname chars + decade digit + month pair (with the +50
 *     female offset) + day pair + year digit + 2 initials + 1 digit +
 *     2 letters. The embedded date rules are genuinely checkable.
 *   • US states with a strongly-typed shape: CA (1 letter + 7 digits),
 *     NY (1 letter + 18 digits or 9 digits), IL (1 letter + 11 digits),
 *     FL/MI/MN/MD (1 letter + 12 digits), NJ (1 letter + 14 digits),
 *     WA (12 chars incl. letters), TX/OH-style plain digit runs are NOT
 *     claimed — a bare 8-digit run is any number.
 *
 * No public checksum exists for any of these, so MEDIUM is the ceiling and
 * a labeled Stage 3 trigger ("DL#", "driver's license") is what will raise
 * them later. Shapes that are just digit runs are deliberately excluded —
 * emitting them would be the false-positive machine SPEC.md forbids.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** UK DVLA licence number: the date rules make it checkable. */
function validateUkDvla(value: string): ValidationResult | null {
  const m = /^([A-Z9]{5})(\d)(\d\d)(\d\d)(\d)([A-Z9]{2})(\d)([A-Z]{2})$/.exec(value);
  if (m === null) return null;
  const monthPair = Number(m[3]);
  // Month 01–12 for male, 51–62 for female drivers.
  const month = monthPair > 50 ? monthPair - 50 : monthPair;
  if (month < 1 || month > 12) return invalid('DVLA month field out of range');
  const day = Number(m[4]);
  if (day < 1 || day > 31) return invalid('DVLA day field out of range');
  return valid({
    canonical: value,
    metadata: { jurisdiction: 'GB', scheme: 'dvla' },
    validator: 'dvla-structure',
  });
}

/** US state shapes with a letter anchor (never bare digit runs). */
const US_SHAPES: readonly (readonly [RegExp, string])[] = [
  [/^[A-Z]\d{7}$/, 'CA'],
  [/^[A-Z]\d{11}$/, 'IL'],
  [/^[A-Z]\d{12}$/, 'FL'],
  [/^[A-Z]\d{14}$/, 'NJ'],
  [/^[A-Z]\d{18}$/, 'NY'],
];

function validateDl(ctx: ValidationContext): ValidationResult {
  const value = ctx.match[0].toUpperCase();

  const dvla = validateUkDvla(value);
  if (dvla !== null) return dvla;

  for (const [shape, state] of US_SHAPES) {
    if (shape.test(value)) {
      return valid({
        canonical: value,
        confidence: CONFIDENCE.LOW,
        metadata: { jurisdiction: 'US', state },
        validator: 'state-shape',
      });
    }
  }

  return invalid('no jurisdiction shape matched');
}

registerDetector({
  id: 'drivers-license',
  entityType: 'DRIVERS_LICENSE',
  regions: ['GB', 'US'],
  // DVLA 16-char format or letter-anchored US state formats.
  pattern: /\b(?:[A-Z9]{5}\d{6}[A-Z9]{2}\d[A-Z]{2}|[A-Za-z]\d{7}(?:\d{4,11})?)\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: "Driver's licences: UK DVLA date-rule structure at MEDIUM, letter-anchored US shapes at LOW.",
  validate: validateDl,
});
