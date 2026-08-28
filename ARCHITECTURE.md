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

### D11 — Vault plaintext containment is enforced by shape (M4)

SPEC.md: no vault method exposes the full plaintext set except the egress
guard. TypeScript cannot verify a caller's identity, so the design makes
misuse structurally visible instead: the ONLY bulk accessor is
`createEgressAuditor()`, a loudly-named capability factory whose sole
intended consumer is `guardEgress`; `replacements()` carries no originals;
no iteration API exists; and a test pins the class's public surface by
name, so adding a method is a reviewable event, not an accident. The leak
REPORT itself carries vault ids and types only — reports get logged and
displayed and must never become a second leak (also pinned by test).

Code: `packages/core/src/mask/vault.ts`, `mask/egressGuard.ts`;
`test/vault.test.ts`, `test/egressGuard.test.ts`.

### D12 — Surrogate policy: generators as the source, and its edges (M4)

Surrogates reuse the M2/M3 generators, so a surrogate for a checksummed
type is itself checksum-valid — masked text re-validates under Stage 1 as
the same entity type (pinned by test), which is what "format-preserving"
means here. Same country (IBAN), issuer (card), scheme (national id), and
chain (crypto) are honored via detector metadata. Judgement calls:

- **"Clearly non-functional" secrets are satisfied by randomness** — a JWT
  with a random signature authenticates nothing — not by a visible marker.
  Swapping to visibly-marked dummies later is a pool change only.
- **PERSON/ORG/LOCATION pools** are small, hand-picked, script-grouped
  starters (family-first order for Han/Kana/Hangul), enough for the M4
  contract; M6/M7's NER-and-gazetteer work replaces them.
- **DATE_OF_BIRTH has no surrogate strategy yet** — an ordering-preserving
  date shift needs a session-scoped offset and interacts with ages in
  surrounding text. It takes the recorded bracket-token fallback.
- **Overlap resolution in the masker is a pre-fusion stopgap** (confidence
  desc, span length desc, detector id) purely so masking is well-defined;
  Stage 4 (M8) owns real resolution. Similarly, the masker ships its own
  `MaskResult` typed over `Stage1Candidate` rather than mislabeling raw
  confidences as the calibrated `DetectedEntity` M1's types envisioned;
  M8 reconciles.
- **Masker and guard share one comparison space.** The M4 integration
  property found a phone surrogate that WAS the original number in
  different formatting (small pool; the literal-string collision check
  passed) — so the masked text failed its own egress guard. The collision
  check now rejects any surrogate containing one of the document's
  sensitive values under the guard's own comparisons (exported
  `comparisonForm` / `separatorFree`: normalized case-folded substring,
  and the ≥6-char separator-free canonical pass). One comparison space,
  used by both sides, is the invariant that keeps masked text guaranteed
  to pass the guard.

Code: `packages/core/src/mask/surrogates.ts`, `mask/surrogatePools.ts`,
`mask/masker.ts`; `test/masker.test.ts`, `test/mask-integration.test.ts`.

### D13 — Restoration: holdback, boundaries, and the exactly-one rule (M4)

The restorer works on ACCUMULATED text and holds back any buffer suffix
that is (a) a proper prefix of a known surrogate, or (b) with fuzzy
enabled, a trailing unterminated token — released on whitespace or
`finish()` — because a token mid-stream may still be growing. Exact
replacement is longest-match with word-boundary semantics on
word-character edges: without it a short surrogate ('Cat') corrupts
ordinary words ('Catalog'), a bug this milestone's own tests caught. The
fuzzy pass restores a settled token only when EXACTLY ONE original is
reachable under case-fold plus possessive/plural stripping; zero or two
reachable originals leave the token as the model wrote it (SPEC.md's hard
rule), and a stripped affix is re-attached to the original unless the
original already ends with the same letters (avoiding 'Holdingss').
Cross-script "translation" of a surrogate is deliberately not attempted —
an untranslatable mention stays visible rather than being guessed at.
Idempotency is structural (rendered text is never revisited) and semantic
(collision safety guarantees no original contains a surrogate).

Code: `packages/core/src/mask/restorer.ts`; `test/restorer.test.ts`.

### D14 — The playground: rendering decisions (M5)

**Vanilla TypeScript + Vite, no framework.** SPEC.md's tooling list names
Vite/Vitest/ESLint/Prettier and no UI framework; the app is two panes and
a rail, and the extension's security rule — no innerHTML with untrusted
content, construct nodes programmatically — is adopted wholesale (the
`el()` helper renders strings as Text nodes only, so user and corpus text
can never be parsed as markup). Fonts are bundled via @fontsource; the
built page requests nothing from any other origin, verified against the
production bundle's CSS/JS.

**Live, debounced detection.** M3 measured Stage 0+1 at p50 0.14 ms /
p99 1.05 ms per document — orders of magnitude under a keystroke — so
detection re-runs 180 ms after typing pauses. The visible glyph layer is
NOT debounced: the textarea's text is transparent and the backdrop clone
behind it carries the visible glyphs, so every input event mirrors plain
text into the backdrop synchronously and only the highlight marks wait
for analysis (the review property that found this: with a debounced-only
backdrop, the visible text freezes while the user types). The mirror also
runs during IME composition; analysis waits for compositionend.

**Textarea + backdrop clone, not contenteditable.** A native textarea
keeps undo, IME, paste, and selection semantics for free;
contenteditable requires caret management under programmatic re-render.
The cost is layout-identity discipline: both layers share one metrics
class, `scrollbar-gutter: stable` keeps wrap widths equal when the
scrollbar appears, `dir=auto` on both layers resolves the same base
direction for RTL, and scroll positions re-sync after every render.
Hover hit-testing uses `document.elementsFromPoint`, which sees through
the transparent textarea to the marks beneath it.

**Display set === mask set.** The input pane highlights exactly what
masking used: `resolveForDisplay` seeds from core's `resolveForMasking`
(the same function `maskOriginal` calls) and only adds non-sensitive
test-value candidates that fit without overlap — so the two panes cannot
disagree about what was masked. Output rendering rebuilds the masked text
from segments, and a test pins joined-segments === maskedText.

**Examples are generated, not written.** `buildExamples()` runs the M3
corpus generator client-side at startup with a pinned seed and selects by
criteria (language sets × doc types) for script/document breadth — the
curation is code, the content is the generator's, and the examples can
never drift from what the eval corpus actually produces. Masking every
sensitive candidate regardless of confidence tier is deliberate: that IS
Stage 1 alone, the milestone's fixed sensitivity; thresholds arrive with
M8 calibration.

**Fail-closed, demonstrated.** A pipeline error blocks the OUTPUT pane
with an alert; the user's own text stays visible in the input pane —
fail-closed guards what leaves, not what the user sees.

Code: `packages/web/src/`; `packages/web/test/`.

### D15 — Scope amendment after M5: seven standing goals (SPEC.md change)

Ratified as project direction between M5 and M6, amended into SPEC.md in
one dedicated commit. The goals, why each was chosen, and how they stack:

1. **Rigor as a visible artifact (BENCHMARKS.md, from M6).** The
   project's core claim is measured accuracy; numbers in a README table
   cannot be audited, a methodology document can. Written at M6 and
   extended at M7/M8 because those stages change the numbers — a
   benchmark frozen at model selection would misrepresent the shipped
   pipeline.
2. **Core as a publishable library (M12).** The API discipline starts
   NOW — no extension/playground concepts in core's exports, breaking
   changes deliberate, every export documented — because M9–M11 wire
   the extension deep into core, and retrofitting a public API after
   that means either churning the shipped extension or freezing a bad
   API. Publication itself waits for post-launch: the shipped extension
   is the proof the API works, and before launch the API must stay free
   to change with M6–M8 findings. Acceptance is behavioral: a developer
   who has never seen the repo installs and runs detection/masking from
   the docs alone.
3. **Exposure score (M8).** Waits for Stage 4 calibration for the same
   honesty reason M3 refused to label raw confidence as calibration: a
   score aggregated over uncalibrated confidences is a number that
   means nothing, shown as if it meant something. Two binding design
   constraints are acceptance criteria, not aspirations: EXPLAINABLE BY
   CONSTRUCTION (deterministic aggregation; the report decomposes the
   total into named contributions) and the MONOTONICITY property test
   (adding a detected entity never lowers the score, removing one never
   raises it). Severity weights are a reviewed data file in
   packages/data with per-category rationale — weights are editorial
   judgements that need review and history, not constants buried in
   code.
4. **Paste guard (M9).** Warning moves to paste time, before the user
   ever reaches send; submit remains the single enforcement gate and
   fail-closed rules are untouched. Layered warning, one gate.
5. **Quick Redact (M10).** The popup becomes a universal masking
   surface for ANY destination with zero added host permissions — the
   product becomes useful everywhere without touching the
   exactly-three-sites trust claim. The playground (D14) is its
   reference implementation: the UI is reused, not reinvented.
6. **Local Insights (M10).** Values-free counts by category over time.
   The no-plaintext-persistence rule is satisfied by construction —
   counts are not values — and the purpose is retention-honest: silent
   protection does not sustain daily use; visible protection does.
7. **Explicit non-goals.** Two tiers, recorded so future feature
   pressure cannot silently relitigate them. Attachment scanning and
   additional chat sites are ROADMAP (revisitable by deliberate
   decision — the first is heavy and fragile today, the second is
   already served by Quick Redact without permission growth). Vault
   export and any cloud component are REJECTED PERMANENTLY because each
   contradicts a foundational claim: an unmask file is itself a secret
   (memory-only is the feature), and any cloud component breaks the
   zero-network claim the whole product stands on.

How they stack: (1) hardens the measurement backbone everything else is
judged against; (2) constrains API shape from M6 onward; (3) builds on
M8 calibration; (4)–(6) are extension surfaces consuming the same core;
(7) fences the boundary around all of it.

### D16 — Stage 2 model selection: XLM-R base, quantized (M6)

**Decision:** Stage 2 ships `jiting/xlm-roberta-base-ner-hrl_onnx` at q8,
pinned to revision `478a2a3e99ef680e4a107c80a7d0c59d51f185ae` (afl-3.0,
ONNX conversion of `Davlan/xlm-roberta-base-ner-hrl`). Full matrix,
methodology, and per-language numbers: BENCHMARKS.md.

**Why this model.** Five candidates, fourteen runs, 1,500 documents per
run (823 planted PERSON/ORG/LOCATION spans across 25 languages). XLM-R
base q8 took the best macro F1 (87.8) with the highest per-language
floor — no language under 80 F1 — at p50 30 ms/doc on CPU. The two
findings that decided it against intuition: **larger lost** (XLM-R large
scored 86.7 macro at 2.8× the latency and 2× the size — its best-in-matrix
ORG was outweighed by a LOCATION precision collapse), and **the
English-only fine-tune collapsed** (61.3 macro despite the same large
backbone), proving the fine-tune's language coverage matters more than
backbone size. DistilBERT's 143 MB saving cost 26 macro-F1 points — not a
trade a privacy tool can make.

**Quantization evidence.** q8 vs fp32 measured on all three architectures
with both variants available: macro deltas +0.9, +0.3, +1.5 — all in q8's
favor, per-type deltas mixed in sign and within noise. SPEC's "only
quantize if the loss is negligible" is satisfied with margin: 279 MB
ships instead of 1,110 MB. fp16 was ruled out on runtime grounds, not
quality: every fp16 model failed to load on onnxruntime's CPU execution
provider (two distinct failure classes, recorded verbatim in
BENCHMARKS.md), so the unquantized comparison ran at fp32.

**Bundling and integrity.** HF revisions are content-addressed commits,
so the pinned revision fixes the exact model bytes; build tooling fetches
into a gitignored cache (`.hf-cache/`) and production consumers load only
from the bundled copy — `allowRemoteModels` defaults to false in the
classifier, keeping the zero-network non-negotiable structural rather
than procedural. The ~296 MB payload (model + tokenizer) is the largest
asset in the extension; the only hard ceiling is the Chrome Web Store's
2 GB package limit, which it clears with wide margin. Hosting the model
in a Web Worker is deliberately the consumer's job (M9): core stays
environment-agnostic, same rule as every stage before it.

### D17 — Stage 2 integration: injected classifier, alignment, chunking (M6)

**Injected classifier.** Core's NER logic (`packages/core/src/ner/`)
depends on a three-member `TokenClassifier` interface — id, window size,
`classify(text)` — not on Transformers.js. The ONNX-backed implementation
lives behind the dedicated `@privacyshield/core/ner-transformers` subpath
export, so consumers that never run Stage 2 never load the ONNX runtime,
and alignment/decoding/chunking/engine logic is tested against a
deterministic mock without model weights. This is also what keeps the
vitest suite model-free: the unit-test path exercises everything except
the weights themselves, and the Stage-2-inclusive accuracy gate lives in
the eval CLI's `--ner` run (gates.config.json `nerPerType`), not vitest.

**Alignment.** The token-classification pipeline returns pieces with no
character offsets, so `alignPieces` reconstructs them: greedy
left-to-right matching with a bounded search window, whitespace skipping,
and explicit refusal of far jumps; `[UNK]`/`<unk>` pieces are bridged
only between located neighbors, and entities whose pieces all failed to
locate are dropped rather than guessed. Correctness is pinned by tests
across the nine scripts M1 handles (Latin+diacritics, Cyrillic, Arabic
and Hebrew RTL, Han, Kana, Hangul, Devanagari, Thai) and through Stage
0's NFKC expansions and invisible-stripping, because a misaligned span
redacts the wrong text — the same offset-map stakes as M1.

**Chunking.** Transformers.js silently truncates past 512 tokens — no
error, text simply unscanned, which is a silent fail-open. Stage 2
therefore chunks at a character budget (400 chars: 512 tokens at the
worst-case one-token-per-char CJK ratio, with headroom) with 96-char
overlap and whitespace-preferring cut points; each chunk owns a core
region (overlap midpoints) and only core-owned entities are emitted, so
chunk boundaries neither drop nor duplicate entities. The engine wraps
the whole run in a hard deadline (`DetectionTimeoutError` → fail closed,
default 2 s) and warms the model once at init.

**IOB decoding.** XLM-R CoNLL-style fine-tunes emit IOB1 in practice —
entities open with `I-` — so the decoder treats both `B-X` and
`I-X`-after-non-X as entity starts, handling IOB1 and IOB2 without a
scheme flag. Entity confidence is the minimum piece score (the weakest
link, honest about uncertainty), surfaced as `rawConfidence` — raw model
softmax, explicitly uncalibrated until M8, the same honesty rule M3 set
for Stage 1.

**Corpus ground truth (deviation, recorded).** M6's instruction assumed
M3's corpus already carried PERSON/ORG/LOCATION labels; it did not — M3
planted only Stage 1 identifier types. Rather than build a separate NER
corpus (explicitly ruled out), the M3 generator was extended: 25-language
name/org/location banks in native scripts, carrier templates, and
planting wired into the existing document kinds, with the NER value
stream forked off the document seed (`seed ^ 0x4e4552`) so Stage 1
value draws stay byte-identical per seed and all M3 baselines remain
comparable.

