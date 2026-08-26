/**
 * @privacyshield/eval — corpus generation, metrics, error analysis, and
 * regression gates for the detection pipeline.
 */

export type { DocType, GroundTruthEntity, LabeledDocument } from './corpus/types.js';
export { DOC_TYPES } from './corpus/types.js';
export { ENTITY_BANK, kindsForLanguage } from './corpus/entityBank.js';
export type { EntityKind } from './corpus/entityBank.js';
export { LANGUAGES, LANGUAGE_CODES } from './corpus/languages.js';
export type { LanguageBank } from './corpus/languages.js';
export { generateCorpus } from './corpus/builder.js';
export type { CorpusOptions } from './corpus/builder.js';
