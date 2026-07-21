/**
 * Shared types for the whole PrivacyShield project.
 *
 * These are contracts that later milestones (detectors, fusion, vault,
 * substitution, egress guard, extension, playground) depend on. This file
 * defines TYPES ONLY — no logic, no constants with behavior.
 *
 * NOTE: SPEC.md was not available when this file was written (see the M1
 * report). The EntityType membership below reconstructs the Stage 1 / Stage 2
 * families named in the milestone instructions: contact, financial, national
 * identifiers (as one family), documents, health, secrets, location, and the
 * Stage 2 NER types PERSON / ORG / LOCATION. Adjust member names here — in one
 * place — if SPEC.md names them differently.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────

/** Every entity type the pipeline can detect (Stage 1 pattern/validator types + Stage 2 NER types). */
export type EntityType =
  // ── Contact ──
  | 'email'
  | 'phone'
  | 'handle' // social / messaging handle, e.g. @username
  | 'url' // URLs that identify a person (profile links, tracking links)
  | 'ip_address'
  // ── Financial ──
  | 'credit_card'
  | 'iban'
  | 'bank_account'
  | 'swift_bic'
  | 'crypto_wallet'
  // ── National identifiers (one family; the concrete scheme — SSN, NINO, TCKN, … —
  //    goes in Candidate.metadata so new countries don't grow this union) ──
  | 'national_id'
  // ── Documents ──
  | 'passport'
  | 'drivers_license'
  | 'vehicle_id' // VIN / license plate
  // ── Health ──
  | 'health_id' // medical record number, health insurance ID
  // ── Secrets ──
  | 'api_key'
  | 'private_key'
  | 'jwt'
  | 'password'
  // ── Location ──
  | 'street_address'
  | 'postal_code'
  | 'geo_coordinate'
  // ── Stage 2 NER (uppercase by NER-label convention) ──
  | 'PERSON'
  | 'ORG'
  | 'LOCATION';

/** Which pipeline stage produced a candidate / contributed to an entity. */
export type DetectionStage =
  | 'stage0-normalization' // text canonicalization (this milestone)
  | 'stage1-pattern' // deterministic detectors: regex triggers + validators
  | 'stage2-ner' // ML named-entity recognition
  | 'fusion'; // candidate merging / calibration

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

/** Wall-clock timing for one pipeline stage. */
export interface StageTiming {
  stage: DetectionStage;
  durationMs: number;
}

/** The result of running detection over one piece of text. */
export interface DetectionResult {
  entities: readonly DetectedEntity[];
  /** Per-stage timing breakdown. */
  timings: readonly StageTiming[];
  /** The normalization the detectors ran on; needed to map offsets back. */
  normalization: NormalizationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy / substitution (shapes only — implemented in later milestones)
// ─────────────────────────────────────────────────────────────────────────────

export type SensitivityProfile = 'minimal' | 'balanced' | 'strict' | 'custom';

export type SubstitutionMode = 'surrogate' | 'token';

/** One masked value held locally so the original can be restored later. */
export interface VaultEntry {
  /** Stable unique id of this entry. */
  id: string;
  type: EntityType;
  /** The original text that was masked. */
  original: string;
  /** What it was replaced with (a surrogate value or an opaque token). */
  replacement: string;
  /** Epoch milliseconds when the entry was created. */
  createdAt: number;
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
export type TransformKind = 'strip-invisibles' | 'nfkc' | 'homoglyph-fold' | 'whitespace-punct';

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
