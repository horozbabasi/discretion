/**
 * reviewed.ts — which locales a human has actually read, and the gate that
 * keeps the unread ones out of the build.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS EXISTS FOR
 *
 * The eight non-English catalogues were machine-translated. They are
 * STRUCTURALLY complete — `Catalogue` makes a missing key a compile error, and
 * `locales.test.ts` checks placeholders and plural categories — and
 * structurally complete is not the same as correct. No speaker of any of them
 * has read them.
 *
 * For most strings a bad translation is a usability bug. For a small number it
 * is a WRONG SAFETY DECISION: if `panel.item.maskThis` and
 * `panel.item.keepOriginal` read as each other in Turkish, a user leaves a
 * secret in plaintext believing they masked it. If `popup.status.unprotected`
 * reads as protected, they trust a page that is not guarded. Those are the
 * strings below.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A DIGEST AND NOT JUST A NAME AND A DATE
 *
 * A sign-off that is only a name and a date keeps claiming to be true after
 * the text changes. Someone reviews the Turkish panel, a string is later
 * reworded, and the record still says "reviewed by …" for words nobody read.
 * That failure is silent and it is exactly the shape this project keeps
 * finding.
 *
 * So a sign-off records a DIGEST of the safety-critical strings it covered.
 * The build recomputes it; if the text has moved, the sign-off no longer
 * matches and the locale drops out until someone reads it again. The record
 * cannot outlive the thing it describes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT "DROPPED" MEANS
 *
 * A locale without a valid sign-off is not shipped at all. `chrome.i18n` falls
 * back to `default_locale`, which is English, so a Turkish user sees an
 * English panel.
 *
 * That is the deliberate choice. An English panel is honest — it says nothing
 * in a language the reader may not have. A confidently mistranslated
 * "Mask this" is not: it says the wrong thing in a language they trust. The
 * rejected middle option was shipping a locale with these 21 forced to
 * English, which puts the one string that matters into the language the reader
 * has already demonstrated they do not read.
 */

import type { Catalogue, MessageKey, Plural } from './catalogue.js';

/**
 * The strings where a mistranslation causes a wrong SAFETY decision rather
 * than confusion.
 *
 * The test for membership is not "is this important" but "if a reader acted on
 * the wrong meaning, could they end up sending something they meant to keep,
 * or trusting a page that is not protected". Everything else — options labels,
 * insights, entity names — is a usability bug at worst and is not listed.
 */
export const SAFETY_CRITICAL_KEYS: readonly MessageKey[] = [
  // The controls that decide whether the message leaves at all.
  'panel.action.cancel',
  'panel.action.maskAndSend',
  'panel.action.protectAndSend',

  // The per-item decision. Reversed, these leave a secret in plaintext while
  // the user believes they masked it.
  'panel.item.keepOriginal',
  'panel.item.maskThis',

  // Fail-closed notices. These say we did NOT protect, or did NOT send.
  'panel.degraded.pageTitle',
  'panel.degraded.sendTitle',
  'panel.degraded.couldNotFind',
  'panel.degraded.noReason',

  // "This may not be your message."
  'panel.unwitnessed.title',
  'panel.unwitnessed.body',

  // What will happen when you send.
  'panel.findings.note',
  'panel.paste.body',
  'panel.paste.none',

  // Whether this page is guarded.
  'popup.status.protected',
  'popup.status.unprotected',
  'popup.status.unsupported',

  // Quick Redact: mask versus restore, the failure notice, and the privacy
  // claim about where the text goes.
  'quick.action.mask',
  'quick.action.restore',
  'quick.unavailable',
  'quick.memoryOnly',
];

export interface ReviewSignoff {
  /** Who read it. A person, not a tool. */
  readonly reviewer: string;
  /** Their relationship to the language, in their own words. */
  readonly relationship: string;
  /** ISO date of the review. */
  readonly date: string;
  /**
   * `safetyCriticalDigest()` of the catalogue AS REVIEWED.
   *
   * If the strings change afterwards this stops matching and the locale drops
   * out, which is the point: the sign-off describes specific words, not a
   * locale in general.
   */
  readonly digest: string;
}

/**
 * Locales a speaker has signed off, keyed by `_locales` directory.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS EMPTY, AND THAT IS THE CURRENT TRUTH.
 *
 * No speaker of Spanish, German, French, Portuguese, Turkish, Japanese, Hindi
 * or Arabic has reviewed these catalogues. Until one does, the build ships
 * English only.
 *
 * An entry here is a claim that a HUMAN who reads the language checked these
 * 21 strings. It must not be added on the strength of a machine translation,
 * a model's opinion of its own output, or a round-trip back to English —
 * those are the process that produced the strings, and re-running it is not
 * review. The review sheets in `docs/translation-review/` are what a reviewer
 * fills in, and each sheet ends with the exact entry to paste here.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const REVIEW_SIGNOFFS: Readonly<Record<string, ReviewSignoff>> = {
  // 'tr': { reviewer: '…', relationship: 'native speaker', date: '2026-__-__', digest: '…' },
};

/** English is the source the reviewers read against; it needs no sign-off. */
export const SOURCE_LOCALE = 'en';

function messageText(value: string | Plural): string {
  if (typeof value === 'string') return value;
  // Every category, in a fixed order, so a change to any of them moves the
  // digest. Arabic's dual is as reviewable as its singular.
  return (['zero', 'one', 'two', 'few', 'many', 'other'] as const)
    .map((category) => `${category}=${value[category] ?? ''}`)
    .join('');
}

/**
 * A stable digest of exactly the safety-critical strings in one catalogue.
 *
 * FNV-1a over the key/value pairs. Not a cryptographic hash and does not need
 * to be: it guards against text CHANGING, not against someone forging a
 * sign-off. Anyone able to edit `REVIEW_SIGNOFFS` can already edit the
 * catalogue.
 */
export function safetyCriticalDigest(catalogue: Catalogue): string {
  const payload = SAFETY_CRITICAL_KEYS.map(
    (key) => `${key} ${messageText(catalogue[key])}`,
  ).join('');

  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export type ReviewState =
  | { readonly shipped: true; readonly reason: 'source-locale' }
  | { readonly shipped: true; readonly reason: 'reviewed'; readonly signoff: ReviewSignoff }
  | { readonly shipped: false; readonly reason: 'never-reviewed' }
  | {
      readonly shipped: false;
      readonly reason: 'stale-signoff';
      readonly signoff: ReviewSignoff;
      readonly actual: string;
    };

/** Whether one locale may ship, and why. */
export function reviewStateOf(dir: string, catalogue: Catalogue): ReviewState {
  if (dir === SOURCE_LOCALE) return { shipped: true, reason: 'source-locale' };

  const signoff = REVIEW_SIGNOFFS[dir];
  if (signoff === undefined) return { shipped: false, reason: 'never-reviewed' };

  const actual = safetyCriticalDigest(catalogue);
  if (actual !== signoff.digest) {
    return { shipped: false, reason: 'stale-signoff', signoff, actual };
  }
  return { shipped: true, reason: 'reviewed', signoff };
}