### D18 — Suppression is reviewed adversarially before it ships (M7)

**The rule.** No Stage 3 suppression rule is wired into the pipeline
until someone has tried to break it by constructing a REAL sensitive
value the rule wrongly suppresses, and EXECUTED that case against the
rule. A suppressed candidate is never sent to the review UI and never
masked, so a wrong suppression is a silent leak — the worst failure
this product has. False positives are visible and annoying; a wrong
suppression is invisible and harmful, and the asymmetry justifies the
extra process.

**Why executed cases, not reasoning.** Reasoning about these rules is
unreliable in a specific, repeatable way: they scan raw characters, and
the spans they receive come from detectors whose exact boundaries are
easy to misremember. The `uri-authority` finding below is the proof —
by inspection the rule looked unsafe, and by execution it turned out
safe for the wrong reason. Neither conclusion was reachable without
running it.

**What the first review found.** Three fail-open defects, each executed
before and after the fix, each now pinned by a regression test in
`context-negative-rules.test.ts`. Every fix TIGHTENS its rule rather
than removing it: each rule exists to kill a large measured error
class, and all four of those classes still suppress correctly
afterwards.

1. **`bracketed-numeric-range` suppressed hyphenated national
   identifiers.** Running `Borger (010101-1234) er registreret.`
   showed a correctly detected Danish CPR number being suppressed;
   Korean RRN (`901010-1234567`) and Swedish personnummer behave the
   same. A hyphenated digit pair *is* the written form of several
   national identifiers, so shape alone cannot separate one from a
   reference interval. The fix adds the evidence that actually makes an
   interval an interval: both sides at most four digits (identifier
   groups are longer), an ascending range, and a measured quantity
   before the bracket. A US SSN was already safe — it carries two
   hyphens, not one — which is luck, not design, and is now pinned.

2. **`uri-authority` was safe only by accident.** Its stated argument
   was that a suppressed address stays protected because another
   detector reports the whole URI. Measuring that claim rather than
   trusting it showed it is FALSE for a userinfo URI with no password:
   for `https://john.doe@example.com`, EMAIL is the only detector that
   fires, because the credentialled-URL and connection-string detectors
   both require a `user:pass@` form. Suppressing there would report the
   document clean. It did not leak in practice only because the EMAIL
   detector's span includes the leading `//`, which falls outside the
   authority and made the rule miss. A span defect in another module is
   not a safety argument — it could be fixed tomorrow, correctly, and
   silently open the leak. EMAIL is now yielded only when a password
   component is present, which is exactly the condition under which the
   other detectors fire.

3. **`version-number` suppressed dot-formatted tax identifiers.** A
   dotted German Steuer-ID was suppressed on shape alone. Several
   national and tax identifiers are written as dot-separated digit
   groups, so the shape is genuinely ambiguous. The fix requires the
   LINE to carry version vocabulary — the corpus's version negatives
   read "Upgraded … from v1.5.3 to 3.12.7-rc.2 in build …" and are
   saturated with it, while an identifier line carries none.

**What rounds two and three found.** Six adversarial reviewers ran 562
executed inputs in total. The first round's fixes were not enough, and
the pattern in what they missed is the useful part:

4. **A suppression window ran past its own boundary.** `uri-authority`
   scanned until a delimiter it happened to list, so any separator that
   was not `/`, `?` or `#` let the "authority" swallow the rest of the
   line — a pipe-delimited log line, a semicolon-delimited CSV, a JDBC
   URL with parameters, a markdown table row. A valid SSN, TC Kimlik
   number and tax identifier were each suppressed as "part of the
   authority". It now scans only the RFC 3986 authority character class.
5. **A guard keyed on type instead of position.** Round one required a
   password component only for EMAIL, which left the identical hole
   open for every other type: a TC Kimlik number used as a bare
   userinfo username was suppressed with nothing else reporting it. The
   requirement is now keyed on POSITION — anything in the userinfo
   region needs a password, whatever its type.
6. **A marker meant something else entirely.** `phone-run-interior`
   read any leading `+` as a dialling prefix. In a git diff or a
   markdown bullet the `+` is a line marker, so a Luhn-valid Amex PAN,
   an SSN, a routing number and an NPI on added lines were all
   suppressed. Three conditions now: the `+` must be immediately
   followed by a digit; the run must be a single field (a tab or two
   or more spaces is a column boundary — that is how a German postal
   code beside a phone column was lost); and the candidate must be
   genuinely INTERIOR, because if it accounts for every digit in the
   run then the rule's own claim is false.
7. **"Somewhere on the line" is not evidence.** `version-number` was
   the most dangerous rule of the five, because many national
   identifiers are printed as dot-separated digit groups. Line-level
   vocabulary let the words "Updated", "release", "beta", the `v.` of
   a legal citation, and a fentanyl "patch" suppress an Argentine DNI,
   a Swiss AHV number and a patient chart number. Its pattern also
   accepted two dotted components while its own risk text claimed
   three, so an NPI followed by a decimal amount read as a version.
   Rebuilt on four conditions, of which two generalize: evidence must
   be ADJACENT, not merely present; and a candidate claimed WHOLE by a
   validating detector is not this rule's to overrule.
8. **A dotted token is not a host name.** `host-port` suppressed real
   postal codes in grep output (`customers.csv:10001`), dotted property
   paths (`kunde.adresse.plz:10115`) and colon-delimited exports. The
   whitespace-delimited token must now be exactly `host:port`, the TLD
   must be plausible, and zero-padded values are rejected — a written
   port is never zero-padded, while short postal codes are by
   definition.

**Two lessons worth keeping.** First, every one of these rules was
plausible when written and wrong in a way only execution exposed —
which is why D18 requires executed counterexamples rather than review.
Second, the recurring defect is *evidence that is too loose about
scope*: a line instead of an adjacency, a type instead of a position, a
prefix character instead of a parse. When tightening a suppression
rule, the question to ask is not "is this signal related?" but "does
this signal actually bind to THIS span?"

**The standing consequence.** `NegativeRule.risk` is a required field
holding prose, not an optional note, and a test asserts every rule
states both its principle and its risk. A suppression rule whose author
cannot name what it might wrongly suppress has not been thought
through.

**Five standing measurement rules now sit together, each earned the
hard way.** They are stated as one block because they fail in the same
direction — a check that looks like it passed when it never ran:

1. **Executed counterexamples** (D18, M7). No suppression rule ships
   until someone has CONSTRUCTED and EXECUTED a real sensitive value it
   wrongly suppresses. Reasoning about these rules is unreliable: the
   `uri-authority` case looked unsafe by inspection and turned out safe
   for the wrong reason, which neither conclusion reached without
   running it.
2. **A measurement far better than its target is a defect report about
   the measurement** (M7, the gazetteer). A Bloom filter sized for 0.1%
   measured 0.000%; the probe's PRNG had lost precision above 2^53 and
   generated 1,731 distinct tokens from 20,000 draws. Suspiciously good
   numbers get audited before they get published.
3. **A clean tree means nothing until every background job has exited**
   (M8). A commit landed while a backgrounded eval was still running, so
   the report artifacts that job rewrote were left uncommitted while the
   tree was reported clean. Verify tree state after the last job exits,
   not after the commit lands.
4. **Verification code gets the same scrutiny as production code**
   (M8). Every measurement defect found so far has lived in code that
   checks other code: the Bloom probe's LCG that lost precision above
   2^53, the scratch audit's per-detector else-if chain, a test that
   compared against a constant-0.5 model while claiming to compare
   against raw scores, and a false-positive probe that counted
   non-sensitive candidates the scorer excludes. A test that cannot fail
   is worse than no test, because it reports success. The practical form
   of this rule: a probe must reproduce a number some independent path
   already produces before its novel numbers are believed.
5. **An exemption must be scoped to the CHECK it excuses, not to the
   DETECTOR that earned it** (M8, span hygiene). A PEM block and an MRZ
   are legitimately multi-line, so both were exempted from the
   line-crossing check — but a scratch audit written as an else-if chain
   attributed each span to the first check it failed, so 48 MRZ spans
   carrying a leading newline were absorbed into the exempt bucket and
   never tested for whitespace. The gate found them because it evaluates
   every check independently and exempts per check. An exemption granted
   at detector granularity silently excuses defects that have nothing to
   do with the reason it was granted.

**Known and deliberately not fixed here.** The rules scan ASCII digits,
so they neither fire nor leak on Arabic-Indic (٠١٢٣) or Devanagari
digits. That is a fail-to-fire, not a leak, and the correct fix is
upstream — a decimal-digit folding transform in Stage 0 — rather than
widening suppression rules into scripts where they are least tested.
Recorded for M8 rather than patched here.

**A second, quieter consequence.** Once GENERIC_SECRET requires an
assignment signal to be emitted at all (D19), every key/value form
`structure.ts` fails to recognise becomes a dropped real secret. Its
coverage gaps are therefore fail-open too, and are reviewed on the same
terms as the suppression rules rather than as mere missing features.

### D19 — GENERIC_SECRET: context is required, overlap defers to M8 (M7)

**The rule as shipped.** A GENERIC_SECRET candidate with no assignment
signal and no matching trigger is suppressed — SPEC.md requires "a
Shannon entropy threshold AND an assignment-context signal", and the
conjunction is the point. One exception: if another detector's positive
identification already covers the span, the candidate is left alone.
Suppressing it there would not be Stage 3 removing a false positive —
the characters are sensitive and another detector says so — it would be
Stage 3 pre-empting the cross-type overlap resolution that SPEC.md
assigns to Stage 4.

That overlap check is a deliberate, narrow exception to Stage 3's rule
that a negative rule cannot see other candidates (D18). It is safe in a
specific direction: the signal can only PREVENT a suppression, never
cause one, so reading the pre-suppression candidate set is conservative
— a candidate that is itself suppressed later can only have made us keep
more, never less.

**The measured result, which is not good.** On the standing corpus:

| | precision | recall | false positives |
| --- | ---: | ---: | ---: |
| Stage 1 baseline | 3.1% | 100% | 2236 |
| Stage 3, suppress on missing context | 3.8% | 56.9% | 1046 |
| Stage 3, with overlap deferral (first measurement) | 1.8% | 56.9% | 2230 |
| **Stage 3, shipped — current** | **1.9%** | **56.9%** | **2130** |

The 1.8%/2230 row was measured before the M7 error-taxonomy rules landed;
`data-uri-payload` then removed 100 base64-blob false positives. **1.9%
precision, 56.9% recall, 2130 false positives is the current figure** and the
one BENCHMARKS.md publishes. The earlier row is kept only so the two numbers
in circulation reconcile.

The deferral gives back the false positives it should — those are
overlap-explained and M8's to resolve — but recovers no recall, and
residual precision therefore sits BELOW the Stage 1 baseline.

**The failure mode, diagnosed rather than assumed.** Every suppressed
true positive has no overlapping detection at all, so the exception
cannot reach it. They are secrets introduced by LABELING LANGUAGE in
prose, across languages — three real examples from the corpus:

- `У справі вказано <secret> як ідентифікатор` (uk, "as identifier")
- `档案中登记的识别号是 <secret>` (zh, "the identification number on file is")
- `Asiakirjoissa tunnisteena on <secret>` (fi, "as identifier in the documents")

None is an assignment, and none matches an API_KEY trigger, so SPEC's
conjunction excludes them by construction.

**Why this is deferred and not fixed here.** The obvious repair — letting
a labeling phrase ("identifier", "reference", "token") count as context
— would reopen the correlation-identifier false-positive class the
suppression review had just closed: request id, trace id, span id and
idempotency key are introduced by exactly that language and are not
secrets. Stage 3 can only make a binary suppress-or-allow call, so it
cannot price that trade. Stage 4 can: fusion and calibration weigh
evidence rather than gating on it, which is the right machinery for a
signal that is genuine but weak.

**Status: REOPENED AT M8.** This was open M8/M9 scope at M7 and the
milestone carried a do-not-reopen note, which has now expired by design:
the overlap deferral parked JWT segments, API keys and crypto wallets for
Stage 4 explicitly, and the prose-labeled-secret recall gap was deferred to
fusion precisely because fusion weighs evidence instead of making the binary
suppress-or-allow call Stage 3 is limited to. Both are M8's to resolve.
Nothing here was accepted as final.
These numbers are published in BENCHMARKS.md with the same caveat, so
nothing downstream can read the current figure as a settled result.

### D20 — Stage 2b ships as membership filters; Stage 2c was built, measured, and removed (M7)

**Stage 2b: Bloom filters, not name lists.** The gazetteers hold
1.41 M entries — 762,502 person names, 342,031 organisations, 308,524
places — and ship as Bloom filters at 3.2 MB. SPEC.md asks for
"compressed sets or a succinct data structure", and two things argued
for the filter over a list. Size is the obvious one: the same entries
are roughly 12 MB as plaintext. The other is a data-protection
argument that needs stating in explicit terms, because it is easy to
wave past: a gazetteer of people's names IS personal data about
identifiable living people. CC0 and CC BY are COPYRIGHT instruments.
They waive copyright and database rights; they do not, and cannot,
waive a data subject's rights, and they grant this project no
permission to redistribute personal data merely because the upstream
licence is permissive. Those are different bodies of law, and a
permissive licence answers only one of them.

Membership testing is the only capability Stage 2b needs. A filter
answers "is this a known name?" without redistributing a list of who
those people are: the artifact is a bit array from which the source
names cannot be enumerated, so the project ships the capability without
shipping the personal data. That is the reason to prefer it even where
size would not force the choice.

The trade is a bounded false-positive rate and NO false negatives. That
asymmetry fits the weight SPEC.md assigns the evidence — "gazetteer hit
alone is medium confidence" — because a hit is corroboration while a
miss is conclusive.

Parameters, since "0.1%" should be checkable rather than trusted: 14.38
bits per entry and k=10 probes, which imply 0.1000%. Measured 0.1000%
(PERSON), 0.1040% (LOCATION) and 0.0875% (ORG) over 200,000 distinct
random tokens. The filters are sized AT their target, not over it, so
there is no over-provisioning cost to reclaim.

An earlier revision of this document published 0.000%, which was a
BROKEN MEASUREMENT and not a good result. The probe used a textbook LCG
whose multiply, `seed * 1103515245`, exceeds 2^53 and silently loses
precision in double arithmetic; it produced 1,731 distinct tokens from
20,000 draws, so it re-probed the same handful of strings and found
nothing. At 0.1% those few distinct probes predict about 1.7 hits, so
zero was unremarkable noise rather than evidence of anything. The
lesson generalizes past this filter: a measurement far BETTER than its
design target is a defect report about the measurement, and the repo's
seeded work uses mulberry32 for exactly this reason. The regression
test now asserts the probe's own distinctness before it asserts a
rate.

Sources were restricted to the two the licensing review verified from
primary sources: Wikidata (CC0) for names, brands and businesses, and
GeoNames (CC BY 4.0) for places, whose attribution is in
THIRD_PARTY_NOTICES.md. ParaNames was rejected despite being the
convenient pre-typed option, because its data licence is stated
inconsistently across its repository, its paper and its README, and
"probably fine because the upstream is CC0" is a legal conclusion this
project should not be asserting. GeoNames `cities500` was rejected on
precision grounds: small-town names collide massively with common words
and surnames.

