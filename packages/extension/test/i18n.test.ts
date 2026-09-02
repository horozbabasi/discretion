// @vitest-environment jsdom
/**
 * The message system.
 *
 * SPEC.md requires English plus Spanish, German, French, Portuguese, Turkish,
 * Japanese, Hindi and Arabic, "with RTL layout support".
 *
 * Two properties carry the weight here, and both are about failure:
 *
 *   - a missing message must never render as NOTHING. `chrome.i18n.getMessage`
 *     returns an empty string for an unknown key, silently, and this UI is a
 *     panel that tells someone their data is about to leave.
 *   - plurals must not be one/other. Arabic has six categories and Japanese
 *     one; "1 عناصر" is the kind of detail that makes a reader distrust
 *     everything else on the panel.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EN, EN_CATALOGUE } from '../src/i18n/catalogue.js';
import type { MessageKey, Plural } from '../src/i18n/catalogue.js';
import { isRtl, plural, t, uiLocale } from '../src/i18n/index.js';

/** Pretends to be a browser in `locale`, with no chrome.i18n available. */
function asLocale(locale: string): void {
  Object.defineProperty(navigator, 'language', { value: locale, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  asLocale('en-US');
});

describe('a message never renders as nothing', () => {
  it('falls back to the bundled English when chrome.i18n returns empty', () => {
    // The exact failure mode: getMessage answers '' for a key it does not
    // have, says nothing about it, and the button renders blank.
    vi.stubGlobal('chrome', { i18n: { getMessage: () => '', getUILanguage: () => 'en-US' } });
    expect(t('panel.action.cancel')).toBe('Cancel');
    expect(t('panel.action.protectAndSend')).toBe('Protect and send');
  });

  it('falls back when there is no chrome at all', () => {
    // The playground, a test, an options page opened as a file.
    vi.stubGlobal('chrome', undefined);
    expect(t('panel.degraded.sendTitle')).toBe('Discretion did not send this message');
  });

  it('prefers a real translation when chrome.i18n has one', () => {
    vi.stubGlobal('chrome', {
      i18n: { getMessage: (key: string) => (key === 'panel_action_cancel' ? 'Abbrechen' : ''), getUILanguage: () => 'de' },
    });
    expect(t('panel.action.cancel')).toBe('Abbrechen');
  });

  it('substitutes positionally', () => {
    vi.stubGlobal('chrome', undefined);
    expect(t('panel.exposure', 51)).toBe('exposure 51/100');
    expect(t('panel.item.aria', 'Keep original', 'Email', 2, 5)).toBe(
      'Keep original: Email, item 2 of 5',
    );
  });

  it('leaves an unfilled placeholder visible rather than blank', () => {
    // A missing substitution should look wrong, not look fine and say the
    // wrong thing.
    vi.stubGlobal('chrome', undefined);
    expect(t('panel.exposure')).toContain('$1');
  });
});

describe('plurals use the languagerules, not one-versus-other', () => {
  it('selects English one/other', () => {
    vi.stubGlobal('chrome', undefined);
    asLocale('en-US');
    expect(plural('panel.review.title', 1)).toBe('1 item to mask');
    expect(plural('panel.review.title', 3)).toBe('3 items to mask');
  });

  it('uses ONE form for Japanese, which has one plural category', () => {
    vi.stubGlobal('chrome', undefined);
    asLocale('ja');
    // Intl.PluralRules('ja').select(n) is 'other' for every n, so both counts
    // resolve to the same form. A hardcoded singular/plural would invent a
    // distinction the language does not have.
    expect(new Intl.PluralRules('ja').select(1)).toBe('other');
    expect(plural('panel.review.title', 1)).toBe(plural('panel.review.title', 3).replace('3', '1'));
  });

  it('asks Intl for the Arabic category rather than guessing', () => {
    vi.stubGlobal('chrome', undefined);
    asLocale('ar');
    const rules = new Intl.PluralRules('ar');
    // Six categories, and the code must ask for each by name.
    expect(rules.select(0)).toBe('zero');
    expect(rules.select(1)).toBe('one');
    expect(rules.select(2)).toBe('two');
    expect(rules.select(3)).toBe('few');
    expect(rules.select(11)).toBe('many');
    expect(rules.select(100)).toBe('other');
    // With only English loaded, every category falls back to `other` - legible,
    // and never empty.
    for (const count of [0, 1, 2, 3, 11, 100]) {
      expect(plural('panel.review.title', count).length).toBeGreaterThan(0);
    }
  });

  it('falls back to `other` for a locale Intl does not know', () => {
    vi.stubGlobal('chrome', undefined);
    asLocale('zz-Nonsense');
    expect(plural('panel.review.title', 2).length).toBeGreaterThan(0);
  });
});

describe('right-to-left', () => {
  it('recognises the RTL languages', () => {
    for (const locale of ['ar', 'ar-EG', 'he', 'fa-IR', 'ur']) {
      expect(isRtl(locale)).toBe(true);
    }
  });

  it('does not mistake anything else for RTL', () => {
    for (const locale of ['en-GB', 'es', 'de', 'fr', 'pt-BR', 'tr', 'ja', 'hi']) {
      expect(isRtl(locale)).toBe(false);
    }
  });

  it('reads the UI locale from chrome when it is there', () => {
    vi.stubGlobal('chrome', { i18n: { getMessage: () => '', getUILanguage: () => 'ar-EG' } });
    expect(uiLocale()).toBe('ar-EG');
    expect(isRtl()).toBe(true);
  });
});

describe('the catalogue itself', () => {
  it('gives every plural message an `other` form', () => {
    // Every language defines `other`; it is the only category that can be the
    // floor for a fallback.
    for (const [key, value] of Object.entries(EN_CATALOGUE)) {
      if (typeof value === 'string') continue;
      expect((value as Plural).other, `${key} has no 'other'`).toBeTruthy();
    }
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(EN)) {
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms) expect(String(form).length, `${key} is empty`).toBeGreaterThan(0);
    }
  });

  it('numbers its placeholders from 1 with no gaps', () => {
    // `$0` never substitutes and a gap means a silently missing value.
    for (const [key, value] of Object.entries(EN)) {
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms) {
        const used = [...String(form).matchAll(/\$(\d+)/gu)].map((m) => Number(m[1]));
        if (used.length === 0) continue;
        const distinct = [...new Set(used)].sort((a, b) => a - b);
        expect(distinct[0], `${key} starts at $${String(distinct[0])}`).toBe(1);
        distinct.forEach((n, i) => {
          expect(n, `${key} has a placeholder gap`).toBe(i + 1);
        });
      }
    }
  });
});

