/**
 * Every user-facing string the extension shows, and the shape a translation
 * must have.
 *
 * SPEC.md: "Extension UI internationalized via chrome.i18n with English plus at
 * minimum Spanish, German, French, Portuguese, Turkish, Japanese, Hindi, and
 * Arabic (with RTL layout support)."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE CATALOGUE IS TYPESCRIPT AND THE `_locales` JSON IS GENERATED
 *
 * `chrome.i18n` is the mechanism SPEC names and it is the right one: the
 * browser picks the locale, and the store reads the same catalogues for its
 * listing. But it has one failure mode that matters more here than anywhere
 * else - `getMessage` returns an EMPTY STRING for a key that does not exist.
 * Not a warning, not the key name, nothing. A mistyped key or a locale missing
 * an entry produces a blank button in a panel whose whole job is to tell
 * someone their data is about to leave.
 *
 * So the catalogues are authored in TypeScript, where a locale missing a key is
 * a COMPILE ERROR - `Record<MessageKey, string>` is not satisfiable without
 * every key - and `_locales/<lang>/messages.json` is generated from them at
 * build time. Type safety at author time, the platform's own format at run
 * time, and one source of truth.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PLURALS ARE NOT ONE/OTHER, AND ARABIC IS WHY
 *
 * `chrome.i18n` has no plural support at all. The usual workaround - a
 * `.one` key and an `.other` key - is wrong for most of the languages SPEC
 * requires: Arabic has six plural categories, Polish three, Japanese one.
 * "1 عناصر" is the kind of detail that makes a reader distrust everything else
 * on the panel.
 *
 * So plural messages declare the categories they need and `Intl.PluralRules`
 * picks, falling back to `other` - which every language has. See `plural()`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityType } from '@privacyshield/core';

/** A message with one form. */
export type Simple = string;

/**
 * A message that varies by count.
 *
 * `other` is required because every language has it; the rest are optional
 * because most languages do not use them. A locale supplying only `other` is
 * correct for Japanese and wrong for nothing.
 */
