/**
 * Which family an entity type belongs to.
 *
 * In core rather than in a UI package for the same reason `labelOf` is, and
 * recorded there first: "two maps drift the moment a type is added to one of
 * them". There are now two consumers - the playground, where the family picks
 * a highlight hue, and the extension's Local Insights, where it is the
 * category counts are kept by ("this month: 12 secrets, 8 financial"). A type
 * filed under `secret` in one and `other` in the other would make the two
 * surfaces disagree about the same text.
 *
 * Pure data with no environment dependency, which is the bar for living here.
 */

import type { EntityType } from './types.js';

/** Annotation families — each gets one hue in the ledger palette. */
export type EntityFamily =
  | 'contact'
  | 'financial'
  | 'identity'
  | 'document'
  | 'health'
  | 'secret'
  | 'network'
  | 'location'
  | 'person'
  | 'other';

const FAMILY_BY_TYPE: Readonly<Record<EntityType, EntityFamily>> = {
  EMAIL: 'contact',
  PHONE: 'contact',
  IP_ADDRESS: 'network',
  MAC_ADDRESS: 'network',
  URL_WITH_CREDENTIALS: 'secret',
  CREDIT_CARD: 'financial',
  IBAN: 'financial',
  SWIFT_BIC: 'financial',
  US_ROUTING_NUMBER: 'financial',
  UK_SORT_CODE: 'financial',
  CA_TRANSIT_NUMBER: 'financial',
  AU_BSB: 'financial',
  IN_IFSC: 'financial',
  BR_AGENCIA: 'financial',
  CRYPTO_WALLET: 'financial',
  NATIONAL_ID: 'identity',
  TAX_ID: 'identity',
  VAT_NUMBER: 'identity',
  PASSPORT_MRZ: 'document',
  DRIVERS_LICENSE: 'document',
  VIN: 'document',
  US_NPI: 'document',
  HEALTH_DATA: 'health',
  API_KEY: 'secret',
  PRIVATE_KEY: 'secret',
  JWT: 'secret',
  GENERIC_SECRET: 'secret',
  CONNECTION_STRING: 'secret',
  POSTAL_CODE: 'location',
  STREET_ADDRESS: 'location',
  COORDINATES: 'location',
  PERSON: 'person',
  ORG: 'person',
  LOCATION: 'location',
  DATE_OF_BIRTH: 'identity',
};

export function familyOf(type: EntityType): EntityFamily {
  return FAMILY_BY_TYPE[type] ?? 'other';
}
