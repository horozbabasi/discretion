/**
 * Sensitivity profiles, allowlist and denylist.
 *
 * SPEC.md: "Apply user allowlist (never mask …) and denylist (always mask …).
 * Denylist beats everything."
 *
 * That last sentence is the whole contract and the ordering tests below exist
 * to pin it. A denylisted value must be reported even when its type is out of
 * profile and even when confidence is far below threshold — it is the one
 * override a user gets to state absolutely, and a profile silently overruling
 * it would make the setting a lie.
 *
 * Thresholds are stated as CALIBRATED probabilities, which is only meaningful
 * because Stage 4 calibrated the scale (D23). Before that a threshold was an
 * arbitrary cut whose meaning varied by type.
 */
import { describe, expect, it } from 'vitest';

import { PROFILES, customProfile, decide } from '../src/fuse/profiles.js';
import type { EntityType } from '../src/types.js';

const entity = (type: EntityType, calibratedConfidence: number, text = 'value') => ({
  type,
  text,
  calibratedConfidence,
});

describe('profiles — scope', () => {
  it('minimal reports only secrets and financial identifiers', () => {
    expect(decide(entity('API_KEY', 0.9), PROFILES.minimal).report).toBe(true);
    expect(decide(entity('IBAN', 0.9), PROFILES.minimal).report).toBe(true);
    // Out of scope for a developer wanting surgical protection.
    expect(decide(entity('PERSON', 0.99), PROFILES.minimal).reason).toBe('type-out-of-profile');
    expect(decide(entity('HEALTH_DATA', 0.99), PROFILES.minimal).reason).toBe('type-out-of-profile');
  });

  it('balanced adds national ids, contact details and person names', () => {
    for (const type of ['NATIONAL_ID', 'EMAIL', 'PHONE', 'PERSON'] as const) {
      expect(decide(entity(type, 0.9), PROFILES.balanced).report, type).toBe(true);
    }
    // Still out of scope until strict.
    expect(decide(entity('HEALTH_DATA', 0.99), PROFILES.balanced).reason).toBe('type-out-of-profile');
    expect(decide(entity('STREET_ADDRESS', 0.99), PROFILES.balanced).reason).toBe('type-out-of-profile');
  });

  it('strict adds health, addresses, dates of birth and organizations', () => {
    for (const type of ['HEALTH_DATA', 'STREET_ADDRESS', 'DATE_OF_BIRTH', 'ORG'] as const) {
      expect(decide(entity(type, 0.9), PROFILES.strict).report, type).toBe(true);
    }
  });

  it('strict admits low-confidence candidates, which is what SPEC asks of it', () => {
    const weak = entity('PERSON', 0.3);
    expect(decide(weak, PROFILES.strict).report).toBe(true);
    expect(decide(weak, PROFILES.balanced).reason).toBe('below-threshold');
  });
});

describe('profiles — thresholds', () => {
  it('reports a credential on weaker evidence than a name', () => {
    // A leaked credential is unrecoverable; a spurious name costs a dismissal.
    const weak = 0.4;
    expect(decide(entity('API_KEY', weak), PROFILES.balanced).report).toBe(true);
    expect(decide(entity('PERSON', weak), PROFILES.balanced).reason).toBe('below-threshold');
  });

  it('minimal demands more confidence than balanced for the same type', () => {
    const middling = entity('CREDIT_CARD', 0.6);
    expect(decide(middling, PROFILES.balanced).report).toBe(true);
    expect(decide(middling, PROFILES.minimal).reason).toBe('below-threshold');
  });

  it('honours per-type thresholds in a custom profile', () => {
    const profile = customProfile({ EMAIL: 0.9, PHONE: 0.1 });
    expect(decide(entity('EMAIL', 0.5), profile).reason).toBe('below-threshold');
    expect(decide(entity('PHONE', 0.5), profile).report).toBe(true);
    expect(decide(entity('IBAN', 0.99), profile).reason).toBe('type-out-of-profile');
  });
});

describe('profiles — denylist beats everything', () => {
  it('reports a denylisted value whose type is out of profile', () => {
    const d = decide(entity('ORG', 0.9, 'Project Kingfisher'), PROFILES.minimal, {
      deny: ['Project Kingfisher'],
    });
    expect(d.report).toBe(true);
    expect(d.reason).toBe('denylist');
  });

  it('reports a denylisted value far below threshold', () => {
    const d = decide(entity('PERSON', 0.01, 'Kingfisher'), PROFILES.minimal, { deny: ['Kingfisher'] });
    expect(d.report).toBe(true);
  });

  it('beats the allowlist when a value appears on both', () => {
    const d = decide(entity('ORG', 0.9, 'Acme'), PROFILES.strict, {
      allow: ['Acme'],
      deny: ['Acme'],
    });
    expect(d.report).toBe(true);
    expect(d.reason).toBe('denylist');
  });

  it('matches case- and whitespace-insensitively', () => {
    const d = decide(entity('ORG', 0.9, '  project   KINGFISHER '), PROFILES.minimal, {
      deny: ['Project Kingfisher'],
    });
    expect(d.report).toBe(true);
  });
});

describe('profiles — allowlist', () => {
  it('suppresses an allowlisted value that would otherwise report', () => {
    const d = decide(entity('ORG', 0.99, 'Acme Corp'), PROFILES.strict, { allow: ['Acme Corp'] });
    expect(d.report).toBe(false);
    expect(d.reason).toBe('allowlist');
  });

  it('does not depend on which profile is active', () => {
    // Suppressing a value the user vouched for must not vary by profile.
    for (const profile of [PROFILES.minimal, PROFILES.balanced, PROFILES.strict]) {
      const d = decide(entity('EMAIL', 0.99, 'me@example.com'), profile, {
        allow: ['me@example.com'],
      });
      expect(d.reason, profile.name).toBe('allowlist');
    }
  });

  it('leaves other values of the same type untouched', () => {
    const lists = { allow: ['me@example.com'] };
    expect(decide(entity('EMAIL', 0.9, 'someone.else@example.com'), PROFILES.balanced, lists).report).toBe(true);
  });
});
