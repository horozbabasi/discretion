/**
 * protect.ts — the one-call entry point: text in, masked text and a report out.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (M12)
 *
 * Every stage of the pipeline was already exported, and that is not the same
 * as being usable. Getting from a string to "here is the masked text and what
 * was found" meant composing eight core calls in a specific order, holding an
 * identity map between two of them, and importing the fitted calibration model
 * from a SECOND package through an unchecked cast. The extension's
 * `analyzeText` does exactly that in about ninety lines.
 *
 * SPEC's M12 acceptance test is that "a developer who has never seen this repo
 * can npm install the package and run detection and masking from the docs
 * alone". Documenting those ninety lines would satisfy the letter of it and
 * miss the point: the order matters for correctness, not just for convenience,
 * and a consumer who gets it wrong gets quietly worse results rather than an
 * error. Two of the orderings below were bugs found in earlier milestones.
 *
 * The individual stages remain exported. This is the supported path, not the
 * only one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT `mask()` IS, AND WHY IT IS NOT THIS
 *
 * `mask()` in `mask/masker.ts` also takes a string and returns masked text,
 * and it looks like this function's smaller sibling. It runs STAGE 1 ONLY —
 * no context scoring, no calibration, no profile decision, no NER. It exists
 * for tests and for the playground's Stage-1 baseline. A consumer who reached
 * for it expecting the full engine would get uncalibrated confidences and none
 * of Stage 3's false-positive suppression, with nothing to indicate the
 * difference. `stagesRun` on this function's result is what makes the
 * distinction legible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED IS THE CALLER'S JOB, AND THIS FUNCTION PRESERVES IT
 *
 * Nothing here catches an error from a stage. `detect` propagates
 * `DetectionTimeoutError` and `DetectorError` deliberately, and so does this.
 * A caller that wrapped it in a try/catch and treated the failure as "nothing
 * found" would have built the exact failure SPEC.md calls a critical bug, so
 * the failure is left where it cannot be mistaken for a result.
 */

import { CALIBRATION_MODEL } from '@discretion/data';

import { computeExposure } from './exposure/index.js';
import { calibrate, type CalibrationModel } from './fuse/calibrate.js';
import { toCalibrationModel } from './fuse/defaultCalibration.js';
import { toDetectedEntity } from './fuse/explain.js';
import { PROFILES, decide, type ProfileName, type SensitivityProfile, type UserLists } from './fuse/profiles.js';
import { resolveOverlaps } from './fuse/resolve.js';
import { maskOriginal } from './mask/masker.js';
import { Vault } from './mask/vault.js';
import { normalize } from './normalization.js';
import { detect } from './pipeline.js';
import type { ContextScoredCandidate, PipelineCandidate } from './context/types.js';
import type { ExposureReport } from './exposure/index.js';
import type { NerRecognizer } from './ner/types.js';
import type {
  DetectionStage,
  EntityExplanation,
  EntityType,
  SubstitutionMode,
} from './types.js';

/** The shipped model, converted once and checked rather than cast. */
const DEFAULT_CALIBRATION: CalibrationModel = toCalibrationModel(CALIBRATION_MODEL).model;

export interface ProtectOptions {
  /**
   * Which findings are worth reporting. A `ProfileName` selects one of the
   * three SPEC profiles; a `SensitivityProfile` supplies your own.
   * Default: `'balanced'`.
   */
  readonly profile?: ProfileName | SensitivityProfile;
  /** Values to always report (`deny`) or never report (`allow`). */
  readonly lists?: UserLists;
  /**
   * The region used for identifiers that are ambiguous without one.
   *
   * Not a tie-breaker: a phone number written in national form cannot be
   * validated at all without a region, so leaving this unset does not lower
   * its confidence — the detector reports nothing.
   */
  readonly defaultRegion?: string;
  /** Per-type opt-out, applied before a surrogate is minted. */
  readonly typeAllowed?: (type: EntityType) => boolean;
  /** `'surrogate'` (realistic stand-ins, default) or `'token'` (`[EMAIL_1]`). */
  readonly mode?: SubstitutionMode;
  /** Varies surrogate selection. Fixed input plus fixed seed is reproducible. */
  readonly seed?: number;
  /**
   * The vault that remembers which surrogate stood in for which value.
   *
   * REQUIRED FOR RESTORATION, and required for consistency across calls: pass
   * the same vault to every `protect()` in a conversation and a value seen
   * twice gets the same surrogate. Omit it and a fresh vault is created for
   * this call alone, which is correct for one-shot masking and wrong for
   * anything that restores a reply later.
   */
  readonly vault?: Vault;
  /**
   * Stage 2. Omit to run Stages 0, 1, 3 and 4 only.
   *
   * Not defaulted to a model on purpose: the recogniser pulls in the ONNX
   * runtime, which this package does not depend on. See the "Stage 2" section
   * of the usage guide.
   */
  readonly ner?: NerRecognizer;
  /** Overrides the shipped calibration model. For eval work, not for use. */
  readonly calibration?: CalibrationModel;
}

/** One finding, with everything needed to show it and nothing that leaks it. */
export interface ProtectedEntity {
  /**
   * The vault id, stable across re-analyses of the same value.
   *
   * Derived from the value rather than from position, so a caller tracking a
   * user's per-item decisions keeps them when text is edited earlier in the
   * document. An index-based id would silently move the decision.
   */
  readonly id: string;
  readonly type: EntityType;
  /** Calibrated, comparable across types. Never the raw detector score. */
  readonly confidence: number;
  /** Which evidence fired. Structured, so callers can render it in any language. */
  readonly explanation: EntityExplanation;
  /** What replaced it in `maskedText`. */
  readonly surrogate: string;
  /** Offsets into the ORIGINAL text, not the normalized text. */
  readonly originalStart: number;
  readonly originalEnd: number;
}

