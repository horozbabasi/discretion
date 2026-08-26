/**
 * CRYPTO_WALLET: Litecoin.
 *
 * base58check versions 0x30 ('L…', P2PKH) and 0x32 ('M…', P2SH), plus
 * bech32 'ltc1…' segwit under the same BIP-173 rules as Bitcoin. Litecoin's
 * legacy '3…' P2SH form is deliberately NOT claimed here — it is
 * indistinguishable from Bitcoin P2SH (same version byte), and the BTC
 * detector already reports it; chain attribution for that shared prefix is
 * genuinely ambiguous and pretending otherwise would be false metadata.
 */

import { base58CheckDecode } from '../../../encoding/base58.js';
import { bech32Decode, convertBits } from '../../../encoding/bech32.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateLtc(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  if (raw[0] === 'L' || raw[0] === 'M') {
    const decoded = base58CheckDecode(raw);
    if (decoded === null) return invalid('base58check checksum failed');
    if (decoded.version !== 0x30 && decoded.version !== 0x32) {
      return invalid('not a Litecoin version byte');
    }
    if (decoded.payload.length !== 20) return invalid('payload is not a hash160');
    return valid({
      canonical: raw,
      metadata: { chain: 'ltc', kind: decoded.version === 0x30 ? 'p2pkh' : 'p2sh' },
      validator: 'base58check',
    });
  }

  const decoded = bech32Decode(raw);
  if (decoded === null) return invalid('bech32 checksum failed');
  if (decoded.hrp !== 'ltc') return invalid('not the Litecoin hrp');
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
    metadata: { chain: 'ltc', kind: version === 0 ? 'segwit-v0' : `segwit-v${version}` },
    validator: decoded.encoding,
  });
}

registerDetector({
  id: 'crypto-ltc',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\b(?:[LM][1-9A-HJ-NP-Za-km-z]{25,34}|(?:ltc1|LTC1)[0-9A-Za-z]{11,87})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Litecoin addresses: base58check L/M forms and ltc1 segwit, all checksummed.',
  validate: validateLtc,
});
