/**
 * Stage 3, NEGATIVE CONTEXT.
 *
 * SPEC.md: "NEGATIVE CONTEXT — signals that a candidate is NOT sensitive:
 * inside a code comment describing a format, in a documentation example
 * block, a known dummy value, lorem ipsum, a test fixture, a UUID in a log
 * line, a git SHA. These must actively suppress."
 *
 * THE SAFETY RULE FOR THIS FILE. Every rule here can cause a real secret to
 * go unreported, which in this product is the worst possible failure. So each
 * rule must satisfy three things, and each is enforced by review, not by the
 * type system alone:
 *
 *   1. It states a GENERAL principle about how text is written — never a
 *      literal drawn from the evaluation corpus. A rule tuned to the corpus
 *      would make the measured precision gain self-fulfilling and dishonest.
 *   2. It states the real positive it risks suppressing, in `risk`.
 *   3. It suppresses only on CONCLUSIVE evidence that the value is a
 *      different kind of thing. Where the evidence merely weakens the case,
 *      the rule returns a penalty instead, and the candidate survives at
 *      lower confidence.
 *
 * Note what is deliberately absent: no rule here looks at OTHER candidates'
 * spans. Deciding that a generic high-entropy match should yield to a
 * structurally validated JWT covering the same characters is cross-type
 * overlap resolution, which SPEC.md assigns to Stage 4. Keeping it out is
 * what stops Stage 3 quietly absorbing the next milestone's work.
 */

import type { EntityType } from '../types.js';
import type { NegativeRule, RuleContext } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Numeric identifier types that a containing structure can rule out. */
const NUMERIC_IDENTIFIERS: readonly EntityType[] = [
  'POSTAL_CODE',
  'NATIONAL_ID',
  'TAX_ID',
  'HEALTH_DATA',
  'DRIVERS_LICENSE',
  'US_ROUTING_NUMBER',
  'CREDIT_CARD',
  'US_NPI',
  'VIN',
];

/** Characters that may appear inside a written telephone number. */
const PHONE_RUN_CHAR = /[+\d\s().-]/;

/** Highest valid TCP/UDP port, used to sanity-check a `host:port` reading. */
const MAX_PORT = 65535;

function countDigits(value: string): number {
  let n = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') n += 1;
  return n;
}

/** The candidate's offsets relative to its own line. */
function localSpan(ctx: RuleContext): { start: number; end: number } {
  return { start: ctx.start - ctx.line.start, end: ctx.end - ctx.line.start };
}

/**
 * The maximal run of telephone-shaped characters containing the candidate.
 * Returns undefined when the candidate is not made only of such characters.
 */
function phoneRunAround(ctx: RuleContext): string | undefined {
  const { text } = ctx.line;
  const { start, end } = localSpan(ctx);
  const value = text.slice(start, end);
  if (value.length === 0 || !/^[\d\s().-]+$/.test(value)) return undefined;

  let from = start;
  let to = end;
  while (from > 0 && PHONE_RUN_CHAR.test(text[from - 1] ?? '')) from -= 1;
  while (to < text.length && PHONE_RUN_CHAR.test(text[to] ?? '')) to += 1;
  return text.slice(from, to);
}

/**
 * The URI authority component containing the candidate, if any.
 *
 * The authority is what sits between `://` and the first `/`, `?` or `#`.
 * Restricting to it is what keeps a genuine address in a query string
 * (`…/contact?email=someone@example.com`) from being suppressed: that lies in
 * the path, not the authority.
 */
