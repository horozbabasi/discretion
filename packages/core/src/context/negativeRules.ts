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
function bracketedAround(ctx: RuleContext): { inner: string; open: number } | undefined {
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
    return { inner: text.slice(i + 1, closeAt), open: i };
  }
  return undefined;
}

/**
 * Does a measured quantity precede this point on the line?
 *
 * A reference interval annotates a measurement — that adjacency is the actual
 * signal, and requiring it is what separates "196.0 mmol/L [65-156]" from an
 * identifier that merely happens to sit in brackets.
 */
function measurementPrecedes(line: string, before: number): boolean {
  return /\d(?:[.,]\d+)?\s*[%\p{L}/]*\s*$/u.test(line.slice(0, before));
}

/** Vocabulary that marks a dotted numeric run as a software version. */
const VERSION_VOCABULARY =
  /\b(v|ver|vers|version|versione|versión|versao|versão|release|build|upgrade[sd]?|updated?|bump(?:ed)?|rc|alpha|beta|snapshot|patch|semver|tag)\b|-(?:rc|alpha|beta|snapshot)\b/i;

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
    "A value inside a URI's authority component is a host, port, username or password of a connection target, not an independent address or identifier — but only when the URI actually carries a credential, so that something else reports it.",
  risk:
    'An address used as a bare userinfo component could be suppressed with nothing else reporting it. The password requirement below is exactly what prevents that.',
  test(ctx) {
    const authority = uriAuthorityAround(ctx);
    if (authority === undefined) return false;

    // The rule's safety rests on the URI as a whole being reported by another
    // detector. The M7 review measured that claim instead of trusting it:
    // for `https://john.doe@example.com`, EMAIL is the ONLY detector that
    // fires — the credentialled-URL and connection-string detectors both
    // require a `user:pass@` form. Suppressing there would have been a silent
    // leak, so an address is only yielded when a password component is
    // present and those detectors therefore cover the URI.
    // (It was previously safe only by accident: the EMAIL detector's span
    // includes the leading `//`, which fell outside the authority. Relying on
    // a span defect is not a safety argument — hence the explicit condition.)
    if (ctx.type === 'EMAIL' && !/^[^@/]*:[^@/]*@/.test(authority)) return false;

    return true;
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
 * A bracketed numeric range annotating a measurement.
 *
 * Laboratory results annotate a measured value with its reference interval,
 * and technical documents annotate values with bounds. Both write a numeric
 * range in brackets, which postal-code patterns read as a code with a
 * separator.
 *
 * TIGHTENED after the M7 adversarial safety review (ARCHITECTURE.md D18).
 * The original rule suppressed any bracketed `digits-digits`, which is the
 * exact written form of several national identifiers: the review executed
 * `Borger (010101-1234) er registreret.` and watched a correctly detected
 * Danish CPR number get suppressed — a leak of a national identifier. Three
 * conditions now separate an interval from an identifier:
 *
 *   • each side is at most 4 digits — reference intervals are small numbers,
 *     whereas national identifier groups are longer (a Danish CPR's first
 *     group is 6, a Korean RRN's is 6, a Swedish personnummer's is 8);
 *   • the range ascends, because an interval whose low exceeds its high is
 *     not an interval;
 *   • a measured quantity precedes the bracket, which is the actual reason a
 *     reference interval is there at all.
 */
const bracketedNumericRange: NegativeRule = {
  id: 'bracketed-numeric-range',
  appliesTo: ['POSTAL_CODE', 'NATIONAL_ID', 'TAX_ID'],
  action: 'suppress',
  principle:
    'A short, ascending numeric range in brackets that immediately follows a measured quantity is a reference interval, not an identifier.',
  risk:
    'A short ascending identifier written as `nnnn-nnnn` in brackets directly after a number could still be suppressed. Identifier groups longer than four digits, descending pairs, and brackets with no preceding measurement are all excluded, which covers the national-identifier formats the review tested.',
  test(ctx) {
    const bracket = bracketedAround(ctx);
    if (bracket === undefined) return false;

    const range = /^\s*(\d{1,4})(?:[.,]\d+)?\s*-\s*(\d{1,4})(?:[.,]\d+)?\s*$/.exec(bracket.inner);
    if (range === null) return false;

    const low = Number(range[1]);
    const high = Number(range[2]);
    if (!(low <= high)) return false;

    return measurementPrecedes(ctx.line.text, bracket.open);
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
    'A dotted numeric run is a release version — not an identifier — when the line it sits on carries explicit version vocabulary.',
  risk:
    'A dotted identifier on a line that also discusses a release could be suppressed. Requiring version vocabulary on the same line is what keeps ordinary identifier lines out of scope.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    let from = start;
    let to = end;
    while (from > 0 && /[\d.]/.test(text[from - 1] ?? '')) from -= 1;
    while (to < text.length && /[\d.]/.test(text[to] ?? '')) to += 1;
    const run = text.slice(from, to);

    const dotted = /^\d+(?:\.\d+)+$/.test(run);
    if (!dotted) return false;

    // TIGHTENED after the M7 adversarial safety review (ARCHITECTURE.md D18).
    // Shape alone cannot tell a version from an identifier: several national
    // and tax identifiers are written as dot-separated digit groups, and the
    // review executed a dotted German Steuer-ID (12.345.678.901) being
    // suppressed on shape. Requiring the LINE to carry version vocabulary
    // keeps the corpus's version negatives suppressed — they read "Upgraded …
    // from v1.5.3 to 3.12.7-rc.2 in build …", which is saturated with it —
    // while an identifier line carries none.
    return VERSION_VOCABULARY.test(text);
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
