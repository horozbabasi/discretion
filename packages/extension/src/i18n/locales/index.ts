/**
 * Every translated catalogue, keyed by the locale directory it generates.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BUILD-TIME ONLY. NOTHING IN THE RUNNING EXTENSION MAY IMPORT THIS.
 *
 * At run time the translations arrive through `chrome.i18n`, which reads
 * `_locales/<lang>/messages.json` and hands back only the ONE locale the
 * browser is set to. That is the whole point of the platform mechanism: the
 * content script carries English as its floor and nothing else.
 *
 * Importing this module from anything reachable from `src/content.ts` would
 * link all nine languages into a script that is parsed on every page load of
 * all three sites, to make eight of them unreachable. `scripts/build.mjs`
 * fails the build if a translated string is found in `content.js`, because a
 * claim about what links is worth exactly as much as the check that enforces
 * it — the same reasoning that keeps the gazetteers out of the content script.
 *
 * The consumer is `scripts/build.mjs`, which bundles this module, flattens it
 * with `toMessages()` and writes `_locales/`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Catalogue, EntityLabels } from '../catalogue.js';
import { EN_CATALOGUE } from '../catalogue.js';
import { AR, AR_ENTITIES } from './ar.js';
import { DE, DE_ENTITIES } from './de.js';
import { ES, ES_ENTITIES } from './es.js';
import { FR, FR_ENTITIES } from './fr.js';
import { HI, HI_ENTITIES } from './hi.js';
import { JA, JA_ENTITIES } from './ja.js';
import { PT, PT_ENTITIES } from './pt.js';
import { TR, TR_ENTITIES } from './tr.js';

// Re-exported so the single bundle scripts/build.mjs makes carries both the
// catalogues and the flattener that turns them into messages.json.
export { toMessages } from '../toMessages.js';

// The review gate travels with the catalogues for the same reason: the build
// bundles this one module and needs both the translations and the rule about
// which of them may ship.
export { reviewStateOf, safetyCriticalDigest, SAFETY_CRITICAL_KEYS, REVIEW_SIGNOFFS } from '../reviewed.js';
export type { ReviewSignoff, ReviewState } from '../reviewed.js';

export interface Locale {
  /** The `_locales/` directory name, which is also the chrome.i18n locale. */
  readonly dir: string;
  readonly catalogue: Catalogue;
  readonly entities: EntityLabels;
}

/**
 * SPEC.md: "English plus at minimum Spanish, German, French, Portuguese,
 * Turkish, Japanese, Hindi, and Arabic (with RTL layout support)."
 *
 * English is first and is the `default_locale`: it is what Chrome falls back
 * to for any locale not listed here.
 */
export const LOCALES: readonly Locale[] = [
  { dir: 'en', catalogue: EN_CATALOGUE, entities: {} },
  { dir: 'es', catalogue: ES, entities: ES_ENTITIES },
  { dir: 'de', catalogue: DE, entities: DE_ENTITIES },
  { dir: 'fr', catalogue: FR, entities: FR_ENTITIES },
  { dir: 'pt_BR', catalogue: PT, entities: PT_ENTITIES },
  { dir: 'tr', catalogue: TR, entities: TR_ENTITIES },
  { dir: 'ja', catalogue: JA, entities: JA_ENTITIES },
  { dir: 'hi', catalogue: HI, entities: HI_ENTITIES },
  { dir: 'ar', catalogue: AR, entities: AR_ENTITIES },
];
