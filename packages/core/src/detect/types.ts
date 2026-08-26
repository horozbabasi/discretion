/**
 * The Stage 1 detector contract.
 *
 * SPEC.md, Stage 1: "Structure this as a registry: each detector declares its
 * id, entity type, supported regions, candidate pattern, validator function,
 * and base confidence. Adding a new national identifier must require touching
 * exactly one new file."
 *
 * That last sentence is the design constraint everything here answers to.
 * A new detector is one file that builds a `Detector` object and calls
 * `registerDetector`. It does not edit a union type (EntityType models
 * national identifiers as families precisely so it never has to — see
 * ARCHITECTURE.md D4), a central list, or this file.
 *
 * THE CENTRAL RULE. SPEC.md: "Regex is only the candidate generator.
 * Emission at high confidence requires passing a validator. A pattern match
 * without validation is at most low confidence." The runner enforces this
 * mechanically rather than trusting each detector to remember it: a detector
 * cannot emit above `CONFIDENCE.LOW` unless its validator returned success,
 * and one that declares `requiresContext` cannot exceed `CONFIDENCE.LOW` at
 * all until Stage 3 supplies the missing signal.
 */

import type { EntityType } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Confidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named confidence levels shared by every detector.
 *
 * These are RAW, detector-local scores, not calibrated probabilities. Stage 4
 * calibrates them against the eval corpus so that 0.8 empirically means ~80%
 * precision; until then they are only meaningfully ordered, not absolute.
 * Detectors use these constants rather than bare numbers so that recalibrating
 * the scale is one edit here instead of a sweep across 145 files.
 */
export const CONFIDENCE = {
  /** A pattern matched but nothing corroborates it. The ceiling for an
   *  unvalidated match, and for anything awaiting a Stage 3 context signal. */
  LOW: 0.3,
  /** A structural check passed, but the format is weak enough that false
   *  positives are expected (short identifiers, no checksum). */
  MEDIUM: 0.6,
  /** A real checksum or structural validator passed. The normal ceiling. */
  HIGH: 0.85,
  /** Reserved for formats that are self-verifying to the point that a false
   *  positive is implausible — SPEC.md names a valid passport MRZ, "every
   *  field is checksummed; treat a valid MRZ as maximum confidence". */
  MAXIMUM: 0.99,
} as const;

export type ConfidenceLevel = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

// ─────────────────────────────────────────────────────────────────────────────
// Regions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An ISO 3166-1 alpha-2 country code, or `GLOBAL` for detectors that are not
 * jurisdiction-specific (email, IP address, JWT, credit card).
 *
 * Kept as a widened string rather than a closed union so adding a country
 * genuinely touches one file. The registry validates the shape at
 * registration time.
 */
export type RegionCode = string;

/** The sentinel region for detectors that apply everywhere. */
export const GLOBAL_REGION = 'GLOBAL';

// ─────────────────────────────────────────────────────────────────────────────
// Context (Stage 3 hook)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evidence from a candidate's surroundings.
 *
 * Stage 3 does not exist yet (it arrives in M7), so this is always `undefined`
 * during M2. It is defined now, and threaded through `ValidationContext`, so
 * that detectors which SPEC.md says "require context boost" —
 * GENERIC_SECRET, POSTAL_CODE, STREET_ADDRESS — can be written once with
 * their context branch in place, rather than being rewritten when Stage 3
 * lands.
 *
 * SPEC.md on GENERIC_SECRET: "Require a Shannon entropy threshold AND an
 * assignment-context signal (see Stage 3)". The entropy half is implemented
 * in M2; `assignment` below is the half that stays dormant.
 */
export interface ContextSignal {
  /** A nearby label matched a trigger lexicon entry ("SSN:", "IBAN", "kimlik"). */
  readonly trigger?: string;
  /** The candidate sits on the value side of an assignment or key-value pair
   *  (`api_key = …`, a JSON key, a .env line, a CSV column header). */
  readonly assignment?: boolean;
  /** Negative evidence: documentation example, test fixture, lorem ipsum,
   *  a UUID in a log line. Actively suppresses rather than merely failing to
   *  boost. */
  readonly negative?: boolean;
  /** Detected document type, which shifts weights (code raises secret
   *  sensitivity and lowers person-name sensitivity). */
  readonly documentType?: string;
}

/**
 * What a validator is given alongside the matched text.
 *
 * Carries the surrounding text because several validators genuinely need it:
 * a passport MRZ spans multiple lines and must look at its siblings, and an
 * IP address must know whether it is inside a URL.
 */