describe('keys are checked at compile time', () => {
  it('rejects a key that is not in the catalogue', () => {
    // Not a runtime assertion. `t` is typed to MessageKey, so the typo case -
    // the one that makes getMessage return '' - cannot be written.
    // @ts-expect-error - 'panel.action.nope' is not a MessageKey.
    const bad: MessageKey = 'panel.action.nope';
    expect(bad).toBeDefined();
  });
});

describe('the panel mirrors for an RTL locale', () => {
  /**
   * `PANEL_STYLES` reads the locale once at module load, so each case needs a
   * fresh module graph. This is the assertion that matters more than
   * `isRtl()` returning true: the stylesheet pins `direction` with
   * `!important`, and it used to pin it to `ltr` unconditionally - correct
   * against a hostile page, and welded the wrong way round for every
   * Arabic-speaking user.
   */
  async function stylesFor(locale: string): Promise<string> {
    vi.resetModules();
    vi.stubGlobal('chrome', { i18n: { getMessage: () => '', getUILanguage: () => locale } });
    const { PANEL_STYLES } = await import('../src/ui/styles.js');
    return PANEL_STYLES;
  }

  it('emits direction: rtl for Arabic', async () => {
    expect(await stylesFor('ar')).toContain('direction: rtl !important');
  });

  it('emits direction: ltr for English', async () => {
    expect(await stylesFor('en-GB')).toContain('direction: ltr !important');
  });

  it('keeps the pin unoverridable either way', async () => {
    // The hardening requirement was never "ltr" - it was that the PAGE does
    // not decide. Both directions keep !important, and both keep the
    // isolation that stops the host's own direction inheriting in.
    for (const locale of ['ar', 'en-GB']) {
      const css = await stylesFor(locale);
      expect(css).toMatch(/direction: (rtl|ltr) !important/u);
      expect(css).toContain('unicode-bidi: isolate !important');
    }
  });
});
