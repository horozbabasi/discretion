/**
 * CRYPTO_WALLET: Monero.
 *
 * Block-wise base58 (Monero's own variant), then the real checksum: the
 * last four payload bytes must equal the first four of Keccak-256 over the
 * rest. Standard (95 chars, network 0x12) and subaddress (95 chars, 0x2a)
 * decode to 69 bytes; integrated addresses (106 chars, 0x13) to 77.
 */

import { keccak256 } from '../../../crypto/keccak256.js';
import { moneroBase58Decode } from '../../../encoding/base58monero.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const NETWORK_KINDS: Readonly<Record<number, string>> = {
  0x12: 'standard',
  0x2a: 'subaddress',
  0x13: 'integrated',
};

function validateXmr(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const bytes = moneroBase58Decode(raw);
  if (bytes === null) return invalid('not Monero base58');
  if (bytes.length !== 69 && bytes.length !== 77) return invalid('unexpected payload size');

  const kind = NETWORK_KINDS[bytes[0]!];
  if (kind === undefined) return invalid('unknown network byte');

  const body = bytes.slice(0, bytes.length - 4);
  const checksum = bytes.slice(bytes.length - 4);
  const expected = keccak256(body).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) return invalid('keccak checksum failed');
  }

  return valid({
    canonical: raw,
    metadata: { chain: 'xmr', kind },
    validator: 'monero-keccak',
  });
}

registerDetector({
  id: 'crypto-xmr',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  // 95-char standard/subaddress or 106-char integrated, first char 4 or 8.
  pattern: /\b[48][1-9A-HJ-NP-Za-km-z]{94}(?:[1-9A-HJ-NP-Za-km-z]{11})?\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Monero addresses: block-wise base58 with the Keccak-256 checksum verified.',
  validate: validateXmr,
});
