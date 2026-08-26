/**
 * Russia: INN (both widths) and SNILS.
 *
 * INN-10 (organizations): weights 2,4,10,3,5,9,4,6,8 → (sum mod 11) mod 10
 * closes digit 10. INN-12 (individuals): two chained checks with the
 * 11- and 12-position weight vectors. SNILS: nine payload digits weighted
 * 9..1, the two check digits are (sum mod 101) with 100 folding to 0 —
 * SPEC.md names the mod-101 explicitly.
 */

import { toDigits, weightedMod } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const INN10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function guard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return 'fragment of a longer number';
  return null;
}

registerDetector({
  id: 'national-id-ru-inn',
  entityType: 'TAX_ID',
  regions: ['RU'],
  pattern: /\b\d{10}\b|\b\d{12}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Russian INN, 10-digit organizational and 12-digit personal forms.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const value = ctx.match[0];
    const d = toDigits(value)!;
    if (value.length === 10) {
      const check = weightedMod(d.slice(0, 9), INN10_WEIGHTS, 11)! % 10;
      if (check !== d[9]) return invalid('INN-10 check failed');
      return valid({
        canonical: value,
        metadata: { scheme: 'inn', country: 'RU', kind: 'organization' },
        validator: 'inn-mod11',
      });
    }
    const c11 = weightedMod(d.slice(0, 10), INN12_W11, 11)! % 10;
    if (c11 !== d[10]) return invalid('INN-12 first check failed');
    const c12 = weightedMod(d.slice(0, 11), INN12_W12, 11)! % 10;
    if (c12 !== d[11]) return invalid('INN-12 second check failed');
    return valid({
      canonical: value,
      metadata: { scheme: 'inn', country: 'RU', kind: 'personal' },
      validator: 'inn-dual-mod11',
    });
  },
});

registerDetector({
  id: 'national-id-ru-snils',
  entityType: 'NATIONAL_ID',
  regions: ['RU'],
  pattern: /\b(\d{3})-(\d{3})-(\d{3})[- ](\d{2})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Russian SNILS with the mod-101 check (SPEC.md names it).',
  validate(ctx): ValidationResult {
    const nine = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`;
    const d = toDigits(nine)!;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += d[i]! * (9 - i);
    let check = sum % 101;
    if (check === 100) check = 0;
    if (check !== Number(ctx.match[4])) return invalid('mod-101 check failed');
    return valid({
      canonical: `${nine}${ctx.match[4]}`,
      metadata: { scheme: 'snils', country: 'RU' },
      validator: 'snils-mod101',
    });
  },
});
