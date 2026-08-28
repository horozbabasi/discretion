/**
 * Stage 4 — SENSITIVITY PROFILES, allowlist and denylist.
 *
 * SPEC.md:
 *   "Apply the active SENSITIVITY PROFILE, which sets thresholds:
 *      Minimal — secrets and financial identifiers only.
 *      Balanced — default. Secrets, financial, national IDs, contact details,
 *        person names.
 *      Strict — adds health data, addresses, dates of birth, organizations,
 *        low-confidence candidates.
 *      Custom — per-entity-type threshold control."
 *   "Apply user allowlist (never mask …) and denylist (always mask …).
 *    Denylist beats everything."
 *
 * A profile does two things at once and it is worth separating them: it says
 * WHICH TYPES are in scope, and it says HOW SURE the pipeline must be before
 * reporting one. The second only became meaningful with calibration — before
 * a confidence meant something comparable across types, a threshold was an
 * arbitrary cut. That is why profiles land in the same milestone as the
 * calibration curve rather than earlier.
 *
 * Thresholds are stated as CALIBRATED probabilities, so "0.5" reads as "report
 * this when it is more likely right than wrong" rather than as a detector-local
 * number whose meaning varies by type.
 */

import type { EntityType } from '../types.js';

export type ProfileName = 'minimal' | 'balanced' | 'strict' | 'custom';

/** Broad families, used to state the profiles in SPEC's own vocabulary. */
const SECRETS: readonly EntityType[] = [
  'API_KEY',
  'PRIVATE_KEY',
  'JWT',
  'GENERIC_SECRET',
  'CONNECTION_STRING',
  'URL_WITH_CREDENTIALS',
];

const FINANCIAL: readonly EntityType[] = [
  'CREDIT_CARD',
  'IBAN',
  'SWIFT_BIC',
  'US_ROUTING_NUMBER',
  'UK_SORT_CODE',
  'CA_TRANSIT_NUMBER',
  'AU_BSB',
  'IN_IFSC',
  'BR_AGENCIA',
  'CRYPTO_WALLET',
  'VAT_NUMBER',
];

const GOVERNMENT_ID: readonly EntityType[] = [
  'NATIONAL_ID',
  'TAX_ID',
  'PASSPORT_MRZ',
  'DRIVERS_LICENSE',
  'VIN',
  'US_NPI',
];

const CONTACT: readonly EntityType[] = ['EMAIL', 'PHONE', 'IP_ADDRESS', 'MAC_ADDRESS'];

const LOCATION_TYPES: readonly EntityType[] = ['STREET_ADDRESS', 'POSTAL_CODE', 'COORDINATES', 'LOCATION'];

const HEALTH: readonly EntityType[] = ['HEALTH_DATA'];

const PEOPLE: readonly EntityType[] = ['PERSON'];
const ORGS: readonly EntityType[] = ['ORG'];
const DATES: readonly EntityType[] = ['DATE_OF_BIRTH'];

export interface SensitivityProfile {
  readonly name: ProfileName;
  /** Types the profile reports at all. */
  readonly types: ReadonlySet<EntityType>;
  /**
   * Minimum CALIBRATED confidence to report, per type, with a default.
   * Meaningful only because Stage 4 calibrated the scale (D23).
   */
  readonly threshold: (type: EntityType) => number;
}

function profile(
  name: ProfileName,
  types: readonly (readonly EntityType[])[],
  defaultThreshold: number,
  overrides: Partial<Record<EntityType, number>> = {},
): SensitivityProfile {
  return {
    name,
    types: new Set(types.flat()),
    threshold: (type) => overrides[type] ?? defaultThreshold,
  };
}

/**
 * The three named profiles.
 *
 * Thresholds differ by INTENT, not by tuning. Minimal exists for a developer
 * who wants surgical protection and would rather miss a weak signal than see
 * a spurious one, so it demands high confidence. Strict exists for someone who
 * would rather over-mask, so it deliberately admits low-confidence candidates
 * — SPEC names "low-confidence candidates" as part of what Strict adds.
 */
export const PROFILES: Readonly<Record<Exclude<ProfileName, 'custom'>, SensitivityProfile>> = {
  minimal: profile('minimal', [SECRETS, FINANCIAL], 0.7),
  balanced: profile('balanced', [SECRETS, FINANCIAL, GOVERNMENT_ID, CONTACT, PEOPLE], 0.5, {
    // A leaked credential is unrecoverable, so it is reported on weaker
    // evidence than a name, which the user can dismiss at no cost.
    API_KEY: 0.35,
    PRIVATE_KEY: 0.35,
    CONNECTION_STRING: 0.35,
  }),
  strict: profile(
    'strict',
    [SECRETS, FINANCIAL, GOVERNMENT_ID, CONTACT, PEOPLE, HEALTH, LOCATION_TYPES, ORGS, DATES],
    0.25,
    { API_KEY: 0.2, PRIVATE_KEY: 0.2, CONNECTION_STRING: 0.2 },
  ),
};

/** A user's own additions to whatever profile is active. */
export interface UserLists {
  /**
   * Never mask these. Matched case- and whitespace-insensitively on the
   * entity's text — a user's own employer name, say.
   */
  readonly allow?: readonly string[];
  /** Always mask these, whatever the profile or confidence says. */
  readonly deny?: readonly string[];
}

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ProfileDecision {
  readonly report: boolean;
  /** Why, in one stable token, for the explanation and for tests. */
  readonly reason: 'denylist' | 'allowlist' | 'type-out-of-profile' | 'below-threshold' | 'in-profile';
}

/**
 * Decide whether one entity is reported under a profile.
 *
 * ORDER IS THE WHOLE CONTRACT, and it follows SPEC exactly: "Denylist beats
 * everything." A denylisted value is reported even when its type is out of
 * profile and even when confidence is far below threshold — it is the one
 * override a user can state absolutely. The allowlist is checked next, before
 * type and threshold, so that suppressing a value the user has vouched for
 * does not depend on which profile happens to be active.
 */
export function decide(
  entity: { readonly type: EntityType; readonly text: string; readonly calibratedConfidence: number },
  profileIn: SensitivityProfile,
  lists: UserLists = {},
): ProfileDecision {
  const text = fold(entity.text);

  if ((lists.deny ?? []).some((d) => fold(d) === text)) {
    return { report: true, reason: 'denylist' };
  }
  if ((lists.allow ?? []).some((a) => fold(a) === text)) {
    return { report: false, reason: 'allowlist' };
  }
  if (!profileIn.types.has(entity.type)) {
    return { report: false, reason: 'type-out-of-profile' };
  }
  if (entity.calibratedConfidence < profileIn.threshold(entity.type)) {
    return { report: false, reason: 'below-threshold' };
  }
  return { report: true, reason: 'in-profile' };
}

/** Build a custom profile from explicit per-type thresholds. */
export function customProfile(
  thresholds: Partial<Record<EntityType, number>>,
  defaultThreshold = 0.5,
): SensitivityProfile {
  return {
    name: 'custom',
    types: new Set(Object.keys(thresholds) as EntityType[]),
    threshold: (type) => thresholds[type] ?? defaultThreshold,
  };
}
