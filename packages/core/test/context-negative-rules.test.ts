/**
 * Stage 3 negative-context rules, and the fail-open cases that shaped them.
 *
 * SPEC.md: negative context signals "must actively suppress". The danger of
 * that power is the subject of most of this file: a suppression rule that
 * fires on a real secret sends it to a third-party model silently, which is
 * the worst failure this product has.
 *
 * The `leaks` block below is the M7 adversarial safety review (ARCHITECTURE.md
 * D18) turned into permanent regression tests. Each case was EXECUTED against
 * the rules before the fix and observed to suppress a genuine identifier;
 * each must now survive. The `measured false-positive classes` block pins the
 * other half of the bargain — the tightened rules must still kill the errors
 * they were written for, or the tightening was just a retreat.
 */
import { describe, expect, it } from 'vitest';
import { NEGATIVE_RULES, ruleApplies } from '../src/context/negativeRules.js';
import type { DocumentProfile, RuleContext } from '../src/context/types.js';
import type { EntityType } from '../src/types.js';

const PROSE: DocumentProfile = {
  format: 'prose',
  domain: 'general',
  formatEvidence: [],
  domainEvidence: [],
};

/** Rule ids that would suppress `value` (found in `doc`) as `type`. */
function suppressors(doc: string, value: string, type: EntityType): string[] {
  const start = doc.indexOf(value);
  expect(start, `fixture must contain ${value}`).toBeGreaterThanOrEqual(0);
  const end = start + value.length;

  const lineStart = doc.lastIndexOf('\n', start - 1) + 1;
  const newline = doc.indexOf('\n', start);
  const lineEnd = newline === -1 ? doc.length : newline;

  const ctx: RuleContext = {
    text: doc,
    start,
    end,
    type,
    profile: PROSE,
    line: { text: doc.slice(lineStart, lineEnd), start: lineStart, end: lineEnd },
  };

  return NEGATIVE_RULES.filter((rule) => ruleApplies(rule, type) && rule.test(ctx)).map((r) => r.id);
}

describe('negative rules — the measured false-positive classes still die', () => {
  it('suppresses a digit group inside an international phone number', () => {
    // The single largest Stage 1 error class: 294 NATIONAL_ID false positives.
    expect(suppressors('Tel: +55 81213-45678', '81213', 'POSTAL_CODE')).toContain('phone-run-interior');
    expect(suppressors('Tel: +81 901 234 567 8', '901 234 567', 'NATIONAL_ID')).toContain(
      'phone-run-interior',
    );
  });

  it('suppresses an address inside a credentialled URI authority', () => {
    const doc = 'db: redis://app:pw@prod-db.corp:5432/appdb';
    expect(suppressors(doc, 'pw@prod-db.corp', 'EMAIL')).toContain('uri-authority');
  });

  it('suppresses a laboratory reference interval', () => {
    expect(suppressors('HbA1c 196.0 mmol/L [65-156]', '65-156', 'POSTAL_CODE')).toContain(
      'bracketed-numeric-range',
    );
  });

  it('suppresses a network port after a dotted host', () => {
    expect(suppressors('host: prod-db.corp:5432', '5432', 'POSTAL_CODE')).toContain('host-port');
  });

  it('suppresses a release version on a line about releases', () => {
    const doc = 'Upgraded the service from v1.5.3 to 3.12.7-rc.2 in build 20260813.5.';
    expect(suppressors(doc, '3.12.7', 'NATIONAL_ID')).toContain('version-number');
  });
});

describe('negative rules — fail-open cases found by the M7 safety review', () => {
  /**
   * Executed before the fix: each of these was suppressed, meaning a real
   * national identifier would have been sent to a third-party model.
   * A hyphenated digit pair is the written form of several national IDs.
   */
  it('keeps a Danish CPR number written in parentheses', () => {
    expect(suppressors('Borger (010101-1234) er registreret.', '010101-1234', 'NATIONAL_ID')).toEqual([]);
  });

  it('keeps a Korean resident registration number in parentheses', () => {
    expect(
      suppressors('Patient (901010-1234567) admitted Tuesday.', '901010-1234567', 'NATIONAL_ID'),
    ).toEqual([]);
  });

  it('keeps a Swedish personnummer in parentheses', () => {
    expect(suppressors('Person (19900101-1234) godkand.', '19900101-1234', 'NATIONAL_ID')).toEqual([]);
  });

  it('keeps a dot-formatted tax identifier on a line with no version vocabulary', () => {
    expect(suppressors('Steuer-ID: 12.345.678.901', '12.345.678.901', 'TAX_ID')).toEqual([]);
  });

  /**
   * The uri-authority rule's safety rests on another detector reporting the
   * whole URI. Measured: for a userinfo URI with NO password, EMAIL is the
   * only detector that fires — so suppressing there reports the document
   * clean.
   */
  it('keeps an address used as bare userinfo, which no other detector covers', () => {
    expect(
      suppressors('See https://john.doe@example.com for details', 'john.doe@example.com', 'EMAIL'),
    ).toEqual([]);
  });

  it('still suppresses userinfo when a password makes the URI detectable elsewhere', () => {
    const doc = 'Portal: https://admin:s3cr3t@build.ci.dev/app';
    expect(suppressors(doc, 's3cr3t@build.ci.dev', 'EMAIL')).toContain('uri-authority');
  });
});

