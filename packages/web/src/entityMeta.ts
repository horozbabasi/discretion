/**
 * entityMeta.ts — presentation metadata for entity types: the annotation
 * family each type belongs to (which drives its highlight colour) and a
 * short human label. Pure data; no detection logic lives in this package.
 */

import type { EntityType } from '@privacyshield/core';

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

// The label map moved to core: the extension's review panel names the same
// types, and two maps drift the moment a type is added to one of them.
export { labelOf } from '@privacyshield/core';

/** Confidence tier name for a raw Stage 1 confidence value. */
export function confidenceTier(raw: number): 'maximum' | 'high' | 'medium' | 'low' {
  if (raw >= 0.99) return 'maximum';
  if (raw >= 0.85) return 'high';
  if (raw >= 0.6) return 'medium';
  return 'low';
}
