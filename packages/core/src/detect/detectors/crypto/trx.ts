/**
 * CRYPTO_WALLET: Tron.
 *
 * base58check with version byte 0x41 and a 20-byte payload; always written
 * starting with 'T' and 34 characters long. Fully checksum-verified.
 */

import { base58CheckDecode } from '../../../encoding/base58.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateTrx(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const decoded = base58CheckDecode(raw);
  if (decoded === null) return invalid('base58check checksum failed');
  if (decoded.version !== 0x41) return invalid('not the Tron version byte');
  if (decoded.payload.length !== 20) return invalid('payload is not 20 bytes');

  return valid({
    canonical: raw,
    metadata: { chain: 'trx' },
    validator: 'base58check',
  });
}

registerDetector({
  id: 'crypto-trx',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Tron addresses: base58check, version 0x41, checksummed.',
  validate: validateTrx,
});
