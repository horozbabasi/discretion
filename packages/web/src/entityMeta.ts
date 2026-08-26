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

/** Human-readable label, e.g. 'CREDIT_CARD' → 'Credit card'. */
export function labelOf(type: EntityType): string {
  const words = type.toLowerCase().split('_');
  const first = words[0] ?? '';
  const label = [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
  // Initialisms that read wrong in sentence case.
  return label
    .replace(/\bIban\b|\biban\b/g, 'IBAN')
    .replace(/\bIp\b|\bip\b/g, 'IP')
    .replace(/\bMac\b|\bmac\b/g, 'MAC')
    .replace(/\bUrl\b|\burl\b/g, 'URL')
    .replace(/\bJwt\b|\bjwt\b/g, 'JWT')
    .replace(/\bApi\b|\bapi\b/g, 'API')
    .replace(/\bVin\b|\bvin\b/g, 'VIN')
    .replace(/\bmrz\b/g, 'MRZ')
    .replace(/\bVat\b|\bvat\b/g, 'VAT')
    .replace(/\bUs\b|\bus\b/g, 'US')
    .replace(/\bUk\b|\buk\b/g, 'UK')
    .replace(/\bCa\b/g, 'CA')
    .replace(/\bAu\b/g, 'AU')
    .replace(/\bIn\b/g, 'IN')
    .replace(/\bBr\b/g, 'BR')
    .replace(/\bbsb\b/g, 'BSB')
    .replace(/\bifsc\b/g, 'IFSC')
    .replace(/\bnpi\b/g, 'NPI');
}

/** Confidence tier name for a raw Stage 1 confidence value. */
export function confidenceTier(raw: number): 'maximum' | 'high' | 'medium' | 'low' {
  if (raw >= 0.99) return 'maximum';
  if (raw >= 0.85) return 'high';
  if (raw >= 0.6) return 'medium';
  return 'low';
}
