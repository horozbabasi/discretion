/**
 * CRYPTO_WALLET: Polkadot.
 *
 * SS58 closes with the first two bytes of blake2b-512("SS58PRE" ‖ payload).
 * Blake2b is not among the bundled hash primitives, and Polkadot would be
 * its only consumer, so per the recorded decision (ARCHITECTURE.md D9) this
 * detector validates STRUCTURALLY at MEDIUM: base58 decodes to exactly 35
 * bytes (1 network + 32 key + 2 checksum) with the Polkadot network byte
 * 0x00 — which is also why the address always starts with '1'. The checksum
 * bytes are present but unverified; the confidence cap says so.
 */

import { base58Decode } from '../../../encoding/base58.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateDot(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const bytes = base58Decode(raw);
  if (bytes === null) return invalid('not base58');
  if (bytes.length !== 35) return invalid('not an SS58 account envelope');
  if (bytes[0] !== 0x00) return invalid('not the Polkadot network prefix');

  return valid({
    canonical: raw,
    metadata: { chain: 'dot', checksum: 'unverified' },
    validator: 'ss58-structural',
  });
}

registerDetector({
  id: 'crypto-dot',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  // Network byte 0x00 → leading '1'; 35 bytes → 45–51 chars, disjoint from
  // the Bitcoin P2PKH length range (26–35) that shares the prefix.
  pattern: /\b1[1-9A-HJ-NP-Za-km-z]{44,50}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Polkadot SS58 addresses, structural (blake2b checksum unverified - ARCHITECTURE.md D9).',
  validate: validateDot,
});
