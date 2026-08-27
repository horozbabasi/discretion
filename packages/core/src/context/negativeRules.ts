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

import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

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
  /** The part of the run before the candidate. */
  readonly prefix: string;
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
    prefix: text.slice(from, start),
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
  // A REAL unit is required, immediately after a number. The earlier version
  // accepted any trailing letters (and matched zero-width), so a Polish
  // address — "Sklep nr 12 Gdansk (80-180)" — read as a measured quantity and
  // the postal code was suppressed. A bare number is deliberately NOT enough:
  // a number directly before a bracket is indistinguishable from a house
  // number, which is exactly the address shape.
  const tokens = line.slice(0, before).trimEnd().split(/\s+/);
  const unit = tokens[tokens.length - 1];
  const quantity = tokens[tokens.length - 2];
  if (unit === undefined || quantity === undefined) return false;
  return UNIT_TOKEN.test(unit) && /^\d+(?:[.,]\d+)?$/.test(quantity);
}

/**
 * Units a measured quantity is written in. Tokenized rather than scanned
 * backwards because units themselves contain digits and slashes (`x10^9/L`),
 * which defeats any anchored character-class scan.
 */
const UNIT_TOKEN =
  /^(?:%|°[CF]?|[x×]10\^?-?\d+(?:\/[A-Za-zµ]{1,6})?|mmHg|kPa|bpm|fL|pg|kcal|IU|U|(?:[mkcdµunp]?(?:mol|g|L|l|m|s|Hz|Pa|eq|Gy|Sv)))(?:\/(?:[mkcdµunp]?[Lldgm]\d?|min|h|24h))?$/i;

