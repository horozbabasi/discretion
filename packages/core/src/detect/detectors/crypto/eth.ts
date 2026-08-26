/**
 * CRYPTO_WALLET: Ethereum (and every EVM chain sharing its format).
 *
 * 0x + 40 hex characters. When the hex is MIXED-case, EIP-55 applies: the
 * i-th letter is uppercase iff the i-th nibble of keccak256(lowercase hex
 * of the address) is ≥ 8 — a real checksum, verified here, HIGH on pass and
 * a hard rejection on failure. An all-lowercase or all-uppercase address
 * carries no checksum at all (that writing predates EIP-55 and is still
 * common), so it validates structurally at MEDIUM.
 *
 * The zero address is the conventional burn target and identifies nobody.
 */

import { keccak256 } from '../../../crypto/keccak256.js';
import { utf8ToBytes, bytesToHex } from '../../../encoding/bytes.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** EIP-55: the correctly-checksummed writing of a lowercase hex address. */
export function toEip55(hexLower: string): string {
  const hash = bytesToHex(keccak256(utf8ToBytes(hexLower)));
  let out = '';
  for (let i = 0; i < 40; i++) {
    const ch = hexLower[i]!;
    out += /[a-f]/.test(ch) && parseInt(hash[i]!, 16) >= 8 ? ch.toUpperCase() : ch;
  }
  return out;
}

function validateEth(ctx: ValidationContext): ValidationResult {
  const hex = ctx.match[0].slice(2);
  const lower = hex.toLowerCase();
  const hasLower = /[a-f]/.test(hex);
  const hasUpper = /[A-F]/.test(hex);

  const canonical = `0x${lower}`;
  const sensitive = canonical !== ZERO_ADDRESS;

  if (hasLower && hasUpper) {
    if (toEip55(lower) !== hex) return invalid('EIP-55 checksum failed');
    return valid({
      canonical,
      sensitive,
      metadata: { chain: 'eth', checksum: 'eip55' },
      validator: 'eip55',
    });
  }

  // Single-case writing: no checksum exists to verify.
  return valid({
    canonical,
    sensitive,
    confidence: CONFIDENCE.MEDIUM,
    metadata: { chain: 'eth', checksum: 'none' },
    validator: 'eth-structural',
  });
}

registerDetector({
  id: 'crypto-eth',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\b0x[0-9a-fA-F]{40}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Ethereum addresses; EIP-55 verified where mixed-case, MEDIUM where uncased.',
  validate: validateEth,
});
