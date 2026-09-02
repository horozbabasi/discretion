/**
 * Human-readable names for entity types.
 *
 * In core rather than in a UI package because there are now two surfaces that
 * must name the same type the same way — the playground and the extension's
 * review panel — and two label maps drift the moment a type is added to one of
 * them. The function is pure string work with no environment dependency, which
 * is the bar for living here.
 *
 * Derived from the type name rather than a hand-written table, so a new entity
 * type is labelled correctly without touching this file at all. Only the
 * initialisms need listing: sentence case turns IBAN into "Iban", and a
 * reviewer who sees "Iban" reasonably doubts everything else on the panel.
 */

import type { EntityType } from './types.js';

/** Initialisms that must not be sentence-cased, longest first. */
const INITIALISMS = [
  'IBAN',
  'IFSC',
  'BSB',
  'MRZ',
  'SWIFT',
  'BIC',
  'API',
  'JWT',
  'URL',
  'MAC',
  'NPI',
  'VAT',
  'VIN',
  'ID',
  'IP',
  'US',
  'UK',
  'CA',
  'AU',
  'IN',
  'BR',
];

const INITIALISM_SET = new Set(INITIALISMS.map((word) => word.toLowerCase()));

/** e.g. 'CREDIT_CARD' -> 'Credit card', 'IN_IFSC' -> 'IN IFSC'. */
export function labelOf(type: EntityType | string): string {
  const words = type.toLowerCase().split('_');
  return words
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (INITIALISM_SET.has(word)) return upper;
      // Only the first word is capitalised: "Credit card", not "Credit Card".
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(' ');
}
