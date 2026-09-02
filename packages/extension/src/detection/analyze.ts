/**
 * Detection, composed for the extension.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS AND IS NOT
 *
 * No detection logic lives here. Every stage is core's; this file is the
 * composition — the order the stages run in, what is threaded between them,
 * and the shape the review panel needs. The playground has its own composition
 * (`packages/web/src/pipeline.ts`) and it is deliberately a different one: the
 * playground runs Stage 1 alone against a text area, while the extension runs
 * the full pipeline against a live composer with a per-session vault.
 *
 * STAGES, in the order SPEC.md gives them:
 *   0  normalize            — with the offset map, so every span maps back
 *   1  validated identifiers
 *   2  NER                  — see the NER note below
 *   3  context scoring      — fed into Stage 1's validators inline by `detect`
 *   4  overlap resolution, calibration, profile decision, explanation
 *      then exposure, then surrogate selection through the session vault
 *
 * FAIL-CLOSED IS THE CALLER'S JOB, AND THIS FILE MAKES IT POSSIBLE.
 * Nothing here catches an error from a stage. `detect` propagates
 * `DetectionTimeoutError` and `DetectorError` on purpose, and so does this. A
 * caller that wrapped this in a try/catch and showed "nothing found" would
 * have built the exact failure SPEC calls a critical bug, so the failure is
 * left where it cannot be mistaken for a result.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RECOGNIZER IS A REQUIRED ARGUMENT, AND IT MAY STILL BE NULL
 *
 * Required, so that no caller can reach Stage 2 by forgetting it. The
 * extension now always supplies one - the model runs in an offscreen document
 * and this is a proxy to it - so the null case describes a configuration that
 * no longer occurs in production, and the argument stays required and nullable
 * anyway.
 *
 * That is deliberate rather than vestigial. `stagesRun` is DERIVED from this
 * argument, never declared, which is what makes "Stage 2 ran" a claim the code
 * can support instead of a comment. Relaxing it once NER works would delete
 * the only mechanism that keeps the claim honest, at exactly the moment the
 * claim starts being worth making. The send gate must refuse to ship while
 * this can be null.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  calibrate,
  computeExposure,
  detect,
  maskOriginal,
  normalize,
  resolveOverlaps,
  toDetectedEntity,
} from '@privacyshield/core';

import { entityLabel } from '../i18n/index.js';
import type {
  CalibrationModel,
  ContextScoredCandidate,
  DetectionStage,
  EntityType,
  ExposureReport,
  NerRecognizer,
  PipelineCandidate,
  SensitivityProfile,
  SubstitutionMode,
  UserLists,
  Vault,
} from '@privacyshield/core';
import { decide } from '@privacyshield/core';
import { CALIBRATION_MODEL } from '@privacyshield/data';

/** The committed model, shaped for core's calibrator. */
const MODEL = CALIBRATION_MODEL as unknown as CalibrationModel;

export interface AnalysisOptions {
  /**
   * Stage 2. Required so it cannot be forgotten. In the extension this is a
   * proxy to the offscreen document, which is where the model runs.
   */
  readonly ner: NerRecognizer | null;
  readonly profile: SensitivityProfile;
  readonly lists?: UserLists;
  /**
   * The user's configured region, for identifiers whose format is ambiguous
   * without one. A phone number written in national form cannot be validated
   * at all without it, so leaving this unset does not merely lower confidence
   * - it means the detector reports nothing.
   */
  readonly defaultRegion?: string;
  /**
   * Per-type toggles from the Options page. Applied at the REPORT decision,
   * before a surrogate is minted, so a type the user switched off never
   * reaches the vault rather than being filtered out of the panel afterwards.
   */
  readonly typeAllowed?: (type: EntityType) => boolean;
  readonly mode: SubstitutionMode;
  /** Per-session, so two sessions produce different surrogates. */
  readonly seed: number;
  /**
   * The session vault, so a value seen twice gets the same surrogate.
   *
   * Passed in rather than created here: consistency is a property of the
   * SESSION, and a vault created per analysis would hand the same value a new
   * surrogate on every keystroke.
   */
  readonly vault: Vault;
}

/** One detection, as the panel needs it. Never carries the original value. */
export interface AnalyzedEntity {
  /**
   * Stable across re-analyses of the same value.
   *
   * The vault id, which is derived from the value rather than from position,
   * so a revert survives the user typing earlier in the message. An
   * index-based id would silently move the revert to a different detection.
   */
  readonly id: string;
  readonly type: EntityType;
  readonly label: string;
  /** Calibrated, comparable across types. SPEC requires this, not raw. */
  readonly confidence: number;
  /** Why it was flagged, in a sentence. Never quotes the matched value. */
  readonly explanation: string;
  /** What would replace it. Shown; the original never is. */
  readonly surrogate: string;
  readonly originalStart: number;
  readonly originalEnd: number;
}

export interface Analysis {
  readonly entities: readonly AnalyzedEntity[];
  readonly exposure: ExposureReport;
  /** Which stages actually ran. Derived, never declared. */
  readonly stagesRun: readonly DetectionStage[];
  readonly elapsedMs: number;
}

