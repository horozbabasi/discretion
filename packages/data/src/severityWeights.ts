/**
 * SEVERITY WEIGHTS for the exposure score.
 *
 * SPEC.md: "Severity weights live in a reviewed data file in packages/data
 * with documented per-category rationale (a validated credit card outweighs a
 * city name) — never constants buried in code."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PRINCIPLE, stated before any number, because this file is where
 * arbitrary values are easiest to hide. Unlike a detector rule, no test can
 * catch a wrong weight here — only a stated rationale a reader can disagree
 * with. So the weights are not per-type intuitions. They are derived from two
 * questions asked of every category, in this order:
 *
 *   1. IRREVERSIBILITY. If this value reaches a third party, what can the
 *      person do about it afterwards? A leaked API key can be rotated in
 *      minutes and the harm stops. A leaked national identity number cannot
 *      be rotated at all: it identifies the person for life, and every future
 *      misuse traces back to that one disclosure. Irreversible harm outranks
 *      severe-but-revocable harm.
 *
 *   2. RE-IDENTIFICATION POWER. How much does this value narrow the set of
 *      people it could refer to? A full national identifier narrows it to
 *      one. A city narrows it to millions. Between two values of equal
 *      reversibility, the one that identifies a specific person scores higher.
 *
 * Where the two disagree, IRREVERSIBILITY WINS. That is the judgement this
 * file rests on and the one to argue with first: it is why government identity
 * outranks credentials even though a leaked credential can cause faster and
 * more visible damage. The reasoning is that speed of harm is not the same as
 * permanence of harm, and a user can respond to the first but not the second.
 *
 * A consequence worth naming: this scale is about HARM TO THE PERSON, not
 * about how alarming a value looks. A private key is dramatic and rotatable;
 * a date of birth is mundane and permanent. The scale reflects that, and it
 * will occasionally read as counter-intuitive for exactly that reason.
 *
 * SCALE: 0–100, where 100 is "irreversible and uniquely identifying".
 * Weights are per CATEGORY; per-type factors adjust within a category.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The categories SPEC names for the exposure breakdown. */
export type SeverityCategory =
  | 'secrets'
  | 'financial'
  | 'government-identity'
  | 'health'
  | 'contact'
  | 'location'
  | 'personal-names';

export interface CategoryWeight {
  readonly weight: number;
  /** Why this number and not another. Required reading for any change. */
  readonly rationale: string;
}

export const SEVERITY_WEIGHTS: Readonly<Record<SeverityCategory, CategoryWeight>> = {
  'government-identity': {
    weight: 100,
    rationale:
      'Maximally irreversible and uniquely identifying, so it anchors the top of the scale. A national identity, tax or passport number cannot be rotated, reissued on request, or meaningfully disowned; it identifies one person for life and is the key that unlocks credit, benefits and healthcare in most jurisdictions. Every later misuse traces back to a single disclosure the person can do nothing about.',
  },
  health: {
    weight: 90,
    rationale:
      'Irreversible and, unlike an identifier, damaging purely by being known. A diagnosis cannot be un-disclosed, and disclosure carries discrimination risk in employment and insurance that no remediation undoes. Slightly below government identity only because a health fact alone is often not sufficient to identify the person it belongs to — it needs a name beside it, which the co-occurrence in a real document usually supplies.',
  },
  financial: {
    weight: 75,
    rationale:
      'Severe, uniquely identifying, and PARTIALLY reversible — which is precisely why it sits below identity and health rather than above them. A card can be cancelled and an account frozen, so the harm has a ceiling and an end date, even though reaching that ceiling costs the person real money and time. Bank identifiers rank here rather than with credentials because they are tied to a named person, not to a machine.',
  },
  secrets: {
    weight: 70,
    rationale:
      'The most ACUTE harm and among the most reversible, which is the tension this scale resolves in favour of permanence. A leaked key can be exploited within seconds of disclosure, but it can also be rotated within minutes, after which the disclosed value is inert. It also usually identifies a SYSTEM rather than a person, so its re-identification power is low. Ranked high because the acute window is genuinely dangerous, below identity because the person retains a remedy.',
  },
  contact: {
    weight: 45,
    rationale:
      'Directly identifying but routinely disclosed and changeable. An email address or phone number names one person, which is why it outranks location, but people hand these out constantly and can change them, so the marginal harm of one more disclosure is low. The real risk is aggregation — a contact detail beside a health fact is worth more than either alone, which the exposure engine handles through co-occurrence rather than by inflating this weight.',
  },
  'personal-names': {
    weight: 35,
    rationale:
      'Identifying in context, weakly identifying alone, and not secret. A common name narrows the population very little; an unusual one narrows it a great deal, and this single weight cannot tell them apart. Kept deliberately modest so that a document full of ordinary names does not read as a crisis, while co-occurrence still lifts a name that sits beside an identifier.',
  },
  location: {
    weight: 25,
    rationale:
      'Weakest re-identification power of the categories and largely reversible in effect. A city or postal code narrows to thousands or millions of people. A full street address is far more identifying than a city, and that difference is handled by a per-type factor rather than by raising the category — otherwise every mention of a country would score like a home address.',
  },
};

