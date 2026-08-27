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
