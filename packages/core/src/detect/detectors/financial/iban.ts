/**
 * IBAN — mod-97 checksum plus the full per-country structure registry.
 *
 * Order of proof: country exists in the registry → length matches that
 * country → BBAN matches that country's structure → mod-97 closes. Each
 * gate alone is insufficient: mod-97 without structure accepts transposed
 * letter/digit segments; structure without mod-97 accepts any typo.
 *
 * SPAN TRIMMING. IBANs are written in groups of four ("GB82 WEST 1234 …"),
 * so the candidate pattern must cross spaces — which lets it absorb the
 * word after the IBAN. The validator counts alphanumerics up to the
 * country's expected length and cuts there, but ONLY at a separator
 * boundary: if the next character is alphanumeric the token simply
 * continues (an account-number-like blob), and that is a rejection, not a
 * trim.
 */

import { ibanMod97Valid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';
import { DOCUMENTATION_IBANS, IBAN_REGISTRY } from './ibanRegistry.js';

function validateIban(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  const country = raw.slice(0, 2).toUpperCase();
  const spec = IBAN_REGISTRY.get(country);
  if (spec === undefined) return invalid('not an IBAN country code');

  // Walk the raw match, collecting alphanumerics up to the expected length
  // and remembering where in the raw text the last one sits.
  let collected = '';
  let endInRaw = 0;
  for (let i = 0; i < raw.length && collected.length < spec.length; i++) {
    const ch = raw[i]!;
    if (/[A-Za-z0-9]/.test(ch)) {
      collected += ch;
      endInRaw = i + 1;
    } else if (ch !== ' ') {
      break; // only spaces may separate IBAN groups
    }
  }
  if (collected.length < spec.length) return invalid('too short for this country');

  // The character after the cut must not continue the token.
  const nextInRaw = raw[endInRaw];
  if (nextInRaw !== undefined && /[A-Za-z0-9]/.test(nextInRaw)) {
    return invalid('embedded in a longer alphanumeric run');
  }
  const afterMatch = ctx.text[ctx.start + raw.length];
  if (endInRaw === raw.length && afterMatch !== undefined && /[A-Za-z0-9]/.test(afterMatch)) {
    return invalid('embedded in a longer alphanumeric run');
  }

  const iban = collected.toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}/.test(iban)) return invalid('malformed check digits');
  const bban = iban.slice(4);
  if (!spec.bban.test(bban)) return invalid('BBAN structure mismatch for country');
  if (!ibanMod97Valid(iban)) return invalid('mod-97 checksum failed');

  return valid({
    canonical: iban,
    sensitive: !DOCUMENTATION_IBANS.has(iban),
    metadata: { country },
    validator: 'iban-mod97-structure',
    span: { start: ctx.start, end: ctx.start + endInRaw },
  });
}

registerDetector({
  id: 'iban',
  entityType: 'IBAN',
  regions: [GLOBAL_REGION],
  // Two letters, two digits, then grouped or compact alphanumerics. The 10
  // minimum keeps three-word capitalized prose ("IN 2019 THE…") from ever
  // reaching the validator.
  pattern: /\b[A-Za-z]{2}\d{2}(?: ?[A-Za-z0-9]){10,32}/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'IBANs validated against the full registry: country, length, structure, mod-97.',
  validate: validateIban,
});
