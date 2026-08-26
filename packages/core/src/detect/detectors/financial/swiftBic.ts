/**
 * SWIFT_BIC — structural validation against country and location code rules.
 *
 * ISO 9362: 4-letter bank code, 2-letter ISO country code, 2-character
 * location code, optional 3-character branch. Location rules: the first
 * location character must not be '0' or '1'; a location code whose SECOND
 * character is '0' designates a TEST BIC (non-production) — detected but
 * classified non-sensitive, like other known test values.
 *
 * A BIC has no checksum, and an 8-character uppercase English word whose
 * characters happen to parse ("FEEDBACK" → bank FEED, country BA, location
 * CK) is structurally a BIC. Confidence therefore reflects the evidence:
 * MEDIUM for the bare all-letter 8-char form, HIGH when the BIC carries a
 * digit or an explicit branch code, which English words do not.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';
import { ISO_COUNTRY_CODES } from '../../isoCountries.js';

function validateBic(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const bic = raw.toUpperCase();

  const country = bic.slice(4, 6);
  if (!ISO_COUNTRY_CODES.has(country)) return invalid('not an ISO country code');

  const location = bic.slice(6, 8);
  if (location[0] === '0' || location[0] === '1') {
    return invalid('location code cannot begin with 0 or 1');
  }

  const branch = bic.length === 11 ? bic.slice(8) : undefined;
  const hasDigit = /\d/.test(bic);
  const isTest = location[1] === '0';

  return valid({
    canonical: bic,
    sensitive: !isTest,
    confidence: hasDigit || branch !== undefined ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    metadata: {
      country,
      ...(branch !== undefined ? { branch } : {}),
      ...(isTest ? { test: true } : {}),
    },
    validator: 'bic-structural',
  });
}

registerDetector({
  id: 'swift-bic',
  entityType: 'SWIFT_BIC',
  regions: [GLOBAL_REGION],
  // Uppercase only: BICs are written uppercase by standard, and admitting
  // lowercase would sweep in ordinary 8-letter words.
  pattern: /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'SWIFT/BIC codes: country and location rules; test BICs non-sensitive.',
  validate: validateBic,
});