export interface ProtectResult {
  /** The input with every reported value replaced. Safe to send. */
  readonly maskedText: string;
  readonly entities: readonly ProtectedEntity[];
  /** How exposed the document was, before masking. */
  readonly exposure: ExposureReport;
  /**
   * Which stages actually ran.
   *
   * DERIVED from the options, never declared, so "Stage 2 ran" is a claim the
   * code supports rather than a comment. Absence of `'stage2-ner'` is how a
   * caller knows names were not looked for.
   */
  readonly stagesRun: readonly DetectionStage[];
  /**
   * The vault holding the originals. Pass it to `restore()` to reverse this.
   *
   * The same instance passed in `options.vault`, or the one created for this
   * call. It holds plaintext originals in memory: SPEC.md forbids persisting
   * it, and the extension clears it per tab session.
   */
  readonly vault: Vault;
}

function resolveProfile(profile: ProtectOptions['profile']): SensitivityProfile {
  if (profile === undefined) return PROFILES.balanced;
  if (typeof profile !== 'string') return profile;
  if (profile === 'custom') {
    throw new Error(
      "protect: profile 'custom' names a shape, not a policy - pass a SensitivityProfile",
    );
  }
  return PROFILES[profile];
}

/**
 * Detect sensitive values in `text` and replace them with stand-ins.
 *
 * Throws on any stage failure rather than returning an empty result. See the
 * fail-closed note in this file's header.
 */
export async function protect(text: string, options: ProtectOptions = {}): Promise<ProtectResult> {
  const profile = resolveProfile(options.profile);
  const calibration = options.calibration ?? DEFAULT_CALIBRATION;
  const vault = options.vault ?? new Vault();

  const normalization = normalize(text);
  const outcome = await detect(normalization, {
    ...(options.ner === undefined ? {} : { ner: options.ner }),
    ...(options.defaultRegion === undefined
      ? {}
      : { stage1: { defaultRegion: options.defaultRegion } }),
  });

  // Resolve overlaps BEFORE calibrating or scoring exposure. An unresolved set
  // double-counts every overlap, so one credential matched by three detectors
  // would appear three times and inflate the exposure score threefold.
  const resolution = resolveOverlaps(
    outcome.emitted
      .filter((scored) => scored.candidate.sensitive)
      .map((scored) => ({ candidate: scored.candidate, confidence: scored.contextConfidence })),
  );

  // Keyed by object identity: `resolveOverlaps` returns the same candidate
  // objects it was given, and the scored record carries the Stage 3
  // contributions the explanation needs.
  const scoredByCandidate = new Map<PipelineCandidate, ContextScoredCandidate>();
  for (const scored of outcome.emitted) scoredByCandidate.set(scored.candidate, scored);

  const reported: { scored: ContextScoredCandidate; confidence: number }[] = [];
  for (const item of resolution.emitted) {
    const scored = scoredByCandidate.get(item.candidate);
    if (scored === undefined) continue;
    const confidence = calibrate(calibration, item.candidate.type, item.confidence);
    const decision = decide(
      { type: item.candidate.type, text: item.candidate.text, calibratedConfidence: confidence },
      profile,
      options.lists ?? {},
    );
    if (!decision.report) continue;
    if (options.typeAllowed?.(item.candidate.type) === false) continue;
    reported.push({ scored, confidence });
  }

  // Surrogates come from the masker rather than from `chooseSurrogate`
  // directly, because the masker enforces the properties a surrogate must
  // have before it is shown: consistency through the vault, and the collision
  // check that stops a surrogate from containing the very value it replaces.
  // Computing them any other way shows the user one string and substitutes
  // another.
  const masked = maskOriginal(
    text,
    reported.map((entry) => entry.scored.candidate),
    vault,
    {
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.seed === undefined ? {} : { seed: options.seed }),
    },
  );

  const surrogateAt = new Map<number, { replacement: string; vaultId: string }>();
  for (const entity of masked.entities) {
    surrogateAt.set(entity.originalStart, {
      replacement: entity.replacement,
      vaultId: entity.vaultId,
    });
  }

  const entities: ProtectedEntity[] = [];
  for (const { scored, confidence } of reported) {
    const candidate = scored.candidate;
    const surrogate = surrogateAt.get(candidate.originalStart);
    if (surrogate === undefined) continue;
    entities.push({
      id: surrogate.vaultId,
      type: candidate.type,
      confidence,
      explanation: toDetectedEntity({ scored, calibratedConfidence: confidence }).explanation,
      surrogate: surrogate.replacement,
      originalStart: candidate.originalStart,
      originalEnd: candidate.originalEnd,
    });
  }

  // Not a warning. A reported detection with no surrogate is one the caller
  // cannot show and cannot let the user revert, while the masker substitutes
  // it anyway.
  if (entities.length !== reported.length) {
    throw new Error(
      `protect: masking produced ${String(entities.length)} surrogates for ${String(reported.length)} reported detections`,
    );
  }

  const stagesRun: DetectionStage[] = ['stage1-validated-identifier'];
  if (options.ner !== undefined) stagesRun.push('stage2-ner');
  stagesRun.push('stage3-context', 'stage4-fusion');

  return {
    maskedText: masked.maskedText,
    entities,
    exposure: computeExposure(
      entities.map((entity) => ({ type: entity.type, calibratedConfidence: entity.confidence })),
    ),
    stagesRun,
    vault,
  };
}
