/**
 * Shared types for the whole Discretion project.
 *
 * These are contracts that later milestones (detectors, fusion, vault,
 * substitution, egress guard, extension, playground) depend on. This file
 * defines TYPES ONLY — no logic, no constants with behavior.
 *
 * EntityType membership comes directly from SPEC.md: the Stage 1 "Validated
 * identifier detection" detector list and the Stage 2 NER types. Names use
 * the spec's own SCREAMING_SNAKE_CASE spelling so a detector's declared
 * entity type reads identically in the spec and in the code.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every entity type the pipeline can detect, grouped as SPEC.md groups them.
 *
 * Three deliberate design choices, each recorded in ARCHITECTURE.md:
 *
 *  1. National identifiers are FAMILIES, not one member per country. SPEC.md
 *     requires that "adding a new national identifier must require touching
 *     exactly one new file" — a per-country union member would force every
 *     new scheme to edit this file too, breaking that requirement. The
 *     concrete scheme (SSN, TCKN, PESEL, Aadhaar, …) and its country travel
 *     in Candidate.metadata. The substitution section's singular
 *     "NATIONAL_ID → a value passing that country's checksum" confirms the
 *     family reading.
 *  2. Tax and VAT registrations are split out from NATIONAL_ID because their
 *     sensitivity genuinely differs — a company VAT number is often public
 *     registry data, a personal national ID never is — so the sensitivity
 *     profiles must be able to threshold them independently.
 *  3. PEM private keys get their own member rather than sharing API_KEY.
 *     SPEC.md lists them in the same bullet, but a leaked private key and a
 *     leaked API key differ in blast radius and in how each is surrogated.
 */
export type EntityType =
  // ── Contact and network ──
  | 'EMAIL'
  | 'PHONE'
  | 'IP_ADDRESS'
  | 'MAC_ADDRESS'
  | 'URL_WITH_CREDENTIALS'
  // ── Financial ──
  | 'CREDIT_CARD'
  | 'IBAN'
  | 'SWIFT_BIC'
  | 'US_ROUTING_NUMBER'
  | 'UK_SORT_CODE'
  | 'CA_TRANSIT_NUMBER'
  | 'AU_BSB'
  | 'IN_IFSC'
  | 'BR_AGENCIA'
  | 'CRYPTO_WALLET'
  // ── National and tax identifiers (families — see note 1 above) ──
  | 'NATIONAL_ID'
  | 'TAX_ID'
  | 'VAT_NUMBER'
  // ── Documents ──
  | 'PASSPORT_MRZ'
  | 'DRIVERS_LICENSE'
  | 'VIN'
  | 'US_NPI'
  // ── Health (ICD-10/ICD-11, SNOMED, lab results) ──
  | 'HEALTH_DATA'
  // ── Secrets and credentials ──
  | 'API_KEY'
  | 'PRIVATE_KEY'
  | 'JWT'
  | 'GENERIC_SECRET'
  | 'CONNECTION_STRING'
  // ── Location ──
  | 'POSTAL_CODE'
  | 'STREET_ADDRESS'
  | 'COORDINATES'
  // ── Stage 2: named-entity recognition ──
  | 'PERSON'
  | 'ORG'
  | 'LOCATION'
  // ── Dates ──
  // Absent from the Stage 1 detector list, but required by two other SPEC.md
  // sections: the Strict profile ("adds ... dates of birth") and the
  // substitution table ("DATE → a shifted date preserving relative ordering
  // across the document"). Carried here so both stay implementable.
  | 'DATE_OF_BIRTH';

/**
 * Which pipeline stage produced a candidate, or contributed to an entity.
 * One member per stage of SPEC.md's core detection pipeline.
 */
export type DetectionStage =
  | 'stage0-normalization' // text canonicalization (M1)
  | 'stage1-validated-identifier' // regex candidate generation + validator
  | 'stage2-ner' // multilingual ONNX token classification
  | 'stage2b-gazetteer' // bundled name / place / org lookup sets
  | 'stage2c-verification' // second opinion over the ambiguous band
  | 'stage3-context' // trigger proximity, structural and negative context
  | 'stage4-fusion'; // calibration, overlap resolution, profile thresholds

