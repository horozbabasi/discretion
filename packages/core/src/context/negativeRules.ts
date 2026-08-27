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

interface PhoneRun {
  readonly run: string;
  /** Digits of the run lying before the candidate. */
  readonly digitsBefore: number;
  /** Digits of the run lying after the candidate. */
  readonly digitsAfter: number;
}

/**
 * The maximal run of telephone-shaped characters containing the candidate.
 * Returns undefined when the candidate is not made only of such characters.
 */
function phoneRunAround(ctx: RuleContext): PhoneRun | undefined {
  const { text } = ctx.line;
  const { start, end } = localSpan(ctx);
  const value = text.slice(start, end);
  if (value.length === 0 || !/^[\d\s().-]+$/.test(value)) return undefined;

  let from = start;
  let to = end;
  while (from > 0 && PHONE_RUN_CHAR.test(text[from - 1] ?? '')) from -= 1;
  while (to < text.length && PHONE_RUN_CHAR.test(text[to] ?? '')) to += 1;

  return {
    run: text.slice(from, to),
    digitsBefore: countDigits(text.slice(from, start)),
    digitsAfter: countDigits(text.slice(end, to)),
  };
}

/**
 * Labels whose last component marks a host name rather than a file or a
 * property path. A bare "looks dotted" test reads `customers.csv:10001` and
 * `kunde.adresse.plz:10115` as host and port, which suppresses real postal
 * codes (M7 safety review). Two-letter labels are accepted wholesale as
 * country-code TLDs; everything else must be named.
 */
const KNOWN_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name',
  'io', 'dev', 'app', 'cloud', 'sh', 'ai', 'co', 'tech', 'online', 'site',
  'xyz', 'me', 'tv', 'cc', 'gg',
  // Internal and reserved suffixes, which is where host:port genuinely appears.
  'local', 'localhost', 'internal', 'corp', 'lan', 'home', 'intranet',
  'test', 'example', 'invalid', 'localdomain',
]);

function looksLikeHostName(candidateHost: string): boolean {
  const match = /([A-Za-z0-9][A-Za-z0-9-]*)\.([A-Za-z]{2,24})$/.exec(candidateHost);
  const tld = match?.[2]?.toLowerCase();
  if (tld === undefined) return false;
  return tld.length === 2 || KNOWN_TLDS.has(tld);
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
  // Scan only over characters RFC 3986 actually permits in an authority.
  // The original scan ran until a delimiter it happened to list, so a '|' in
  // a log line, a ';' in a JDBC URL or a CSV separator did not stop it and the
  // "authority" swallowed the rest of the line — the M7 review executed
  // 'INFO|…|https://enroll.acme-benefits.com|200|ssn=240-01-2233|…' and watched
  // a valid SSN suppressed as part of the authority.
  while (authorityEnd < text.length && AUTHORITY_CHAR.test(text[authorityEnd] ?? '')) {
    authorityEnd += 1;
  }
  if (start < authorityStart || end > authorityEnd) return undefined;
  return text.slice(authorityStart, authorityEnd);
}

/** Characters RFC 3986 permits in a URI authority component. */
const AUTHORITY_CHAR = /[A-Za-z0-9._~%+@:[\]-]/;

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

/**
 * Vocabulary that marks a dotted numeric run as a software version, required
 * IMMEDIATELY BEFORE the run rather than anywhere on the line.
 *
 * Line membership was far too weak. The review executed an Argentine DNI
 * suppressed because the line said "Updated", a Swiss AHV number suppressed
 * because an HR sentence said "release", and a patient chart number
 * suppressed because the line mentioned a fentanyl "patch". A line is not a
 * unit of meaning — a log line or a minified JSON document can be thousands
 * of characters — so generic prose verbs are gone and what remains must be
 * adjacent.
 */
// `ver` is deliberately absent: it is an ordinary verb in Spanish and
// Portuguese ("para que puedas ver 20.123.456"), and the review found that
// class of collision is exactly how identifiers get suppressed.
const VERSION_INTRODUCER = /\b(?:version|versione|versión|versao|versão|semver)\s+$/i;