export interface Plural {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/**
 * The English catalogue: the source of truth for WHICH keys exist.
 *
 * Placeholders are `$1`, `$2` in the order they are substituted. Kept
 * positional rather than named because that is what `chrome.i18n` supports,
 * and a second convention would be one more thing to get wrong.
 */
export const EN = {
  // ── the store listing (read from the manifest via __MSG_…__) ──
  'appName': 'PrivacyShield',
  'appDescription':
    'Detects and redacts sensitive information in text before it reaches AI chat interfaces. Runs entirely on your device.',

  // ── the review panel ──
  'panel.review.aria': 'PrivacyShield: review what will be masked before sending',
  'panel.review.title': { one: '$1 item to mask', other: '$1 items to mask' },
  'panel.exposure': 'exposure $1/100',
  'panel.action.cancel': 'Cancel',
  'panel.action.maskAndSend': 'Mask and send',
  'panel.action.protectAndSend': 'Protect and send',
  'panel.item.keepOriginal': 'Keep original',
  'panel.item.maskThis': 'Mask this',
  /** $1 action, $2 entity type, $3 position, $4 total. WCAG 2.5.3: the visible
   *  text comes first so speech input can activate it by what is written. */
  'panel.item.aria': '$1: $2, item $3 of $4',

  // ── D29: the composer nobody was seen typing into ──
  'panel.unwitnessed.title': 'Check this is your message',
  'panel.unwitnessed.body':
    'This text was already in the box - PrivacyShield did not see you type it. That is normal for a saved draft, a link that fills the box for you, or a suggested prompt.',

  // ── findings, shown while typing ──
  'panel.findings.aria': {
    one: 'PrivacyShield: $1 sensitive item detected in this message',
    other: 'PrivacyShield: $1 sensitive items detected in this message',
  },
  'panel.findings.title': { one: '$1 item detected', other: '$1 items detected' },
  'panel.findings.note': 'When you send, these will be replaced and you will be asked to confirm first.',

  // ── the paste guard ──
  'panel.paste.title': '$1 in what you just pasted',
  'panel.paste.body': 'These will be masked when you send. You can mask them now instead.',
  'panel.paste.none': 'Nothing sensitive was found in it.',
  'panel.paste.dismiss': 'Dismiss',
  'panel.paste.maskNow': 'Mask now',
  /** $1 count, $2 human entity-type label. */
  'panel.paste.countOfType': { one: '$1 $2', other: '$1 $2s' },

  // ── degraded ──
  'panel.degraded.pageTitle': 'PrivacyShield is not protecting this page',
  'panel.degraded.sendTitle': 'PrivacyShield did not send this message',
  'panel.degraded.couldNotFind': 'Could not find: $1.',
  'panel.degraded.noReason': 'The extension reported a problem without saying what it was.',

  // ── the popup ──
  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'Status',
  'popup.tab.quickRedact': 'Quick Redact',
  'popup.tab.insights': 'Insights',
  'popup.status.protected': 'Protecting this page',
  'popup.status.unprotected': 'Not protecting this page',
  'popup.status.unsupported': 'PrivacyShield does not run on this site',
  'popup.status.sessionCounts': 'Masked this session',
  'popup.status.sessionExposure': 'Session exposure',
  'popup.status.profile': 'Sensitivity',
  'popup.profile.minimal': 'Minimal',
  'popup.profile.balanced': 'Balanced',
  'popup.profile.strict': 'Strict',
  'popup.status.enabledHere': 'Enabled on this site',

  // ── Quick Redact ──
  'quick.heading': 'Mask text for anywhere',
  'quick.explain':
    'Paste text from any app. The masked version is safe to send. Paste a reply back to restore the real values.',
  'quick.input.aria': 'Text to mask',
  'quick.output.aria': 'Masked text',
  'quick.action.mask': 'Mask',
  'quick.action.restore': 'Restore',
  'quick.action.copy': 'Copy',
  'quick.copied': 'Copied',
  'quick.empty': 'Nothing to mask yet.',
  'quick.found': { one: '$1 item masked', other: '$1 items masked' },
  'quick.memoryOnly':
    'The mapping between your text and its replacements is kept in memory only, and is erased when this popup closes.',

  // ── Local Insights ──
  'insights.heading': 'What you have protected',
  'insights.explain': 'Counts only. No text and no values are ever stored.',
  'insights.empty': 'Nothing masked yet.',
  'insights.thisMonth': 'This month',
  'insights.allTime': 'All time',
  'insights.reset': 'Reset counts',
  'insights.resetConfirm': 'Reset all counts? This cannot be undone.',

  // ── options ──
  'popup.status.session': 'This session',
  'popup.status.nothingYet': 'Nothing masked on this page yet.',
  'popup.status.peak': 'Highest',
  'popup.status.mean': 'Typical',
  'popup.status.toggleAria': 'Protect this site',
  'popup.profile.hint': 'Strict catches more and asks you more often.',
  'popup.health.ok': 'Reading this page correctly',
  'popup.health.degraded': 'Cannot read this page',
  'popup.health.degradedWhy': 'Sends are blocked until the layout is recognised again.',
  'quick.unavailable': 'Masking is unavailable right now, so nothing was changed.',
  'quick.placeholder': 'Paste anything here',
  'family.contact': 'Contact',
  'family.financial': 'Financial',
  'family.identity': 'Identity',
  'family.document': 'Documents',
  'family.health': 'Health',
  'family.secret': 'Secrets',
  'family.network': 'Network',
  'family.location': 'Location',
  'family.person': 'Names',
  'family.other': 'Other',

  'options.title': 'PrivacyShield settings',
  'options.section.detection': 'What to detect',
  'options.section.substitution': 'Replacement style',
  'options.section.lists': 'Always and never',
  'options.mode.surrogate': 'Realistic replacements',
  'options.mode.token': 'Labels like [EMAIL_1]',
  'options.allowlist': 'Never mask these',
  'options.denylist': 'Always mask these',
  'options.save': 'Save',
  'options.saved': 'Saved',
} as const;

export type MessageKey = keyof typeof EN;

/**
 * A complete translation.
 *
 * `Record<MessageKey, ...>` rather than `Partial<...>`: a locale missing a key
 * fails to compile, which is the whole reason the catalogues are TypeScript.
 * The shape must also match - a message that is plural in English must be
 * plural in every locale, because the code calls `plural()` on it.
 */
export type Catalogue = {
  readonly [K in MessageKey]: (typeof EN)[K] extends string ? Simple : Plural;
};

/** English, as a Catalogue. Also the runtime fallback. */
export const EN_CATALOGUE: Catalogue = EN;

/**
 * Localised names for entity types - "Credit card", "Tarjeta de crédito".
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS `Partial` WHEN THE MESSAGE CATALOGUE IS NOT
 *
 * The message catalogue is complete-or-fail because `chrome.i18n` answers a
 * missing key with an EMPTY STRING, and a blank button is not legible. Entity
 * labels have a different floor: `labelOf()` in core derives a correct English
 * name from the type itself, so a missing translation degrades to "Credit
 * card" rather than to nothing.
 *
 * That difference is the whole justification. Requiring all 34 here would make
 * every locale restate IBAN, JWT, VIN and SWIFT/BIC - which are the same word
 * in all nine languages - and would break ARCHITECTURE.md D4's rule that
 * adding a national identifier touches exactly one new file, because it would
 * also touch nine catalogues before the build went green again.
 * ---------------------------------------------------------------------------
 */
export type EntityLabels = Partial<Record<EntityType, string>>;
