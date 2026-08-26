/**
 * POSTAL_CODE — the per-country table, context-gated.
 *
 * A five-digit number satisfies twenty countries' postal formats and is
 * also a quantity, a price, and a PIN. SPEC.md therefore assigns "low base
 * confidence, requires context boost": this detector declares
 * requiresContext, the runner caps it at LOW until Stage 3 supplies a
 * trigger ("postcode", "PLZ", "郵便番号") or an address co-occurrence, and
 * the candidate carries every country whose format it satisfies so fusion
 * can reconcile it with the document's other evidence.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';
import { postalCountriesFor } from './postalRegistry.js';

function validatePostal(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d,.-]/.test(before ?? '')) return invalid('fragment of a longer number');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^[\d]/.test(after) || /^[.,]\d/.test(after)) return invalid('fragment of a longer number');

  const candidate = ctx.match[0].toUpperCase();
  const countries = postalCountriesFor(candidate);
  if (countries.length === 0) return invalid('no country format matched');

  // A year-shaped 4-digit number is overwhelmingly a year in running text;
  // the postal reading needs Stage 3 to argue otherwise, and until then it
  // is noise we do not emit at all.
  if (/^\d{4}$/.test(candidate)) {
    const year = Number(candidate);
    if (year >= 1900 && year <= 2099) return invalid('year-shaped');
  }

  return valid({
    canonical: candidate.replace(/ /g, ''),
    metadata: { countries },
    validator: 'postal-format-table',
  });
}

registerDetector({
  id: 'postal-code',
  entityType: 'POSTAL_CODE',
  regions: [GLOBAL_REGION],
  // Structured letter formats (UK, CA, NL, IE, MT, AZ/AD/MD/LV/LT…) plus
  // digit groups with optional internal dash/space. Uppercase only — postal
  // codes are written uppercase, and lowercase admits ordinary words.
  pattern:
    /\b(?:[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|[A-Z]\d[A-Z] ?\d[A-Z]\d|\d{4} ?[A-Z]{2}|[A-Z]{2,3}[- ]?\d{4,5}|[A-Z]\d{2} ?[A-Z0-9]{4}|\d{2,7}(?:[- ]\d{2,4})?)\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  requiresContext: true,
  description: 'Postal codes against the per-country format table; LOW until Stage 3 context.',
  validate: validatePostal,
});
