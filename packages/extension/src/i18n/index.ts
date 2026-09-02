/**
 * Message lookup: `chrome.i18n` first, the bundled English catalogue as the
 * floor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A FALLBACK AT ALL, given chrome.i18n already falls back to the
 * default locale: because it does so only for a locale that is MISSING the
 * key. For a key that exists in no catalogue - a typo, a string added to the
 * code and not to the catalogue - `getMessage` returns an EMPTY STRING and
 * says nothing. In this UI that is a blank button on the panel that exists to
 * tell someone their data is about to leave.
 *
 * The bundled catalogue makes that impossible: the worst case is English text
 * where a translation was wanted, which is legible, rather than nothing, which
 * is not. `t()` is also typed to `MessageKey`, so the typo case is a compile
 * error before it is ever a runtime one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityType } from '@discretion/core';
import { labelOf } from '@discretion/core';

import type { Catalogue, MessageKey, Plural } from './catalogue.js';
import { EN_CATALOGUE } from './catalogue.js';

/** Locales whose script runs right to left. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/** The UI locale, as a BCP-47 tag. */
export function uiLocale(): string {
  try {
    const fromChrome = chrome.i18n.getUILanguage();
    if (typeof fromChrome === 'string' && fromChrome.length > 0) return fromChrome;
  } catch {
    // Not in an extension context (a test, the playground). Fall through.
  }
  try {
    return navigator.language;
  } catch {
    return 'en';
  }
}

/**
 * Whether the UI should lay out right to left.
 *
 * Consumed by the injected surface, which pins `direction` with `!important`
 * so the host page cannot mirror the panel — and which, until this existed,
 * pinned it to `ltr` unconditionally. That was correct against a hostile page
 * and wrong for every Arabic-speaking user, who would have got a
 * left-to-right panel welded in place by our own stylesheet.
 */
export function isRtl(locale?: string): boolean {
  // Direction comes from the CATALOGUE THAT LOADED, not from the browser's
  // preference. The two diverge because of the review gate (i18n/reviewed.ts):
  // an unreviewed locale is dropped and chrome falls back to English, so a
  // browser set to Arabic renders English strings. Before this, isRtl() asked
  // getUILanguage(), said `rtl`, and produced ENGLISH TEXT WELDED INTO AN RTL
  // LAYOUT - measured on the options page, not hypothesised.
  //
  // `@@bidi_dir` is not the fix: it follows the UI language too. An ordinary
  // message key goes through chrome's normal fallback, so it follows the words.
  //
  // An explicit argument still wins, for the playground and for tests.
  if (locale === undefined) {
    try {
      // `ui.dir` and NOT `@@bidi_dir`: the predefined message follows the
      // browser UI language, which is the wrong question here. See the note on
      // the key in catalogue.ts.
      const dir = chrome.i18n.getMessage('ui_dir');
      if (dir === 'rtl') return true;
      if (dir === 'ltr') return false;
    } catch {
      // Not in an extension context. Fall through to the language tag.
    }
  }
  const primary = (locale ?? uiLocale()).toLowerCase().split(/[-_]/u)[0] ?? '';
  return RTL_LANGUAGES.has(primary);
}

/** `$1`, `$2` … replaced positionally. */
function substitute(template: string, subs: readonly string[]): string {
  return template.replace(/\$(\d+)/gu, (whole, index: string) => {
    const at = Number.parseInt(index, 10) - 1;
    return subs[at] ?? whole;
  });
}

function fromChrome(key: MessageKey, subs: readonly string[]): string | null {
  try {
    // chrome.i18n keys cannot contain dots.
    const message = chrome.i18n.getMessage(key.replace(/\./gu, '_'), [...subs]);
    return typeof message === 'string' && message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

/** A message with one form. */
export function t(key: MessageKey, ...subs: readonly (string | number)[]): string {
  const asStrings = subs.map((s) => String(s));
  const translated = fromChrome(key, asStrings);
  if (translated !== null) return translated;
  const local = EN_CATALOGUE[key];
  const template = typeof local === 'string' ? local : local.other;
  return substitute(template, asStrings);
}

/**
 * A message that varies by count.
 *
 * The category comes from `Intl.PluralRules`, not from `count === 1`. Arabic
 * has six categories and Japanese one; picking between a hardcoded singular
 * and plural produces wrong grammar in most of the languages SPEC requires.
 * `other` is the floor because every language defines it.
 */
export function plural(
  key: MessageKey,
  count: number,
  ...subs: readonly (string | number)[]
): string {
  const asStrings = [String(count), ...subs.map((s) => String(s))];
  const locale = uiLocale();

  let category = 'other';
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    // An unknown locale tag. `other` is always defined, so this degrades to
    // the form every language has rather than to nothing.
  }

  const translated = fromChrome(`${key}.${category}` as MessageKey, asStrings);
  if (translated !== null) return translated;
  const fallbackTranslated = fromChrome(`${key}.other` as MessageKey, asStrings);
  if (fallbackTranslated !== null) return fallbackTranslated;

  const local = EN_CATALOGUE[key];
  if (typeof local === 'string') return substitute(local, asStrings);
  const form = (local as Plural)[category as keyof Plural] ?? local.other;
  return substitute(form, asStrings);
}

/**
 * The localised name of an entity type - "Credit card", "Tarjeta de crédito".
 *
 * Falls back to `labelOf()`, which DERIVES a correct English name from the
 * type itself. So the floor here is real text, not an empty string, and a
 * newly added entity type is named correctly on the panel from the moment it
 * exists - before anyone has translated it, and without touching nine
 * catalogues (ARCHITECTURE.md D4).
 */
export function entityLabel(type: EntityType | string): string {
  try {
    const message = chrome.i18n.getMessage(`entity_${type}`);
    if (typeof message === 'string' && message.length > 0) return message;
  } catch {
    // Not an extension context.
  }
  return labelOf(type);
}

export type { Catalogue, MessageKey };
