/**
 * CA_TRANSIT_NUMBER — Canadian branch transit in the paper (MICR) writing:
 * 5-digit branch, hyphen, 3-digit institution.
 *
 * No public checksum covers the branch number, so validation rests on the
 * institution number, which IS a closed set — the Payments Canada financial
 * institution numbers. The list below carries the chartered banks, Crown
 * institutions, and the major trust/credit-union centrals that appear in
 * practice. Membership → MEDIUM (a real table check, but not a checksum);
 * an unknown institution number is a rejection, not a low-confidence hit.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** Payments Canada institution numbers in active use. */
const INSTITUTIONS: ReadonlySet<string> = new Set([
  '001', // Bank of Montreal
  '002', // Scotiabank
  '003', // RBC
  '004', // TD
  '006', // National Bank
  '010', // CIBC
  '016', // HSBC Canada
  '030', // Canadian Western Bank
  '039', // Laurentian
  '117', // Government of Canada
  '127', // Canada Post (money orders)
  '177', // Bank of Canada
  '219', // ATB Financial
  '241', // Bank of America Canada
  '245', // Bank of Tokyo-Mitsubishi
  '260', // Citibank Canada
  '265', // Deutsche Bank Canada
  '269', // Mega International
  '270', // JPMorgan Chase Canada
  '290', // UBS Canada
  '308', // Bank of China Canada
  '309', // Vancity (Citizens)
  '326', // President's Choice
  '338', // Canadian Tire Bank
  '340', // ICICI Canada
  '509', // Canada Trust
  '540', // Manulife Bank
  '568', // Peace Hills Trust
  '614', // Tangerine
  '621', // KEB Hana Canada
  '623', // EQ Bank / Equitable
  '618', // B2B Bank
  '809', // Central 1 (BC)
  '815', // Desjardins (QC)
  '819', // Desjardins (MB)
  '828', // Central 1 (ON)
  '829', // Desjardins (ON)
  '837', // Meridian
  '839', // Credit Union Atlantic
  '849', // Brunswick Credit Union
  '865', // Desjardins (Caisse populaire)
  '879', // Credit Union Central MB
  '889', // Credit Union Central SK
  '899', // Alberta Central
]);

function validateTransit(ctx: ValidationContext): ValidationResult {
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer sequence');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer sequence');

  const [branch, institution] = ctx.match[0].split('-') as [string, string];
  if (!INSTITUTIONS.has(institution)) return invalid('unknown institution number');

  return valid({
    canonical: `${branch}-${institution}`,
    metadata: { branch, institution },
    validator: 'transit-institution-table',
  });
}

registerDetector({
  id: 'ca-transit-number',
  entityType: 'CA_TRANSIT_NUMBER',
  regions: ['CA'],
  pattern: /\b\d{5}-\d{3}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Canadian branch-institution transit numbers, institution validated against the Payments Canada table.',
  validate: validateTransit,
});
