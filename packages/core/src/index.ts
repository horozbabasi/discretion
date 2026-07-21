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
