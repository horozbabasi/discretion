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
