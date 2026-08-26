/**
 * Brazil: CPF and CNPJ — both with two chained mod-11 check digits (r < 2
 * folds to 0, so mutation detection is ~10/11 by design — the property
 * tests say so). Repdigit CPFs (111.111.111-11 and friends) satisfy the
 * arithmetic but are never issued and are rejected outright.
 */

import { toDigits, weightedModBy } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function guard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d.-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^[.-]\d/.test(after)) return 'fragment of a longer number';
  return null;
}

/** Check digit: weights descending from `start`, fold r<2 → 0. */
function brCheck(digits: readonly number[], start: number): number {
  const remainder = weightedModBy(digits, (i) => start - i, 11)!;
  return remainder < 2 ? 0 : 11 - remainder;
}

registerDetector({
  id: 'national-id-br-cpf',
  entityType: 'NATIONAL_ID',
  regions: ['BR'],
  pattern: /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Brazilian CPF with both mod-11 check digits; repdigits rejected.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const all = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}`;
    if (/^(.)\1+$/.test(all)) return invalid('repdigit CPFs are never issued');
    const digits = toDigits(all)!;
    if (brCheck(digits.slice(0, 9), 10) !== digits[9]) return invalid('first check digit failed');
    if (brCheck(digits.slice(0, 10), 11) !== digits[10]) return invalid('second check digit failed');
    return valid({
      canonical: all,
      metadata: { scheme: 'cpf', country: 'BR' },
      validator: 'cpf-dual-mod11',
    });
  },
});

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheck(digits: readonly number[], weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[i]! * weights[i]!;
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

registerDetector({
  id: 'national-id-br-cnpj',
  entityType: 'TAX_ID',
  regions: ['BR'],
  pattern: /\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Brazilian CNPJ with both mod-11 check digits.',
  validate(ctx): ValidationResult {
    const g = guard(ctx);
    if (g !== null) return invalid(g);
    const all = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}${ctx.match[5]}`;
    if (/^0+$/.test(all)) return invalid('all zeros');
    const digits = toDigits(all)!;
    if (cnpjCheck(digits.slice(0, 12), CNPJ_W1) !== digits[12]) return invalid('first check digit failed');
    if (cnpjCheck(digits.slice(0, 13), CNPJ_W2) !== digits[13]) return invalid('second check digit failed');
    return valid({
      canonical: all,
      metadata: { scheme: 'cnpj', country: 'BR' },
      validator: 'cnpj-dual-mod11',
    });
  },
});
