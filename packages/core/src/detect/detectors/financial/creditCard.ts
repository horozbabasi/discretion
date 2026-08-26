/**
 * CREDIT_CARD — Luhn required, plus issuer BIN identification.
 *
 * SPEC.md names the issuer set: Visa, Mastercard, Amex, Discover, JCB,
 * UnionPay, Diners, Maestro, Troy, Mir, RuPay, Elo, Verve. "Known test card
 * numbers matched but classified as non-sensitive."
 *
 * BIN resolution is LONGEST-PREFIX-FIRST: 622126–622925 (six digits,
 * Discover's UnionPay-processed block) beats 62 (UnionPay); 6521–6522
 * (RuPay) beats 65 (Discover); 6011 (Discover) beats 60 (RuPay). Contested
 * short prefixes are classified per the mainstream network documentation;
 * issuer is metadata for substitution and display — Luhn plus per-issuer
 * length is what gates validity.
 *
 * A Luhn-valid digit run with NO recognizable issuer prefix is REJECTED, not
 * emitted at low confidence. Luhn alone has a 10% pass rate on arbitrary
 * digit runs, and IMEIs, tracking numbers and account numbers are all
 * Luhn-closed — issuer identification is the precision gate that keeps them
 * out. (A 15-digit IMEI starting 35 falls in JCB's 3528–3589 window, but
 * JCB issues only 16–19 digit PANs, so the length gate rejects it.)
 */

import { luhnValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

interface BinRule {
  readonly lo: number; // inclusive numeric prefix bound
  readonly hi: number; // inclusive
  readonly digits: number; // how many leading digits the bounds cover
  readonly issuer: string;
}

/** Ordered within each prefix length; longer prefixes always win. */
const BIN_RULES: readonly BinRule[] = [
  // 6-digit rules
  { lo: 622126, hi: 622925, digits: 6, issuer: 'discover' },
  { lo: 506099, hi: 506198, digits: 6, issuer: 'verve' },
  { lo: 507865, hi: 507964, digits: 6, issuer: 'verve' },
  { lo: 650002, hi: 650027, digits: 6, issuer: 'verve' },
  { lo: 401178, hi: 401179, digits: 6, issuer: 'elo' },
  { lo: 431274, hi: 431274, digits: 6, issuer: 'elo' },
  { lo: 438935, hi: 438935, digits: 6, issuer: 'elo' },
  { lo: 451416, hi: 451416, digits: 6, issuer: 'elo' },
  { lo: 457393, hi: 457393, digits: 6, issuer: 'elo' },
  { lo: 457631, hi: 457632, digits: 6, issuer: 'elo' },
  { lo: 504175, hi: 504175, digits: 6, issuer: 'elo' },
  { lo: 506699, hi: 506778, digits: 6, issuer: 'elo' },
  { lo: 509000, hi: 509999, digits: 6, issuer: 'elo' },
  { lo: 627780, hi: 627780, digits: 6, issuer: 'elo' },
  { lo: 636297, hi: 636297, digits: 6, issuer: 'elo' },
  { lo: 636368, hi: 636368, digits: 6, issuer: 'elo' },
  { lo: 650031, hi: 650051, digits: 6, issuer: 'elo' },
  { lo: 650405, hi: 650439, digits: 6, issuer: 'elo' },
  { lo: 650485, hi: 650538, digits: 6, issuer: 'elo' },
  { lo: 650541, hi: 650598, digits: 6, issuer: 'elo' },
  { lo: 650700, hi: 650727, digits: 6, issuer: 'elo' },
  { lo: 650901, hi: 650978, digits: 6, issuer: 'elo' },
  { lo: 651652, hi: 651679, digits: 6, issuer: 'elo' },
  { lo: 655000, hi: 655058, digits: 6, issuer: 'elo' },
  // 4-digit rules
  { lo: 9792, hi: 9792, digits: 4, issuer: 'troy' },
  { lo: 2200, hi: 2204, digits: 4, issuer: 'mir' },
  { lo: 3528, hi: 3589, digits: 4, issuer: 'jcb' },
  { lo: 2221, hi: 2720, digits: 4, issuer: 'mastercard' },
  { lo: 6011, hi: 6011, digits: 4, issuer: 'discover' },
  { lo: 6521, hi: 6522, digits: 4, issuer: 'rupay' },
  { lo: 3095, hi: 3095, digits: 4, issuer: 'diners' },
  // 3-digit rules
  { lo: 300, hi: 305, digits: 3, issuer: 'diners' },
  { lo: 644, hi: 649, digits: 3, issuer: 'discover' },
  { lo: 508, hi: 508, digits: 3, issuer: 'rupay' },
  // 2-digit rules
  { lo: 34, hi: 34, digits: 2, issuer: 'amex' },
  { lo: 37, hi: 37, digits: 2, issuer: 'amex' },
  { lo: 36, hi: 36, digits: 2, issuer: 'diners' },
  { lo: 38, hi: 39, digits: 2, issuer: 'diners' },
  { lo: 51, hi: 55, digits: 2, issuer: 'mastercard' },
  { lo: 65, hi: 65, digits: 2, issuer: 'discover' },
  { lo: 62, hi: 62, digits: 2, issuer: 'unionpay' },
  { lo: 60, hi: 60, digits: 2, issuer: 'rupay' },
  { lo: 81, hi: 82, digits: 2, issuer: 'rupay' },
  { lo: 50, hi: 50, digits: 2, issuer: 'maestro' },
  { lo: 56, hi: 59, digits: 2, issuer: 'maestro' },
  { lo: 61, hi: 61, digits: 2, issuer: 'maestro' },
  { lo: 63, hi: 64, digits: 2, issuer: 'maestro' },
  { lo: 66, hi: 69, digits: 2, issuer: 'maestro' },
  // 1-digit rules
  { lo: 4, hi: 4, digits: 1, issuer: 'visa' },
];

/** Permitted PAN lengths per issuer. */
const ISSUER_LENGTHS: Readonly<Record<string, readonly number[]>> = {
  visa: [13, 16, 19],
  mastercard: [16],
  amex: [15],
  discover: [16, 17, 18, 19],
  jcb: [16, 17, 18, 19],
  unionpay: [16, 17, 18, 19],
  diners: [14, 15, 16, 17, 18, 19],
  maestro: [12, 13, 14, 15, 16, 17, 18, 19],
  troy: [16],
  mir: [16, 17, 18, 19],
  rupay: [16],
  elo: [16],
  verve: [16, 18, 19],
};

/** Universally published test PANs: detected, never masked. */
const TEST_CARDS: ReadonlySet<string> = new Set([
  '4111111111111111', '4012888888881881', '4222222222222', '4000056655665556',
  '4917610000000000',
  '5555555555554444', '5105105105105100', '5200828282828210', '2223003122003222',
  '378282246310005', '371449635398431', '378734493671000',
  '6011111111111117', '6011000990139424', '6011981111111113',
  '3530111333300000', '3566002020360505',
  '30569309025904', '38520000023237',
  '6200000000000005', '6200000000000047',
  '2200000000000053',
]);

function resolveIssuer(pan: string): string | null {
  for (const rule of BIN_RULES) {
    if (pan.length < rule.digits) continue;
    const prefix = Number(pan.slice(0, rule.digits));
    if (prefix >= rule.lo && prefix <= rule.hi) return rule.issuer;
  }
  return null;
}

function validateCreditCard(ctx: ValidationContext): ValidationResult {
  // Digit runs adjacent to more digits (or digit-separator continuations)
  // are fragments of something longer.
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/\d/.test(before ?? '')) return invalid('fragment of a longer digit run');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^[ -]\d/.test(after)) return invalid('fragment of a longer digit run');

  const pan = ctx.match[0].replace(/[ -]/g, '');
  if (!/^\d{12,19}$/.test(pan)) return invalid('not 12-19 digits');

  const issuer = resolveIssuer(pan);
  if (issuer === null) return invalid('no recognizable issuer prefix');
  if (!ISSUER_LENGTHS[issuer]!.includes(pan.length)) {
    return invalid('length not issued by this network');
  }
  if (!luhnValid(pan)) return invalid('Luhn checksum failed');

  return valid({
    canonical: pan,
    sensitive: !TEST_CARDS.has(pan),
    metadata: { issuer },
    validator: 'luhn-bin',
  });
}

registerDetector({
  id: 'credit-card',
  entityType: 'CREDIT_CARD',
  regions: [GLOBAL_REGION],
  // 12–19 digits with optional single space/hyphen separators.
  pattern: /\b\d(?:[ -]?\d){11,18}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Payment card numbers: Luhn plus issuer BIN identification; test PANs non-sensitive.',
  validate: validateCreditCard,
});
