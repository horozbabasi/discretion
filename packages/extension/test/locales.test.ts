/**
 * The nine catalogues, and the generator that turns them into `_locales`.
 *
 * Completeness is already a COMPILE error — `Catalogue` is a total Record, so
 * a locale missing a key does not build. These are the properties the type
 * system cannot express:
 *
 *   - a translation must not use a placeholder English does not supply, or it
 *     renders a literal `$3` to a user;
 *   - every plural must have `other`, since that is what every fallback lands
 *     on;
 *   - the generator must expand plural categories into separate chrome keys,
 *     because chrome.i18n has no plural support at all — and Arabic needs six.
 */

import { describe, expect, it } from 'vitest';

import { EN } from '../src/i18n/catalogue.js';
import type { MessageKey, Plural } from '../src/i18n/catalogue.js';
import { LOCALES } from '../src/i18n/locales/index.js';
import { toMessages } from '../src/i18n/toMessages.js';

const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** Every distinct `$n` in a message, as numbers. */
function placeholders(message: string): number[] {
  return [...new Set([...message.matchAll(/\$(\d+)/gu)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
}

/** Every form of a message, plural or not. */
function forms(value: string | Plural): string[] {
  if (typeof value === 'string') return [value];
  return CATEGORIES.map((c) => value[c]).filter((f): f is string => f !== undefined);
}

/** The placeholders English supplies for a key — the budget a locale may draw on. */
function englishPlaceholders(key: MessageKey): number[] {
  const all = new Set<number>();
  for (const form of forms(EN[key])) for (const n of placeholders(form)) all.add(n);
  return [...all].sort((a, b) => a - b);
}

describe('every locale', () => {
  it('is registered exactly once, and SPEC.md asks for all nine', () => {
    // SPEC.md: "English plus at minimum Spanish, German, French, Portuguese,
    // Turkish, Japanese, Hindi, and Arabic (with RTL layout support)."
    const dirs = LOCALES.map((l) => l.dir);
    expect(dirs).toEqual(['en', 'es', 'de', 'fr', 'pt_BR', 'tr', 'ja', 'hi', 'ar']);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('uses no placeholder English does not supply', () => {
    // A `$3` where English has two arguments renders the literal characters
    // "$3" to the user. The reverse is fine and deliberate: Arabic's `one` and
    // `two` forms carry the count in the noun and drop `$1`.
    for (const locale of LOCALES) {
      for (const key of Object.keys(EN) as MessageKey[]) {
        const budget = englishPlaceholders(key);
        for (const form of forms(locale.catalogue[key])) {
          for (const used of placeholders(form)) {
            expect(budget, `${locale.dir}/${key} uses $${String(used)}`).toContain(used);
          }
        }
      }
    }
  });

  it('gives every plural message an `other` form', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(EN) as MessageKey[]) {
        const value = locale.catalogue[key];
        if (typeof value === 'string') continue;
        expect(value.other, `${locale.dir}/${key}`).toBeTruthy();
      }
    }
  });

  it('has no empty or whitespace-only message', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(EN) as MessageKey[]) {
        for (const form of forms(locale.catalogue[key])) {
          expect(form.trim().length, `${locale.dir}/${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps a message plural in every locale if it is plural in English', () => {
    // `plural()` is called on these by key. A locale that flattened one to a
    // string would drop the count agreement silently.
    for (const locale of LOCALES) {
      for (const key of Object.keys(EN) as MessageKey[]) {
        expect(typeof locale.catalogue[key], `${locale.dir}/${key}`).toBe(typeof EN[key]);
      }
    }
  });

  it('translates something, rather than copying English through', () => {
    // Guards against a locale file created by copy-paste and never filled in.
    //
    // A FRACTION, not a count. Some entries are legitimately identical in
    // another language - 'Discretion' is a proper noun, and French spells
    // Contact, Documents and Secrets the way English does. An absolute
    // threshold turns those correct translations into a failure the moment
    // enough of them accumulate, which is what a count of 5 did the first time
    // twenty-one keys were added. A copy-pasted file is ~100% identical, so
    // the signal this test is for survives a far looser bound.
    const keys = Object.keys(EN) as MessageKey[];
    for (const locale of LOCALES) {
      if (locale.dir === 'en') continue;
      const identical = keys.filter(
        (key) => JSON.stringify(locale.catalogue[key]) === JSON.stringify(EN[key]),
      );
      const fraction = identical.length / keys.length;
      expect(
        fraction,
        `${locale.dir}: ${String(identical.length)}/${String(keys.length)} identical to English (${identical.slice(0, 8).join(', ')})`,
      ).toBeLessThan(0.25);
    }
  });
});

describe('Arabic, which is why plurals are not one/other', () => {
  const ar = LOCALES.find((l) => l.dir === 'ar');

  it('supplies all six CLDR categories where a count is shown', () => {
    const title = ar?.catalogue['panel.review.title'];
    expect(typeof title).toBe('object');
    for (const category of CATEGORIES) {
      expect((title as Plural)[category], `panel.review.title.${category}`).toBeTruthy();
    }
  });

  it('covers every category Intl actually selects for Arabic', () => {
    const rules = new Intl.PluralRules('ar');
    const needed = new Set([0, 1, 2, 3, 11, 100].map((n) => rules.select(n)));
    const supplied = ar?.catalogue['panel.findings.title'] as Plural;
    for (const category of needed) expect(supplied[category as keyof Plural]).toBeTruthy();
  });
});

describe('Turkish and Japanese supply only `other`, and that is complete', () => {
  it('Japanese has exactly one plural category, so one form is all there is', () => {
    const rules = new Intl.PluralRules('ja');
    expect(new Set([0, 1, 2, 5, 100].map((n) => rules.select(n)))).toEqual(new Set(['other']));
    const ja = LOCALES.find((l) => l.dir === 'ja');
    expect((ja?.catalogue['quick.found'] as Plural).one).toBeUndefined();
  });

  it('Turkish falls through from `one` to `other`, which is the same sentence', () => {
    // Turkish does not mark the plural after a numeral - "3 öğe", not
    // "3 öğeler" - so the two forms would be identical.
    expect(new Intl.PluralRules('tr').select(1)).toBe('one');
    const tr = LOCALES.find((l) => l.dir === 'tr');
    expect((tr?.catalogue['panel.review.title'] as Plural).one).toBeUndefined();
    expect((tr?.catalogue['panel.review.title'] as Plural).other).toBeTruthy();
  });
});

describe('the messages.json generator', () => {
  const en = LOCALES[0];
  const messages = toMessages(en!.catalogue, en!.entities);

  it('flattens dots, because chrome.i18n keys cannot contain them', () => {
    expect(messages['panel_action_cancel']?.message).toBe('Cancel');
    expect(Object.keys(messages).every((k) => /^[A-Za-z0-9_]+$/u.test(k))).toBe(true);
  });

  it('expands a plural into one key per category', () => {
    expect(messages['panel_review_title_one']?.message).toBe('$1 item to mask');
    expect(messages['panel_review_title_other']?.message).toBe('$1 items to mask');
    // and NOT a single key holding an object
    expect(messages['panel_review_title']).toBeUndefined();
  });

  it('emits all six Arabic categories', () => {
    const ar = LOCALES.find((l) => l.dir === 'ar');
    const arMessages = toMessages(ar!.catalogue, ar!.entities);
    for (const category of CATEGORIES) {
      expect(arMessages[`panel_review_title_${category}`]?.message).toBeTruthy();
    }
  });

  it('gives every entry a non-empty description, which Chrome requires', () => {
    for (const locale of LOCALES) {
      for (const [key, entry] of Object.entries(toMessages(locale.catalogue, locale.entities))) {
        expect(entry.message.length, `${locale.dir}/${key}`).toBeGreaterThan(0);
        expect(entry.description.length, `${locale.dir}/${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('emits entity labels under their own prefix, and none for English', () => {
    // English entity names are DERIVED by labelOf(), so there is nothing to
    // translate and nothing to ship. A miss there falls back to real text.
    expect(Object.keys(messages).some((k) => k.startsWith('entity_'))).toBe(false);
    const es = LOCALES.find((l) => l.dir === 'es');
    const esMessages = toMessages(es!.catalogue, es!.entities);
    expect(esMessages['entity_CREDIT_CARD']?.message).toBe('Tarjeta de crédito');
  });
});