One coverage bug came out of probing rather than assuming: a
three-character minimum silently dropped most Chinese and Japanese city
names, because a CJK place name is routinely two characters and is a
whole word. Known remaining gap, recorded rather than hidden: consumer
brands such as Photoshop and Coca-Cola still miss, because Wikidata
files them under classes other than the two queried.

**Stage 2c: removed, on its own measurement.** SPEC.md specifies a
verification pass over an ambiguous confidence band and then says
plainly: "If the eval shows it does not improve results, remove it and
document why." It was built and measured, and it does not.

The method was chosen by elimination. A second bundled model was
rejected because M6 measured the runner-up as WORSE overall at 2.8× the
latency, so a disagreement between the two would carry little
information. The gazetteer was rejected because Stage 3 already consumes
it, so re-using it would double-count one piece of evidence rather than
add one. What remained was genuinely independent: re-inference over a
recentred context window. A transformer's prediction is a function of
surrounding tokens, and Stage 2 necessarily sees each span at an
arbitrary position inside a 400-character chunk, so re-asking with the
span centred tests whether the original prediction depended on chunk
placement.

Measured over 861 documents, verification on versus off:

| | PERSON | ORG | LOCATION |
| --- | ---: | ---: | ---: |
| precision, off → on | 99.0% → 99.0% | 80.2% → 80.2% | 55.3% → 55.3% |
| false positives, off → on | 3 → 3 | 22 → 22 | 55 → 55 |

Identical, to the candidate. 1.28% of candidates entered the band (45 of
3,505; 39 confirmed, 6 refuted) at a cost of +10.5% wall-clock.

**Why it changed nothing, which is the part worth keeping.** Stage 2c
only ADJUSTS confidence; it never suppresses. The eval scores every
emitted prediction regardless of confidence, so a pure confidence
adjustment is invisible to it by construction. The stage is therefore
not measurable until Stage 4 applies profile thresholds and confidence
starts deciding what is emitted.

Two options were rejected before removing it. Keeping it off by default
would leave unmeasured machinery in the pipeline, which is the thing
SPEC's rule exists to prevent. Letting it SUPPRESS on refutation would
make it measurable, but that turns it into a suppression rule, and D18
requires every one of those to survive constructed, executed
counterexamples — a disproportionate risk for the six refutations it
found. So it is removed, and reinstating it at M8 should be a deliberate
decision made against a thresholded eval, not a default.

### D21 — Decimal digits fold to ASCII in Stage 0, and it runs last (M8)

**The failure.** NFKC folds FULLWIDTH digits, because those are
compatibility variants of ASCII. It leaves Arabic-Indic, Extended
Arabic-Indic, Devanagari, Bengali and Thai digits alone, and that is
CORRECT — they are the ordinary digits of living scripts, not variants
of anything. But every Stage 1 detector matches `\d`, so the pipeline
inherited a hole nobody had written down: an identifier in native digits
matched nothing.

Measured before fixing, because "probably broken" is not a finding: a
Turkish national identity number in Arabic-Indic digits, an Iranian
phone number, a Hindi Aadhaar number, a Thai national ID and a Bengali
credit card ALL returned no detections at all. Not low confidence —
nothing. That is the same class as an identifier hidden inside `<td>`
markup, and it landed on precisely the users the 32-language trigger
work exists to serve.

**Why it ran last in the pipeline.** After homoglyph folding, not
before, and this is the non-obvious part. Folding digits changes a
token's SCRIPT CENSUS: Arabic-Indic digits are Arabic, ASCII digits are
not. Folding them earlier would silently alter the dominant-script
calculation that homoglyph folding depends on, and could flip a fold
that D3 deliberately declines to make on a tie. Running afterwards
leaves that decision on the original scripts. ASCII digits are
NFKC-stable, so unlike homoglyph folding this owes no second NFKC pass.

**It is not a 1:1 transform.** Most digit blocks are BMP and fold one
code unit to one, but a few are astral — Osmanya, Brahmi, the
mathematical digits — where a surrogate PAIR folds to a single
character. It therefore goes through `MappedTextBuilder` rather than
assuming equal lengths, the same machinery NFKC's expansions use, and a
test folds an Osmanya run specifically to keep that path honest.

**The user's text is never rewritten.** Folding happens only in the
normalized text; masking edits the ORIGINAL through the offset map, so a
Persian user gets their own digits back. A test asserts that the
mapped-back span contains no ASCII digit at all. That separation is the
entire point of the offset-map contract, and this transform is the
clearest illustration of it so far.

**The corpus had to change too, and that is the more general lesson.**
The class was invisible to the eval, so the failure was UNMEASURABLE
rather than merely unfixed — no metric would have moved if someone had
broken it further. Planted values in the six native-digit languages are
now written in native digits 40% of the time (not 100%: real documents
mix both, and an all-native corpus would stop measuring the ASCII path
in those languages), and a `native-digit-noise` hard-negative category
carries ordinary order numbers, prices and dates in the same scripts.
Without those negatives the corpus would measure the recall the fold
buys and none of the precision it costs.

**Measured, with the shape a correct fix should have:**

| language group | GT spans | recall before | recall after | change |
| --- | ---: | ---: | ---: | ---: |
| native-digit languages | 804 | 66.17% | 99.75% | **+33.58pp** |
| all other languages | 4,425 | 99.44% | 99.44% | +0.00pp |

Large where it should be, exactly zero everywhere else. A fix of this
kind that moved the other row would be a regression in disguise.

**Sequencing.** This landed BEFORE any fusion or calibration work, on
purpose. Everything downstream calibrates against this corpus, and
fitting thresholds and weights while an entire input class was invisible
would have meant refitting all of them afterwards.

### D22 — Overlap resolution orders by COVERAGE first, not specificity (M8)

**What SPEC says, and why it is not implemented literally.** SPEC.md:
"Resolve overlapping candidates: prefer the more specific type, then
higher calibrated confidence, then longer span." Applied in that order
it is unsafe, and the reason is specific to what resolution does.

Resolution DROPS candidates, so D18's discipline applies to it as to any
suppression rule. But it has a failure mode a suppression rule does not:
dropping a WIDE candidate in favour of a narrow one it contains does not
merely relabel a span, it UNMASKS every character outside the narrow one.
Preferring "the more specific type" would take CONNECTION_STRING over the
credentialled URL containing it and leave the scheme, host and port of a
live database URI in the outgoing text.

**The order implemented is therefore: widest span, then specificity,
then confidence.** Coverage is promoted above specificity because it is
the property that cannot be recovered downstream — a mislabelled span is
a cosmetic defect in the review UI, an unmasked one is a leak. Where
spans are equal the two orderings agree, and equal spans are the case
SPEC's wording is really about.

**The specificity table is measured, not intuited.** A census over the
2,600-document corpus found 66.8% of Stage 1 candidates in at least one
cross-type overlap and recorded, for every pair, which type ground truth
agreed with. Three results decided the table:

- CONNECTION_STRING over URL_WITH_CREDENTIALS on equal spans: ground
  truth agreed with the connection string in **140 of 140**. The
  database scheme is the more specific reading of the same characters.
- Any validated type over GENERIC_SECRET: the specific type was right in
  **2,047 of 2,053**. This is the bulk of GENERIC_SECRET's false-positive
  mass, and resolving it here rather than suppressing it in Stage 3 is
  exactly what D19 deferred to this stage.
- NATIONAL_ID and TAX_ID **tie deliberately**. The census found ground
  truth split between them on equal spans (28/10/10 one way, 19/11/11
  the other). No static ordering is honest about a genuine cross-scheme
  ambiguity, so they fall through to calibrated confidence, which is the
  machinery that can actually weigh it.

**A leak the invariant caught, and the lesson in it.** The first
implementation — greedy, widest-span-first — still opened 8 coverage
holes across 6 documents. Every one was a PARTIAL overlap in which the
loser extended past the winner, and every one was a Korean street address
abutting another entity. Widest-wins preserves coverage under
containment and NOT under partial overlap, which is the kind of gap that
looks closed until it is measured. The winner now absorbs the union of
the two spans instead of the loser being dropped.

Widening in both coordinate spaces at once is sound without
re-consulting the offset map: the map is monotonic, so the union of two
mapped spans contains the mapping of the union, and erring wider only
ever masks more. That is the safe direction by construction.

`coverageHoles()` is exported alongside the resolver so the property can
be ASSERTED by callers and tests rather than trusted to follow from the
ordering. Current state: 9,474 candidates resolve to 5,688 with zero
holes.

### D23 — Calibration is isotonic, per type, on splits proved disjoint (M8)

**Method.** Isotonic regression over ten score bins, fitted per entity
type, with pool-adjacent-violators enforcing monotonicity. Chosen over
Platt scaling deliberately: the raw scores are a base confidence plus a
handful of additive Stage 3 contributions, so there is no reason to
expect a logistic shape and a two-parameter family would impose one.
Isotonic is also readable — the model IS a table of empirical precisions,
so "0.8 means 80%" can be checked against the fit rather than inferred
from coefficients.

Per type because the types are not comparable, which the eval's own
header has said since M3: a validated IBAN and a shape-only postal code
carry the same raw score and mean different things. Removing that
non-comparability is the whole job. Types with fewer than 200
observations use a pooled curve instead of fitting noise.

**Monotonicity is the property that matters most**, and it is why
isotonic rather than raw binned precision. A sparse bin can easily show
lower precision than the bin below it; left alone that would mean more
evidence yielding less confidence. It also has a downstream consequence:
the exposure score's required monotonicity property (adding an entity
never lowers the score) cannot hold if the confidence feeding it is not
monotonic in the evidence.

**Different seeds are NOT a disjoint split.** The hard-negative builders
are templated with only a few random fields, so short negatives collide
across seeds — 91 identical documents on the first run, 181 at the size
finally used. Assuming seed independence would have leaked fit documents
into the held-out set and inflated the result. The harness now removes
duplicates by text, prints the count, and asserts zero overlap on every
run. Generalizing: a split is disjoint when it has been CHECKED to be,
not when the construction suggests it should be.

**Two of my own additions were wrong and are recorded because the
failures generalize.** Prediction originally interpolated between step
midpoints to smooth the output — an embellishment with no justification,
which because the steps are coarse where data is sparse systematically
pulled predictions toward the step below and left the model
under-confident through 0.7–0.8. Reverting to the standard piecewise-
constant isotonic prediction improved held-out ECE from 3.90% to 2.63%.
Separately, a test that claimed to compare calibrated against RAW scores
in fact compared against a constant-0.5 model, so it was not measuring
what it named. Both are the same error in different clothes: a step
added for plausibility rather than for a reason.

**Result, held out: expected calibration error 2.63% against 12.33% for
the raw scores.** Honest weakness, published rather than smoothed: the
curve is conservative in the middle, every mid-range bucket running
12–15 points above what it predicts, because 4,755 of 5,416 held-out
observations sit in the top bucket and the mid-range bins have least
data. One bucket is over-confident (30.9% predicted, 16.9% observed, 77
samples), which is the direction that matters and is small but real.

**D19 is discharged by resolution, not by calibration.** GENERIC_SECRET
goes 2.0% → 100% precision with all 2,075 false positives removed,
because 2,047 of 2,053 had a validated type covering the same
characters. That is exactly why Stage 3's binary suppress-or-allow made
precision WORSE at M7 and why the deferral was correct. POSTAL_CODE goes
23.5% → 100%. The remaining GENERIC_SECRET recall gap (55.4%) is
untouched and still open: prose-labeled secrets have no competing
candidate to resolve against, so that half is a detection problem, not
an overlap one.

### D24 — Arbitration is an input to the exposure score, not only a label (M8)

**The coupling, recorded because it is the one most likely to be broken
silently.** Severity weights are per ENTITY TYPE. Overlap resolution
decides which type owns a span. Therefore changing the specificity table
changes which weight applies, which changes the document's exposure
score — a published, user-facing number.

Concretely: a span arbitrated to `CONNECTION_STRING` (secrets, weight
70) rather than `URL_WITH_CREDENTIALS` (also secrets, 70) moves nothing,
but a span arbitrated to `NATIONAL_ID` (government-identity, 100) rather
than `POSTAL_CODE` (location, 25 × 0.8) moves the document's score
substantially. Resolution stopped being a presentation concern the
moment the exposure engine started reading its output.

**This is intended.** The alternative — scoring every candidate before
arbitration — would double-count every overlap, so a single credential
claimed by three detectors would contribute three times and a document
with one secret would read as a document with three. Scoring the
resolved set is the only coherent choice. But it means the specificity
table now has two consumers with different failure modes: get it wrong
and the review UI shows a misleading label, AND the exposure number is
wrong in a way nothing in the UI reveals.

**The practical consequence for a future change:** editing `SPECIFICITY`
in `fuse/resolve.ts` requires re-checking the exposure numbers in
BENCHMARKS.md, not only the per-type precision table. A test cannot
catch this — both outputs would still be internally consistent — so it
is recorded here instead.

**A related scoping correction, made in the same measurement.** The
earlier "zero wrong winners" result was reported without saying what it
covered. Measured across all 2,758 cross-type arbitrations:

| arbitration | count | share | loser was right |
| --- | ---: | ---: | ---: |
| validated beats heuristic | 2,208 | 80.1% | 9 |
| **validated beats validated** | **348** | **12.6%** | **17** |
| heuristic beats validated | 64 | 2.3% | 7 |
| heuristic beats heuristic | 138 | 5.0% | 1 |

The dominant case is near-tautological, exactly as suspected: the corpus
plants a valid identifier, GENERIC_SECRET fires on it as entropy noise,
and the arbiter prefers the validated type — which by construction is
the planted one. The interesting case, validated-versus-validated, is
12.6% of arbitrations and the arbiter gets **17 of them wrong**. The
zero-wrong figure was true only of GENERIC_SECRET and POSTAL_CODE, whose
overlaps are all validated-versus-heuristic. BENCHMARKS.md now scopes it.

**A build-hygiene defect audited in the same pass.** The root `build`
script was `tsc -b`, which does not build the web bundle, so
`npm run build` did not produce what its name implies and a browser check
run after it could test a stale bundle — which is exactly what happened
once during M8 before the screenshot caught it. Now
`tsc -b && npm run build --workspace @privacyshield/web`; `build:ts`
keeps the fast path for `eval` and `bench`, which have no use for the
bundle.

Scope of the doubt, checked rather than assumed: the only earlier
browser-verified claim is M5's, and it reported a measured bundle size
(603 KB / 156 KB gzipped) and described itself as a production-bundle
smoke — both of which require an actual `vite build`. That verification
stands. M11 requires a production build verified loading unpacked in
Chrome, so this sat directly on that path.

### D24a — The exposure scale is pinned by a value snapshot, not only by property tests (M9)

