/**
 * EMAIL — structural validation, IDN/punycode aware.
 *
 * SPEC.md: "EMAIL — structural validation, IDN/punycode aware, reject
 * reserved example domains at high confidence." "Reject" there means reject
 * as SENSITIVE: an address at example.com is detected (so eval can see it)
 * but classified non-sensitive, the same treatment as test credit cards.
 *
 * The pattern over-generates: it accepts any plausible local@domain.tld run,
 * including Unicode letters on both sides (IDN). The validator applies the
 * structural rules that matter for precision — label lengths, hyphen and dot
 * placement, TLD plausibility — rather than attempting full RFC 5322, whose
 * grammar admits addresses no mail system accepts.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/**
 * Reserved names that can never be a real deliverable domain (RFC 2606 /
 * RFC 6761). Addresses here are documentation examples: detected, but
 * non-sensitive.
 */
const RESERVED_SECOND_LEVEL = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);

/** atext (RFC 5322) plus Unicode letters/digits for EAI local parts. */
const UNQUOTED_LOCAL = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+$/u;

/** One domain label: letters/digits with interior hyphens. */
const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;

/** Punycode labels must be pure LDH after the xn-- prefix. */
const PUNYCODE_LABEL = /^xn--[a-z0-9-]+$/;

function validateEmail(ctx: ValidationContext): ValidationResult {
  let start = ctx.start;
  const end = ctx.end;
  let raw = ctx.text.slice(start, end);

  // Sentence punctuation and quoting absorb into the local part because '.'
  // and '\'' are legal atext: «Contact: .john@x.com» or «'john@x.com'».
  // Trim from the left and narrow the span. Interior dots/apostrophes
  // (o'brien@…) are untouched.
  while (raw.length > 0 && (raw[0] === '.' || raw[0] === "'")) {
    raw = raw.slice(1);
    start += 1;
  }

  if (raw.length > 254) return invalid('address exceeds 254 characters');

  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return invalid('missing local part or domain');
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  // Local part: quoted string or dot-atom.
  if (local.startsWith('"') && local.endsWith('"') && local.length >= 3) {
    if (local.length > 64) return invalid('local part exceeds 64 characters');
  } else {
    if (local.length > 64) return invalid('local part exceeds 64 characters');
    if (!UNQUOTED_LOCAL.test(local)) return invalid('illegal character in local part');
    if (local.startsWith('.') || local.endsWith('.')) return invalid('local part begins or ends with a dot');
    if (local.includes('..')) return invalid('consecutive dots in local part');
  }

  // Domain: dot-separated labels, each individually checked.
  const domainLower = domain.toLowerCase();
  const labels = domainLower.split('.');
  if (labels.length < 2) return invalid('domain has no top-level label');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return invalid('domain label length out of range');
    if (label.startsWith('xn--')) {
      if (!PUNYCODE_LABEL.test(label)) return invalid('malformed punycode label');
      continue;
    }
    if (!LABEL.test(label)) return invalid('malformed domain label');
  }
  const tld = labels[labels.length - 1]!;
  if (tld.length < 2 && !tld.startsWith('xn--')) return invalid('implausible top-level domain');
  if (/^[0-9]+$/.test(tld)) return invalid('all-numeric top-level domain');

  // Reserved documentation domains: detected, classified non-sensitive.
  const lastTwo = labels.slice(-2).join('.');
  const reserved = RESERVED_TLDS.has(tld) || RESERVED_SECOND_LEVEL.has(lastTwo);

  const hasUnicode = !/^[\x20-\x7e]*$/.test(raw);

  return valid({
    canonical: `${local}@${domainLower}`,
    sensitive: !reserved,
    metadata: {
      domain: domainLower,
      idn: hasUnicode,
      punycode: labels.some((l) => l.startsWith('xn--')),
      ...(reserved ? { reserved: true } : {}),
    },
    validator: 'email-structural',
    span: { start, end },
  });
}

registerDetector({
  id: 'email',
  entityType: 'EMAIL',
  regions: [GLOBAL_REGION],
  pattern:
    /(?:"[^"\r\n]{1,62}"|[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+)@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)+/gu,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Email addresses, IDN/punycode aware; example-domain addresses non-sensitive.',
  validate: validateEmail,
});
