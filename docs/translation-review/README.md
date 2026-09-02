# Translation review

Eight locales are machine-translated and **no speaker of any of them has read
them**. Until one does, they are not shipped: `scripts/build.mjs` drops any
locale without a valid sign-off and `chrome.i18n` falls back to English.

That is deliberate. An English panel is honest — it says nothing in a language
the reader may not have. A confidently mistranslated "Mask this" is not: it
says the wrong thing in a language they trust.

## Scope

Of 116 catalogue keys, **21** are reviewed here: the ones where a
mistranslation causes a wrong safety decision rather than confusion. That is
roughly **254 words per locale**, a 20–30 minute read — not a translation
contract. The other 95 keys are usability bugs at worst and are not gating.

## Status

| locale | language | reviewer | shipped | sheet |
| --- | --- | --- | --- | --- |
| `en` | English | — (source) | **yes** | — |
| `es` | Spanish | — | no | [es.md](es.md) |
| `de` | German | — | no | [de.md](de.md) |
| `fr` | French | — | no | [fr.md](fr.md) |
| `pt_BR` | Portuguese (Brazil) | — | no | [pt_BR.md](pt_BR.md) |
| `tr` | Turkish | — | no | [tr.md](tr.md) |
| `ja` | Japanese | — | no | [ja.md](ja.md) |
| `hi` | Hindi | — | no | [hi.md](hi.md) |
| `ar` | Arabic | — | no | [ar.md](ar.md) |

## How a locale starts shipping

1. A person who reads the language fills in the sheet.
2. Their name, relationship to the language, date and the sheet's digest go
   into `REVIEW_SIGNOFFS` in `packages/extension/src/i18n/reviewed.ts`.
3. `npm test` and `npm run ext:build` — the locale now builds into
   `_locales/`.

**A sign-off is a claim that a human who reads the language checked these
strings.** It must not be added on the strength of a machine translation, a
model's assessment of its own output, or a round-trip back to English. That is
the process that produced these strings; re-running it is not review.

Regenerate these sheets with
`node packages/extension/scripts/make-review-sheets.mjs`.
