/**
 * IP_ADDRESS (IPv4) — valid-range checking with scope classification.
 *
 * SPEC.md: "IP_ADDRESS — v4 and v6 with valid-range checking;
 * private/reserved ranges classified separately and lower sensitivity by
 * default." Scope drives both metadata and confidence: a routable public
 * address is a strong signal; a 10.x.x.x reveals only that someone has a
 * LAN. The TEST-NET documentation ranges are non-sensitive by construction —
 * they exist so that documentation can contain addresses.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

type Ipv4Scope =
  | 'public'
  | 'private'
  | 'loopback'
  | 'link-local'
  | 'cgn'
  | 'documentation'
  | 'benchmarking'
  | 'multicast'
  | 'reserved'
  | 'broadcast'
  | 'unspecified'
  | 'this-network';

function classify(o: readonly [number, number, number, number]): Ipv4Scope {
  const [a, b, c] = o;
  if (a === 0) return o.every((x) => x === 0) ? 'unspecified' : 'this-network';
  if (a === 10) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'cgn';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 192 && b === 0 && c === 2) return 'documentation'; // TEST-NET-1
  if (a === 192 && b === 168) return 'private';
  if (a === 198 && (b === 18 || b === 19)) return 'benchmarking';
  if (a === 198 && b === 51 && c === 100) return 'documentation'; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return 'documentation'; // TEST-NET-3
  if (a >= 224 && a <= 239) return 'multicast';
  if (o[0] === 255 && o[1] === 255 && o[2] === 255 && o[3] === 255) return 'broadcast';
  if (a >= 240) return 'reserved';
  return 'public';
}

function validateIpv4(ctx: ValidationContext): ValidationResult {
  // Reject dotted runs that are fragments of something longer: a version
  // string ("v1.2.3.4"), a 5-part sequence ("1.2.3.4.5"), or a decimal
  // neighbourhood. \b cannot see these, so the validator looks around.
  const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
  if (before === '.' || before === 'v' || before === 'V' || /\d/.test(before ?? '')) {
    return invalid('embedded in a longer dotted sequence');
  }
  const after = ctx.text.slice(ctx.end, ctx.end + 2);
  if (/^\.\d/.test(after)) return invalid('embedded in a longer dotted sequence');

  const parts = ctx.match[0].split('.');
  if (parts.length !== 4) return invalid('not four octets');
  const octets: number[] = [];
  for (const p of parts) {
    if (p.length === 0 || p.length > 3) return invalid('octet length out of range');
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return invalid('octet out of range');
    octets.push(v);
  }
  const o = octets as unknown as readonly [number, number, number, number];
  const scope = classify(o);

  // Canonical form strips zero-padding ("192.168.001.001" → "192.168.1.1")
  // so log-formatted and plain writings of one address share a vault entry.
  const canonical = o.join('.');

  if (scope === 'documentation') {
    return valid({
      canonical,
      sensitive: false,
      confidence: CONFIDENCE.MEDIUM,
      metadata: { version: 4, scope },
      validator: 'ipv4-range',
    });
  }
  if (scope === 'broadcast' || scope === 'unspecified') {
    // Well-known constants; identifying nothing.
    return valid({
      canonical,
      sensitive: false,
      confidence: CONFIDENCE.LOW,
      metadata: { version: 4, scope },
      validator: 'ipv4-range',
    });
  }
  const isPublic = scope === 'public';
  return valid({
    canonical,
    confidence: isPublic ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    metadata: { version: 4, scope },
    validator: 'ipv4-range',
  });
}

registerDetector({
  id: 'ip-v4',
  entityType: 'IP_ADDRESS',
  regions: [GLOBAL_REGION],
  pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'IPv4 addresses with range validation; private/reserved scopes classified at lower confidence.',
  validate: validateIpv4,
});