/**
 * A sentence explaining one detection.
 *
 * Built from the structured explanation core produces, because a reviewer
 * needs to know WHICH evidence fired, and "high confidence" is not evidence.
 * The value itself never appears: these strings reach the DOM of a page this
 * extension exists to withhold information from.
 */
function explanationSentence(
  scored: ContextScoredCandidate,
  calibratedConfidence: number,
): string {
  const entity = toDetectedEntity({ scored, calibratedConfidence });
  const parts: string[] = [];

  const validator = entity.explanation.validatorPassed;
  if (validator !== undefined) {
    parts.push(`passed the ${validator} check`);
  } else if (scored.candidate.stage === 'stage2-ner') {
    parts.push('recognised as a name by the language model');
  } else {
    parts.push('matched a known pattern');
  }

  // Positive Stage 3 signals only, and only the strongest two: the panel is a
  // decision aid, not a log. The full contribution list stays available to the
  // diagnostic.
  const supporting = scored.contributions
    .filter((contribution) => contribution.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((contribution) => contribution.signal);
  if (supporting.length > 0) parts.push(`supported by ${supporting.join(' and ')}`);

  return `${parts.join(', ')}.`;
}

/**
 * Run the pipeline over one piece of composer text.
 *
 * Throws on any stage failure, deliberately. See the header.
 */
export async function analyzeText(text: string, options: AnalysisOptions): Promise<Analysis> {
  const started = performance.now();

  const normalization = normalize(text);
  const outcome = await detect(normalization, {
    ...(options.ner === null ? {} : { ner: options.ner }),
    ...(options.defaultRegion === undefined
      ? {}
      : { stage1: { defaultRegion: options.defaultRegion } }),
  });

  // Stage 4a: resolve overlaps BEFORE calibrating or scoring exposure. An
  // unresolved set double-counts every overlap, so one credential covered by
  // three detectors would inflate the exposure score threefold and appear in
  // the panel three times.
  const resolution = resolveOverlaps(
    outcome.emitted
      .filter((scored) => scored.candidate.sensitive)
      .map((scored) => ({ candidate: scored.candidate, confidence: scored.contextConfidence })),
  );

  // The scored record for each survivor, so the explanation keeps its Stage 3
  // contributions. Keyed by identity: `resolveOverlaps` returns the same
  // candidate objects it was given.
  const scoredByCandidate = new Map<PipelineCandidate, ContextScoredCandidate>();
  for (const scored of outcome.emitted) scoredByCandidate.set(scored.candidate, scored);

  const reported: { scored: ContextScoredCandidate; confidence: number }[] = [];
  for (const item of resolution.emitted) {
    const scored = scoredByCandidate.get(item.candidate);
    if (scored === undefined) continue;
    const confidence = calibrate(MODEL, item.candidate.type, item.confidence);
    const decision = decide(
      { type: item.candidate.type, text: item.candidate.text, calibratedConfidence: confidence },
      options.profile,
      options.lists ?? {},
    );
    if (!decision.report) continue;
    if (options.typeAllowed?.(item.candidate.type) === false) continue;
    reported.push({ scored, confidence });
  }

  // Surrogates come from the masker rather than from `chooseSurrogate`
  // directly, because the masker is what enforces the properties a displayed
  // surrogate must already have: consistency through the vault, and the
  // collision check that stops a surrogate from containing the very value it
  // replaces. Computing them any other way would show the user one string and
  // substitute another.
  const masked = maskOriginal(
    text,
    reported.map((entry) => entry.scored.candidate),
    options.vault,
    { mode: options.mode, seed: options.seed },
  );
  const surrogateAt = new Map<number, { replacement: string; vaultId: string }>();
  for (const entity of masked.entities) {
    surrogateAt.set(entity.originalStart, {
      replacement: entity.replacement,
      vaultId: entity.vaultId,
    });
  }

  const entities: AnalyzedEntity[] = [];
  for (const { scored, confidence } of reported) {
    const candidate = scored.candidate;
    const surrogate = surrogateAt.get(candidate.originalStart);
    // A reported candidate the masker did not mask has no surrogate to show,
    // and showing it without one would promise a substitution that will not
    // happen. Dropping it silently would be worse, so it is reported as a
    // detection failure by the caller: `entities.length` must equal
    // `reported.length`, asserted below.
    if (surrogate === undefined) continue;
    entities.push({
      id: surrogate.vaultId,
      type: candidate.type,
      label: entityLabel(candidate.type),
      confidence,
      explanation: explanationSentence(scored, confidence),
      surrogate: surrogate.replacement,
      originalStart: candidate.originalStart,
      originalEnd: candidate.originalEnd,
    });
  }

  if (entities.length !== reported.length) {
    // Not a warning. A detection the panel cannot show is a detection the user
    // cannot revert, and one it will silently substitute anyway.
    throw new Error(
      `masking produced ${String(entities.length)} surrogates for ${String(reported.length)} reported detections`,
    );
  }

  const exposure = computeExposure(
    entities.map((entity) => ({ type: entity.type, calibratedConfidence: entity.confidence })),
  );

  const stagesRun: DetectionStage[] = ['stage1-validated-identifier'];
  if (options.ner !== null) stagesRun.push('stage2-ner');
  stagesRun.push('stage3-context', 'stage4-fusion');

  return { entities, exposure, stagesRun, elapsedMs: performance.now() - started };
}
