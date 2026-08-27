/**
 * Stage 3 types.
 *
 * SPEC.md, Stage 3: "This is where false positives die, and the most
 * important stage for real-world quality. Each candidate's confidence is
 * adjusted by evidence from its surroundings."
 *
 * Two properties are load-bearing in the shapes below.
 *
 * EXPLAINABILITY. Every adjustment is a NAMED, SIGNED contribution rather
 * than an opaque delta, so the adjusted score always decomposes into the
 * reasons that produced it. Stage 4 (M8) calibrates these into probabilities
 * and SPEC.md requires the review UI to show why an entity was reported; a
 * score that cannot show its work would make both impossible.
 *
 * NO PLAINTEXT IN EXPLANATIONS. A contribution's `detail` may name the
 * LEXICON TERM that matched ("iban", "kimlik no") but never the candidate's
 * own text and never a raw document key, because explanations flow into
 * reports and UI surfaces that must stay free of sensitive values — SPEC.md's
 * third non-negotiable. `structure:*` contributions therefore report the key
 * only when it matched a known lexicon term, and otherwise report the slot
 * kind alone.
 */

import type { EntityType } from '../types.js';
import type { Stage1Candidate } from '../detect/types.js';
import type { Stage2Candidate } from '../ner/types.js';

/** Any candidate entering Stage 3, from Stage 1 or Stage 2. */
export type PipelineCandidate = Stage1Candidate | Stage2Candidate;

/**
 * The FORMAT of a document — how it is written, not what it is about.
 *
 * SPEC.md: "detect whether input is prose, source code (and which language),
 * JSON, YAML, CSV, a log dump, a markdown table, or an email thread. Each
 * mode shifts weights."
 */
export type DocumentFormat =
  | 'prose'
  | 'code'
  | 'json'
  | 'yaml'
  | 'csv'
  | 'log'
  | 'markdown-table'
  | 'email'
  | 'unknown';

/**
 * The SUBJECT DOMAIN of a document, detected from terminology.
 *
 * Kept as a second, independent axis rather than folded into the format
 * union: a medical record can arrive as prose, as CSV, or as a JSON payload,
 * and collapsing the two would force a false choice. SPEC.md lists "medical,
 * legal, and financial terminology used for context scoring" under the
 * gazetteers, which is what feeds this.
 */
export type DocumentDomain = 'medical' | 'legal' | 'financial' | 'general';

/** One named, signed reason the confidence moved. */
export interface ContextContribution {
  /** Stable signal name, e.g. `trigger:NATIONAL_ID`, `negative:uri-authority`. */
  readonly signal: string;
  /** Signed adjustment applied to the raw confidence. */
  readonly delta: number;
  /** Safe supporting detail — a lexicon term or rule name, never a value. */
  readonly detail?: string;
}

/** A candidate after Stage 3, carrying its adjustment and its reasons. */
export interface ContextScoredCandidate {
  readonly candidate: PipelineCandidate;
  /** Confidence after applying every contribution, clamped to [0, 1]. */
  readonly contextConfidence: number;
  readonly contributions: readonly ContextContribution[];
  /**
   * Stage 3 concluded this candidate should not be emitted at all.
   *
   * Suppression is reserved for evidence that the candidate is NOT sensitive
   * (a documentation example, a value inside a URI's authority, a lab
   * reference range) — never for mere weakness of evidence, which is what the
   * confidence score is for.
   */
  readonly suppressed: boolean;
  /** Rule id that suppressed it. Present exactly when `suppressed`. */
  readonly suppressionReason?: string;
}

/** What Stage 3 learned about the document as a whole. */
export interface DocumentProfile {
  readonly format: DocumentFormat;
  readonly domain: DocumentDomain;
  /** Signals that decided the format, for reporting and debugging. */
  readonly formatEvidence: readonly string[];
  /** Domain terms that matched, for reporting. Lexicon terms only. */
  readonly domainEvidence: readonly string[];
}

/**
 * The evidence a rule sees about one candidate.
 *
 * Deliberately narrow: rules receive the document text and the candidate's
 * span, not the other candidates. Reasoning about OTHER candidates' spans is
 * overlap resolution, which SPEC.md assigns to Stage 4 — keeping it out of
 * this interface is what stops Stage 3 quietly absorbing M8's job.
 * Co-occurrence, the one signal that legitimately looks across candidates,
 * runs as a separate pass with its own input.
 */
export interface RuleContext {
  /** The full normalized document text. */
  readonly text: string;
  /** Candidate start offset in the normalized text (inclusive). */
  readonly start: number;
  /** Candidate end offset (exclusive). */
  readonly end: number;
  readonly type: EntityType;
  readonly profile: DocumentProfile;
  /** The line containing the candidate, and the candidate's offsets within it. */
  readonly line: { readonly text: string; readonly start: number; readonly end: number };
}

/**
 * A negative-context rule.
 *
 * SPEC.md: "NEGATIVE CONTEXT — signals that a candidate is NOT sensitive:
 * inside a code comment describing a format, in a documentation example
 * block, a known dummy value, lorem ipsum, a test fixture, a UUID in a log
 * line, a git SHA. These must actively suppress."
 *
 * Each rule must state the real positive it risks suppressing, because in a
 * privacy tool a wrong suppression is a leak, and an un-reviewed suppression
 * rule is how leaks get shipped.
 */
export interface NegativeRule {
  /** Stable id, surfaced as `negative:<id>` in contributions. */
  readonly id: string;
  /** Entity types this rule may act on, or `'all'`. */
  readonly appliesTo: readonly EntityType[] | 'all';
  /**
   * `'suppress'` drops the candidate; a negative number reduces confidence.
   * Prefer a penalty over suppression unless the evidence is conclusive.
   */
  readonly action: 'suppress' | number;
  /** The general principle, quoted into ARCHITECTURE.md and reviewable. */
  readonly principle: string;
  /** What real positive this could wrongly suppress. Required, not optional. */
  readonly risk: string;
  test(ctx: RuleContext): boolean;
}
