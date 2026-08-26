/**
 * MAC_ADDRESS — colon, hyphen and Cisco dotted notations.
 *
 * A MAC has no checksum, but its shape — six hex octets with a CONSISTENT
 * separator, or three dotted quads — is distinctive enough that structural
 * validation carries high confidence. The separator consistency is enforced
 * in the pattern via a backreference; mixed separators do not match at all.
 *
 * The broadcast (ff:ff:…) and null (00:00:…) addresses are well-known
 * constants that identify no device: detected, classified non-sensitive,
 * mirroring SPEC.md's treatment of known test values.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

function validateMac(ctx: ValidationContext): ValidationResult {
  // A six-group run inside a longer separated sequence (an IPv6 address, a
  // long hex dump) is a fragment, not a MAC. \b cannot see separators.
  const before = ctx.start >= 2 ? ctx.text.slice(ctx.start - 2, ctx.start) : '';
  if (/[0-9A-Fa-f][:-]$/.test(before)) return invalid('fragment of a longer sequence');
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^[:-][0-9A-Fa-f]/.test(after)) return invalid('fragment of a longer sequence');

  const raw = ctx.match[0];
  const hex = raw.replace(/[^0-9A-Fa-f]/g, '');
  if (hex.length !== 12) return invalid('not six octets');
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));

  const canonical = bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
  const notation = raw.includes(':') ? 'colon' : raw.includes('-') ? 'hyphen' : 'cisco-dotted';

  const allFF = bytes.every((b) => b === 0xff);
  const allZero = bytes.every((b) => b === 0);
  if (allFF || allZero) {
    return valid({
      canonical,
      sensitive: false,
      confidence: CONFIDENCE.LOW,
      metadata: { notation, special: allFF ? 'broadcast' : 'null' },
      validator: 'mac-structural',
    });
  }

  const b0 = bytes[0]!;
  return valid({
    canonical,
    metadata: {
      notation,
      multicast: (b0 & 0x01) !== 0,
      locallyAdministered: (b0 & 0x02) !== 0,
    },
    validator: 'mac-structural',
  });
}

registerDetector({
  id: 'mac-address',
  entityType: 'MAC_ADDRESS',
  regions: [GLOBAL_REGION],
  pattern:
    /\b(?:[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}|[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'MAC addresses in colon, hyphen, or Cisco dotted notation; broadcast/null non-sensitive.',
  validate: validateMac,
});
