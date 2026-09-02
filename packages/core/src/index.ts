/**
 * @privacyshield/core — public API.
 *
 * M1 surface: shared types, script detection, Stage 0 normalization with an
 * exact bidirectional offset map.
 */
export type * from './types.js';

export { detectScripts, getCharScript, classifyCodePoint, scriptsCompatible } from './scripts.js';
export type { CodePointClass } from './scripts.js';

export { normalize } from './normalization.js';
export { labelOf } from './entityLabel.js';
export { familyOf } from './entityFamily.js';
export type { EntityFamily } from './entityFamily.js';

export {
  composeMaps,
  identityMap,
  buildReverseMap,
  mapNormalizedSpan,
  MappedTextBuilder,
} from './offsetMap.js';
export type { StepChange, TransformStepResult } from './offsetMap.js';

// The individual transforms are exported so they stay independently testable
// and reusable; normalize() is the supported entry point.
export { stripInvisibles } from './transforms/stripInvisibles.js';
export { nfkcByGrapheme } from './transforms/nfkc.js';
export { foldHomoglyphs } from './transforms/homoglyphFold.js';
export { normalizeWhitespacePunct } from './transforms/whitespacePunct.js';
export { foldDigits, asciiDigitFor } from './transforms/foldDigits.js';

// ── Stage 1: validated identifier detection (M2) ──
// Importing the package registers every bundled detector.
import './detect/detectors/index.js';

export {
  registerDetector,
  allDetectors,
  getDetector,
  detectorsForRegion,
  detectorsForEntityType,
  detectorCount,
} from './detect/registry.js';
export { runStage1, DetectionTimeoutError, DetectorError } from './detect/runner.js';
export { CONFIDENCE, GLOBAL_REGION, invalid, valid } from './detect/types.js';
export type {
  Detector,
  RegionCode,
  ContextSignal,
  ValidationContext,
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  Stage1Candidate,
} from './detect/types.js';
export type { Stage1Options } from './detect/runner.js';

// The checksum library is public API: M3's corpus generator and M4's
// format-preserving surrogates both need to CREATE valid identifiers.
export * as checksums from './checksums/index.js';

// Seeded valid-value generators: consumed by the eval corpus builder (M3)
// and by format-preserving surrogate synthesis (M4).
export * as generate from './generate/index.js';

// ── Stage 2: multilingual NER (M6) ──
// Pure logic only. The Transformers.js-backed classifier is exported through
// the './ner-transformers' entry point so that importing the core root never
// loads the ONNX runtime.
export { alignPieces } from './ner/align.js';
export type { AlignedPiece } from './ner/align.js';
export { decodeEntities } from './ner/merge.js';
export { chunkText } from './ner/chunk.js';
export type { Chunk } from './ner/chunk.js';
export { NerEngine } from './ner/engine.js';
export { ChunkCache } from './ner/chunkCache.js';
export type { NerEngineOptions } from './ner/engine.js';
export { runStage2 } from './ner/runStage2.js';
export type {
  NerEntityType,
  NerRecognizer,
  NerSpan,
  Stage2Candidate,
  TokenClassifier,
  TokenPrediction,
} from './ner/types.js';

// ── Stage 3: context scoring (M7) ──
export { analyzeContext } from './context/score.js';
export type { ContextAnalysis, ContextOptions } from './context/score.js';
export { buildStructureIndex } from './context/structure.js';
export type { StructureIndex, StructuredSlot, StructureKind } from './context/structure.js';
export { buildTriggerIndex, foldForMatch } from './context/triggers.js';
export type { LanguageTriggers, TriggerIndex, TriggerMatch } from './context/triggers.js';
export { profileDocument } from './context/documentProfile.js';
export type { DomainLexicon } from './context/documentProfile.js';
export { NEGATIVE_RULES, ruleApplies } from './context/negativeRules.js';
export type {
  ContextContribution,
  ContextScoredCandidate,
  DocumentDomain,
  DocumentFormat,
  DocumentProfile,
  NegativeRule,
  PipelineCandidate,
  RuleContext,
} from './context/types.js';

// ── Stage 2b: gazetteers (M7) ──
export { lookupGazetteer, gazetteerSizes, isGazetteerType } from './gazetteer/index.js';
export type { GazetteerHit, GazetteerType } from './gazetteer/index.js';

// ── Stage 4: overlap resolution (M8) ──
export { resolveOverlaps, coverageHoles } from './fuse/resolve.js';
export { fitCalibration, calibrate, reliability } from './fuse/calibrate.js';
export { PROFILES, decide, customProfile } from './fuse/profiles.js';
export { explain, toDetectedEntity, explainOmission } from './fuse/explain.js';
export type { FusionInput } from './fuse/explain.js';
export type { ProfileName, SensitivityProfile, UserLists, ProfileDecision } from './fuse/profiles.js';
export { computeExposure, exposureBand, EXPOSURE_LIMITATION } from './exposure/index.js';
export type {
  ExposureReport,
  ExposureInput,
  ExposureContribution,
  CategoryBreakdown,
} from './exposure/index.js';
export type {
  CalibrationBin,
  CalibrationCurve,
  CalibrationModel,
  CalibrationSample,
  ReliabilityPoint,
} from './fuse/calibrate.js';
export type { ScoredForResolution, ResolutionResult } from './fuse/resolve.js';

// ── The composed pipeline (M7) ──
// Stages 0–3 in one call. This is what consumers should use; the individual
// stage functions remain exported for tooling that wants one stage.
export { detect } from './pipeline.js';
export type { DetectOptions, DetectionOutcome } from './pipeline.js';

// ── Stage: masking (M4) ──
export { Vault, normalizedKey } from './mask/vault.js';
export type { EgressAuditor } from './mask/vault.js';
export { chooseSurrogate } from './mask/surrogates.js';
export type { SurrogateRequest } from './mask/surrogates.js';
export { PERSON_POOLS, ORG_POOL, LOCATION_POOL } from './mask/surrogatePools.js';
export { mask, maskOriginal, resolveForMasking } from './mask/masker.js';
export type { MaskOptions, MaskResult, MaskedEntity } from './mask/masker.js';
export { Restorer, restore } from './mask/restorer.js';
export type { RestorerOptions } from './mask/restorer.js';
export { guardEgress } from './mask/egressGuard.js';
export type { EgressLeak, EgressVerdict } from './mask/egressGuard.js';