/** Attached pre-release suffixes: `-rc.2`, `-beta`, `-SNAPSHOT`. */
const PRERELEASE_SUFFIX = /^-(?:rc|alpha|beta|snapshot|dev|pre)\b/i;

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
    'An identifier written immediately after a phone number with no separating punctuation would be suppressed. The dialling-prefix, single-field and interiority conditions below each independently narrow that.',
  test(ctx) {
    const phone = phoneRunAround(ctx);
    if (phone === undefined) return false;
    const run = phone.run.trim();

    // A dialling prefix is '+' followed IMMEDIATELY by a digit. Without this,
    // '+' at the start of a git diff line or a markdown bullet reads as a
    // country code: the M7 review executed '+ 3787 344936 71000' (a Luhn-valid
    // Amex PAN in a bullet list) and '+123-45-6789' (an SSN on an added diff
    // line) and watched both get suppressed.
    if (!/^\+\d/.test(run)) return false;

    // A telephone number is ONE field. A tab or a run of two or more spaces is
    // a column boundary, so what lies beyond it belongs to a different column
    // — the review found German postal codes suppressed because they sat in
    // the column next to a '+49' phone column in a space-aligned paste.
    if (/\t|\s{2,}/.test(run)) return false;

    const digits = countDigits(run);
    if (digits < 7 || digits > 15) return false;

    // INTERIORITY. The rule's whole claim is that the candidate is PART OF a
    // longer phone number. If the candidate accounts for every digit in the
    // run, it is not interior to anything and the claim is false — that is
    // how a standalone routing number, NPI or card on a '+' line was being
    // suppressed.
    return phone.digitsBefore + phone.digitsAfter >= 1;
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
    //
    // The requirement is keyed on POSITION, not on entity type. Keying it on
    // EMAIL alone left the same hole open for every other type: the review
    // executed a Turkish TC Kimlik number used as a bare userinfo username
    // (`https://30214566412@sso…/oauth2/authorize`) and found the national
    // identifier suppressed with nothing else reporting it.
    const at = authority.lastIndexOf('@');
    if (at === -1) return true; // No userinfo: the candidate is a host or port.

    const authorityStart = ctx.line.text.lastIndexOf('://', localSpan(ctx).start) + 3;
    const inUserinfo = localSpan(ctx).start < authorityStart + at;
    if (!inUserinfo) return true; // Host or port side of the '@'.

    // Userinfo: yield it only when a password component makes the whole URI
    // detectable by the credentialled-URL and connection-string detectors.
    return /^[^@/]*:[^@/]*@/.test(authority);
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

    // A written port is never zero-padded; short postal codes routinely are
    // (the review executed a Cambridge MA ZIP, 02139, being suppressed).
    if (!/^[1-9]\d{1,4}$/.test(value)) return false;
    if (Number(value) > MAX_PORT) return false;
    if (text[start - 1] !== ':') return false;

    // The whitespace-delimited token containing the candidate must be
    // EXACTLY host:port. Testing only the text to the left let a
    // colon-delimited record — `jane.doe@corp.com:8001:Zurich` — read as a
    // host and port and suppress a real postal code, because the left side
    // genuinely ends in a host name.
    let tokenStart = start;
    while (tokenStart > 0 && !/\s/.test(text[tokenStart - 1] ?? '')) tokenStart -= 1;
    let tokenEnd = end;
    while (tokenEnd < text.length && !/\s/.test(text[tokenEnd] ?? '')) tokenEnd += 1;
    const token = text.slice(tokenStart, tokenEnd).replace(/[:.,;/]+$/, '');

    const hostPort = /^([A-Za-z0-9][A-Za-z0-9.-]*):([1-9]\d{1,4})$/.exec(token);
    if (hostPort === null || hostPort[2] !== value) return false;

    return looksLikeHostName(hostPort[1] ?? '');
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

    const lowText = range[1] ?? '';
    const highText = range[2] ?? '';

    // A reference-interval bound is never zero-padded, while short postal
    // codes are zero-padded by definition. The review executed Polish postal
    // codes — `Paczka 3 Warszawa (02-495)` — surviving the size and ascending
    // checks and still being suppressed, because a digit earlier in the line
    // satisfied the measurement test.
    if (/^0\d/.test(lowText) || /^0\d/.test(highText)) return false;

    if (!(Number(lowText) <= Number(highText))) return false;

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
    'A dotted numeric run of three or more components is a release version when a version introducer sits immediately before it, or it carries an attached pre-release suffix — and only when no detector has claimed the whole run.',
  risk:
    'A dotted identifier written directly after a version introducer could be suppressed. The proper-fragment condition means a validated identifier is never suppressed, since a detector that claimed the whole run has already judged it.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    let from = start;
    let to = end;
    while (from > 0 && /[\d.]/.test(text[from - 1] ?? '')) from -= 1;
    while (to < text.length && /[\d.]/.test(text[to] ?? '')) to += 1;
    const run = text.slice(from, to);

    // TIGHTENED TWICE after the M7 safety review (ARCHITECTURE.md D18). Four
    // conditions, each closing an executed leak.

    // (1) Three or more components. Two-component runs are decimals: the
    //     review executed an NPI at `1245319599.00` and a routing number at
    //     `021000021.00` being read as versions.
    if (!/^\d+(?:\.\d+){2,}$/.test(run)) return false;

    // An ATTACHED marker — a `-rc.2` suffix, or a `v` with no space before the
    // digits — is conclusive: no identifier is printed that way. A spaced
    // introducer ("version 1.2.3") is weaker, because ordinary words abut
    // numbers all the time.
    const prerelease = PRERELEASE_SUFFIX.test(text.slice(to));
    const attachedV = /[vV]$/.test(text.slice(0, from));
    const conclusive = prerelease || attachedV;

    // (2) Absent a conclusive marker, the candidate must be a PROPER FRAGMENT
    //     of the run. If a detector claimed the whole dotted value it has
    //     already judged it — usually against a checksum — and this rule has
    //     no standing to overrule it. Argentine DNI (20.123.456), Swiss AHV
    //     (756.1234.5678.97) and Brazilian CPF are all claimed whole by
    //     validating detectors.
    if (from === start && to === end && !conclusive) return false;

    // (3) Otherwise a version introducer must sit immediately before the run.
    //     Adjacency is the point: mere presence on the line let "Updated",
    //     "release" and a legal citation's "v." suppress identifiers.
    return conclusive || VERSION_INTRODUCER.test(text.slice(0, from));
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
