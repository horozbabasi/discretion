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
export type { NerEngineOptions } from './ner/engine.js';
export { runStage2 } from './ner/runStage2.js';
export type {
  NerEntityType,
  NerSpan,
  Stage2Candidate,
  TokenClassifier,
  TokenPrediction,
} from './ner/types.js';

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
