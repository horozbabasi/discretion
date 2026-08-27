/**
 * @privacyshield/data — generated Unicode data.
 *
 * M1 content: the confusables table, generated from the official Unicode
 * security data by scripts/build-confusables.ts (see that file for
 * provenance and post-processing). The generated module is committed, so
 * consumers never need network access.
 *
 * The Unicode data is redistributed under the Unicode License v3; the
 * required copyright and permission notice is in THIRD_PARTY_NOTICES.md at
 * the repository root.
 */
import {
  CONFUSABLES_RAW,
  CONFUSABLES_UNICODE_VERSION,
  CONFUSABLES_SOURCE_URL,
  CONFUSABLES_SOURCE_SHA256,
  type ScriptName,
} from './confusables.js';

export type { ScriptName };
export {
  CONFUSABLES_RAW,
  CONFUSABLES_UNICODE_VERSION,
  CONFUSABLES_SOURCE_URL,
  CONFUSABLES_SOURCE_SHA256,
};

/** One confusable mapping: a character, its skeleton, and both scripts. */
export interface ConfusableEntry {
  /** Script of the confusable character itself. */
  sourceScript: ScriptName;
  /** The NFKC-normalized skeleton the character is confusable with. */
  skeleton: string;
  /** Script of the skeleton — what script a fold would fold INTO. */
  skeletonScript: ScriptName;
}

/** Fast lookup: source code point → its confusable mapping. */
export const CONFUSABLES: ReadonlyMap<number, ConfusableEntry> = (() => {
  const map = new Map<number, ConfusableEntry>();
  for (const [cp, sourceScript, skeleton, skeletonScript] of CONFUSABLES_RAW) {
    map.set(cp, { sourceScript, skeleton, skeletonScript });
  }
  return map;
})();

export const CONFUSABLES_ENTRY_COUNT = CONFUSABLES_RAW.length;

// ── Stage 1 secret provider table (M2) ──
export { SECRET_PROVIDERS, SECRET_CHARSET_PATTERN } from './secretProviders.js';
export type { SecretProvider } from './secretProviders.js';

// ── Stage 3 context lexicons (M7) ──
export { TRIGGER_LEXICONS } from './triggerLexicons.js';
export type { TriggerLexicon } from './triggerLexicons.js';
