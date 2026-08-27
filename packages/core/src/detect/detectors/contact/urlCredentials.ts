/**
 * URL_WITH_CREDENTIALS — userinfo passwords and credential-bearing query
 * parameters.
 *
 * SPEC.md: "URL_WITH_CREDENTIALS — userinfo components or tokens in query
 * parameters."
 *
 * Two shapes, one detector:
 *   • scheme://user:password@host…      (userinfo with a password)
 *   • scheme://…?token=…&…              (a credential-named query parameter)
 *
 * The emitted span is the WHOLE URL, not just the secret. Masking only the
 * password would leave "https://admin:…@internal.corp.com" — still leaking
 * the username and the internal host — and M4's surrogate substitution can
 * replace a whole URL with a same-shape fake, which it cannot do for a URL
 * with a hole in it. The credential's location travels in metadata.
 *
 * A bare username without a password (git@github.com style) is NOT a
 * credential; ubiquitous and public. Template placeholders (${VAR},
 * YOUR_API_KEY) are detected but non-sensitive, mirroring test values.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** Parameter names that are credentials whenever they carry a real value. */
const STRONG_PARAMS = new Set([
  'token', 'accesstoken', 'authtoken', 'idtoken', 'refreshtoken', 'apitoken', 'sastoken',
  'apikey', 'secret', 'clientsecret', 'privatekey', 'password', 'passwd', 'pwd',
  'authorization', 'bearer', 'credential', 'credentials',
]);

/**
 * Names too generic to trust alone ("?key=north", "?sig=v2"): the value must
 * itself look like key material — long and drawn from token alphabets.
 */
const WEAK_PARAMS = new Set(['key', 'auth', 'sig', 'signature', 'session', 'sessionid', 'code']);

const WEAK_VALUE_SHAPE = /^[A-Za-z0-9+/_.=~%-]{16,}$/;

/** Obvious template/placeholder values: detected, non-sensitive. */
function isPlaceholder(value: string): boolean {
  if (/^\$\{[^}]*\}$/.test(value) || /^\{\{[^}]*\}\}$/.test(value)) return true;
  if (/^<[^>]*>$/.test(value)) return true;
  if (/^(?:x+|X+|\*+|\.+)$/.test(value)) return true;
  if (/^YOUR[_-]/i.test(value) || /[_-]HERE$/i.test(value)) return true;
  if (/^(?:changeme|placeholder|redacted|example|dummy|sample|test)$/i.test(value)) return true;
  return false;
}

/** RFC 2606/6761 documentation hosts → the whole URL is a doc example. */
function isReservedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/(^|\.)example\.(com|net|org)$/.test(h)) return true;
  return /\.(test|invalid|example)$/.test(h);
}

function validateUrlCredentials(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const schemeEnd = raw.indexOf('://');
  if (schemeEnd < 0) return invalid('no scheme');
  const rest = raw.slice(schemeEnd + 3);

  // Userinfo form: user:password@host…
  const slash = rest.search(/[/?#]/);
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const at = authority.lastIndexOf('@');
  if (at > 0) {
    const userinfo = authority.slice(0, at);
    const host = authority.slice(at + 1);
    const colon = userinfo.indexOf(':');
    if (colon <= 0 || colon === userinfo.length - 1) {
      return invalid('userinfo has no password');
    }
    const password = userinfo.slice(colon + 1);
    const placeholder = isPlaceholder(password) || isReservedHost(host);
    return valid({
      sensitive: !placeholder,
      metadata: { kind: 'userinfo', host },
      validator: 'url-credential-structural',
    });
  }

  // Query-parameter form.
  const paramPattern = /[?&]([A-Za-z0-9_-]+)=([^\s&"'<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramPattern.exec(raw)) !== null) {
    const name = m[1]!.toLowerCase().replace(/[_-]/g, '');
    const value = m[2]!;
    const strong = STRONG_PARAMS.has(name);
    const weak = WEAK_PARAMS.has(name);
    if (!strong && !weak) continue;
    if (strong && value.length < 6) continue;
    if (weak && !WEAK_VALUE_SHAPE.test(value)) continue;

    const host = authority;
    const placeholder = isPlaceholder(value) || isReservedHost(host);
    return valid({
      sensitive: !placeholder,
      metadata: { kind: 'query', param: m[1]!, host },
      validator: 'url-credential-structural',
    });
  }

  return invalid('no credential-bearing component');
}

registerDetector({
  id: 'url-with-credentials',
  entityType: 'URL_WITH_CREDENTIALS',
  regions: [GLOBAL_REGION],
  // Commas and pipes terminate the URI. RFC 3986 permits a comma as a
  // sub-delimiter, but in the shapes URIs actually appear in — CSV rows,
  // pipe-delimited logs, markdown table cells — an unencoded one is a FIELD
  // boundary, and swallowing it made this span eat the neighbouring cells.
  // That is not merely a mislabelled span: masking OVERWRITES the span, so an
  // over-long one destroys the user's adjacent data.
  pattern: /\b[A-Za-z][A-Za-z0-9+.-]{1,15}:\/\/[^\s"'<>,|]{3,700}/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'URLs carrying credentials in userinfo or query parameters; whole-URL span.',
  validate: validateUrlCredentials,
});
