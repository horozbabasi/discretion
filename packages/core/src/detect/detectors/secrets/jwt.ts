/**
 * JWT — structural validation.
 *
 * SPEC.md: "three base64url segments, header decodes to valid JSON with an
 * alg field." That is exactly the bar: a JWT's signature cannot be verified
 * without its key, so structure is all there is — but a well-formed header
 * with a real `alg` is a strong and specific signal. base64url is decoded
 * by hand (atob is a DOM global, banned in core).
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** Registered JWS algorithms plus 'none'; a header alg must be one of these. */
const JWT_ALGS = new Set([
  'none',
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES256K', 'ES384', 'ES512',
  'PS256', 'PS384', 'PS512',
  'EdDSA',
]);

function base64urlDecode(segment: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0;
  let acc = 0;
  const bytes: number[] = [];
  for (const ch of b64) {
    const v = chars.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  // Decode UTF-8 bytes to a string.
  try {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i]!;
      if (b0 < 0x80) { out += String.fromCharCode(b0); i += 1; }
      else if (b0 < 0xe0) { out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1]! & 0x3f)); i += 2; }
      else if (b0 < 0xf0) { out += String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f)); i += 3; }
      else {
        const cp = ((b0 & 0x07) << 18) | ((bytes[i + 1]! & 0x3f) << 12) | ((bytes[i + 2]! & 0x3f) << 6) | (bytes[i + 3]! & 0x3f);
        out += String.fromCodePoint(cp);
        i += 4;
      }
    }
    return out;
  } catch {
    return null;
  }
}

function validateJwt(ctx: ValidationContext): ValidationResult {
  const parts = ctx.match[0].split('.');
  if (parts.length !== 3) return invalid('not three segments');
  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];
  if (signatureSeg.length === 0) return invalid('empty signature segment');

  const headerJson = base64urlDecode(headerSeg);
  if (headerJson === null) return invalid('header is not base64url');

  let header: unknown;
  try {
    header = JSON.parse(headerJson);
  } catch {
    return invalid('header is not JSON');
  }
  if (typeof header !== 'object' || header === null) return invalid('header is not a JSON object');
  const alg = (header as Record<string, unknown>)['alg'];
  if (typeof alg !== 'string' || !JWT_ALGS.has(alg)) return invalid('header has no valid alg');

  // The payload must at least decode as base64url; it need not be JSON
  // (though it usually is) — some tokens carry non-JSON claims sets.
  if (base64urlDecode(payloadSeg) === null) return invalid('payload is not base64url');

  return valid({
    canonical: ctx.match[0],
    metadata: { alg },
    validator: 'jwt-structural',
  });
}

registerDetector({
  id: 'jwt',
  entityType: 'JWT',
  regions: [GLOBAL_REGION],
  pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'JSON Web Tokens: three base64url segments, header JSON carrying a valid alg.',
  validate: validateJwt,
});