/**
 * A pre-fusion detection produced by a single detector.
 * Offsets are indices into the NORMALIZED text (see NormalizationResult for
 * how they map back to the original).
 */
export interface Candidate {
  /** The matched substring of the normalized text. */
  text: string;
  type: EntityType;
  /** Start offset (inclusive), UTF-16 code units into the normalized text. */
  start: number;
  /** End offset (exclusive). */
  end: number;
  /** Detector-local confidence in [0, 1]; NOT calibrated across detectors. */
  rawConfidence: number;
  stage: DetectionStage;
  /** Stable identifier of the detector that produced this, e.g. "email-rfc5322". */
  detectorId: string;
  /** Detector-specific extras (e.g. { scheme: 'ssn', country: 'US' } for national_id). */
  metadata?: Readonly<Record<string, unknown>>;
}

/** Why an entity was reported — surfaced in the review UI and in eval output. */
export interface EntityExplanation {
  /** Which stages fired for this entity. */
  stages: readonly DetectionStage[];
  /** Which triggers matched (detector ids, trigger names, context words). */
  triggers: readonly string[];
  /** Name of the validator that passed (checksum, format check), if any. */
  validatorPassed?: string;
}

/** A post-fusion entity: what the pipeline actually reports. */
export interface DetectedEntity {
  /** The matched substring of the normalized text. */
  text: string;
  type: EntityType;
  /** Start offset (inclusive), UTF-16 code units into the normalized text. */
  start: number;
  /** End offset (exclusive). */
  end: number;
  /** Calibrated confidence in [0, 1], comparable across types and stages. */
  calibratedConfidence: number;
  explanation: EntityExplanation;
}

// `StageTiming` and `DetectionResult` were declared here at M1 as shapes for
// "later milestones" and were never implemented: no function ever returned
// one, and nothing outside this file ever referenced them. M12 removed them
// rather than publish them.
//
// A type in a published API is a promise that something produces it. Shipping
// these would have put two entries in the generated reference that a reader
// could search the whole package for and never find - the documentation
// equivalent of a stub, which SPEC.md's fourth non-negotiable forbids.
//
// `protect()` is what M12 shipped for this job. Its result carries
// `stagesRun`, which is DERIVED from the options, in place of `timings`,
// which was merely declared.

// ─────────────────────────────────────────────────────────────────────────────
// Policy / substitution
// ─────────────────────────────────────────────────────────────────────────────

// `SensitivityProfile` used to be declared here as the string union
// 'minimal' | 'balanced' | 'strict' | 'custom'. It was DEAD and worse than
// dead: `index.ts` re-exports the same name from `fuse/profiles.ts`, where it
// is the profile OBJECT, so the union was unreachable through the package's
// public API while still being the first definition a reader finds by name.
// The union it described is `ProfileName`, which fuse/profiles.ts already
// exports. Removed rather than renamed - two names for one idea is what
// created the collision.

export type SubstitutionMode = 'surrogate' | 'token';

/** One masked value held locally so the original can be restored later. */
export interface VaultEntry {
  /** Stable unique id of this entry. */
  id: string;
  type: EntityType;
  /** The original text that was masked (first-seen writing). */
  original: string;
  /** What it was replaced with (a surrogate value or an opaque token). */
  replacement: string;
  /** Epoch milliseconds when the entry was created. */
  createdAt: number;
  /**
   * Canonical form of the original (separators stripped, case-normalized by
   * the detector) — the consistency key that makes "4111 1111…" and
   * "4111-1111…" share one entry, and the egress guard's
   * separator-insensitive search term. Added in M4; optional because token
   * bracket entries for unknown shapes have no canonical beyond the text.
   */
  canonical?: string;
  /**
   * True when no sensible surrogate could be produced and a bracket token
   * was used instead — SPEC.md requires the fallback be recorded in the
   * session record. Added in M4.
   */
  fallback?: boolean;
}

/** Result of masking a piece of text. */
export interface MaskResult {
  maskedText: string;
  /** The entities that were substituted. */
  entities: readonly DetectedEntity[];
  /** Vault entries created for this mask operation. */
  vaultEntries: readonly VaultEntry[];
}

