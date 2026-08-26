/**
 * IN_IFSC — Indian Financial System Codes.
 *
 * Structure: 4 uppercase letters (bank), a MANDATORY '0' (reserved fifth
 * character), 6 alphanumerics (branch). The fixed zero at position five is
 * what makes this format strong: no English word or acronym has that shape,
 * so unlike SWIFT BICs the all-letter collision class is empty and HIGH
 * confidence is warranted despite the absence of a checksum. A bank-code
 * whitelist was considered and rejected — the RBI issues new bank codes
 * routinely, and a stale table would silently reject real branches.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateIfsc(ctx: ValidationContext): ValidationResult {
  const code = ctx.match[0];
  // The branch part must not be all letters: real branch codes carry at
  // least one digit, and requiring it removes the residual word-shaped
  // collisions (e.g. an uppercase heading "ABCD0EFGHI" would need exactly
  // this test to sneak through).
  if (!/\d/.test(code.slice(5))) return invalid('branch code carries no digit');

  return valid({
    canonical: code,
    metadata: { bank: code.slice(0, 4), branch: code.slice(5) },
    validator: 'ifsc-structural',
  });
}

registerDetector({
  id: 'in-ifsc',
  entityType: 'IN_IFSC',
  regions: ['IN'],
  pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Indian IFSC codes: four letters, the mandatory reserved zero, six-character branch.',
  validate: validateIfsc,
});