/**
 * Attached pre-release suffixes: `-rc.2`, `-beta`, `-SNAPSHOT`.
 *
 * Only ATTACHED markers are consulted. An earlier revision matched version
 * vocabulary near the run and then anywhere on the line; both were wrong in
 * opposite directions — line membership let "Updated", "release" and a legal
 * citation's "v." suppress national identifiers, and requiring adjacency gave
 * back the changelog and Docker-tag errors the rule exists to remove. The
 * structural conditions in the rule carry the decision instead.
 */
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

    // The run must be an ACTUAL phone number, not merely phone-shaped. A digit
    // count between 7 and 15 was far too loose: single-space column layouts
    // fuse a phone and the next column into one run that still fits the
    // window, and the review executed 'Tel +33 1 23 45 67 75008' suppressing a
    // French postal code. libphonenumber is already bundled for the PHONE
    // detector, so this is the same authority Stage 1 uses, not a new one.
    if (parsePhoneNumberFromString(run)?.isValid() !== true) return false;

    // INTERIORITY. The rule's whole claim is that the candidate is PART OF a
    // longer phone number. If the candidate accounts for every digit in the
    // run, it is not interior to anything and the claim is false — that is
    // how a standalone routing number, NPI or card on a '+' line was being
    // suppressed.
    if (phone.digitsBefore + phone.digitsAfter < 1) return false;

    // A TRAILING candidate whose prefix is ALREADY a complete valid number is
    // a separate field that a single space fused onto the phone. Germany's
    // variable-length numbering makes '+49 30 901820 10115' parse as valid in
    // full, so validity alone could not separate the postal code from the
    // number; asking whether the phone was already complete without it can.
    if (phone.digitsAfter === 0 && parsePhoneNumberFromString(phone.prefix.trim())?.isValid() === true) {
      return false;
    }

    return true;
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

    // Normalize the token before requiring the host:port shape. Taking it
    // verbatim was over-tight and gave back most of the errors this rule
    // exists to remove: `db.host=pg.example.net:5432` and
    // `proxy = "gateway.example.com:3128"` are the two commonest config and
    // log shapes, and a `key=` prefix or a quote made both fail.
    const token = text
      .slice(tokenStart, tokenEnd)
      .replace(/^[^\s"'=]*=/, '')
      .replace(/^["'`[]+/, '')
      .replace(/["'`\]]+$/, '')
      .replace(/[:.,;/]+$/, '');

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
    //
    // These two conditions are the whole rule. An earlier revision also
    // required version vocabulary near the run, which was measured to be
    // over-tight: it gave back most of the false positives the rule exists to
    // remove — changelogs, release headings, Docker tags, dependency pins and
    // markdown table cells all stopped being suppressed — while adding no
    // safety, because condition (2) already protects every validated
    // identifier. Fewer conditions, same protection, and the errors die again.
    return from !== start || to !== end || conclusive;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Rules from the M7 error taxonomy (each corrected by the safety review)
// ─────────────────────────────────────────────────────────────────────────────

/** Types whose detector has no checksum — shape and a format table only. */
const SHAPE_ONLY_TYPES: readonly EntityType[] = ['POSTAL_CODE', 'DRIVERS_LICENSE', 'HEALTH_DATA'];

/**
 * A candidate that is a fragment of a longer delimited token.
 *
 * A fragment guard must be symmetric: if a separator plus a digit immediately
 * BEFORE a candidate proves it is part of something longer, the same shape
 * immediately AFTER proves it too.
 *
 * CORRECTED. The proposed right-edge class included `-`, which collides with
 * the check-digit suffix convention several real schemes use — Chilean RUT
 * `12345678-5`, Argentine CUIT `20-12345678-3`, Brazilian CPF. The hyphen is
 * gone, and the rule is confined to types with no checksum: for a scheme that
 * validates, a PASSING CHECKSUM is positive evidence the characters are the
 * whole identifier, and this rule has no standing against it.
 */
const fragmentBoundary: NegativeRule = {
  id: 'fragment-boundary',
  appliesTo: SHAPE_ONLY_TYPES,
  action: 'suppress',
  principle:
    'A candidate immediately followed by a path or time separator plus a digit, or immediately preceded by one, is a fragment of a longer delimited token rather than a whole identifier.',
  risk:
    'An unvalidated identifier written directly against a separator and a digit would be suppressed. The hyphen is excluded because check-digit suffixes use it, and checksummed types are out of scope entirely.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    // The left edge requires a DIGIT before the separator, mirroring the right
    // edge. Without that symmetry `/[:/]$/` fired on every colon-delimited
    // field and re-opened postal-code leaks that round two had closed: a ZIP in
    // grep output (`customers.csv:10001`), one under a dotted property path
    // (`kunde.adresse.plz:10115`) and one in a colon-delimited export all carry
    // a colon to their left, and none of them is a fragment of a longer number.
    return /^[/:.]\d/.test(text.slice(end)) || /\d[:/]$/.test(text.slice(0, start));
  },
};

/**
 * A short digit group that is one member of a run of digit groups.
 *
 * CORRECTED. The proposal applied this to NATIONAL_ID and TAX_ID as well,
 * which the review identified as a leak for exactly the reason above: a
 * checksum that passes is evidence FOR the candidate, and grouped identifiers
 * (a spaced IBAN, a grouped national number) are written precisely this way.
 * POSTAL_CODE alone — shape-only, and the type the errors were measured on.
 */
const digitGroupRunMember: NegativeRule = {
  id: 'digit-group-run-member',
  appliesTo: ['POSTAL_CODE'],
  action: 'suppress',
  principle:
    'A short digit group flanked by other digit groups separated only by single spaces is one component of a longer grouped number, not a standalone postal code.',
  risk:
    'A postal code written with only a space between it and an adjacent number — a house number before it, for instance — would be suppressed. Confined to the one type with no validator.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    if (!/^\d{2,5}$/.test(text.slice(start, end))) return false;
    return /\d\s$/.test(text.slice(0, start)) && /^\s\d/.test(text.slice(end));
  },
};

/** A run of MRZ filler characters, which no natural-language text produces. */
const MRZ_FILLER = /<{3,}/;

/**
 * A candidate abutting the delimiters of a different notation.
 *
 * CORRECTED, and this was the most dangerous item in the review. The proposal
 * put `<` and `>` in the generic edge classes to catch passport MRZ filler —
 * but those two characters are the entire syntax of HTML and XML. Executed
 * against the rule as proposed, `<td>943 476 5919</td>`, `<ssn>123456789</ssn>`,
 * `<span>12345</span>`, `<taxId>38694597107</taxId>` and `<td>123-45-6789</td>`
 * were ALL suppressed: five real identifiers un-redacted, in the single most
 * common shape structured data is pasted in. The angle brackets are gone from
 * the generic classes, and MRZ is its own predicate requiring a run of three
 * or more `<`.
 */
const notationDelimiter: NegativeRule = {
  id: 'notation-delimiter',
  appliesTo: ['POSTAL_CODE', 'SWIFT_BIC', 'NATIONAL_ID', 'TAX_ID'],
  action: 'suppress',
  principle:
    'A candidate abutting the delimiters of another notation — a bracketed range, a sexagesimal coordinate, or a run of passport MRZ filler — is a fragment of that notation.',
  risk:
    'An identifier deliberately bracketed for emphasis, such as a ticket writing an ID as [NNNNN], would be suppressed. Angle brackets are excluded so that HTML and XML markup cannot trigger it.',
  test(ctx) {
    const { text } = ctx.line;
    const { start, end } = localSpan(ctx);
    const window = text.slice(Math.max(0, start - 40), end + 40);
    if (MRZ_FILLER.test(window)) return true;
    // Square brackets are deliberately NOT here. `bracketed-numeric-range`
    // already owns them, under conditions the safety review forced it to earn:
    // a real unit, an ascending range, no zero padding. A blanket "anything in
    // brackets" test is strictly weaker, and it suppressed a descending pair
    // that an earlier round established must be kept — while the review itself
    // names bracketing an identifier for emphasis as real usage.
    return /[°′″]$/.test(text.slice(0, start)) || /^[°′″]/.test(text.slice(end));
  },
};

/**
 * A high-entropy run inside an inlined binary payload.
 *
 * A data URI declares its own encoding, and everything after the declaration
 * is image or font bytes rather than a credential.
 */
const dataUriPayload: NegativeRule = {
  id: 'data-uri-payload',
  appliesTo: ['GENERIC_SECRET'],
  action: 'suppress',
  principle:
    'A high-entropy run introduced by an explicit content-transfer declaration is an inlined binary payload, not a secret.',
  risk:
    'A credential deliberately smuggled inside a data URI, or a secrets file pasted as one, would be missed. The declaration must be an actual base64 content-transfer preamble, which ordinary prose does not contain.',
  test(ctx) {
    const { start } = localSpan(ctx);
    return /;base64,[A-Za-z0-9+/=]*$/i.test(ctx.line.text.slice(0, start));
  },
};

/**
 * A vendor-prefixed token whose body carries no information.
 *
 * A credential is a carrier of entropy. `sk_live_XXXXXXXXXXXX` presents a real
 * prefix and then says nothing, which is what documentation does.
 */
const uninformativeKeyBody: NegativeRule = {
  id: 'uninformative-key-body',
  appliesTo: ['API_KEY'],
  action: 'suppress',
  principle:
    'A token carrying a recognised vendor prefix whose remaining body is a single repeated character is a documentation placeholder, not a key.',
  risk:
    'A genuine key whose random body happened to be one repeated character. For an 8-character body that is about 62 in 62^8, which is far rarer than the placeholder it removes.',
  test(ctx) {
    const value = ctx.line.text.slice(localSpan(ctx).start, localSpan(ctx).end);
    const body = value.replace(/^[A-Za-z]+[_-]/, '').replace(/^[A-Za-z]{2,4}_/, '');
    if (body.length < 8) return false;
    return new Set(body.toLowerCase()).size <= 1;
  },
};

/**
 * A commercial or administrative label governing the number after it.
 *
 * CORRECTED to a PENALTY rather than a suppression. The review was explicit
 * that this rule carries the most genuine risk of the set: in healthcare and
 * legal text a "case number" or "claim number" can be exactly the sensitive
 * record identifier, so a hard suppression would remove real findings from
 * precisely the documents where they matter most. As a penalty the evidence
 * still counts and Stage 4 can weigh it.
 */
const enumerationLabel: NegativeRule = {
  id: 'enumeration-label',
  appliesTo: ['NATIONAL_ID', 'TAX_ID', 'HEALTH_DATA', 'US_ROUTING_NUMBER', 'US_NPI'],
  action: -0.2,
  principle:
    'A transaction-sequence noun immediately before a bare digit run governs it: the digits after "order" are an order number.',
  risk:
    'In medical and legal documents a case or claim number IS the sensitive record identifier, which is why this reduces confidence rather than suppressing.',
  test(ctx) {
    const { start, end } = localSpan(ctx);
    if (!/^[\d\s.-]+$/.test(ctx.line.text.slice(start, end))) return false;
    return ENUMERATION_NOUN.test(ctx.line.text.slice(0, start));
  },
};

/**
 * Enumeration nouns across the languages the trigger lexicons cover.
 *
 * `claim` and `case` are deliberately ABSENT: the review named them as the
 * terms whose medical and legal senses are sensitive record identifiers.
 */
const ENUMERATION_NOUN =
  /\b(?:order|invoice|receipt|tracking|shipment|consignment|ticket|reference|ref|purchase order|sku|batch|lot|serial|work order|rma|quote|bestellung|bestellnummer|rechnung|sendungsnummer|auftrag|vorgang|charge|seriennummer|commande|facture|suivi|référence|reference|pedido|factura|seguimiento|referencia|lote|fatura|rastreamento|ordine|fattura|spedizione|riferimento|lotto|bestelling|factuur|zending|zamówienie|faktura|заказ|счёт|накладная|sipariş|fatura|注文|請求書|订单|发票|주문|송장)\s*(?:number|no\.?|nr\.?|num\.?|#|номер|nummer|numéro|número|numero)?\s*[:#-]?\s*$/i;

/**
 * A value the document itself frames as an illustration.
 *
 * CORRECTED into two rules by action. The review called this risk
 * "substantial and asymmetric": a user writing "for example, my national ID
 * is <real ID>" is handing over a real identifier inside an example frame.
 * So a validated candidate is only PENALIZED, never suppressed — a checksum
 * that passes outweighs a framing word. Shape-only candidates, which have no
 * such evidence, are suppressed.
 */
const EXAMPLE_FRAME =
  /\b(?:for example|e\.?g\.?|example|examples|sample|specimen|demo|sandbox|tutorial|documentation|placeholder|dummy|fake|mock|beispiel|zum beispiel|par exemple|exemple|por ejemplo|ejemplo|per esempio|esempio|por exemplo|exemplo|bijvoorbeeld|voorbeeld|na przykład|przykład|например|пример|örneğin|örnek|例えば|例|例如|예를 들어|예시)\b[^.!?\n]{0,60}$/i;

const exampleFrameShapeOnly: NegativeRule = {
  id: 'example-frame',
  appliesTo: ['POSTAL_CODE', 'DRIVERS_LICENSE'],
  action: 'suppress',
  principle:
    'A value the surrounding clause explicitly frames as an example, sample or placeholder is asserted by the document not to be live.',
  risk:
    'Someone writing "for example, my postcode is …" gives a real value inside an example frame. Confined to types with no validator, where there is no competing evidence to weigh.',
  test(ctx) {
    return EXAMPLE_FRAME.test(ctx.line.text.slice(0, localSpan(ctx).start));
  },
};

const exampleFrameValidated: NegativeRule = {
  id: 'example-frame-validated',
  appliesTo: ['NATIONAL_ID', 'TAX_ID', 'CREDIT_CARD', 'IBAN', 'API_KEY', 'GENERIC_SECRET'],
  action: -0.25,
  principle:
    'An example frame weakens a validated candidate but does not overturn it: a passing checksum is stronger evidence than a framing word.',
  risk:
    'None by construction — this reduces confidence and never suppresses, which is the whole reason it is separate from the shape-only rule.',
  test(ctx) {
    return EXAMPLE_FRAME.test(ctx.line.text.slice(0, localSpan(ctx).start));
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
  fragmentBoundary,
  digitGroupRunMember,
  notationDelimiter,
  dataUriPayload,
  uninformativeKeyBody,
  enumerationLabel,
  exampleFrameShapeOnly,
  exampleFrameValidated,
];

/**
 * DELIBERATELY NOT HERE: containment.
 *
 * The M7 error taxonomy proposed four further rules that suppress a candidate
 * because ANOTHER candidate's span covers it — a format-only detector yielding
 * to a validated one, non-sensitivity propagating across schemes, an NER span
 * inside a structured Stage 1 span. Together they account for the largest
 * measured error class in the corpus, and they are all excluded.
 *
 * Two reasons, both ratified rather than assumed. First, ARCHITECTURE.md D19:
 * deciding which of two overlapping type claims wins is Stage 4 resolution,
 * and Stage 3 pre-empting it was exactly the mistake the GENERIC_SECRET
 * measurement exposed. Second, the taxonomy's own highest-priority residual is
 * a SPAN-HYGIENE PREREQUISITE — url-with-credentials and connection-string
 * spans were measured straddling CSV and line boundaries — and containment
 * suppression is only ever as safe as the covering span is correct. Shipping
 * it before that is fixed would let a bad span silently un-redact whatever it
 * wrongly covers.
 */

/** True when the rule may act on this entity type. */
export function ruleApplies(rule: NegativeRule, type: EntityType): boolean {
  return rule.appliesTo === 'all' || rule.appliesTo.includes(type);
}
