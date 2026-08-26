/**
 * US_NPI — National Provider Identifier.
 *
 * SPEC.md: "US_NPI — Luhn with prefix." Ten digits, closed by Luhn computed
 * over the NPI PREFIXED with the constant 80840 (the ISO 7812 issuer prefix
 * assigned to the NPI system). Omitting the prefix is the classic
 * implementation bug: it produces a different check digit and silently
 * rejects every real NPI, so the prefix is applied here and pinned by tests
 * against published specimen NPIs.
 *
 * Issued NPIs begin with 1 or 2 (3 and 4 are reserved for future use), which
 * is enforced: it removes most of the arbitrary 10-digit runs that pass Luhn
 * by chance.
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** ISO 7812 issuer identifier for the NPI system. */
const NPI_PREFIX = '80840';

function validateNpi(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');

  const npi = ctx.match[0];
  const first = npi[0]!;
  if (first !== '1' && first !== '2') return invalid('NPIs begin with 1 or 2');
  if (!luhnValid(`${NPI_PREFIX}${npi}`)) return invalid('Luhn checksum (with 80840 prefix) failed');

  return valid({
    canonical: npi,
    metadata: { scheme: 'npi', country: 'US' },
    validator: 'luhn-80840',
  });
}

registerDetector({
  id: 'us-npi',
  entityType: 'US_NPI',
  regions: ['US'],
  pattern: /\b\d{10}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'US National Provider Identifiers: Luhn over the 80840-prefixed number.',
  validate: validateNpi,
});
