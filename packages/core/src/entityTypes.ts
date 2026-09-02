/**
 * entityTypes.ts — runtime enumeration of `EntityType`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS IN CORE
 *
 * `EntityType` is a TypeScript union, so it has no runtime representation. Any
 * consumer that needs to iterate the types — an options page, a report, a
 * coverage check — has to write the list out by hand, and every hand-written
 * copy is a place the list can go stale when the union grows.
 *
 * Until M12 the only such list lived in the extension's options page. That is
 * the wrong package for it: which entity types exist, and which of them
 * anything can actually produce, are facts about the DETECTION ENGINE, and a
 * published library consumer has no access to the extension at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DECLARED vs DERIVED, AND THE BUG THAT MOTIVATED IT
 *
 * `ALL_ENTITY_TYPES` must be declared: there is nothing to derive it from.
 * `Record<EntityType, true>` makes an omission a COMPILE ERROR, which is the
 * only guarantee available.
 *
 * `detectableEntityTypes()` is the opposite: it is DERIVED from the detector
 * registry and the Stage 2 output types, never declared. M11 found that the
 * options page offered a `DATE_OF_BIRTH` toggle although no Stage 1 detector
 * emits it and Stage 2 emits only PERSON/ORG/LOCATION — a control that did
 * nothing in either position, which is a quiet claim that the type is being
 * looked for. Nothing in the test suite could have caught it, because every
 * test agreed with the code that all 35 types were offered.
 *
 * Deriving the answer is what stops that recurring. When a `DATE_OF_BIRTH`
 * detector is registered the type reappears here on its own, and when a type
 * loses its last detector it disappears the same way.
 */

import { detectorsForEntityType } from './detect/registry.js';
import type { NerEntityType } from './ner/types.js';
import type { EntityType } from './types.js';

/**
 * Every member of `EntityType`, in a stable, family-grouped order.
 *
 * The `Record<EntityType, true>` annotation is load-bearing: adding a member
 * to the union without adding it here fails to compile.
 */
const ALL_TYPES: Readonly<Record<EntityType, true>> = {
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

/** Every entity type the engine models, detectable or not. */
export const ALL_ENTITY_TYPES: readonly EntityType[] = Object.freeze(
  Object.keys(ALL_TYPES) as EntityType[],
);

/**
 * The types Stage 2 can emit.
 *
 * Declared for the same reason as `ALL_TYPES` — `NerEntityType` is a union —
 * and annotated the same way so that widening the union fails to compile here
 * rather than silently narrowing `detectableEntityTypes()`.
 */
const NER_TYPES: Readonly<Record<NerEntityType, true>> = {
  PERSON: true, ORG: true, LOCATION: true,
};

/** The types Stage 2's model can produce. */
export const NER_ENTITY_TYPES: readonly NerEntityType[] = Object.freeze(
  Object.keys(NER_TYPES) as NerEntityType[],
);

/**
 * The types anything can actually produce: those with at least one registered
 * Stage 1 detector, plus those Stage 2 emits.
 *
 * RECOMPUTED ON EVERY CALL, and deliberately not memoised. The first version
 * cached the answer on the reasoning that the registry only grows. It does
 * only grow — but `registerDetector` is public API, so a consumer who adds a
 * detector for their own identifier format and then asks which types are
 * detectable would have been told the answer from before their own call. A
 * cache that is only correct until someone uses another part of the API is
 * worse than no cache.
 *
 * The work is a scan of the registry per type: 35 types against ~113
 * detectors, no allocation beyond the result. That is not worth a correctness
 * hazard.
 *
 * Reading the registry at call time is also what makes the answer safe at any
 * point in the import cycle: detectors register as a side effect of importing
 * the package, and a module-level constant here would have been evaluated
 * during that same import, possibly yielding a confidently empty list.
 */
export function detectableEntityTypes(): readonly EntityType[] {
  const ner = new Set<string>(NER_ENTITY_TYPES);
  return ALL_ENTITY_TYPES.filter(
    (type) => detectorsForEntityType(type).length > 0 || ner.has(type),
  );
}