function uriAuthorityAround(ctx: RuleContext): string | undefined {
  const { text } = ctx.line;
  const { start, end } = localSpan(ctx);
  const schemeAt = text.lastIndexOf('://', start);
  if (schemeAt === -1) return undefined;

  const authorityStart = schemeAt + 3;
  let authorityEnd = authorityStart;
  while (authorityEnd < text.length && !/[/?#\s"'`,<>]/.test(text[authorityEnd] ?? '')) {
    authorityEnd += 1;
  }
  if (start < authorityStart || end > authorityEnd) return undefined;
  return text.slice(authorityStart, authorityEnd);
}

/** The innermost bracketed group containing the candidate, if any. */
function bracketedAround(ctx: RuleContext): string | undefined {
  const { text } = ctx.line;
  const { start, end } = localSpan(ctx);
  const openers: Record<string, string> = { '[': ']', '(': ')' };

  for (let i = start - 1; i >= 0; i -= 1) {
    const ch = text[i] ?? '';
    if (ch === ']' || ch === ')') return undefined;
    const closer = openers[ch];
    if (closer === undefined) continue;
    const closeAt = text.indexOf(closer, end);
    if (closeAt === -1) return undefined;
    return text.slice(i + 1, closeAt);
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A digit group inside an international telephone number.
 *
 * National identifier and postal-code patterns are pure digit shapes, so they
 * match happily inside a phone number written in international form. The
 * leading `+` is the conclusive part: it marks an E.164 country prefix, and
 * identifiers are not written with one.
 */
const phoneNumberInterior: NegativeRule = {
  id: 'phone-run-interior',
  appliesTo: NUMERIC_IDENTIFIERS,
  action: 'suppress',
  principle:
    'A digit group that forms part of a run beginning with an international dialling prefix (+) is part of a telephone number, not an independent identifier.',
  risk:
    'An identifier written immediately after a phone number with no separating punctuation would be suppressed. Requiring the run to begin with "+" and to hold no more digits than a phone number can (≤15, per E.164) keeps that narrow.',
  test(ctx) {
    const run = phoneRunAround(ctx);
    if (run === undefined) return false;
    if (!run.trimStart().startsWith('+')) return false;
    const digits = countDigits(run);
    return digits >= 7 && digits <= 15;
  },
};

/**
 * A value inside a URI's authority component.
 *
 * `redis://app:secret@host:5432/db` contains something email-shaped and
 * something postal-code-shaped, but the authority is a connection target: its
 * parts are a username, a password, a host and a port. The credential itself
 * remains protected, because the URI as a whole is what the connection-string
 * and credentialled-URL detectors report.
 */
const uriAuthorityMember: NegativeRule = {
  id: 'uri-authority',
  appliesTo: ['EMAIL', 'POSTAL_CODE', 'NATIONAL_ID', 'TAX_ID', 'DRIVERS_LICENSE'],
  action: 'suppress',
  principle:
    "A value inside a URI's authority component is a host, port, username or password of a connection target, not an independent address or identifier.",
  risk:
    'A real email address used as a userinfo component would be suppressed as an EMAIL. It stays protected as part of the credentialled URL the URI detectors report, and only the authority — not the path or query — is covered.',
  test(ctx) {
    return uriAuthorityAround(ctx) !== undefined;
  },
};

/**
 * A bare `host:port` outside a URI.
 *
 * Ports occupy the same 2–5 digit space as many postal codes, and a service
 * address written without a scheme is extremely common in configuration and
 * logs.
 */
const hostPort: NegativeRule = {
  id: 'host-port',
  appliesTo: ['POSTAL_CODE'],
  action: 'suppress',
  principle:
    'A short digit group immediately preceded by a colon and a dotted host name is a network port, not a postal code.',
  risk:
    'A postal code written directly after a colon and a dotted token would be suppressed; requiring a host-shaped left side and a value within the valid port range keeps that implausible.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    const value = text.slice(start, end);
    if (!/^\d{2,5}$/.test(value)) return false;
    if (Number(value) > MAX_PORT) return false;
    if (text[start - 1] !== ':') return false;
    const before = text.slice(0, start - 1);
    return /[A-Za-z0-9](?:[A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(before);
  },
};

/**
 * A bracketed numeric range.
 *
 * Laboratory results annotate a measurement with its reference interval, and
 * technical documents annotate values with bounds. Both write a pure numeric
 * range in brackets, which postal-code patterns read as a code with a
 * separator.
 */
const bracketedNumericRange: NegativeRule = {
  id: 'bracketed-numeric-range',
  appliesTo: ['POSTAL_CODE', 'NATIONAL_ID', 'TAX_ID'],
  action: 'suppress',
  principle:
    'A bracketed group whose entire content is a numeric range is a reference interval or bounds annotation, not an identifier.',
  risk:
    'An identifier written alone inside brackets as `[nnn-nnn]` would be suppressed. The whole bracket content must be a bare numeric range, so any surrounding label or unit prevents the rule from firing.',
  test(ctx) {
    const inner = bracketedAround(ctx);
    if (inner === undefined) return false;
    return /^\s*\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*$/.test(inner);
  },
};

/**
 * A dotted version number.
 *
 * Release notes, dependency manifests and changelogs are dense with
 * `1.2.3`-shaped values that numeric identifier patterns match.
 */
const versionNumber: NegativeRule = {
  id: 'version-number',
  appliesTo: NUMERIC_IDENTIFIERS,
  action: 'suppress',
  principle:
    'A digit group that is one component of a dotted or `v`-prefixed release version is part of a version number, not an identifier.',
  risk:
    'An identifier formatted with dots between groups would be suppressed. Requiring at least three dot-separated numeric components, or an explicit `v` prefix, distinguishes versions from grouped identifiers.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    let from = start;
    let to = end;
    while (from > 0 && /[\d.]/.test(text[from - 1] ?? '')) from -= 1;
    while (to < text.length && /[\d.]/.test(text[to] ?? '')) to += 1;
    const run = text.slice(from, to);
    const prefixed = from > 0 && /[vV]/.test(text[from - 1] ?? '') && /^\d+(?:\.\d+)+$/.test(run);
    return prefixed || /^\d+(?:\.\d+){2,}$/.test(run);
  },
};

/**
 * The full rule set, in evaluation order.
 *
 * Order is not significant for correctness — every rule is evaluated and the
 * strongest action wins — but keeping the conclusive structural rules first
 * makes traces easier to read.
 */
export const NEGATIVE_RULES: readonly NegativeRule[] = [
  phoneNumberInterior,
  uriAuthorityMember,
  hostPort,
  bracketedNumericRange,
  versionNumber,
];

/** True when the rule may act on this entity type. */
export function ruleApplies(rule: NegativeRule, type: EntityType): boolean {
  return rule.appliesTo === 'all' || rule.appliesTo.includes(type);
}
