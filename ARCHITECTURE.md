# PrivacyShield — Architecture Notes

Working notes on ratified design decisions. SPEC.md is the product
specification; this file records the _why_ behind decisions the spec states
tersely, with pointers into the code.

SPEC.md is present and authoritative. Every decision below is implemented and
pinned by `packages/core/test/spec-conformance.test.ts`, which quotes the
governing SPEC.md rule in each test so drift fails the build.

## Ratified decisions

### D1 — ZWNJ (U+200C) is preserved between joining-script text

ZWNJ is linguistically meaningful in scripts with cursive joining or conjunct
formation: Persian/Urdu and other Arabic-script languages use it for letter
shaping and word segmentation (می‌خواهم), and Indic scripts use it to
suppress conjuncts (क्‌ष). Stripping it there corrupts the text. The original
Stage 0 strip list wrongly swept it in with the other zero-width characters.

**Rule.** ZWNJ is preserved when its nearest substantive neighbors on both
sides — skipping other strippable invisibles and combining marks — belong to
a ZWNJ-using script: Arabic, Syriac, Mongolian, Devanagari, Bengali,
Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala,
Myanmar, Khmer. Everywhere else (Latin ligature suppression, obfuscation,
stray controls, text edges) it is noise and is stripped. This mirrors the
reasoning already applied to ZWJ inside emoji sequences.

**Corollary.** A token carrying a preserved ZWNJ is never a homoglyph-folding
candidate: a fold could rewrite one of the ZWNJ's neighbors into another
script and flip the preservation decision on re-normalization, breaking
idempotency.

Code: `packages/core/src/transforms/stripInvisibles.ts`
(`shouldPreserveZwnj`), guard in
`packages/core/src/transforms/homoglyphFold.ts` (`computeFolds`).

### D2 — Script compatibility groups for token dominance

Ordinary Japanese prose freely mixes Han, Hiragana/Katakana, and embedded
Latin (acronyms, romaji); Korean prose mixes Hangul with Han (hanja). Such
text must never be treated as anomalous script mixing.

**Rule.** For token-dominance decisions in homoglyph folding, these groups
are compatible — members are never script-anomalous with respect to each
other:

- { Han, Kana (Hiragana + Katakana), Latin }
- { Hangul, Han }

A Cyrillic or Greek character inside a Japanese token is still anomalous and
still folds if the confusables table can map it. `ScriptInfo.mixed` remains a
purely statistical flag (Japanese text reports `mixed: true`); compatibility
applies to folding decisions, not reporting.

Code: `packages/core/src/scripts.ts` (`scriptsCompatible`), used by
`computeFolds`.

### D3 — No folding on a dominant-script tie

A token whose top two script counts are equal gives no evidence of which
script is "home", so no character in it is folded. Conservative by design:
a missed fold is recoverable downstream, a wrong fold corrupts user text.

Code: `computeFolds` in `packages/core/src/transforms/homoglyphFold.ts`.

### D4 — Entity types are families where the spec requires extensibility

`EntityType` in `packages/core/src/types.ts` is taken from SPEC.md's Stage 1
detector list and Stage 2 NER types, using the spec's own SCREAMING_SNAKE_CASE
spelling. Three membership decisions needed judgement:

**National identifiers are one family, not one member per country.** SPEC.md
requires that "adding a new national identifier must require touching exactly
one new file". A per-country union member would force every new scheme to edit
`types.ts` as well, breaking that requirement outright. The concrete scheme
(SSN, TCKN, PESEL, Aadhaar, …) and its country travel in `Candidate.metadata`.
The substitution section's singular "NATIONAL_ID → a value passing that
country's checksum" confirms the family reading.

**`TAX_ID` and `VAT_NUMBER` are split out from `NATIONAL_ID`.** Their
sensitivity genuinely differs: a company VAT number is frequently public
registry data, a personal national ID never is. The sensitivity profiles must
be able to threshold them independently — Balanced should mask a national ID
without masking a published VAT number.

**`PRIVATE_KEY` is separate from `API_KEY`.** SPEC.md lists PEM blocks in the
same bullet as provider tokens, but a leaked private key and a leaked API key
differ in blast radius and in how each is surrogated.

**`DATE_OF_BIRTH` is carried despite being absent from the Stage 1 detector
list**, because two other SPEC.md sections require it: the Strict profile
("adds … dates of birth") and the substitution table ("DATE → a shifted date
preserving relative ordering across the document").

### D5 — Stage 0 strips a superset of the characters SPEC.md enumerates

Two places where the implementation is deliberately broader than the spec's
literal list. Both are supersets, so no character the spec protects is
stripped, and no character the spec strips is kept.

**Invisibles.** SPEC.md names U+200B–U+200F, U+202A–U+202E, and U+FEFF. The
implementation also strips U+00AD (soft hyphen) and U+2060–U+2064 (word joiner
and the invisible math operators), which the original M1 brief listed
explicitly. All are zero-width characters and fall under the spec's stated
category, "zero-width and bidi control characters"; all are pure noise for
detection and are equally usable for obfuscation.

**ZWNJ-using scripts.** SPEC.md names Arabic, Persian, Urdu, Devanagari,
Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada, Malayalam, and Sinhala.
The implementation additionally preserves ZWNJ in Syriac, Mongolian, Oriya,
Myanmar, and Khmer, which use it for the same cursive-joining and
conjunct-control purposes. Preserving more is the safe direction: a
wrongly-kept ZWNJ is invisible noise, a wrongly-stripped one corrupts the
user's words. Every script the spec names is covered by a test.

## Standing contracts (established in M1)

- **Offset map:** `offsetMap[i]` is the original index of the cluster that
  produced normalized index `i`, with a sentinel at `normalizedLength`.
  Deleted runs attribute to the following cluster (trailing runs to the
  sentinel), so `offsetMap[0] === 0` whenever output exists.
- **Span mapping:** consumers use `mapNormalizedSpan()`, which widens
  endpoints inside an NFKC expansion to the whole original cluster; spans
  that split one expansion may map to overlapping original spans and must be
  merged before substitution.
- **Folding safety:** every fold replacement is NFKC-stable and consists of
  letters/marks/digits only, so folding survives the NFKC re-pass and never
  changes tokenization.

Details and rationale: header comments in `packages/core/src/offsetMap.ts`
and the transform files.
