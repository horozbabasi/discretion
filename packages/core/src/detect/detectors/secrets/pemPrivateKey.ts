/**
 * PRIVATE_KEY — PEM private-key blocks.
 *
 * A whole armored block, header through footer, is matched and the span
 * covers all of it: a private key with its header stripped is still a
 * private key, and substitution must replace the entire block. The type is
 * PRIVATE_KEY (its own EntityType, split from API_KEY in ARCHITECTURE.md D4)
 * because a leaked private key's blast radius and its surrogate differ from
 * a token's. Confidence is MAXIMUM: a well-formed PEM private-key block is
 * essentially never a false positive.
 *
 * PUBLIC-key blocks and CERTIFICATE blocks are deliberately excluded — they
 * are not secret.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const KEY_LABELS = [
  'PRIVATE KEY',
  'RSA PRIVATE KEY',
  'EC PRIVATE KEY',
  'DSA PRIVATE KEY',
  'OPENSSH PRIVATE KEY',
  'PGP PRIVATE KEY BLOCK',
  'ENCRYPTED PRIVATE KEY',
];

function validatePem(ctx: ValidationContext): ValidationResult {
  const label = ctx.match[1];
  const footerLabel = ctx.match[3];
  if (label === undefined || !KEY_LABELS.includes(label)) return invalid('not a private-key label');
  if (label !== footerLabel) return invalid('header and footer labels differ');

  const body = ctx.match[2] ?? '';
  // The body between the armor lines must contain real base64 content, not
  // just whitespace — an empty pair of armor lines is a template, not a key.
  if (!/[A-Za-z0-9+/]{16,}/.test(body)) return invalid('no key material between armor lines');

  return valid({
    canonical: ctx.match[0].trim(),
    confidence: CONFIDENCE.MAXIMUM,
    metadata: { keyType: label },
    validator: 'pem-armor',
  });
}

registerDetector({
  id: 'pem-private-key',
  entityType: 'PRIVATE_KEY',
  regions: [GLOBAL_REGION],
  // Header, body, footer. [\s\S] so the body can cross newlines; the label
  // is captured twice so the validator can require they match.
  pattern: /-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END ([A-Z0-9 ]+?)-----/g,
  baseConfidence: CONFIDENCE.MAXIMUM,
  description: 'PEM private-key blocks (RSA/EC/DSA/OpenSSH/PGP/PKCS8), whole-block span.',
  validate: validatePem,
});