Adopted from a review observation on D24, and agreed with. The exposure
score is assembled from numbers spread across several files — severity
weights and type factors in `packages/data`, the `SPECIFICITY` table in
`fuse/resolve.ts`, the saturation curve in `exposure/index.ts` — each
chosen for a reason local to its own file and each independently
editable.

The failure that motivates it: someone edits `SPECIFICITY` to fix an
overlap-resolution bug. The change is legitimate, well-reasoned, and the
overlap tests pass afterwards. Every document's exposure score moves.
Nothing fails, nobody notices, and the scores users read — and the bands
the review panel colours by — quietly stop meaning what they meant when
they were calibrated.

`exposure.test.ts` pins the engine's PROPERTIES: monotonicity,
decomposition, saturation. Those properties survive a re-anchoring of
the scale intact, which is precisely why they cannot catch this. So
`exposure.snapshot.test.ts` pins the VALUES: eight fixed documents
spanning the range, with their scores and bands recorded verbatim from
the engine, plus an assertion on their relative ordering (to catch a
re-anchoring that preserved magnitudes but scrambled ranks).

A failure here is not necessarily a bug. It means a table edit moved the
published scale, and the required response is to look at the new numbers
and update the snapshot IN THE SAME COMMIT, so the diff shows a one-line
table change beside its effect on every document.

Verified to be capable of failing, per the standing rule that a test
which cannot fail is worse than none: changing the `contact` weight from
45 to 50 breaks two of the eight documents. The snapshot values were
generated by running the engine rather than hand-computed — a
hand-computed expectation would pin arithmetic rather than behaviour.

### D25 — NER stays on the blocking path, and the budget miss is reported (M9)

**Ratified: Stage 2 blocks the send. Making it advisory is rejected and
is not open.**

**Why advisory NER cannot work.** NER is the only detector for an entity
class that has no other detector. Stage 1 validates identifiers by
checksum. The Stage 2b gazetteers cover known names and places — 762,502
person names drawn from Wikidata, which is a list of NOTABLE people.
Neither reaches an ordinary private individual's name, which is the most
common PII in chat prose and the thing this product exists to protect.

The failure mode of an advisory Stage 2 is therefore precisely inverted:
it would block on a famous name the gazetteer already knows and pass the
name of the person actually at risk. A protection whose coverage is
strongest where the need is weakest is not a degraded mode, it is a
misleading one.

It also cannot be made coherent as a mechanism. Results that arrive
after the send has gone mean the data has already left — the report is a
notification of a leak, not a prevention of one. And "send if inference
has not finished" makes the leak a race decided by typing speed, so the
same document leaks or does not depending on how fast the user pressed
Enter. Neither is a fail-closed behaviour, and SPEC's second
non-negotiable does not admit a latency exception.

**What follows from that.** The latency budget is missed on the runtime
that ships, and it is REPORTED rather than resolved — which SPEC line
238 authorizes in terms: "If a larger model improves accuracy but
breaches this, report both numbers and let the measurement drive the
decision rather than assuming." The decision the measurement drives here
is that the miss is accepted, because the alternative is a protection
that fails on the case it exists for.

**Measured, in a real browser on onnxruntime-web** (the Node build has no
WASM execution provider at all, so this could not be measured from Node):
WASM is roughly 2.7× slower than onnxruntime-node. Script-aware window
sizing helps materially but does not close the gap. WebGPU under headless
Edge measured far worse, but that is a measurement of a software
rasterization fallback rather than of WebGPU, and it is re-measured on
the real adapter before any conclusion is drawn from it.

### D25a — The M6 model-selection tiebreak used the wrong runtime (qualification)

Recorded so a future session finds it rather than rediscovering it: the
M6 benchmark that selected `jiting/xlm-roberta-base-ner-hrl_onnx` ran on
onnxruntime-node on native CPU. That is not the runtime the extension
ships, and the WASM measurement above shows the two differ by roughly
2.7×.

**The decision is NOT reopened, for two reasons.** SPEC is explicit that
selection is accuracy-first with latency as a tiebreak — "Do NOT select
on size, and do not use F1-per-megabyte as the criterion" — so
re-selecting on latency would invert its stated priority. And the
per-language F1 numbers published in BENCHMARKS.md were measured against
the selected model; changing it would invalidate them, which is a real
cost against a benefit SPEC declines to rank first.

What the qualification means in practice: the ACCURACY ranking from M6
stands unqualified, because accuracy does not vary with the execution
provider. Only the latency column was measured on the wrong runtime, and
the latency column was only ever the tiebreak. Had it been measured on
WASM the ordering between the two XLM-R variants might have differed;
the accuracy gap between them (87.8 vs 86.7 macro F1) is what decided it,
and that gap is unaffected.

### D26 — Wrong-element selection is prevented by construction, not by tests (M9)

SPEC: *"Silent failure is the worst possible outcome and must be
impossible by construction."* The obvious reading is "handle the case
where the selector finds nothing", and that case is easy: it is loud,
healthCheck reports it, sends block.

The case that actually matters is the opposite one. **A selector that
finds the WRONG element** — a composer-shaped editable div that is not
the one the site submits — passes every check. Detection runs on it and
finds nothing, because the user's text is elsewhere. healthCheck passes,
because an element *was* found and it looks right. The send proceeds and
the real composer's unmasked text leaves the machine. Every component
reports success.

**A test cannot catch this**, and that is the crux. A test asserting
"the adapter finds the right element" has to already know which element
is right — which is precisely the thing in question. Fixture tests
establish that the logic is correct on page shapes we know about; they
say nothing about whether the live site still has those shapes.

So the guarantee is placed somewhere a site redesign cannot reach. Four
constructions, independent by design so that a mistake in any one is
caught by another:

1. **Ambiguity is a failure, not a choice.** Within a strategy tier, two
   or more distinct valid candidates is a hard failure with no
   fall-through. No tie-break, no first-match-wins, no scoring. A decoy
   almost always presents as a second match, and any rule for choosing
   between two candidates is a rule that eventually chooses the decoy —
   silently, because the caller cannot distinguish a confident answer
   from a guess.

2. **Identity binding at submit — the load-bearing one.** The element
   detection ran on must be the same NODE (`===`) as the element the
   user's own submit event resolves to, derived from `composedPath()`
   and never from a selector. This is the second opinion the resolver
   cannot give itself: it is built on the user's keystroke, which
   physically went into the real composer, so no redesign can move it.
   A wrong `getComposer()` therefore produces a mismatch and blocks
   rather than leaking.

3. **The input witness.** An element may only be bound if it has
   actually received input during this page session. A decoy is by
   definition the element the user did *not* type into. An element
   holding text nobody typed is not a composer.

4. **Verified writes.** `setComposerText` re-reads what it wrote and
   fails closed on a mismatch. This catches the React/ProseMirror
   failure mode, where a write updates the DOM and is then reverted, so
   the composer still holds the ORIGINAL text at send time — otherwise
   indistinguishable from success.

**An ordering subtlety, recorded because the first version got it
wrong.** Invariants are applied BEFORE the ambiguity count, not after.
Counting first looks equivalent and is not: sites keep hidden
measurement clones and `aria-hidden` duplicates of the composer, and
counting those as rivals would report ambiguity — blocking every send —
on a page that is working perfectly. An extension that blocks a healthy
page gets uninstalled, and an uninstalled extension protects nobody.
Invariants decide what is a candidate at all; ambiguity then adjudicates
between candidates. The `composer-hidden-clone` fixture caught this.

**A second ordering bug, same shape, found while reviewing the button
path.** `resolveUnique` admits a candidate only if it satisfies every
composer invariant, so an aria-hidden measurement clone is not a
candidate. `editableWithinRegion` — which the BUTTON path of construction
#2 uses to find "the single editable beside this send button" — filtered
only by `isEditableSurface`. The two therefore disagreed about what
counts as a candidate: on a page with an inert clone inside the composer
region, the resolver found the composer without difficulty and the button
path then returned null, blocking the send as 'undecidable'.

Both now apply the SAME admission rule. The general lesson is the one
already stated in `isEditableSurface`'s docstring and now demonstrated:
when two places decide what counts as a candidate, a divergence between
them does not fail loudly — it fails as a healthy page that cannot send,
which a user reads as the extension being broken. Pinned in both
directions by the `composer-region-clone` fixture: an inert clone must
not block, and two genuine editables still must.

**The cost, stated honestly.** This design fails closed more often than
a naive one. A site that legitimately grows a second editable surface
near the composer will block sends until the adapter is updated. That is
the intended trade: a false block is visible, complainable, and fixable;
a false send is none of those.

### D27 — CORRECTED: a 4-6x latency swing was misattributed to power state; conditions are now recorded on every run (M9)

**This entry previously claimed WASM NER latency varies 4.4x with mains
versus battery power. That claim was wrong, and the error is recorded
here rather than quietly edited away.**

**What was observed.** Two clean runs of the browser benchmark reported
cold p50 3022 and 3024 ms at the shipped 400-char window, against roughly
697 ms measured in an earlier session. The harness was correctly
exonerated by A/B: the OLD benchmark file, byte-identical apart from its
sample count, re-run under the same conditions, reported 3056 ms — it
agreed with the new harness rather than with its own earlier result. So
the code was not the variable.

**What was then claimed, and why it was wrong.** The machine was observed
to be on battery, and the earlier fast session was assumed to have been
on mains. Power state was named as the cause and published. That was an
inference from a single co-occurrence, not a measurement: the battery
state was observed, the mains state was assumed, and nothing was varied
deliberately.

**The direct test refutes it.** Measured later the same session, ON
BATTERY throughout:

| mode | power | battery | cold p50 @ w400 |
| --- | --- | ---: | ---: |
| headless | battery | 46% | 3022 / 3024 / 3056 ms |
| headed | battery | 77% | 595 ms |
| headless | battery | 76% | 533 ms |
| headless (3-run sweep) | battery | 76% | 562 / 887 / 691 ms |

Battery at 76% is roughly 5x faster than battery at 46%, and today's
battery median of 691 ms matches the earlier session's "mains" figure of
697 ms almost exactly. **The fast state is the normal state; the ~3000 ms
runs were the anomaly, and power source was not the variable.**

**What the variable actually was: NOT ESTABLISHED, and recorded as an
open item in D27a rather than left as a shrug.** It reproduced three
times running, so it is a state the machine enters and will enter again;
any latency figure measured while it is active is invalid. The candidates: The machine runs
ASUS power-management services (`ipf_helper`,
`AsusOptimizationStartupTask`), which switch performance profiles on
their own. A background scan of the 300 MB model cache, a thermal
excursion, or an OEM power profile are all plausible and none is
confirmed. The honest statement is that an unidentified machine
power/performance mode produced a 4-6x slowdown, and it was not captured
at the time, so it cannot be reproduced or explained after the fact.

**The durable fix.** `bench/wasm-latency/run.py` now records observable
machine conditions on EVERY run, before and after: power line status,
battery percent and charge status, current and max clock, CPU load, and
`% Processor Performance`. Published figures quote them. These proxies
are not a complete description of a machine's power state and the report
says so rather than implying otherwise — but a run that records nothing
cannot be interrogated at all, which is exactly the position this
benchmark was in.

**What survived, and it is the useful part.** The SHAPE of every
conclusion held across a 5x change in machine speed:

- cold improves and incremental degrades as the window grows, in both
  states (cold 400->1200: 1.57x faster in the slow state, 1.38x in the
  fast state; incremental: 2.36x and 2.55x slower);
- the cold-path budget is missed in both states (691 ms against 250 ms in
  the fast state, which is the state to publish).

Conclusions about the shape of a tradeoff proved far more durable than
conclusions about whether a threshold is met.

**The lesson, which is standing rule 6 turned on its author.** The rule
says repetition is not replication: reproducing a measurement within one
sitting controls for noise, not machine state, so vary the state or name
it as a condition. The failure here was subtler and worse — a state was
NAMED as a condition without being varied. Observing "on battery" beside
"slow" and publishing "battery causes slow" is the same error as
publishing an unconditioned number, with a false explanation attached
that makes it look rigorous. **Naming a condition you did not vary is
worse than naming none, because it stops the next person looking.**

### D27a — OPEN: an unexplained ~4-5x slow state, which invalidates any latency figure measured while it is active (M9)

Split out of D27 so it is not mistaken for a solved problem. D27 records
what the cause was NOT (power source). This records that the cause is
still unknown, and what a future session should do about it.

**The observation.** Three consecutive runs measured cold p50 at
3022 / 3024 / 3056 ms at window 400, where the normal figure is
562 / 887 / 691 ms. That is roughly 4-5x, far outside the ±29% run-to-run
spread seen in the normal state. An A/B against a byte-identical older
harness reproduced the slow numbers, so the benchmark code is not the
cause.

**Why it matters more than a one-off oddity.** It reproduced three times
in a row, which means it is a STATE the machine enters rather than a
transient blip — so it will recur. **Any latency figure measured while it
is active is invalid**, and nothing in the numbers themselves says which
state produced them. The recorded conditions are the only defence, and
they did not distinguish the two states: `% Processor Performance` was
not being captured when the slow runs happened.

**Candidates, and what would distinguish them:**

| Candidate | Why plausible | What would confirm or exclude it |
| --- | --- | --- |
| OEM power/performance profile (ASUS) | `ipf_helper` and `AsusOptimizationStartupTask` run on this machine and switch profiles on their own, including on AC/battery transitions and charge thresholds | Log the active MyASUS/Armoury Crate performance mode alongside each run; correlate a slow run with a mode change. Also log PL1/PL2 package power limits, which is where such a profile acts |
| Windows Defender scanning the model cache | `.hf-cache` holds ~300 MB of model weights that the benchmark reads on every run; a scheduled or triggered scan would contend for I/O and CPU exactly during a run | Check Defender's scan history against run timestamps; or run once with the cache directory excluded and compare |
| Thermal throttling | Sustained inference on a thin-and-light will heat-soak | Log package temperature and `% Processor Performance` continuously through a run. NOTE: this candidate is *weakened* by the observed sequence — the machine was CHARGING (which adds heat) shortly before the fast runs, so the fast state followed the hotter period, which is the wrong way round |
| Background Windows work (Update, search indexing) | Ordinary and invisible | Correlate against the Windows Update and indexing logs for the run window |

`% Processor Performance` is now captured on every run and is the cheapest
discriminator: a value far below 100% during a slow run points at
throttling of some kind (OEM profile or thermal) rather than at
contention.

**Deliberately not chased now.** Diagnosing it properly means
instrumenting the machine and reproducing a state that appears on its own
schedule, which is a poor use of the milestone. The requirement this
entry satisfies is narrower and sufficient: **a future session finds this
recorded rather than rediscovering a 4x anomaly from scratch and
attributing it to something plausible.** That last mistake has already
been made once, in D27.

### D28 — The Stage 2 window stays at 400 because a larger one is a CORRECTNESS violation, not a slower tradeoff (M9)

M9 measured four window sizes on both the cold and incremental paths,
expecting to widen the window to 1200 for the cold-path win. The window
stays at 400. **The reason that decides it is correctness, and it holds
regardless of any latency number.**

