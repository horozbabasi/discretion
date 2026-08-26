/**
 * CRYPTO_WALLET: Bitcoin.
 *
 * Three address families, all checksum-verified:
 *   • base58check version 0x00 (P2PKH, '1…') and 0x05 (P2SH, '3…')
 *   • bech32 'bc1q…' — segwit v0, program exactly 20 or 32 bytes
 *   • bech32m 'bc1p…' — segwit v1+ (taproot), program 2–40 bytes
 * The v0/v1 encoding split is BIP-350's rule: a v0 address closed with
 * bech32m (or v1 with bech32) is INVALID, not merely unusual.
 *
 * The genesis address is treated like a documentation value: it appears in
 * every Bitcoin tutorial and identifies no user.
 */

import { base58CheckDecode } from '../../../encoding/base58.js';
import { bech32Decode, convertBits } from '../../../encoding/bech32.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const WELL_KNOWN: ReadonlySet<string> = new Set([
  '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // genesis block coinbase
]);

function validateBtc(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  if (raw[0] === '1' || raw[0] === '3') {
    const decoded = base58CheckDecode(raw);
    if (decoded === null) return invalid('base58check checksum failed');
    if (decoded.version !== 0x00 && decoded.version !== 0x05) {
      return invalid('not a Bitcoin version byte');
    }
    if (decoded.payload.length !== 20) return invalid('payload is not a hash160');
    return valid({
      canonical: raw,
      sensitive: !WELL_KNOWN.has(raw),
      metadata: { chain: 'btc', kind: decoded.version === 0x00 ? 'p2pkh' : 'p2sh' },
      validator: 'base58check',
    });
  }

  const decoded = bech32Decode(raw);
  if (decoded === null) return invalid('bech32 checksum failed');
  if (decoded.hrp !== 'bc') return invalid('not the Bitcoin hrp');
  if (decoded.data.length === 0) return invalid('empty witness data');
  const version = decoded.data[0]!;
  if (version > 16) return invalid('witness version out of range');
  const program = convertBits(decoded.data.slice(1), 5, 8, false);
  if (program === null || program.length < 2 || program.length > 40) {
    return invalid('malformed witness program');
  }
  if (version === 0) {
    if (decoded.encoding !== 'bech32') return invalid('segwit v0 requires bech32');
    if (program.length !== 20 && program.length !== 32) {
      return invalid('v0 program must be 20 or 32 bytes');
    }
  } else if (decoded.encoding !== 'bech32m') {
    return invalid('segwit v1+ requires bech32m');
  }

  return valid({
    canonical: raw.toLowerCase(),
    metadata: { chain: 'btc', kind: version === 0 ? 'segwit-v0' : `segwit-v${version}` },
    validator: decoded.encoding,
  });
}

registerDetector({
  id: 'crypto-btc',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\b(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|(?:bc1|BC1)[0-9A-Za-z]{11,87})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Bitcoin addresses: base58check P2PKH/P2SH and BIP-173/350 segwit, all checksummed.',
  validate: validateBtc,
});