/**
 * Per-type multipliers WITHIN a category.
 *
 * These exist because a category weight is necessarily coarse. Each is a
 * ratio against the category's own weight, and each needs the same kind of
 * reason the categories do — a factor is not a tuning knob.
 */
export interface TypeFactor {
  readonly factor: number;
  readonly rationale: string;
}

export const TYPE_FACTORS: Readonly<Record<string, TypeFactor>> = {
  STREET_ADDRESS: {
    factor: 1.6,
    rationale:
      'A street address identifies a household, which is a far smaller set than the city or postal code the location weight is calibrated for, and it exposes physical safety rather than only privacy.',
  },
  POSTAL_CODE: {
    factor: 0.8,
    rationale:
      'Narrows to a neighbourhood at best, and in several countries to an area of thousands. Below the category baseline, which is set for a named place.',
  },
  COORDINATES: {
    factor: 1.6,
    rationale:
      'A latitude/longitude pair is a street address expressed differently, and is often more precise than one.',
  },
  PRIVATE_KEY: {
    factor: 1.3,
    rationale:
      'Rotatable like any credential, but the blast radius is wider: a private key typically authorises a class of operations rather than one service, and rotation requires re-issuing everything that trusted it.',
  },
  GENERIC_SECRET: {
    factor: 0.7,
    rationale:
      "Not a factor about harm but about CERTAINTY: this type's precision is the weakest in the pipeline, so its contribution is discounted to keep an uncertain detection from dominating a document's score. Recorded here rather than hidden in the engine because it is a different kind of reason from the others.",
  },
  PASSPORT_MRZ: {
    factor: 1.0,
    rationale:
      'A passport number is a government identifier like the others in its category; the machine-readable zone adds nationality and date of birth, which the co-occurrence handling already accounts for.',
  },
  DRIVERS_LICENSE: {
    factor: 0.9,
    rationale:
      'Government-issued and identifying, but reissued on a schedule and replaceable after loss, so marginally less permanent than a national identity number.',
  },
  VIN: {
    factor: 0.5,
    rationale:
      'Identifies a vehicle rather than directly a person, and is visible through the windscreen of every car on the street. Included because it links to an owner through a registry, discounted because that link is not public.',
  },
  ORG: {
    factor: 0.6,
    rationale:
      'An organisation is not a person. It appears in the personal-names category only because the NER stage produces it alongside PERSON, and it is discounted to reflect that a company name is usually public information.',
  },
};

/** Which category an entity type belongs to. */
export const CATEGORY_OF: Readonly<Record<string, SeverityCategory>> = {
  API_KEY: 'secrets',
  PRIVATE_KEY: 'secrets',
  JWT: 'secrets',
  GENERIC_SECRET: 'secrets',
  CONNECTION_STRING: 'secrets',
  URL_WITH_CREDENTIALS: 'secrets',

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
  VAT_NUMBER: 'financial',

  NATIONAL_ID: 'government-identity',
  TAX_ID: 'government-identity',
  PASSPORT_MRZ: 'government-identity',
  DRIVERS_LICENSE: 'government-identity',
  VIN: 'government-identity',
  US_NPI: 'government-identity',

  HEALTH_DATA: 'health',

  EMAIL: 'contact',
  PHONE: 'contact',
  IP_ADDRESS: 'contact',
  MAC_ADDRESS: 'contact',

  STREET_ADDRESS: 'location',
  POSTAL_CODE: 'location',
  COORDINATES: 'location',
  LOCATION: 'location',

  PERSON: 'personal-names',
  ORG: 'personal-names',
  DATE_OF_BIRTH: 'personal-names',
};
