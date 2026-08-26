/**
 * Spain: DNI, NIE, CIF — all with real check characters.
 *
 * DNI: 8 digits + letter = "TRWAGMYFPDXBNJZSQVHLCKE"[n mod 23].
 * NIE: X/Y/Z + 7 digits + the same letter check with X→0, Y→1, Z→2
 * prepended. CIF: organization letter + 7 digits + check, where the check
 * is computed Luhn-style over the seven digits and is a digit for some
 * organization classes, a letter ("JABCDEFGHI"[value]) for others, and
 * either for the rest.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

registerDetector({
  id: 'national-id-es-dni',
  entityType: 'NATIONAL_ID',
  regions: ['ES'],
  pattern: /\b(\d{8})[- ]?([A-Z])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Spanish DNI with the mod-23 letter verified.',
  validate(ctx): ValidationResult {
    const expected = DNI_LETTERS[Number(ctx.match[1]) % 23]!;
    if (ctx.match[2] !== expected) return invalid('mod-23 letter failed');
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}`,
      metadata: { scheme: 'dni', country: 'ES' },
      validator: 'dni-mod23',
    });
  },
});

registerDetector({
  id: 'national-id-es-nie',
  entityType: 'NATIONAL_ID',
  regions: ['ES'],
  pattern: /\b([XYZ])[- ]?(\d{7})[- ]?([A-Z])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Spanish NIE (foreigner id) with the mod-23 letter verified.',
  validate(ctx): ValidationResult {
    const prefixValue = { X: '0', Y: '1', Z: '2' }[ctx.match[1] as 'X' | 'Y' | 'Z'];
    const numeric = Number(`${prefixValue}${ctx.match[2]}`);
    const expected = DNI_LETTERS[numeric % 23]!;
    if (ctx.match[3] !== expected) return invalid('mod-23 letter failed');
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`,
      metadata: { scheme: 'nie', country: 'ES' },
      validator: 'nie-mod23',
    });
  },
});

/** CIF organization letters and which check-character class each takes. */
const CIF_DIGIT_ONLY = new Set(['A', 'B', 'E', 'H']);
const CIF_LETTER_ONLY = new Set(['K', 'P', 'Q', 'S', 'N', 'W', 'R']);
const CIF_ORG = /^[ABCDEFGHJKLMNPQRSUVW]$/;
const CIF_CHECK_LETTERS = 'JABCDEFGHI';

registerDetector({
  id: 'national-id-es-cif',
  entityType: 'TAX_ID',
  regions: ['ES'],
  pattern: /\b([A-HJ-NP-SUVW])[- ]?(\d{7})[- ]?([0-9A-J])\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Spanish CIF (company tax id) with its Luhn-style check verified.',
  validate(ctx): ValidationResult {
    const org = ctx.match[1]!;
    if (!CIF_ORG.test(org)) return invalid('not a CIF organization letter');
    const digits = ctx.match[2]!;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      let v = Number(digits[i]);
      if (i % 2 === 0) {
        v *= 2;
        if (v > 9) v -= 9;
      }
      sum += v;
    }
    const value = (10 - (sum % 10)) % 10;
    const check = ctx.match[3]!;
    const digitOk = check === String(value);
    const letterOk = check === CIF_CHECK_LETTERS[value];
    if (CIF_DIGIT_ONLY.has(org) && !digitOk) return invalid('digit check required and failed');
    if (CIF_LETTER_ONLY.has(org) && !letterOk) return invalid('letter check required and failed');
    if (!digitOk && !letterOk) return invalid('check character failed');
    return valid({
      canonical: `${org}${digits}${check}`,
      metadata: { scheme: 'cif', country: 'ES' },
      validator: 'cif-check',
    });
  },
});
