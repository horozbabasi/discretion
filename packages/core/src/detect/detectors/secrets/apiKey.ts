/**
 * API_KEY — known-prefix provider tokens, driven by the data-file table.
 *
 * SPEC.md wants providers addable "without code changes", so this single
 * detector reads @privacyshield/data's SECRET_PROVIDERS. The pattern is the
 * alternation of every prefix; the validator resolves the longest matching
 * prefix, checks the body charset and length, and runs the provider's
 * checksum where one exists (GitHub's base62 CRC32).
 *
 * Stripe TEST keys (sk_test_, pk_test_) are handled as a non-sensitive
 * sibling of the live prefixes: detected so eval sees them, never masked.
 */

import { SECRET_PROVIDERS, SECRET_CHARSET_PATTERN } from '@privacyshield/data';
import type { SecretProvider } from '@privacyshield/data';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** GitHub token CRC32 over the 30-char random body → 6-char base62 check. */
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function crc32(s: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i);
    for (let b = 0; b < 8; b++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** GitHub's check: last 6 base62 chars encode crc32 of the preceding body. */
function githubChecksumValid(body: string): boolean {
  if (body.length < 7) return false;
  const random = body.slice(0, body.length - 6);
  const check = body.slice(body.length - 6);
  let value = crc32(random);
  let encoded = '';
  for (let i = 0; i < 6; i++) {
    encoded = BASE62[value % 62]! + encoded;
    value = Math.floor(value / 62);
  }
  return encoded === check;
}

/** All prefixes, longest first, each paired with its provider. */
const PREFIX_INDEX: readonly (readonly [string, SecretProvider])[] = SECRET_PROVIDERS.flatMap((p) =>
  p.prefixes.map((prefix) => [prefix, p] as const),
).sort((a, b) => b[0].length - a[0].length);

/** Stripe test-key prefixes: detected, non-sensitive. */
const STRIPE_TEST_PREFIXES = ['sk_test_', 'pk_test_', 'rk_test_'];

function validateApiKey(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];

  for (const testPrefix of STRIPE_TEST_PREFIXES) {
    if (raw.startsWith(testPrefix)) {
      return valid({
        canonical: raw,
        sensitive: false,
        metadata: { provider: 'stripe', test: true },
        validator: 'provider-prefix',
      });
    }
  }

  for (const [prefix, provider] of PREFIX_INDEX) {
    if (!raw.startsWith(prefix)) continue;
    const body = raw.slice(prefix.length);
    const [min, max] = provider.bodyLength;
    if (body.length < min || body.length > max) return invalid('body length outside provider window');
    if (!SECRET_CHARSET_PATTERN[provider.bodyCharset].test(body.replace(/[.]/g, ''))) {
      return invalid('body charset mismatch');
    }
    if (provider.checksum === 'github' && !githubChecksumValid(body)) {
      return invalid('GitHub token checksum failed');
    }
    return valid({
      canonical: raw,
      metadata: { provider: provider.id, ...(provider.checksum !== undefined ? { checksum: provider.checksum } : {}) },
      validator: provider.checksum !== undefined ? `${provider.id}-checksum` : 'provider-prefix',
    });
  }

  return invalid('no known provider prefix');
}

/** Build one alternation of every prefix, longest first, regex-escaped. */
const PREFIX_ALTERNATION = PREFIX_INDEX.map(([prefix]) => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .concat(STRIPE_TEST_PREFIXES)
  .join('|');

registerDetector({
  id: 'api-key',
  entityType: 'API_KEY',
  regions: [GLOBAL_REGION],
  pattern: new RegExp(`(?:${PREFIX_ALTERNATION})[A-Za-z0-9._-]{10,130}`, 'g'),
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Provider API tokens from the bundled prefix table; GitHub checksums verified.',
  validate: validateApiKey,
});