**A 1200-character CJK chunk exceeds the model's 512-token limit.** The
400 bound was set at M6 from exactly this. Feed the model 1200 characters
of Chinese and the input is TRUNCATED at 512 tokens — the tail is never
seen, and nothing reports an error. Any entity past the cut is silently
undetected.

**Measured, not inherited** (`bench/wasm-latency/tokens-per-char.mjs`, the
shipped model's own tokenizer, 400-character samples of real prose per script):

| script | tokens/char | tokens at a 1200-char window | chars that fit in 512 tokens |
| --- | ---: | ---: | ---: |
| Chinese (Simplified) | 0.723 | **867 - truncates** | 708 |
| Japanese | 0.563 | **675 - truncates** | 910 |
| Korean | 0.525 | **630 - truncates** | 975 |
| Arabic | 0.260 | 312 | 1969 |
| German | 0.245 | 294 | 2089 |
| Thai | 0.225 | 270 | 2275 |
| English / Russian | 0.220 | 264 | 2327 |
| Hindi (Devanagari) | 0.212 | 255 | 2409 |

Two corrections to what was assumed before measuring. M6's "worst case one
token per character" is **conservative**: the true worst is 0.723 for Chinese,
so 400 has more headroom than the bound assumed (708 characters would fit).
And Thai and the Indic scripts are **not** in the danger set - both tokenize at
Latin-like ratios. The problem is specifically CJK.


That is silent under-detection **for an entire class of users, in their
own languages, while every component reports success.** It is the same
failure class as the Arabic-Indic digit bug closed at M8 (D21), where
identifiers written in non-ASCII digits matched no detector at all and
the pipeline reported a clean document. The lesson there was that a gap
which only affects text a developer does not read is the hardest kind to
notice and the worst kind to ship. Repeating it deliberately, for
latency, would be indefensible.

So a global 1200 is not "a tradeoff with a mode cost". It is a bug.

**The secondary reasons are real and belong underneath it**, and they
would justify keeping 400 even if the CJK argument did not exist:

- **Cold and incremental want opposite sizes.** Measured: 400 -> 1200
  buys 1099 ms on a cold paste and costs 603 ms on every debounced
  keystroke burst. Larger windows are ~1.35x more efficient per
  character (fewer inferences, overhead amortised) but incremental cost
  is per WINDOW, so a bigger window redoes more characters per edit.
- **Two window sizes would cost the entire cache.** The content-hash
  cache keys on chunk text, so 400-char and 1200-char chunks are
  disjoint populations. A document that used both would get ZERO reuse
  across them: the first keystroke after a paste would re-infer
  everything. Avoiding that needs a per-document pinned window — a mode
  that must be correct every time or the result is worse than either
  option alone.

**The standing constraint for any future revisit: windowing must be
SCRIPT-AWARE from the start, never a global bump.** The window size is a
function of the tokenizer's behaviour on the input's script, and the only
safe global value is the one that holds for the worst script. A change
that raises the window without re-measuring tokens-per-character for CJK
reintroduces this bug. The measurement above also shows what a
script-aware design could safely do: roughly 700 characters for Chinese
against roughly 2300 for Latin — the cold-path win is available, but only
per script, never globally.

### D29 — M9 BLOCKER: node-identity binding has nothing to bind when the composer was never typed into

Recorded as a known gap rather than resolved, because the right answer
is not obvious and guessing at it would be worse than naming it.

**The case.** `verifyBinding` requires that the bound element has
received user input during this page session (construction #3, the input
witness). Several legitimate flows fill a composer without any user
editing event:

- a draft the site restores after a reload;
- a URL-parameter prefill (`/new?q=...`);
- a suggested-prompt chip that sets the composer programmatically;
- an edit-a-previous-message flow that populates an editor;
- any programmatic set, followed by the user simply clicking Send.

**What runs today: the send is BLOCKED**, with code
`no-input-witness`. `verifyBinding` reaches that branch because
`originComposer` resolves fine (the button path finds the region's single
editable), node identity matches, and the element is connected — so the
witness is the only failing check.

**Measured in a real browser** (`scripts/probe-input-events.py`), because
jsdom cannot answer it and the unit tests dispatch synthetic events
directly at the composer, which assumes the answer:

| filling path | raises editing events? | witnessed? |
| --- | --- | --- |
| typing into contenteditable | `beforeinput` + `input`, both targeting the editing host | yes |
| typing into a textarea | both, targeting the textarea | yes |
| paste (Ctrl+V) | `beforeinput` targets the inner `<p>`; `input` targets the host | **yes, but only via `input`** |
| `execCommand('insertText')` (our own write) | `input` only, targeting the host | yes |
| programmatic `innerHTML =` | **none at all** | no |
| focus/click without typing | none | no |

**A near-miss the probe caught.** On paste, `beforeinput` targets the
inner paragraph, not the editing host. Had the witness listened to
`beforeinput` alone — which was the more obvious choice, since it fires
first — the composer would never have been witnessed on a paste, and
every paste-then-send would have been blocked. It works only because the
witness also listens to `input`. That was luck rather than judgement, and
it is now a deliberate, documented requirement.

**The tension, stated honestly.** Fail-closed says block, and blocking is
what happens. But a legitimate flow blocked on a real site is a bug found
by users rather than by us, and "the extension stops you sending after
clicking a suggested prompt" is the kind of defect that gets it
uninstalled — which protects nobody. The witness is the weakest of the
four constructions precisely here: it is the only one that can be wrong
in the SAFE direction and still do damage.

**PROMOTED FROM AN OPEN NOTE TO AN M9 BLOCKER.** The first framing
treated this as an edge case to carry forward. It is not one.

The blocked set includes **suggested-prompt chips**, which are a
first-run path on both Gemini and ChatGPT — plausibly the first thing a
new user clicks. So the current behaviour is: install the extension, open
the site, click the suggestion the site is showing you, and the send is
blocked. That is not an edge case, it is an adoption failure, and an
uninstalled extension protects nobody.

Fail-closed is correct and stays; blocking is the right response to an
unbindable composer. What is wrong is having no path THROUGH the block
for a legitimate flow. **This must be resolved before M9 closes**, not
carried into M10.

**Sequencing.** The dependency on the review panel is real and fine: the
resolution belongs with the content-script flow batch, where the panel
exists. It is a blocker on M9's completion, not on the next batch's
start.

**Shares its surface with D36**, which is also an M9 blocker. The
injected shadow-DOM host that carries the review panel carries the
degraded state and this confirmation path too - one surface, three
contents. Build it first in the content-script batch; both blockers
depend on it.

**Not redesigned yet, on purpose.** The candidate answers each have a
cost worth weighing rather than picking:
(a) treat a programmatic fill as witnessed if the text was present before
    the extension attached — cheap, but it trusts page state, which is
    exactly what the witness exists not to do;
(b) require the witness only when the composer's text CHANGED since the
    last successful bind, so a restored draft binds once and thereafter
    behaves normally;
(c) drop the witness and rely on constructions #1, #2 and #4 alone,
    accepting that a decoy in the same region as the send button is no
    longer excluded;
(d) fall back to an explicit user confirmation in the review panel when
    the witness is missing, converting a silent block into a visible
    "protect and send" step.

(d) is the most promising because it fails closed without failing
useless, but it needs the review panel, which is the next M9 batch. The
decision belongs with that work.


### D30 — CLOSED: WebGPU is not an option for Stage 2; it is 4-5x SLOWER than WASM on the real adapter (M9)

Left open at M8 with a legitimate doubt: the first WebGPU measurement was
taken in headless Edge, which injects `--enable-unsafe-swiftshader`, so
3054 ms looked like what software rasterisation looks like rather than
what a GPU looks like. Measuring a software fallback and calling it
WebGPU would have been a real error, so the question was reopened.

**Measured properly.** Headed Edge (no software-rasteriser flag), on the
machine's real adapter — `navigator.gpu.requestAdapter()` reports
`intel / xe-2lpg`, the Arc 140V — with conditions recorded, and paired
back-to-back against WASM in the same machine state:

| runtime | cold p50 @ w400 | incremental p50 | per inference |
| --- | ---: | ---: | ---: |
| WASM (8 threads) | 533-691 ms | 80-112 ms | ~85 ms |
| WebGPU (real Arc 140V) | 2931 / 2938 ms | 424-769 ms | ~420 ms |

Reproduced twice at 2931 and 2938 ms. Conditions on the final run:
battery 75%, `% Processor Performance` 89.1%, CPU idle — a healthy state,
not a throttled one.

**WebGPU is 4-5x slower than WASM here, not faster.** The doubt about the
headless number was well founded and the number was nearly right anyway:
the earlier 3054 ms was not SwiftShader, it was WebGPU.

**Why, and why this is expected rather than a configuration mistake.**
The model ships q8-quantized. onnxruntime-web's WebGPU execution provider
has limited int8 matmul coverage, so quantized operators it cannot run on
the GPU fall back to CPU per-operator — and every fallback costs a tensor
round-trip across the GPU/CPU boundary. A q8 transformer on WebGPU
therefore pays GPU dispatch overhead AND CPU compute AND transfer cost,
which is a straightforward way to be slower than simply running the whole
thing on well-threaded WASM SIMD. Nothing here suggests a
misconfiguration to chase.

**Closed, and would be closed even if it had been faster.** WebGPU is not
universally available: it depends on the browser, the GPU, the driver and
enterprise policy. So it could only ever be an OPPORTUNISTIC accelerator
with a WASM fallback beside it — which means shipping and maintaining TWO
inference runtimes, with two sets of numerical behaviour to validate,
two failure modes, and an eval matrix that doubles. The bar for that
complexity is a large, reliable win. The measured result is a large loss,
so the bar is not merely unmet; it points the other way.

WASM is the single runtime. Revisit only if onnxruntime-web ships real
int8 GPU matmul coverage, and re-measure before believing it.


### D30a - The ChatGPT adapter received one third of its intended adversarial review (M9)

Recorded against that adapter rather than left in a commit message,
because it is a standing reason to weight live verification and future
review more heavily there than for the other two.

Both new adapters were designed with three independent critique lenses -
localisation, ambiguity, and read/write. For Gemini all three completed.
**For ChatGPT, the ambiguity and read/write lenses both failed** with API
errors, so that design was revised against the localisation critique
alone.

I covered the two missing lenses by hand during implementation, and the
read/write pass found something real the design had not accounted for:
React's value tracker reverting a naive `element.value` assignment, now
handled by writing through the prototype setter (see D32). That one
finding is evidence the missing reviews were not ceremonial.

**The asymmetry stands as a known weakness of that adapter**, not a
closed item. ChatGPT has had less adversarial attention than the other
two, and the ambiguity lens - the one covering exactly the decoy and
false-block cases this subsystem exists for - is the one whose absence is
least comfortable.

### D31 - The extension was silent by construction, which made SPEC's central requirement unverifiable (M9)

Found from a real unpacked load: the extension was active on a live
signed-in claude.ai chat, no errors, and the console showed NOTHING from
it at any log level. Two explanations fit - not injecting, or injecting
and producing no output - and they need opposite fixes.

**Measured rather than guessed** (`scripts/verify-injection.py`). The
built extension was loaded into a real browser with the claude.ai origin
intercepted and a committed fixture served in its place; Chrome matches
content scripts on the URL, so injection behaves identically. The running
service worker was instrumented to record what it received - observation
only, the artifact unmodified.

Result: **injecting, and completely silent.** Two health messages
arrived: `ok: true` with no failures on a page with a composer, and
`ok: false` with `composer/response-root/send-button: not-found` on a
page without one. The badge went to `!` on the failing tab. Console
output: **zero lines**.

**Why that is a defect and not a preference.** SPEC's strongest sentence
is that silent failure must be impossible by construction, and it
requires healthCheck failure to produce a VISIBLE degraded state. The
only observable was a toolbar badge, and on a HEALTHY page that badge is
empty - indistinguishable from the extension not running at all. So no
human could establish whether the adapter had resolved the composer,
which strategy won, or what healthCheck returned. **An unverifiable
requirement is not a requirement**, and ADAPTER-VERIFICATION.md's status
table said NOT VERIFIED for all three adapters with no way for anyone to
change that.

**The fix**: `diagnostics.ts` builds a structural report - which strategy
resolved each element, every strategy tried with its match and admitted
counts, which invariant rejected the rest, the ambiguity count, and
healthCheck's failures in full - and `debug.ts` renders it to the page
console.

**It ships rather than being a dev-only script**, deliberately. The sites
change, and when a user reports "it stopped working on Gemini" the only
useful thing they can send back is this report from their own browser. A
diagnostic that exists only on a developer's machine is no help on the
day it is needed. Default-on for an unpacked load (detected via the
absence of `update_url`, which Chrome injects only for store installs),
default-off for a store install, user-overridable.

It reports lengths, counts, tags, tiers and strategy ids, never page text
- it is designed to be pasted into a bug report by someone with no way to
audit it first, so it must be safe by construction rather than by their
judgement.

Measured after: 0 console lines became 22, naming the winning strategy,
the tier, the ambiguity count and every failure, in both the healthy and
the degraded state.

### D32 - Construction #4 could silently pass: the write verifier is synchronous, and frameworks revert asynchronously (M9)

Raised as a review question and confirmed. It is the worst shape a defect
can take here - a mechanism built to make silent failure impossible,
failing silently itself.

`writeAndVerify` writes and reads back IN THE SAME TASK. That catches a
framework that rejects or ignores the write. It does not catch one that
ACCEPTS the write and reverts it on a later render tick, which is exactly
what React does to a controlled input whose value tracker was not
updated. The read-back would pass, and microseconds later the composer
would hold the user's ORIGINAL unmasked text, with every check having
reported success.

Two things now stand between that and a leak:

1. `text.ts` writes through the PROTOTYPE value setter, so React's
   tracker sees a value it did not write and accepts the following input
   event as a genuine edit. This makes the revert not happen.
2. `reverifyBeforeSend()` re-reads at the gate and blocks on any
   difference. This catches it if it happens anyway.

The second is the load-bearing one, because the first depends on a
correct model of a third party's internals. **It must be called in the
same task as the decision to allow the send** - any await between the
check and the send reopens the hole, and that constraint is written at
the function.

REQUIREMENT ON THE CONTENT-SCRIPT BATCH: the send path must call
`reverifyBeforeSend` immediately before permitting the send. Implemented
and tested now so it cannot be forgotten later and rediscovered as a
leak.

### D33 - Live adapter verification cannot be automated, and the harness is retired (M9)

`verify-live.py` was built to verify adapters against the live sites and
has been removed. All three targets run bot detection: claude.ai sits
behind a Cloudflare interstitial that loops indefinitely for a driven
browser, and Gemini has Google's equivalent.

This is not a harness bug and a better harness does not fix it. The sites
are working as intended, and an extension-verification tool is
indistinguishable to them from the automation they exist to stop.

**Nor should it be worked around.** Defeating a site's bot detection in
order to test an extension that reads that site would be a poor thing for
a privacy tool to ship, and any technique that worked would be fragile in
exactly the way the adapters already are.

Recorded as a finding rather than left as a deleted file, because
automating it will keep looking attractive. Live verification is manual,
permanently; the procedure is in ADAPTER-VERIFICATION.md.

What automation still covers, and does: whether the content script
injects and produces output (D31), via origin interception and a
committed fixture. That verifies the MECHANISM. Only a person signed in
can verify the SITE'S SHAPE.


### D34 - Gemini fails live; diagnose reachability before selectors (M9)

Observed live, composer visible, extension loaded unpacked: composer
`not-found`, all five strategies matched 0 at every tier, NO invariant
rejections, send-button 0, response-root RESOLVED.

**One inference corrected first.** The natural reading is that
response-root resolving while the composer does not points at the query
mechanism. It does not: `gemini/response-main` uses `deepQueryAll` too,
exactly like the five composer strategies. All six go through the same
helper, so the contrast carries no information about piercing. What it
does establish is narrower - `deepQueryAll` runs and returns light-DOM
matches.

**Three causes print identically as "matched 0" and need opposite
fixes:** stale selectors, a CLOSED shadow root (permanently unreachable),
or an iframe (`all_frames: false`). Nothing in the existing report
separates them, and none of it can be determined remotely.

So the diagnostic now emits ENVIRONMENT FORENSICS on any resolution
failure: open shadow-root count and depth; likely-CLOSED shadow hosts,
detected as custom elements that render but expose neither children nor a
`shadowRoot` (the only signal available - a closed root is unreachable by
any supported means, so its absence must be inferred from something
painting that cannot be reached); iframe count; and light-versus-deep
match counts for probes from `rich-textarea` down to bare `textarea`. It
prints a stated READING, not just numbers, because a table nobody
interprets is barely better than the silence it replaced.

**Selector work must not start until that block is captured.** A
stale-selector fix applied to a reachability failure looks like progress
and resolves nothing - and would burn the one live run per session that
this project actually gets.

**Conditional consequence, deliberately NOT yet written into SPEC.** If
the forensics show a closed shadow root, Gemini is not a bug but a
permanent limitation: the adapter reports `not-found` and blocks, which
is correct by design, and the site can never be supported. SPEC's
three-site claim would become two working sites and one blocked, which is
a product fact the README and SPEC limitations must state. That edit
waits for the evidence rather than anticipating it.

### D35 - Fixtures encode a working state and can never detect that a site has moved (M9)

Two of three adapters failed on first live contact with every fixture
test passing. Recorded because it is easy to read as a testing failure
and is not one.

A fixture is written against the markup as its author understood it, and
a fixture test asks: given a page of this shape, does the adapter resolve
correctly? It can prove a strategy parses what it was written against.
**It can never detect that the site has moved**, because the fixture
moves with the author's belief rather than with the site. Every test can
stay green forever while all three adapters are dead.

This is the fixtures' BOUNDARY, not a defect. More fixtures do not move
it; a captured fixture has exactly the same property as a synthetic one.
The only instrument that crosses it is a person opening the real site.

Acted on in three places: the status table tracks Claim A and Claim B in
separate columns so a green suite is never reported as a working adapter;
the diagnostic makes crossing the boundary cost about two minutes; and
live results are DATED, because "verified" decays and a Claim B result is
evidence about the day it was taken.

**WHAT THE LIVE PROCEDURE ACTUALLY CAUGHT**, recorded because it settles
what the boundary is worth in practice. Every fixture test passed
throughout. Live verification found:

1. **One real selector failure** - Gemini's send control.
2. **One state-model defect** that would have put the extension into a
   degraded, send-blocking state during most of a user's session (D34i) -
   a defect in the health MODEL, not in any selector.
3. **Two adapters wrongly diagnosed as broken** - ChatGPT had no rot at
   all, and Gemini's composer was healthy the whole time.

None of it was reachable from fixtures, and two of the three are not
selector problems at all - which is the part worth remembering. The
fixture boundary is usually described as "fixtures cannot tell you the
site changed". It is wider than that: fixtures cannot tell you the
extension is wrong about the site in ANY way that depends on the site
being live, including its own state model.



### D36 - M9 BLOCKER: SPEC's visible degraded state does not exist yet; the badge is not it

Asked directly: what does a person see when a site changes next week?
Answered from the code rather than from intent.

SPEC: "On failure the extension enters a visible degraded state, blocks
sends, and tells the user the site layout changed." Today, on a health
failure, the complete set of observables is:

| Observable | Reaches whom |
| --- | --- |
| Console diagnostic | Only an unpacked (development) load. **Default OFF for a store install.** |
| Toolbar badge `!` + action tooltip | Anyone who happens to look at the extension icon, or hovers it |

There is **no in-page UI** - the content script creates no DOM at all -
and **no send blocking**, because submit interception is deliberately
absent until detection is wired.

So for a normal store-installed user on a site that changed, the entire
signal is a small badge on an icon they are not looking at, and the
sentence "the site layout changed" is reachable only by hovering the
toolbar button. **SPEC's requirement is unmet on all three clauses.**

**On whether periodic healthCheck is sufficient**, which was the question
asked: the poll is not the problem. Both observed failures are permanent
site drift, so the FIRST check already found them - a 15-second poll adds
nothing for a permanent condition. Its value is elsewhere: catching SPA
navigation and mid-session DOM replacement. What is missing is not more
frequent detection but a VISIBLE SURFACE for what detection already
found, and a send gate for it to block.

**SCOPE: M9 OWNS THIS. It closes with M9, together with D29.** Stated
explicitly because an open decision recording that SPEC's strongest
requirement is unmet, with no milestone attached, is how a requirement
quietly becomes optional.

Four reasons it cannot slip to M10:

1. **SPEC assigns it to M9 twice over.** M9 is "Extension: manifest,
   adapters, content script, REVIEW UI, streaming restoration". The
   degraded-state sentence itself lives in SPEC's adapters section, which
   is M9's. Neither clause is in M10's list.
2. **M10 is a different surface.** M10 is "Popup, options, i18n,
   accessibility, security hardening" - EXTENSION PAGES. The degraded
   state, the send gate and D29's confirmation path are all IN-PAGE, in
   an injected shadow-DOM host (SPEC: "All injected UI inside a shadow
   DOM"). Filing an in-page requirement under a milestone about extension
   pages would misfile it, and the misfiling is what would make it
   invisible.
3. **The send gate is non-negotiable #2, not decoration.** Fail-closed is
   the guarantee the product is built on. Shipping M9's content-script
   flow with detection wired and nothing able to block would mean M9's
   own acceptance is unmet, whatever the milestone list said.
4. **All three share ONE surface.** The review panel, the degraded state
   and D29's "protect and send" confirmation are the same injected host
   with different contents. M9 builds that host for the review panel
   regardless. Deferring D36 would mean building the surface in M9 and
   deliberately not wiring the degraded state into it, which is more work
   than doing it, not less.

**Ordering consequence.** The injected surface is a PREREQUISITE for both
D29 and D36, so it is the first thing in the content-script batch rather
than the last. Building detection first and the surface afterwards would
leave both blockers open until the end of the milestone, which is where
scope gets cut.

**One honest caveat, which is not a reason to slip.** Telling the user
"the site layout changed" is user-facing copy, and SPEC puts message
catalogues in M10. The interim is English-only strings in M9, with the
catalogue entry added in M10 alongside every other string. A missing
translation is a smaller failure than a missing message.

Recorded as open so it is not mistaken for done once the badge exists.


### D34a - PARTLY WITHDRAWN: the wrong-model conclusion came from an un-painted reading (M9)

Follow-up to D34, recording what the forensics returned and one defect
they exposed in themselves.

**Reading (un-painted, superseded): 0 open shadow roots, 0 iframes,
likely-closed hosts `mat-icon` only.**

**The closed-shadow-root branch is CLOSED, and the basis is now the
PAINTED reading, not this one.** The verdict is unchanged but its
original basis was invalid, and a correct conclusion resting on an
invalid measurement is still something to fix - it would survive the next
review only by luck.

On the painted reading the composer RESOLVES, by four independent
strategies. An element that resolves is by definition reachable, which
settles the question far more directly than any shadow-root count does.
Gemini is supportable; SPEC's limitations and the README are not edited;
the three-site claim stands.

**WITHDRAWN: "the failure is a wrong model, not stale selectors."**

The reasoning was that every editable probe returned 0 while bare
`textarea` returned 1, so Gemini had presumably replaced its
contenteditable rich editor with a native textarea - which would have
meant reworking `setComposerText` onto the value-property branch,
re-confirming the input witness against a textarea, and revisiting the
`editable` invariant.

**All of that is wrong and none of it should be done.** The reading it
rested on came from an un-painted page. On a confirmed-painted reading,
`gemini/composer-ql-editor` matches - which proves the QUILL EDITOR IS
STILL THERE. Gemini did not replace its rich-text composer. There is no
value branch to switch to, no input-witness rework, and no invariant
change.

It is recorded as withdrawn rather than deleted because the note was
specific and actionable, and a future session finding it would have done
several days of unnecessary work. The lesson is the one below: a
conclusion drawn from an instrument with a known timing defect must be
re-derived, not merely re-checked.

**A DEFECT IN THE INSTRUMENT, which makes the specific counts
provisional.** `button` matched 0 in the light DOM on a page with a
visible send control. Not credible, and not yet explained: either the
probe ran before the Angular app painted, or the controls are not
`<button>` elements.

The cause of the ambiguity is mine. `run_at` is `document_idle`, which
for a single-page app is BEFORE bootstrap - and the diagnostic was
emitted only when `health.ok` CHANGED. So a page that failed at
`document_idle` and stayed failing was reported once, from the shell, and
never again. Whoever read that console saw a snapshot of a page that no
longer existed, with nothing on it saying so.

This is D27's lesson in a new place: a reading whose conditions are not
recorded is not a reading of the thing you think it is. Fixed the same
way - by recording the conditions:

- every forensics block now carries `readyState`, milliseconds since
  script start, an attempt number, and TOTAL DOM ELEMENT COUNT (an
  un-painted shell has hundreds, a painted app thousands);
- below 400 elements the block refuses to draw a conclusion and says the
  page had not painted, rather than reporting a selector verdict;
- re-checks run at 400ms, 1.2s, 3s, 6s and 12s;
- the console re-emits on a change of VERDICT, not only of `health.ok`,
  so a shell reading is superseded rather than standing forever;
- the probe list gained `[role="button"]` and `mat-icon`, which separates
  "the controls are not buttons" from "nothing had painted".

The "stale selectors" conclusion is accepted. The counts behind it are
provisional until one reading on a confirmed-painted page, and selector
work waits for that.


### D34b - A tag assumption shared by all three adapters (a fragility finding, NOT yet the diagnosis of Gemini's failure) (M9)

The painted reading withdraws most of D34a. Composer RESOLVED by
`gemini/composer-role-textbox` (attribute tier); four of five strategies
match, including `composer-ql-editor`. Response root resolves on both
strategies. **Only the send control fails.**

**SCOPE OF THIS ENTRY, corrected.** It was first written as the diagnosis
of that send-control failure. **It is not, and there is no valid reading
that supports it as one.** The block it was drawn from had its READING
withheld by a broken paint gate (D34e), and a withheld block is not data.
Worse, the specific warning it leaned on - "1 plausible send control is
NOT a button" - referred to an `<a role="button">` marked NOT VISIBLE,
while a VISIBLE `<button>` sat in the same candidate list under the
composer's own container. If that visible button is the send control,
then the tag assumption is not what broke Gemini and the real cause is
still unfound.

**What stands, and what does not:**

- STANDS: tag-anchoring across every tier is a genuine fragility, on its
  own terms, arrived at by reading the eleven clauses rather than from
  any live reading. The widening stays.
- DOES NOT STAND: that this fragility is why Gemini's send control
  failed. That claim is withdrawn pending a valid reading.

The distinction matters because a fragility finding and a diagnosis have
different consequences. The first says "this could break"; the second
says "this is what broke, stop looking". Recording the second without
evidence would have ended the search at the wrong place.

**THE SHARED ASSUMPTION, which is the finding.** Every send-control
clause in every adapter began with the literal `button` tag:

  Claude   4 clauses, all `button[...]`
  ChatGPT  3 clauses, all `button[...]`
  Gemini   3 clauses `button[...]`, plus an icon clause resolving
           `closest(icon, 'button')`, plus an English fallback
           `button[aria-label=...]`

Eleven clauses across three adapters, one assumption. **Not one of them
would match `div[role="button"]`.**

The tiered design HID this. Tiers are meant to give independent
fallbacks, and they vary correctly here - attribute, then class - but the
TAG is constant at every tier, so the ladder is an illusion for this
element. One markup change defeats all eleven clauses simultaneously,
which is exactly what "matched 0 at every tier" looked like.

Contrast the composer strategies, which key on EDITABILITY
(`[contenteditable]`, `textarea`) and never on a fixed tag. That is why
the composer resolved by four independent strategies on the same page
where the send control resolved by none. The difference is not luck; it
is that one element's strategies were written against a capability and
the other's against a tag.

**The fix, for Gemini only.** `CONTROL_SELECTOR` is now
`button, [role="button"], input[type="submit"]`, send markers are
tag-agnostic and may sit on the control or an ancestor, and the icon
clause resolves its enclosing control with that selector rather than with
`button`. There is no justification for requiring the tag: an accessible
control is any element carrying `role="button"`, which is what assistive
technology reads, so it is at least as durable as a test id. Requiring
`<button>` on top was a narrowing nobody chose.

Widening is safe because the ambiguity rule is untouched: a wider net
that catches two candidates fails hard rather than guessing.

**Claude and ChatGPT are NOT changed**, though they share the flaw. Each
must be re-run live and re-diagnosed first - ChatGPT's existing reading
came from the same defective instrument, and fixing against it would be
fixing against noise.

### D34c - `composer-in-send-region` is not independent coverage (M9)

Measured: on the painted Gemini page,
`gemini/composer-in-send-region` matched 0 while four other composer
strategies matched. It is anchored on `findSendButtons`, so it returns
nothing whenever the send control cannot be found.

**A fallback that fails whenever another element's strategies fail is not
a fallback.** It presents in the strategy list as one of five independent
routes to the composer, and the tier ladder reinforces that reading by
placing it at the structural tier - below the attribute tier and
therefore, apparently, more durable. It is not: it inherits every
assumption the send-control selectors make, including the tag assumption
that had just defeated them.

Recorded in the strategy's own `assumes` string, where anyone reading the
list will see it: treat it as a CORROBORATOR of the send control, never
as a fallback for the composer. ChatGPT's `composer-in-submit-region` has
the same shape and the same caveat applies, unverified.

The general lesson for the contract: a strategy anchored on ANOTHER
element inherits that element's failure modes, and the tier a strategy
sits at says nothing about that. Tier expresses durability of the marker;
it does not express independence.

### D34d - The forensics went quiet on the failure that remained (M9)

Second defect found in the instrument, and the reason the painted reading
could not diagnose the send control.

Forensics were gated on `composer.ok && responseRoot.ok`. On the painted
Gemini page BOTH resolved and only the send control failed - so no
forensics were emitted at all, and the reading arrived with no probe
table, no control candidates, and nothing to diagnose from.

An instrument that reports richly on the failures it anticipated and goes
silent on the one that actually happened is worse than a blunt one,
because its silence reads as "nothing more to see".

Now gated on `health.ok`, so any failure emits forensics. Added
`controlCandidates`: plausible submit controls found WITHOUT a tag
assumption, reporting tag, role, visibility, attribute names, ancestors,
and why each was considered a control - and warning explicitly when a
plausible send control is not a `<button>`, which is the exact shape that
defeated the selectors.


### D34e - The paint gate withheld a reading from a painted page: a proxy that could contradict its own data (M9)

Third gate defect in the diagnostic, and the mirror of the first.

**Observed:** the block printed `READING: withheld - the page had not
painted` while its own probe data showed 6 buttons, a `rich-textarea`, 34
custom elements and 2 editable surfaces. The gate and the probes
disagreed, in the same emission.

**Cause, after checking the three candidates:**

- Sampled at the same moment as the probes? YES - `domElementCount` is
  computed inside the same synchronous `buildForensics(doc)` call. Not a
  staleness bug.
- Read from an earlier attempt? NO - every call recomputes.
- **The floor of 400 was simply wrong.** I invented the number and never
  measured it. `querySelectorAll('*')` counts LIGHT DOM ONLY, and a
  componentised Angular application with a short conversation sits
  comfortably under 400 nodes while fully painted.

**The structural error is worse than the number.** The gate used a PROXY
(element count) to decide whether to believe the DIRECT EVIDENCE (the
probes). A proxy that can contradict the data it gates will eventually
contradict it, and when it does the instrument reports a confident
falsehood about its own reading.

**Fixed by construction, not by retuning.** Raising the floor would have
been the obvious repair and the wrong one - it would leave a proxy in
place and merely move the point at which it disagrees. The gate is now
DERIVED from the probe data: if the probes found controls, editable
surfaces or custom elements, the page has rendered. There is no separate
proxy left to disagree, so the contradiction is impossible rather than
unlikely. Element count is still reported as context and decides nothing.

**A second, smaller defect in the same block.** The "plausible send
control is NOT a button" warning did not consider VISIBILITY, so an
invisible `<a role="button">` was reported as evidence about the send
control while a visible `<button>` sat in the same list. Hidden
candidates are now separated out and explicitly discounted, and a visible
`<button>` candidate is called out as pointing at ordinary selector rot
rather than at anything about tags.

### D34f - Eight defects in checking code, and the last three share a shape (M9)

Recorded together because the pattern is more useful than any of them
individually, and because the count is now large enough that it is a
property of how this code is written rather than a run of bad luck.

The eight, in order:

1. Bloom-filter probe used an LCG that lost precision above 2^53, drew
   1,731 distinct tokens from 20,000, and reported a false 0.000% false
   positive rate (M7).
2. False-positive-fate probe counted candidates the scorer excludes,
   over-reporting residual FPs by 96 (M8).
3. Calibration test compared against a constant-0.5 model while claiming
   to compare against raw scores (M8).
4. Latency benchmark's incremental path timed the trailing chunk, whose
   length depends on the window - it compared chunk sizes, not windows
   (M9).
5. A 4-6x latency swing was attributed to mains-versus-battery from a
   single co-occurrence, and refuted by a direct test (D27).
6. The jsdom layout helper checked `hidden` on the element but
   `aria-hidden` on ancestors, so a hidden form field simulated as
   visible (M9).
7. The diagnostic emitted only on a change of `health.ok`, so a shell
   snapshot taken at `document_idle` stood forever (D34a).
8. Forensics were gated on composer-and-response resolution, so a
   send-control-only failure emitted nothing at all (D34d).
9. The paint gate withheld on a painted page (D34e).

**THE LAST THREE ARE THE SAME DEFECT.** Each is a GATE - a rule deciding
when to emit, when to believe, when to conclude - and in each case the
measuring code was correct while the gate around it was not:

  D34a  assumed the FIRST reading would be from a painted page
  D34d  assumed a failure would always involve composer or response
  D34e  assumed a painted page implies >400 light-DOM elements

Every one encoded an unmeasured assumption about which condition would
hold, and every one was wrong in a DIFFERENT direction: 7 concluded when
it should not have, 8 stayed silent when it should have spoken, 9 refused
when it should have concluded.

**The generalisable rule, which is standing rule 7:** a gate needs the
same scrutiny as a measurement, and specifically - **a gate must be
derived from the data it gates, never from a parallel proxy that can
disagree with it.** Where a proxy is unavoidable, the instrument must
detect and report its own contradiction rather than letting the proxy
win silently.

This is why D34e was fixed by removing the proxy rather than by raising
the floor. Retuning a proxy only moves the point at which it lies.


### D34g - The READING line asserted a conclusion it never tested: a summary is a gate on ATTENTION (M9)

Fourth gate defect, and the most dangerous shape so far.

**Observed:** on a painted Gemini page the block printed *"visible,
editable surface(s) ARE reachable but no strategy matched one. THE
SELECTORS ARE STALE"* - while the composer had RESOLVED, by four of five
strategies, on that same page. The previous painted run and this one gave
opposite verdicts about the same unchanged composer.

**Cause:** the line was keyed on `editableCandidates` - the PROBE - and
never on the resolver. The clause "but no strategy matched one" was
generic text emitted whenever forensics fired and a visible editable
existed. Since forensics fire on ANY health failure, a run where only the
SEND CONTROL failed produced a confident false statement about the
composer, which the instrument had not examined at all.

**Which run was right:** the earlier painted run. The composer had
resolved. The reading was describing nothing.

**Why this is worse than the previous three gate defects.** D34a, D34d
and D34e were gates on DATA, and a wrong gate on data can be caught by
comparing it against the data - which is how each was found. **A SUMMARY
IS A GATE ON ATTENTION.** If it states a conclusion the instrument did
not test, it stops the reader looking exactly as a wrong diagnosis does,
and it is likelier to be believed, because it reads as the instrument's
considered verdict rather than as one more number to cross-check.

It is also the shape most likely to recur, because summarising is
precisely where the temptation to be helpful outruns what was measured.

**Fixed:** every branch of the reading is now keyed on
`diagnostic.composer` - the resolver's own result. When the composer
resolved, the reading says so, names the targets that actually failed
from `health.failures`, and states explicitly that nothing in the block
is evidence about composer selectors. `ambiguous` and `invariant`
failures now read as themselves rather than collapsing into "stale". And
the resolver's per-strategy counts are restated INSIDE the forensics
block, so the claim can be checked where it is made rather than by
scrolling to another part of the group.

A self-check was added at the same point: if an adapter's strategy list
is empty, the block says **"NO STRATEGIES REGISTERED - this is a bug in
the diagnostic, not a finding about the page"**, because an empty list
renders as an empty table and is indistinguishable from no table at all.
A test asserts every registered adapter yields a non-empty strategy list.

**Standing rule 7, extended:** a gate must be derived from the data it
gates - and a SUMMARY must assert only what it actually tested. Where it
reports on something it did not examine, it must say so rather than
inferring.

### D34h - ChatGPT painted reading: composer rot; the send control is NOT yet evidence for the tag finding (M9)

The painted ChatGPT reading supersedes the earlier one entirely. The
earlier "editable invariant rejection on
`chatgpt/composer-in-composer-form`" is NOT reproduced and is treated as
superseded, not as a second finding to chase - it came from an unpainted
page.

**Composer: CORRECTED - the invariant rejection is real, and it changes
the diagnosis.**

The first version of this entry recorded the earlier "editable invariant
rejection on `chatgpt/composer-in-composer-form`" as an unpainted
artefact, superseded. **That was wrong.** It reproduces on a painted
page: `matched 1, admitted 0`.

**Selector rot cannot produce `matched 1`.** A stale selector matches
nothing. A candidate that was FOUND and then rejected means the selector
still describes something real and the ELEMENT'S STATE disqualified it -
`isEditableSurface` returns false for a disabled or readonly textarea, so
`form[data-type="unified-composer"] textarea` finding a DISABLED textarea
produces exactly this signature.

Two painted readings disagree, and the difference is state, not markup:

  Reading A: a VISIBLE contenteditable with aria-multiline and role,
             failing NO invariants; strategies matched 0.
  Reading B: no contenteditable at all - four surfaces, all file inputs
             plus a DISABLED textarea, every one failing `editable`; and
             `composer-in-composer-form` matched 1, admitted 0.

The textarea and both file inputs are disabled in B and were not in A.
That points at page state - composer locked mid-generation, rate-limited,
or still initialising - rather than at markup.

**Which is true is NOT yet established**, and it needs readings across
states (idle, mid-generation, immediately after load) rather than more
reasoning. What IS established is that the two failures are different in
kind and cannot share a fix.

**Send control: the tag finding is NOT confirmed by this.** The reading
shows 6 visible `<button>` candidates AND one visible `div[role="button"]`
with a `data-testid` **under `nav`**.

That div is almost certainly NOT the send control. A send control lives
in the composer region; this one is in the navigation landmark, which is
where a sidebar toggle, a model switcher or an account menu lives. With 6
visible `<button>` candidates present, the send control is far more
likely to be one of those - in which case ChatGPT's send failure is
ordinary rot, exactly like its composer, and the tag assumption is
irrelevant to it.

**So D34b stays a FRAGILITY FINDING and does not graduate.** The
widening stays on its own merits. What would settle it: the attributes of
the 6 visible button candidates, and whether any carries a send marker -
which the next reading prints.

**Neither adapter is being fixed yet.** Both readings were taken with the
defective READING line described in D34g, and although the ChatGPT
composer conclusion is independently supported by the resolver's own
`not-found` plus the editable table, the instruction stands: re-take both
with a strategy table attached before writing selectors against them.


### D34i - OPEN: a momentarily disabled composer must not put the adapter into DEGRADED (M9)

Raised by the ChatGPT painted readings and not yet resolved, because the
evidence needed is live readings across page states rather than
reasoning.

**The mechanism, which is certain.** `isEditableSurface` returns false for
a disabled or readonly textarea. The `editable` invariant therefore
rejects it, `resolveUnique` reports `invariant`, `healthCheck` fails, and
the extension enters its degraded state.

**The consequence, if the ChatGPT reading is what it looks like.** A
composer is disabled every time a response is generating - which is not
an edge case, it is most of the time a user spends on these sites. An
adapter that goes DEGRADED and blocks sends whenever the composer is
momentarily disabled would appear broken constantly.

**Why blocking is the WRONG response here specifically.** Fail-closed
exists to stop unmasked text being sent. A disabled composer cannot send
anything - there is nothing to protect at that instant and nothing to
fail closed against. Blocking buys no safety and costs all the
credibility.

**The shape of the answer**, to be decided with the content-script batch:
the health model needs a third state. Today it is binary, ok or degraded.
It needs to distinguish:

  - healthy, composer available          -> normal
  - healthy, composer TEMPORARILY unavailable (disabled/generating)
                                         -> not degraded, no badge, no block
  - degraded, adapter cannot find what it should
                                         -> visible, blocking

The second state must be entered only on POSITIVE evidence that the
element was found and is disabled - never on a `not-found`, which is
exactly the case a missing composer must not be able to masquerade as.
That distinction is the whole risk in this change, and it is why the
diagnostic now separates found-and-disabled from not-found before
anything acts on it.

**Belongs with D29 and D36.** All three are cases where fail-closed
blocks a legitimate flow and the answer is a path THROUGH the block
rather than removing it, and all three need the same in-page surface.
Same batch, same M9 blocker set.

### D34j - Anchoring strategies in both directions is a cycle, not a fallback (M9)

Introduced and caught within one change, recorded because the near-miss
is instructive.

D34c established that `composer-in-send-region` is not independent
coverage, because it anchors the composer on the send control. The
obvious repair - anchor the SEND CONTROL on the composer, which is the
element that resolves reliably - is sound in direction and was
implemented as `findSendControlNearComposer`.

It caused **infinite recursion**: the new function resolved the composer,
which ran `composer-in-send-region`, which called `findSendButtons`,
which called the new function. The test suite failed with
"Maximum call stack size exceeded" rather than anything resembling a
selector problem.

Fixed by resolving the composer from the strategies that are INDEPENDENT
of the send control - explicitly excluding `composer-in-send-region`.

The rule this adds to D34c: a strategy may anchor on another element, but
the strategies used in one direction must be independent of the other
direction. Anchoring both ways is not two fallbacks; it is a cycle, and a
cycle fails in a way that looks nothing like the problem it came from.


### D34k - The Gemini send-control fix was reviewed adversarially and was unsafe (M9)

The fix shipped, was reviewed by three independent lenses that
REPRODUCED their findings in jsdom against the real adapter, and came
back with four blocking defects. Recorded in full because the near-miss
is the point: the change had passing tests, a clean typecheck and a
written justification, and it was still dangerous.

**1. The region walk escaped to `<body>`.** Six widenings reached the
document root, so when the composer's container held no control, "the
single control beside the composer" was taken from the whole page - a
sidebar button - and `healthCheck` then reported `failures: []`. **A
loud, blocking failure became a silently green adapter bound to an
unrelated control.** Once interception lands that is unmasked text sent
while health reads OK: the silent-wrong-element failure this subsystem
exists to prevent, reintroduced by its own repair.

**2. The walk started AT the composer**, searching inside it. The filter
excluded controls that CONTAIN the composer but not controls it
contains, so a `role="button"` chip inside the contenteditable won at hop
0 and typing-area interaction became a send.

**3. `Node.contains` does not cross shadow boundaries** while
`deepQueryAll` does, so the "not a wrapper" guard failed exactly when the
composer was in a shadow root - the case this adapter exists for. Same
class as `closest` versus `closestAcrossShadow`, already fixed once in
this file.

**4. The ligature clause was unscoped and `findSendButtons` had no
ambiguity rule.** `<mat-icon>send</mat-icon>` is the default glyph for
share, export and feedback, so a second one bound a share-menu item as
the send control.

**AND THE COMMENT LIED.** Directly above `CONTROL_SELECTOR` I had written
"a wider net that catches two candidates fails hard rather than
guessing". True of `resolveUnique`; FALSE of `findSendButtons`. I
asserted a property the code did not have, in the comment justifying the
widening - the READING-line defect (D34g) in a new place: a claim that
reads as verified, in the place a reader goes to check.

**5. Identification without binding.** `composerRegionOf` still re-derived
"is this a send region" from markers, so on exactly the pages the new
tier existed for, the control was identified and could not be bound, and
every pointer send was undecidable. Two places deciding the same question
- the `editableWithinRegion` defect again.

**All fixed.** The send control now has the composer's ambiguity rule:
two candidates at a tier is a refusal, because binding the wrong control
means a send that is never intercepted - the same consequence as
resolving the wrong composer, so it gets the same rule. Provenance is
reported, so the guessiest path no longer looks like a test-id match.

**Tier order corrected, inverting the usual rule deliberately:** the
English aria-label now ranks ABOVE the positional tier. That cannot harm
non-English users - for them the clause matches nothing and falls through
exactly as before - and for English users it replaces a match with NO
send evidence by one with actual send evidence. A wrong positional guess
binds the attach button.

**The ligature argument was half right.** The name is an icon identifier
the site never translates, but it lives in a text node and page-level
machine translation rewrites text nodes; broken Material ligatures are
the known symptom, and Material's own guidance is `translate="no"`.
Treated as locale-fragile, ranked below the attribute forms, warned
about, and compared after stripping `\p{Cf}` rather than only whitespace -
RTL builds insert LRM/RLM around inline text, the same reason
packages/core strips them in Stage 0.

**Checking code drifted from production again.** The diagnostic's
send-icon probe still matched only the attribute forms after the adapter
gained ligature matching, so it could report "no send icon" on a page
where the adapter was matching one. Eleventh defect in checking code, and
the second of exactly this shape. One predicate now.

**The clause shipped with zero coverage in either direction** - no
fixture contained a ligature-form icon at all. Two added: ligature-only,
and ligature-translated.

**The lesson.** The tests passed because they tested the shapes I had
thought of. Adversarial review that REPRODUCES rather than reasons is not
redundant with a test suite; it is what finds the cases the suite was
never pointed at.


### D34i-a - CONFIRMED and broader: health polling cannot observe the state the composer spends most of its time in (M9)

D34i was filed as "a momentarily disabled composer must not put the
adapter into DEGRADED". A live idle reading confirms it and widens it.

**ChatGPT has no selector rot.** Read idle, `healthCheck` is ok with no
failures, the composer RESOLVES by `chatgpt/composer-id`, and all four
strategies match - the SAME selectors that matched 0 in the earlier
reading. **Those zeros were state, not staleness.** The adapter is
correct; the earlier diagnosis of "ordinary rot with the target in plain
view" was wrong, and is withdrawn.

**The state is structurally invisible to the current model, which is the
real finding.** Re-checks run at 400ms, 1.2s, 3s, 6s and 12s from load
and then the 15-second poll takes over. A generation beginning after that
window is only observed if a poll happens to land inside it. Generations
last seconds; the poll period is 15 seconds.

**A periodic sampler with period P systematically cannot observe states
whose lifetime is shorter than P.** The composer's disabled state is
exactly such a state, and it is the state the composer occupies for much
of a working session. This is not a mis-tuned interval; it is the wrong
instrument for the question.

**Proposing against SPEC's design rather than bolting an observer onto
it.** SPEC says "healthCheck() runs at init and periodically", and for
what SPEC was describing that is right. The problem is that TWO
DIFFERENT QUESTIONS have been conflated into one check:

| Question | Lifetime | Right instrument |
| --- | --- | --- |
| Can the adapter find its elements? | permanent until someone fixes it | **polling** - SPEC's design, 15s is ample |
| Is the composer editable right now? | seconds | **events** - it is announced, not discovered |

Adapter breakage does not start and stop; sampling it periodically is
appropriate and cheap. Availability changes constantly and announces
itself in the DOM. Tuning the poll down to catch it would be the wrong
repair twice over: it would burn CPU on every open tab forever to
rediscover something the page already broadcasts, and it would STILL miss
states shorter than the new period.

So SPEC's sentence is not wrong and does not need replacing. It answers
the first question, and the extension needs to answer both.

**The mechanism, for the content-script batch:** a `MutationObserver` on
the resolved composer with
`{ attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'readonly', 'contenteditable'] }`.
One observer, one node, no polling cost.

Two things it must handle, neither obvious:

- **The composer may be REPLACED rather than disabled** during
  generation, leaving the observer attached to a detached node and
  silently blind. Re-resolution must be triggered by the composer
  becoming disconnected, not only by its attributes changing.
- **It drives UI state, never the safety decision.** The send gate
  re-checks at submit time regardless of what the observer last said. An
  observer is a responsiveness mechanism; fail-closed stays where it is.

**The third state, restated with what the readings show.** Found-and-
disabled must not be DEGRADED. Blocking there guards an action that is
already impossible - a disabled composer cannot send - so the block buys
ZERO safety and costs the entire user-facing impression of the product.

That is different in kind from D29, where the block at least sits on a
real send path and the argument is about how to get through it. Here
there is nothing to get through.

Entered **only on positive evidence**: element found, element disabled.
**Never on `not-found`.** A missing composer masquerading as a disabled
one would undo fail-closed entirely, and that is the whole risk in this
change.


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

## Status after M4

The masking layer is complete: session-scoped vault (D11), surrogate
substitution with generator reuse and recorded bracket-token fallback
(D12), streaming-safe restoration (D13), and the egress guard. 40 new
tests bring the suite to 571, including the character-at-a-time streaming
test with a no-surrogate-visible-mid-stream invariant, a 400-run
chunk-boundary fuzz, the guard's raw/zero-width/homoglyph/case/separator
leak coverage with plaintext-free reports, and a 150-run end-to-end
property (detect → mask → guard → fuzzed-chunk stream → restore) that
found and now pins the masker/guard comparison-space bug recorded in D12.

Deferred by design: DATE_OF_BIRTH surrogates (D12), NER-scale
PERSON/ORG/LOCATION handling (M6/M7), calibrated overlap resolution and
the MaskResult/DetectedEntity reconciliation (M8), and per-tab vault
lifecycle — the vault is an injectable store; wiring it to tab sessions is
extension work (M9).

## Status after M5

The playground (packages/web) is the first end-to-end surface: live
Stage 0–1 detection with per-family highlights and hover cards (type,
raw confidence labeled uncalibrated, detector, validator), masked output
with surrogate/token toggle, summary counts, eight corpus-generated
examples across five scripts including RTL, and a demonstrated
fail-closed error state. 35 package tests (610 total). Verified against
the production bundle in a real browser (Playwright + Edge): 12-check
smoke including tooltip hover, RTL rendering, and zero console errors;
the bundle makes no external request (603 KB / 156 KB gzip — dominated
by libphonenumber's full metadata, the accuracy-first choice SPEC
mandates). An adversarial review pass caught and fixed: a placeholder-
select bug that overwrote user text, the frozen-glyph-layer typing bug,
RTL base-direction and scrollbar-width parity between the editor layers,
and zero-coverage on IME and hover flows. Deviations from SPEC's web
section, by milestone design: no sensitivity profile switcher and no
calibrated confidence or explanations until M8; names/addresses absent
until M6/M7 — the UI says so rather than faking them.

## Status after M6

Stage 2 multilingual NER is complete: a 14-run benchmark matrix over
five candidate models (BENCHMARKS.md) selected
`jiting/xlm-roberta-base-ner-hrl_onnx` at q8, pinned by content-addressed
revision (D16); core gained an injected-classifier NER module —
piece-to-character alignment, IOB1/IOB2 decoding, silent-truncation-proof
chunking, hard-deadline fail-closed engine, and `runStage2` emitting
`Stage2Candidate`s through the same offset-map path as Stage 1 (D17).
The eval corpus now plants PERSON/ORG/LOCATION in native scripts across
all 25 languages via a forked RNG stream, leaving every Stage 1 metric
byte-identical (verified in the regenerated baseline). 37 new tests
bring the suite to 647, including nine-script alignment, chunk-boundary
coverage, timeout and load-failure fail-closure, and offset mapping
through NFKC expansions and stripped invisibles.

Official combined run (2,600 docs, 1,393 NER spans): PERSON
98.7 P / 98.5 R-partial / F1 98.6; ORG 80.0 / 88.4 / 84.0; LOCATION
59.1 / 100.0 / 74.3; per-language F1 80.5 (th) to 97.6 (uk), no language
below 80. `nerPerType` regression floors now bind in the eval CLI's
`--ner` run. LOCATION's precision is dominated by a measured scoring
artifact — on the bench corpus, 52 of its 58 false positives sit on
STREET_ADDRESS ground truth and zero are hallucinations; only 16 of 956
NER predictions (1.7%, all ORG) match no ground truth at all, and the
hard negatives produced zero NER false positives. The M3
NATIONAL_ID/TAX_ID collision problem is measurably unaffected (identical
metrics; 0 of 651 identifier predictions overlap any Stage 2 span);
cross-type overlap resolution is M8's job, with the numbers above as its
starting facts.

Deferred by design: Web Worker hosting and model bundling into the
extension (M9, per D16 core stays environment-agnostic), gazetteers and
verification (M7), calibration of the raw softmax `rawConfidence` and
overlap fusion (M8).

## Status after M7

Stage 3 context scoring is complete and measured, Stage 2b gazetteers
ship, and Stage 2c was removed on its own criterion (D20). The pipeline
is now composed behind one entry point, `detect()`, which runs Stages
0–3 and threads Stage 3 evidence into Stage 1's validators — a caller
who forgets that hook silently gets a weaker pipeline, which is not a
detail consumers should be trusted with.

What Stage 3 contains: structural cues (JSON/YAML/.env/code assignment/
CSV headers/markdown tables/prose form labels, plus the shapes people
actually paste — curl headers, git diffs, `.npmrc`, Kubernetes block
scalars, `.netrc`, docker `-e`, CLI flags, SDK setters, minified JSON,
CJK full-width colons); trigger matching over 32 languages and 7,342
terms; document format and subject-domain profiling on independent
axes; thirteen negative rules; and the scoring pass with co-occurrence
and repetition. 788 tests.

**The measured result.** M7's exit criterion in SPEC.md is the precision
improvement on hard negatives: **332 → 190 false positives, −42.8%**.
base64 blobs went to zero, placeholder code more than halved, labelled
examples fell by a quarter. Per type: EMAIL 81.3% → 98.5%, POSTAL_CODE
5.9% → 20.0%, NATIONAL_ID 67.2% → 71.8%, API_KEY 92.3% → 95.9%,
SWIFT_BIC 88.2% → 100%. No recall regression anywhere except the
recorded GENERIC_SECRET gap.

**The dominant lesson of this milestone was about suppression.** Four
rounds of adversarial review ran 562 executed inputs against rules that
all looked reasonable when written, and every one of them leaked: Danish
CPR and Korean RRN in parentheses, SSNs swallowed by an authority scan
that ran past `|` and `;`, Luhn-valid Amex PANs on git-diff `+` lines,
Argentine DNI and Swiss AHV read as version numbers, real identifiers
un-redacted inside HTML and XML markup. The recurring defect was
evidence too loose about SCOPE — a line instead of an adjacency, a type
instead of a position, a prefix character instead of a parse — and the
standing rule it produced is D18: no suppression rule ships until
someone has CONSTRUCTED and EXECUTED a real sensitive value it wrongly
suppresses. A later round then measured the opposite edge and found two
rules over-tightened into uselessness, which is why the regression suite
pins both directions.

**Open, carried into M8, and neither is a surprise.** GENERIC_SECRET at
1.9% precision / 56.9% recall (D19): secrets introduced by labeling
language in prose across languages, which SPEC's "entropy AND an
assignment signal" excludes by construction, and which cannot be fixed
by a binary suppress-or-allow call. POSTAL_CODE at 20.0% precision:
much improved from 5.9% but still the weakest type in the pipeline, and
the residue is genuinely ambiguous — short digit runs whose only
distinguishing evidence is a per-country format table with no checksum
behind it.

**Deferred by design, not overlooked.** Cross-type overlap resolution is
Stage 4's: TAX_ID cross-scheme collisions, URL_WITH_CREDENTIALS against
CONNECTION_STRING, LOCATION inside STREET_ADDRESS, and the four
containment rules the error taxonomy proposed and this milestone
declined to ship. The taxonomy's own highest-priority residual is a
SPAN-HYGIENE prerequisite — url-with-credentials and connection-string
spans were measured straddling CSV and line boundaries — and containment
suppression is only ever as safe as the covering span is correct, so
that comes first. Also outstanding: the rules scan ASCII digits and
neither fire nor leak on Arabic-Indic or Devanagari digits, whose
correct fix is a folding transform in Stage 0 rather than widening
suppression rules into scripts where they are least tested.

## Status after M8

Stage 4 is complete: fusion, calibration, explanations, sensitivity
profiles, and the exposure score engine with its severity-weight data
file. 867 tests.

**What M8 actually fixed, in order of how much it mattered.** A silent
un-redaction came first and had nothing to do with fusion: identifiers
written in Arabic-Indic, Devanagari, Bengali or Thai digits matched
NOTHING, because NFKC folds fullwidth digits but correctly leaves
living-script digits alone while every detector matches `\d`. Stage 0
digit folding (D21) took recall in those six languages from 66.17% to
99.75% and left every other language at exactly 99.44%. It ran before
any calibration work on purpose: fitting thresholds while an entire
input class was invisible would have meant refitting them afterwards.

Then span hygiene, then cross-type overlap resolution (D22), which is
where the M7 deferrals were discharged. GENERIC_SECRET went from 2.0% to
100% precision and POSTAL_CODE from 23.5% to 100% — by REASSIGNMENT, not
elimination: every one of those spans is still emitted and still masked,
under the validated type that owns it. Total false positives 2,991 → 246.

Calibration (D23) is isotonic per entity type, fitted and evaluated on
splits proved disjoint rather than assumed to be — seed separation alone
leaked 181 duplicate documents. Held-out expected calibration error is
**2.63% against 12.33% for the raw scores**.

**What this milestone was really about, though, was measurement
discipline.** Five of the standing rules now in this file were earned
here or in M7, and three of the four defects they describe were found in
VERIFICATION code rather than production code: a Bloom probe whose PRNG
lost precision above 2^53 and reported a suspiciously perfect 0.000%; a
scratch audit whose else-if chain hid 48 defects inside an exemption; a
test that compared against a constant-0.5 model while claiming to
compare against raw scores; a false-positive probe that counted
candidates the scorer excludes. Each reported success while measuring
the wrong thing. The rules are in this file because the pattern
recurred, not because it happened once.

Two corrections in the same spirit landed on claims already published:
"2,075 false positives removed" was a reassignment described as an
elimination, and "zero wrong winners" turned out to cover only
validated-versus-heuristic arbitration — the genuinely contestable case
is 12.6% of arbitrations and the arbiter is wrong in about 5% of those
(D24).

**Open and carried into M9, none of it smoothed.** GENERIC_SECRET recall
at 55.4%, which is a DETECTION gap rather than an overlap one: prose-
labeled secrets have no competing candidate to arbitrate against, so
Stage 4 could not reach them. TAX_ID recall at 91.2%, the price of
refusing to settle a genuine cross-scheme ambiguity with a static
ordering. A calibration bucket that is over-confident (30.9% predicted
against 16.9% observed) on 77 samples, treated as real because it errs
in the direction that matters. Mid-range calibration fitted on few
observations because 4,755 of 5,416 sit in the top bucket. And the p50
latency budget missed under conditions favourable on both axes —
hardware above SPEC's mid-range reference and the faster of the two
runtimes — so 5.8 ms is a floor rather than a size.

**The coupling to watch** is D24: severity weights are per type and
arbitration decides the type, so the specificity table is now an input
to a published number. Nothing tests that, because both outputs stay
internally consistent when it is wrong.

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
