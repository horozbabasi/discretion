/**
 * Flattens a typed catalogue into the shape `chrome.i18n` reads.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE SOURCE OF TRUTH, TWO FORMATS. The catalogues are authored in TypeScript
 * because that is where a locale missing a key can be a COMPILE ERROR
 * (`Catalogue` is a total Record, not a Partial). `chrome.i18n` cannot read
 * TypeScript, and it is both the mechanism SPEC.md names and what the Chrome
 * Web Store reads to localise the listing. So `_locales/<lang>/messages.json`
 * is GENERATED at build time and never hand-edited, and the type checker stays
 * the thing that catches a missing string.
 *
 * Two shapes are flattened here, because chrome.i18n has neither:
 *
 *   - DOTS. Its keys are [A-Za-z0-9_] only, so `panel.action.cancel` becomes
 *     `panel_action_cancel`. `t()` applies the same rule when it looks up.
 *   - PLURALS. It has no plural support at all, so each category becomes its
 *     own key: `panel_review_title_one`, `…_other`, and for Arabic also
 *     `_zero`, `_two`, `_few`, `_many`. `plural()` asks `Intl.PluralRules` for
 *     the category and looks up that key, falling back to `_other`.
 *
 * Placeholders stay positional `$1`/`$2` — the form chrome.i18n substitutes
 * natively through `getMessage(key, [subs])` — so no `placeholders` block is
 * needed and there is no second convention to get wrong.
 *
 * This lives in `src/` rather than beside the build script so that it is
 * typechecked and unit-tested like everything else. `scripts/build.mjs` does
 * the file writing; this does the thinking.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Catalogue, EntityLabels } from './catalogue.js';

/** One entry of a `messages.json`. Chrome requires both fields. */
export interface ChromeMessage {
  readonly message: string;
  readonly description: string;
}

/** The CLDR plural categories, in the order a reader expects to see them. */
const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** chrome.i18n keys are [A-Za-z0-9_]; ours are dotted. */
function flatten(key: string): string {
  return key.replace(/\./gu, '_');
}

/**
 * `description` is developer documentation shown to translators and never to a
 * user, so the originating key is the most useful thing to put there: a
 * translator seeing `panel.degraded.sendTitle` learns more than one seeing the
 * sentence restated.
 */
function describe(key: string, category?: string): string {
  return category === undefined ? key : `${key} (plural category: ${category})`;
}

export function toMessages(
  catalogue: Catalogue,
  entities: EntityLabels,
): Record<string, ChromeMessage> {
  const out: Record<string, ChromeMessage> = {};

  for (const [key, value] of Object.entries(catalogue)) {
    if (typeof value === 'string') {
      out[flatten(key)] = { message: value, description: describe(key) };
      continue;
    }
    // A plural: one chrome key per category THIS LOCALE defines. Japanese
    // supplies only `other` and that is complete, not partial.
    for (const category of CATEGORIES) {
      const form = value[category];
      if (form === undefined || form.length === 0) continue;
      out[`${flatten(key)}_${category}`] = {
        message: form,
        description: describe(key, category),
      };
    }
  }

  for (const [type, label] of Object.entries(entities)) {
    if (label === undefined || label.length === 0) continue;
    out[`entity_${type}`] = { message: label, description: `entity type ${type}` };
  }

  return out;
}
