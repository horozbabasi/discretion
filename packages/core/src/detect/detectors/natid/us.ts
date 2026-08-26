/**
 * United States: SSN, ITIN, EIN.
 *
 * None of the three carries a checksum, so per SPEC.md the validators are
 * the published ISSUANCE RULES and confidence stays MEDIUM:
 *  • SSN — area not 000/666/900–999, group not 00, serial not 0000. Only
 *    the delimited 3-2-4 writing is matched: a bare nine-digit run is any
 *    number in the world (and the ABA detector owns the checksummed ones).
 *    The famous Woolworth wallet-card number 078-05-1120 and the
 *    advertising range 987-65-432x are detected but non-sensitive.
 *  • ITIN — SSN shape, area 900–999 with the IRS-assigned group ranges.
 *  • EIN — XX-XXXXXXX with a real IRS campus/e-file prefix.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const KNOWN_TEST_SSNS = new Set(['078051120', '219099999']);

function fragmentGuard(ctx: ValidationContext): string | null {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return 'fragment of a longer number';
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return 'fragment of a longer number';
  return null;
}

registerDetector({
  id: 'national-id-us-ssn',
  entityType: 'NATIONAL_ID',
  regions: ['US'],
  pattern: /\b(\d{3})[- ](\d{2})[- ](\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'US Social Security Numbers (delimited form), issuance rules enforced.',
  validate(ctx): ValidationResult {
    const guard = fragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    const area = Number(ctx.match[1]);
    const group = Number(ctx.match[2]);
    const serial = Number(ctx.match[3]);
    const digits = `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`;

    // The famous non-issuable specimens LIVE in the excluded ranges (the
    // SSA advertising block is area 987), so they are recognized before the
    // issuance gates — detected, never masked.
    const advertising = area === 987 && group === 65 && serial >= 4320 && serial <= 4329;
    if (KNOWN_TEST_SSNS.has(digits) || advertising) {
      return valid({
        canonical: digits,
        sensitive: false,
        metadata: { scheme: 'ssn', country: 'US' },
        validator: 'ssn-issuance-rules',
      });
    }

    if (area === 0 || area === 666 || area >= 900) return invalid('invalid area');
    if (group === 0) return invalid('invalid group');
    if (serial === 0) return invalid('invalid serial');
    return valid({
      canonical: digits,
      metadata: { scheme: 'ssn', country: 'US' },
      validator: 'ssn-issuance-rules',
    });
  },
});

/** IRS-assigned ITIN group ranges (the middle pair). */
function itinGroupValid(group: number): boolean {
  return (group >= 70 && group <= 88) || (group >= 90 && group <= 92) || (group >= 94 && group <= 99);
}

registerDetector({
  id: 'national-id-us-itin',
  entityType: 'TAX_ID',
  regions: ['US'],
  pattern: /\b(9\d{2})[- ](\d{2})[- ](\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'US ITINs: area 9xx with IRS-assigned group ranges.',
  validate(ctx): ValidationResult {
    const guard = fragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    if (!itinGroupValid(Number(ctx.match[2]))) return invalid('not an ITIN group range');
    if (Number(ctx.match[3]) === 0) return invalid('invalid serial');
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`,
      metadata: { scheme: 'itin', country: 'US' },
      validator: 'itin-group-ranges',
    });
  },
});

/** Valid EIN campus/e-file prefixes. */
const EIN_PREFIXES = new Set([
  '01','02','03','04','05','06','10','11','12','13','14','15','16','20','21','22','23','24','25','26','27',
  '30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46','47','48',
  '50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67','68',
  '71','72','73','74','75','76','77','80','81','82','83','84','85','86','87','88','90','91','92','93','94','95','98','99',
]);

registerDetector({
  id: 'national-id-us-ein',
  entityType: 'TAX_ID',
  regions: ['US'],
  pattern: /\b(\d{2})-(\d{7})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'US Employer Identification Numbers with valid IRS prefixes.',
  validate(ctx): ValidationResult {
    const guard = fragmentGuard(ctx);
    if (guard !== null) return invalid(guard);
    if (!EIN_PREFIXES.has(ctx.match[1]!)) return invalid('not an IRS prefix');
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}`,
      metadata: { scheme: 'ein', country: 'US' },
      validator: 'ein-prefix-table',
    });
  },
});