/**
 * Round two of the M7 review, which ran 314 further inputs across the rules
 * and found four more leak classes. Table-driven because the point is
 * breadth: each row is a document shape a person genuinely pastes.
 */
describe('negative rules — round-two leak classes (M7 review)', () => {
  const leaks: readonly [string, string, string, EntityType][] = [
    // The authority scan ran past characters RFC 3986 forbids, so a delimiter
    // that is not '/', '?' or '#' let the "authority" swallow the rest of the
    // line — and everything in it.
    ['pipe-delimited log line', 'INFO|2026-08-26|https://enroll.acme.com|200|ssn=240-01-2233|dur=41ms', '240-01-2233', 'NATIONAL_ID'],
    ['semicolon-delimited CSV', 'hasta;portal;tckn\n4471;https://portal.saglik.gov.tr;30214566412', '30214566412', 'NATIONAL_ID'],
    ['JDBC URL with parameters', 'url=jdbc:sqlserver://sql01.corp.local:1433;databaseName=hr;taxId=38694597107', '38694597107', 'TAX_ID'],
    ['markdown table cell', '|881|https://enroll.acme.com|240-01-2233|', '240-01-2233', 'NATIONAL_ID'],
    // The credential requirement was keyed on EMAIL, leaving every other type
    // exposed in the same position.
    ['national id as bare userinfo', 'Failing: https://30214566412@sso.saglik.gov.tr/oauth2/authorize', '30214566412', 'NATIONAL_ID'],
    // '+' as a diff marker or list bullet is not a dialling prefix.
    ['amex on an added diff line', '@@ -4,3 +4,4 @@\n 4024007183925829\n+378734493671000', '378734493671000', 'CREDIT_CARD'],
    ['ssn on an added diff line', '@@ -12,6 +12,7 @@\n ssn,last\n+123-45-6789,Smith', '123-45-6789', 'NATIONAL_ID'],
    ['routing number on an added diff line', '@@ -1,2 +1,3 @@\n 021000021\n+011401533', '011401533', 'US_ROUTING_NUMBER'],
    ['amex in a markdown bullet', 'Cards to review:\n\n+ 3787 344936 71000\n', '3787 344936 71000', 'CREDIT_CARD'],
    ['medical record number in a bullet', 'Follow-up:\n\n+ 7645329\n', '7645329', 'POSTAL_CODE'],
    ['npi on an added diff line', '@@ -8,2 +8,3 @@ npi\n 1234567893\n+1093817462', '1093817462', 'US_NPI'],
    // A phone number is one field; a column boundary ends it.
    ['postal code in the column beside a phone', 'Mueller GmbH     +49 30 901820    10115', '10115', 'POSTAL_CODE'],
    // A dotted token is not necessarily a host name.
    ['zip in grep file:line output', 'exports/customers.csv:10001,Jane Miller,new york', '10001', 'POSTAL_CODE'],
    ['zip under a dotted property path', 'kunde.adresse.plz:10115', '10115', 'POSTAL_CODE'],
    ['zero-padded zip after a colon', 'customer.billing.zip:02139', '02139', 'POSTAL_CODE'],
    ['postal code in a legacy colon export', 'meier.anna:10115:Berlin:DE', '10115', 'POSTAL_CODE'],
    // Zero-padded bounds are postal codes, not reference intervals.
    ['polish postal code in parentheses', 'Paczka 3 Warszawa (02-495) ul. Polczynska 121', '02-495', 'POSTAL_CODE'],
    ['danish cpr in parentheses', 'Anders Jensen (010190-1234) - startdato', '010190-1234', 'NATIONAL_ID'],
  ];

  for (const [label, doc, value, type] of leaks) {
    it(`keeps a real identifier: ${label}`, () => {
      expect(suppressors(doc, value, type)).toEqual([]);
    });
  }
});

describe('negative rules — boundaries', () => {
  it('does not suppress an address in a URI path or query', () => {
    const query = 'https://x.com/c?email=john.doe@example.com';
    expect(suppressors(query, 'john.doe@example.com', 'EMAIL')).toEqual([]);
  });

  it('does not suppress an address merely because a URL appears earlier on the line', () => {
    const doc = 'Docs at https://support.example.com/ or mail john.doe@example.com';
    expect(suppressors(doc, 'john.doe@example.com', 'EMAIL')).toEqual([]);
  });

  it('does not read a descending or unmeasured bracket pair as a reference interval', () => {
    // No measurement precedes the bracket, so it is not an interval.
    expect(suppressors('Reference (1234-5678) filed.', '1234-5678', 'NATIONAL_ID')).toEqual([]);
    // Descending: not an interval even with a measurement present.
    expect(suppressors('Value 5.0 mg [900-100]', '900-100', 'POSTAL_CODE')).toEqual([]);
  });

  it('leaves a credit card alone: no phone run can hold that many digits', () => {
    const doc = 'Card 4111 1111 1111 1111 tel +15550100';
    expect(suppressors(doc, '4111 1111 1111 1111', 'CREDIT_CARD')).toEqual([]);
  });

  it('every rule declares the real positive it risks suppressing', () => {
    // The file's own safety contract: an unreviewed suppression rule is how
    // leaks ship, so `risk` is required prose, not an optional field.
    for (const rule of NEGATIVE_RULES) {
      expect(rule.risk.length, `${rule.id} must state its risk`).toBeGreaterThan(40);
      expect(rule.principle.length, `${rule.id} must state its principle`).toBeGreaterThan(40);
    }
  });
});
