/**
 * CRYPTO_WALLET: Cardano.
 *
 * Shelley addresses ('addr1…') are bech32 with a REAL checksum — verified
 * here with the length limit raised past BIP-173's 90 characters, which
 * Cardano exceeds by design — so they earn HIGH. Byron-era addresses
 * ('Ae2…', 'DdzFF…') wrap their CRC in a CBOR envelope; verifying it would
 * mean parsing CBOR for a legacy format, so Byron validates structurally
 * (base58-decodable with the known prefix) at MEDIUM. The asymmetry is
 * deliberate and stated here rather than hidden.
 */

import { base58Decode } from '../../../encoding/base58.js';
import { bech32Decode } from '../../../encoding/bech32.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateAda(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  if (raw.toLowerCase().startsWith('addr1')) {
    const decoded = bech32Decode(raw, 130);
    if (decoded === null) return invalid('bech32 checksum failed');
    if (decoded.hrp !== 'addr') return invalid('not the Cardano hrp');
    return valid({
      canonical: raw.toLowerCase(),
      metadata: { chain: 'ada', era: 'shelley' },
      validator: 'bech32',
    });
  }

  const bytes = base58Decode(raw);
  if (bytes === null) return invalid('not base58');
  if (bytes.length < 30) return invalid('too short for a Byron address');
  return valid({
    canonical: raw,
    confidence: CONFIDENCE.MEDIUM,
    metadata: { chain: 'ada', era: 'byron' },
    validator: 'byron-structural',
  });
}

registerDetector({
  id: 'crypto-ada',
  entityType: 'CRYPTO_WALLET',
  regions: [GLOBAL_REGION],
  pattern: /\b(?:addr1[02-9ac-hj-np-z]{20,110}|(?:Ae2|DdzFF)[1-9A-HJ-NP-Za-km-z]{20,120})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Cardano addresses: Shelley bech32 checksummed at HIGH, Byron structural at MEDIUM.',
  validate: validateAda,
});
