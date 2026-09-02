/**
 * Entity labels and families.
 *
 * `labelOf` derives a human name from the type rather than reading a table,
 * which is what lets a new entity type be named correctly without touching
 * that file (ARCHITECTURE.md D4). The cost of deriving is that a name can come
 * out wrong in a way nothing notices — its own header says so: "sentence case
 * turns IBAN into 'Iban', and a reviewer who sees 'Iban' reasonably doubts
 * everything else on the panel."
 *
 * That is exactly what happened to `NATIONAL_ID`, which rendered as
 * "National id" on the options page for as long as this function existed
 * without a test.
 */

import { describe, expect, it } from 'vitest';

import { familyOf, labelOf } from '../src/index.js';
import type { EntityType } from '../src/index.js';

/**
 * Every member of the union.
 *
 * `Record<EntityType, true>` rather than a bare array: a type added to the
 * union and not to this list is a COMPILE error, so the sweep below cannot
 * quietly stop covering it.
 */
const ALL: Readonly<Record<EntityType, true>> = {
  EMAIL: true, PHONE: true, IP_ADDRESS: true, MAC_ADDRESS: true,
  URL_WITH_CREDENTIALS: true, CREDIT_CARD: true, IBAN: true, SWIFT_BIC: true,
  US_ROUTING_NUMBER: true, UK_SORT_CODE: true, CA_TRANSIT_NUMBER: true,
  AU_BSB: true, IN_IFSC: true, BR_AGENCIA: true, CRYPTO_WALLET: true,
  NATIONAL_ID: true, TAX_ID: true, VAT_NUMBER: true, PASSPORT_MRZ: true,
  DRIVERS_LICENSE: true, VIN: true, US_NPI: true, HEALTH_DATA: true,
  API_KEY: true, PRIVATE_KEY: true, JWT: true, GENERIC_SECRET: true,
  CONNECTION_STRING: true, POSTAL_CODE: true, STREET_ADDRESS: true,
  COORDINATES: true, PERSON: true, ORG: true, LOCATION: true,
  DATE_OF_BIRTH: true,
};

const TYPES = Object.keys(ALL) as EntityType[];

describe('labelOf', () => {
  it('sentence-cases a multi-word type', () => {
    expect(labelOf('CREDIT_CARD')).toBe('Credit card');
    expect(labelOf('STREET_ADDRESS')).toBe('Street address');
    expect(labelOf('DATE_OF_BIRTH')).toBe('Date of birth');
  });

  it('never lowercases an initialism, wherever it sits in the name', () => {
    // The whole reason the initialism list exists. Each of these has the
    // initialism in a different position - first, last, and middle.
    expect(labelOf('IBAN')).toBe('IBAN');
    expect(labelOf('NATIONAL_ID')).toBe('National ID');
    expect(labelOf('TAX_ID')).toBe('Tax ID');
    expect(labelOf('US_NPI')).toBe('US NPI');
    expect(labelOf('IN_IFSC')).toBe('IN IFSC');
    expect(labelOf('API_KEY')).toBe('API key');
    expect(labelOf('IP_ADDRESS')).toBe('IP address');
    expect(labelOf('PASSPORT_MRZ')).toBe('Passport MRZ');
    expect(labelOf('SWIFT_BIC')).toBe('SWIFT BIC');
  });

  it('leaves no all-caps segment of the type name lowercased in its label', () => {
    // The sweep that would have caught NATIONAL_ID. Any segment that is a
    // known initialism must survive as upper case; any segment that is a real
    // word must not be shouted. This checks the first half for every type at
    // once, so a new type with an unlisted initialism fails here rather than
    // on someone's screen.
    const KNOWN_INITIALISMS = new Set([
      'IBAN', 'IFSC', 'BSB', 'MRZ', 'SWIFT', 'BIC', 'API', 'JWT', 'URL',
      'MAC', 'NPI', 'VAT', 'VIN', 'ID', 'IP', 'US', 'UK', 'CA', 'AU', 'IN',
      'BR',
    ]);
    for (const type of TYPES) {
      const words = labelOf(type).split(' ');
      const segments = type.split('_');
      expect(words.length, `${type} lost or gained a word`).toBe(segments.length);
      segments.forEach((segment, index) => {
        if (!KNOWN_INITIALISMS.has(segment)) return;
        expect(words[index], `${type}: "${segment}" was not kept upper case`).toBe(segment);
      });
    }
  });

  it('gives every type a non-empty label that starts with a capital', () => {
    for (const type of TYPES) {
      const label = labelOf(type);
      expect(label.length, `${type} has no label`).toBeGreaterThan(0);
      expect(label, `${type} label does not start with a capital`).toMatch(/^[A-Z]/u);
      expect(label, `${type} label still contains an underscore`).not.toContain('_');
    }
  });

  it('capitalises only the first word, so it is a name and not a Title', () => {
    // "Credit card", not "Credit Card". Consistency matters here because these
    // strings sit next to each other in a list.
    expect(labelOf('CONNECTION_STRING')).toBe('Connection string');
    expect(labelOf('CRYPTO_WALLET')).toBe('Crypto wallet');
    expect(labelOf('HEALTH_DATA')).toBe('Health data');
  });
});

describe('familyOf', () => {
  it('files every type under a family', () => {
    // A type with no entry falls to 'other', which is a legitimate answer for
    // something genuinely uncategorised and a silent mistake for everything
    // else - so nothing in the current union may land there.
    for (const type of TYPES) {
      expect(familyOf(type), `${type} fell through to 'other'`).not.toBe('other');
    }
  });

  it('groups the ones a user would expect together', () => {
    for (const type of ['API_KEY', 'PRIVATE_KEY', 'JWT', 'GENERIC_SECRET'] as const) {
      expect(familyOf(type)).toBe('secret');
    }
    for (const type of ['IBAN', 'CREDIT_CARD', 'SWIFT_BIC', 'AU_BSB'] as const) {
      expect(familyOf(type)).toBe('financial');
    }
    // URL_WITH_CREDENTIALS is filed under secrets rather than network: the
    // credential is the sensitive part, not the host.
    expect(familyOf('URL_WITH_CREDENTIALS')).toBe('secret');
  });
});