/** Result of restoring masked values in a piece of text. */
export interface RestoreResult {
  restoredText: string;
  /** How many replacements were restored to their originals. */
  restoredCount: number;
  /** Replacements found in the text with no matching vault entry. */
  unmatchedReplacements: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripts
// ─────────────────────────────────────────────────────────────────────────────

/** Writing systems the pipeline distinguishes. Everything else is 'other'. */
export type ScriptName =
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'devanagari'
  | 'greek'
  | 'thai'
  | 'armenian'
  | 'georgian'
  | 'ethiopic'
  | 'other';

/** Per-script breakdown of a piece of text. */
export interface ScriptInfo {
  /**
   * Letter counts per script. Script-neutral characters — whitespace, digits,
   * punctuation, symbols, combining marks — are not counted at all; letters of
   * scripts outside the supported list are counted under 'other'.
   */
  counts: Readonly<Record<ScriptName, number>>;
  /**
   * The script with the strictly highest letter count among the supported
   * (non-'other') scripts, or null when the text has no such letters or the
   * top count is tied.
   */
  dominant: ScriptName | null;
  /** True when letters of two or more supported scripts are present. */
  mixed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization (Stage 0)
// ─────────────────────────────────────────────────────────────────────────────

/** The individual transforms of the Stage 0 pipeline, in execution order. */
export type TransformKind =
  | 'strip-invisibles'
  | 'nfkc'
  | 'homoglyph-fold'
  | 'whitespace-punct'
  | 'fold-digits';

/** One transform application, recorded for debugging and for the review UI. */
export interface TransformationRecord {
  kind: TransformKind;
  /** Start of the affected range in the ORIGINAL text (inclusive). */
  originalStart: number;
  /** End of the affected range in the ORIGINAL text (exclusive). */
  originalEnd: number;
  /** The affected slice of the ORIGINAL text. */
  original: string;
  /** What this transform emitted for that range ('' for deletions). */
  replacement: string;
}

/** Every transform can be disabled individually; all default to enabled. */
export interface NormalizationOptions {
  stripInvisibles?: boolean;
  nfkc?: boolean;
  homoglyphFold?: boolean;
  whitespacePunct?: boolean;
  /** Fold non-ASCII decimal digits (Arabic-Indic, Devanagari, Thai, …) to ASCII. */
  foldDigits?: boolean;
}

/**
 * The result of Stage 0 normalization.
 *
 * THE OFFSET MAP CONTRACT
 * ───────────────────────
 * Detection runs on `normalizedText`; substitution edits the ORIGINAL text.
 * `offsetMap` connects the two:
 *
 *   offsetMap[i]  = index in the original string where the cluster that
 *                   produced normalized index i begins.
 *   offsetMap[normalizedText.length] = originalText.length   (sentinel)
 *
 * A normalized span [s, e) therefore maps to the original span
 * [offsetMap[s], offsetMap[e]).  Invariants (tested exhaustively):
 *   • offsetMap is monotonically non-decreasing
 *   • offsetMap[0] === 0 whenever normalizedText is non-empty
 *   • offsetMap[normalizedLength] === originalLength
 *   • every value is a valid index into the original string (0..length incl.)
 *   • identity inputs produce offsetMap[i] === i for every i
 *
 * Deleted characters (invisibles) do not appear in offsetMap; each deleted
 * run is attributed to the cluster that FOLLOWS it (or to the sentinel when
 * the run is at the very end), which is what makes offsetMap[0] === 0 hold.
 *
 * `reverseMap` goes the other way:
 *   reverseMap[j] = normalized index of the start of the cluster whose
 *                   original extent contains original index j; for a deleted
 *                   character this is the normalized position where it was
 *                   removed.
 *   reverseMap[originalText.length] = normalizedText.length   (sentinel)
 */
export interface NormalizationResult {
  normalizedText: string;
  /** normalized index → original index; length is normalizedText.length + 1. */
  offsetMap: Int32Array;
  /** original index → normalized index; length is originalText.length + 1. */
  reverseMap: Int32Array;
  /** Script breakdown of the NORMALIZED text. */
  scripts: ScriptInfo;
  /** Every transform that fired, with ranges in original-text coordinates. */
  transformations: readonly TransformationRecord[];
  originalLength: number;
  normalizedLength: number;
}
