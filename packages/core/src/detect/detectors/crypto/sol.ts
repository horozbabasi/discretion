/**
 * CRYPTO_WALLET: Solana.
 *
 * A Solana address is a bare ed25519 public key in Bitcoin-alphabet base58 —
 * there is NO checksum, so this is structural validation: the string must
 * decode to EXACTLY 32 bytes, which rejects most base58-looking words (a
 * 40-character run decodes to ~29 bytes, a Bitcoin address to 25). MEDIUM
 * by the no-checksum rule.
 *
 * The system program (32 '1's, the all-zero key) is a well-known constant.
 */

import { base58Decode } from '../../../encoding/base58.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateSol(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const bytes = base58Decode(raw);
  if (bytes === null) return invalid('not base58');
  if (bytes.length !== 32) return invalid('not a 32-byte key');

  const allZero = bytes.every((b) => b === 0);
  return valid({
    canonical: raw,
    sensitive: !allZero,
    metadata: { chain: 'sol', ...(allZero ? { wellKnown: 'system-program' } : {}) },
    validator: 'sol-structural',
  });
}

registerDetector({
  id: 'crypto-sol',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Solana addresses: base58 decoding to exactly 32 bytes. No checksum exists; MEDIUM.',
  validate: validateSol,
});
