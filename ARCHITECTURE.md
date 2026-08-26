# PrivacyShield — Architecture Notes

Working notes on ratified design decisions. SPEC.md is the product
specification; this file records the _why_ behind decisions the spec states
tersely, with pointers into the code.

SPEC.md is present and authoritative. The Stage 0 decisions (D1-D5) are
pinned by `packages/core/test/spec-conformance.test.ts`, which quotes the
governing SPEC.md rule in each test so drift fails the build; later decisions
name the suite that pins them inline.

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

### D6 — `.claude/` is local agent tooling, not project content

The repository briefly tracked `.claude/skills/` — three Claude Code skills
used while working on this project. They are now ignored and untracked.

**Reasoning.** Skills are tooling for whoever happens to be editing the code,
not part of the product: nothing in the build, the workspace globs, or any
package entry point reads them. Tracking them bought nothing and created a
licensing complication. Two of the three vendor third-party Apache-2.0 works,
each carrying its own `LICENSE.txt` (one reading "Copyright 2026 Anthropic,
PBC."), and the third has no license file or attribution of any kind and is
demonstrably not this project's original work. Redistributing all of it under
a blanket root MIT `LICENSE` would assert a grant over code this project does
not own, and keeping it would additionally require an Apache-2.0 section in
THIRD_PARTY_NOTICES.md to be correct.

Untracking removes the problem at its source instead of documenting around
it. The skills stay on disk and keep working exactly as before; they simply
stop being redistributed as part of this repository.

Code: `.gitignore` (`.claude/`).

### D7 — Stage 1 candidates carry both normalized and original offsets

`Candidate.start`/`end` are defined in `types.ts` as offsets into the
NORMALIZED text, and every M1 offset-map invariant is written against that
meaning. Stage 1 detectors match on normalized text, but substitution edits
the ORIGINAL text, so a candidate needs both.

**Rule.** `Stage1Candidate` carries `start`/`end` (normalized) alongside
`originalStart`/`originalEnd`, which the runner resolves once via
`mapNormalizedSpan()`. Redefining `Candidate.start` to mean original offsets
was rejected: it would silently invalidate the M1 property tests while leaving
them passing, since both are plain numbers.

**Consequence, discovered by the runner's property test.** An original span
ABSORBS adjacent runs of characters that Stage 0 deletes — a leading run
because deleted runs attribute to the cluster that follows them, and a
trailing run at end-of-text because it attributes to the sentinel. So for
`"AAA​123"` the original span includes the zero-width space.

This is correct and desirable rather than a defect: masking the span removes
the obfuscating character along with the value, instead of leaving it stranded
beside a surrogate. The invariant worth asserting is therefore not
byte-exactness but that the original span re-normalizes to exactly the matched
value — which is what `detect-runner.test.ts` checks over generated input.

Code: `packages/core/src/detect/runner.ts`, `packages/core/src/detect/types.ts`.

### D8 — The checksum library stops at the remainder

Most national identifier checksums are Σ(digitᵢ × weightᵢ) mod m, differing
only in weights and modulus. SPEC.md asks for each algorithm to be
"implemented once and reused", so those shared parts live in
`packages/core/src/checksums/`.

**Rule.** The shared layer computes the weighted remainder and stops. The
closing rule — whether the check digit is the remainder, its complement,
whether 10 maps to 'X' or invalidates, whether 11 folds to 0 — stays in each
detector.

**Reasoning.** The closing rules vary too much to generalize honestly. Encoding
them as configuration produces one function with a dozen mutually exclusive
branches, where each branch is exercised by only a handful of countries and a
mistake in one silently corrupts an unrelated one. Splitting at the remainder
puts the error-prone shared arithmetic in one tested place while keeping each
country's idiosyncrasy visible in its own file, next to the spec reference
that justifies it.

Code: `packages/core/src/checksums/weighted.ts` and siblings.

### D9 — Polkadot SS58 validates structurally; blake2b is not bundled

Every other wallet checksum in the crypto family reuses a primitive that
more than one chain needs: SHA-256d covers Bitcoin, Litecoin and Tron;
Keccak-256 covers Ethereum's EIP-55 and Monero; bech32/bech32m cover
Bitcoin segwit and Cardano Shelley. Polkadot's SS58 alone requires
blake2b-512, and a 64-bit hash built from paired 32-bit halves is exactly
the kind of code where a subtle carry bug survives casual review.

**Rule.** The DOT detector validates structure only — base58 to exactly 35
bytes with the 0x00 network prefix — at MEDIUM confidence, with
`checksum: 'unverified'` in its metadata. If a second consumer of blake2b
ever appears, implement the primitive with pinned official vectors and
upgrade the detector to HIGH.

A parallel small asymmetry, recorded in the ADA detector itself: Cardano
Shelley addresses are fully checksum-verified (bech32) at HIGH, while
Byron-era addresses would need a CBOR parse to reach their CRC and validate
structurally at MEDIUM instead.

Code: `packages/core/src/detect/detectors/crypto/dot.ts`, `ada.ts`.

### D10 — Mutation properties follow the checksum's real guarantees

Every Stage 1 detector with a checksum has a property test that generates
valid identifiers and asserts detection. Whether the property ALSO asserts
that a single-digit mutation is rejected depends on the scheme's arithmetic,
established case by case during M2:

**Hard mutation** applies only when the remainder→check mapping is bijective
and every weight·delta is nonzero modulo the modulus — Luhn and Verhoeff
schemes, prime-modulus weighted sums with unissuable remainders rejected
(NHS, CUIT, RUT, NRIC, HKID, Kuwait), divisibility tests (TFN, ABN, rodné
číslo), ISO 7064, and the ICAO 7-3-1 digits.

**Validation-only, with the fold named at the call site** where the scheme
itself cannot promise detection: check mappings that FOLD two remainders
onto one digit (REGON 10→0, PT NIF r<2→0, CPF/CNPJ, AFM's mod-10, CNP
10→1, EGN, EMŠO, JP/KR/TH), two-phase retry schemes that give a second
chance (KZ IIN, NZ IRD, LT), mod-10 checks with even weights where delta 5
aliases (Taiwan), multi-century acceptance (Belgian RRN, ~1/97 escape), and
transforms with aliasing factors (Turkish VKN's 2^k mod 9).

Asserting hard mutation on a folded scheme is asserting something the
identifier's designers never promised; the suites document the exact fold
instead. Property runs discovered every one of these — the policy is
empirical, not assumed.

Code: the `hardMutationProperty` / fold-documented helpers in
`packages/core/test/detectors-natid-*.test.ts`.

## Status after M2

Stage 1 is complete: 113 registered detectors — 57 NATIONAL_ID and 19
TAX_ID schemes across 47 countries, the 27-state EU VAT table, 8 crypto
chains, and 28 detectors across contact/financial/secrets/documents/
location — on the registry/runner infrastructure, with the shared checksum
library (Luhn, Verhoeff, mod-97, ISO 7064, ABA, ICAO 9303, weighted-mod
core) and pure-TS crypto primitives (SHA-256, Keccak-256, base58check,
bech32/bech32m, Monero base58) each pinned to published vectors.

Deliberately structural-only (no verifiable public checksum exists; each
detector states it): IN PAN, QA QID, DK CPR (check abolished 2007), MX RFC,
PK CNIC, BD NID, MY MyKad, ID NIK, VN CCCD, PH PCN, EG National ID, US
SSN/ITIN/EIN, GB NINO, UK sort code, AU BSB, CA transit, SWIFT BIC's
all-letter form, ETH uncased addresses, SOL, ADA Byron, DOT SS58 (D9),
drivers' licences, and the labeled forms (AR/PE DNI, NG NIN, KE ID, MA
CNIE). Awaiting Stage 3 (M7): GENERIC_SECRET, POSTAL_CODE and
STREET_ADDRESS are runner-capped at LOW. Awaiting M3: the eval corpus,
measured precision/recall, and the GENERIC_SECRET entropy threshold tuning.

## Status after M3

The eval harness exists and has produced the first honest baseline
(packages/eval/reports/baseline.md, seeds pinned): 2,618 documents, 5,338
ground-truth entities. Headline Stage-1-alone results: checksummed types are
excellent (IBAN, VAT, JWT, PEM, MRZ, PHONE, VIN, crypto at 98-100%
precision, ~100% recall); the honest weak tier is exactly the predicted
one - GENERIC_SECRET 3% and POSTAL_CODE 6% precision (context-awaiting,
runner-capped at LOW: the LOW confidence bucket measures 9.6% precision vs
85.3% at HIGH and 100% at MAXIMUM, so the cap machinery does its job),
NATIONAL_ID 67% / TAX_ID 55% (cross-scheme digit collisions),
URL_WITH_CREDENTIALS 38% and EMAIL 81% (overlap shadowing: connection
strings re-detected as EMAIL/URL over the same span). Latency p50 0.14ms,
p99 1.05ms per document.

Known issues recorded for later milestones, deliberately NOT patched to
improve these numbers: overlap shadowing and cross-scheme collisions are
Stage 4 overlap-resolution work (M8); context-free FP floods are Stage 3
(M7); POSTAL_CODE's 72% recall traces to its comma fragment-guard
suppressing values inside CSV fields, which document-type awareness (M7)
addresses. Regression floors in packages/eval/gates.config.json sit below
the measured baseline and fail the build on regression; raising a floor
after a genuine improvement is the intended workflow.

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
