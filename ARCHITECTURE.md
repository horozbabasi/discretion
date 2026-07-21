# PrivacyShield — Architecture Notes

Working notes on ratified design decisions. SPEC.md is the product
specification; this file records the _why_ behind decisions the spec states
tersely, with pointers into the code.

> **Pending:** SPEC.md is not yet present in this repository (the file's text
> has not been provided). The decisions below are ratified and implemented;
> the corresponding SPEC.md wording (including the Stage 0 ZWNJ rule) must be
> added when the spec file lands.

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
