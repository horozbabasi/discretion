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