export interface ValidationContext {
  /** The full normalized text the runner is scanning. */
  readonly text: string;
  /** Start offset of the match within `text` (inclusive). */
  readonly start: number;
  /** End offset of the match within `text` (exclusive). */
  readonly end: number;
  /** The regex match that produced this candidate, including capture groups. */
  readonly match: RegExpExecArray;
  /** The user's configured default region, used for ambiguous formats such as
   *  phone numbers. `undefined` when unset. */
  readonly defaultRegion?: RegionCode;
  /** Stage 3 evidence. Always `undefined` in M2. */
  readonly context?: ContextSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation results
// ─────────────────────────────────────────────────────────────────────────────

/** The match is not an instance of this entity type. It is not emitted. */
export interface ValidationFailure {
  readonly valid: false;
  /** Why it failed, for eval error analysis. Never contains the value itself. */
  readonly reason: string;
}

/** The match is an instance of this entity type. */
export interface ValidationSuccess {
  readonly valid: true;
  /**
   * Confidence for this specific match, overriding the detector's
   * `baseConfidence`. Use when one detector's certainty varies by case — a
   * public/reserved IP range is a weaker signal than a routable address.
   */
  readonly confidence?: number;
  /**
   * Canonical form of the value: separators stripped, case normalized. Later
   * milestones key the vault on this so that `4111 1111 1111 1111` and
   * `4111-1111-1111-1111` resolve to one entry.
   */
  readonly canonical?: string;
  /**
   * Whether this value is actually sensitive.
   *
   * SPEC.md requires known test values to be "matched but classified as
   * non-sensitive" — the documentation IBAN GB82WEST…, the Visa test card
   * 4111…, reserved example domains. They are detected so the eval corpus can
   * assert they were seen, and marked non-sensitive so they are never masked.
   * Defaults to `true`.
   */
  readonly sensitive?: boolean;
  /**
   * Scheme details for Stage 4 fusion and M4 substitution. For a national
   * identifier this carries the concrete scheme and country, which is how the
   * family design stays extensible: `{ scheme: 'tckn', country: 'TR' }`.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Name of the validator that passed, surfaced in `EntityExplanation
   * .validatorPassed`. SPEC.md: every emitted entity carries an explanation
   * of "which validator passed".
   */
  readonly validator?: string;
  /**
   * Narrow the span to a sub-range of the regex match, in offsets relative to
   * the full scanned text. Patterns often need leading context to anchor
   * (a label, a delimiter) that must not be masked along with the value.
   */
  readonly span?: { readonly start: number; readonly end: number };
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/** Convenience constructor for the common failure case. */
export function invalid(reason: string): ValidationFailure {
  return { valid: false, reason };
}

/** Convenience constructor for the common success case. */
export function valid(fields: Omit<ValidationSuccess, 'valid'> = {}): ValidationSuccess {
  return { valid: true, ...fields };
}

// ─────────────────────────────────────────────────────────────────────────────
// The detector
// ─────────────────────────────────────────────────────────────────────────────

export interface Detector {
  /**
   * Stable, unique, kebab-case identifier — `"national-id-tr-tckn"`,
   * `"credit-card"`, `"iban"`. Appears in `Candidate.detectorId`, in eval
   * error analysis, and in regression-gate config, so it must not churn.
   */
  readonly id: string;

  /** The entity type emitted. For national schemes this is the FAMILY
   *  (`NATIONAL_ID`), with the concrete scheme carried in metadata. */
  readonly entityType: EntityType;

  /** Jurisdictions this detector applies to, or `[GLOBAL_REGION]`. */
  readonly regions: readonly RegionCode[];

  /**
   * The candidate generator. Must carry the `g` flag; the runner never
   * mutates it, cloning per scan so a shared `lastIndex` cannot leak state
   * between calls — a notorious source of intermittent misses with `/g`
   * regexes held at module scope.
   *
   * Patterns should over-generate. Precision is the validator's job.
   */
  readonly pattern: RegExp;

  /**
   * Confidence when the validator passes and no per-match confidence is
   * returned. The runner clamps this to `CONFIDENCE.LOW` when
   * `requiresContext` is set and no context signal is present.
   */
  readonly baseConfidence: number;

  /**
   * Decide whether a match is genuinely an instance of `entityType`.
   *
   * Detectors with a real checksum return failure for a wrong checksum, and
   * the candidate is dropped — a mistyped SSN is not a low-confidence SSN, it
   * is not an SSN. Detectors for formats with no checksum (drivers' licences,
   * postal codes) return success at a low confidence instead.
   */
  validate(ctx: ValidationContext): ValidationResult;

  /**
   * This detector cannot reach its base confidence without Stage 3 evidence.
   *
   * SPEC.md marks GENERIC_SECRET, POSTAL_CODE and STREET_ADDRESS this way.
   * Until Stage 3 exists the runner caps them at `CONFIDENCE.LOW`, which is
   * what keeps GENERIC_SECRET from "firing on entropy alone".
   */
  readonly requiresContext?: boolean;

  /**
   * Human-readable description, shown in the options UI's per-entity toggles
   * and in eval reports.
   */
  readonly description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Stage 1 candidate, extending the shared `Candidate` with the original-text
 * span.
 *
 * `Candidate.start`/`end` are offsets into the NORMALIZED text, which is the
 * M1 contract every offset-map invariant is written against. Substitution
 * however edits the ORIGINAL text, so the runner resolves both up front via
 * `mapNormalizedSpan` and carries them together. Recorded as ARCHITECTURE.md
 * D7: the alternative — redefining `Candidate.start` to mean original offsets
 * — would silently invalidate the M1 offset-map tests.
 */
export interface Stage1Candidate {
  readonly text: string;
  readonly type: EntityType;
  /** Start offset in the NORMALIZED text (inclusive). */
  readonly start: number;
  /** End offset in the NORMALIZED text (exclusive). */
  readonly end: number;
  /** Start offset in the ORIGINAL text (inclusive), via the Stage 0 map. */
  readonly originalStart: number;
  /** End offset in the ORIGINAL text (exclusive), via the Stage 0 map. */
  readonly originalEnd: number;
  readonly rawConfidence: number;
  readonly stage: 'stage1-validated-identifier';
  readonly detectorId: string;
  /** False for known test/documentation values, which are detected but must
   *  never be masked. */
  readonly sensitive: boolean;
  /** Canonical form, separators stripped and case normalized. */
  readonly canonical: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Which validator passed, for the entity explanation. */
  readonly validatorPassed?: string;
}
