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

**THIS FAILURE CLASS HAS ESCAPED ONCE, AND IT WAS THE REPAIR THAT DID
IT.** Recorded here rather than only in the review log, because a reader
of this section is deciding how much to trust these constructions and
should know that they have been breached.

The Gemini send-control fix (D34b, D34k) added a structural fallback:
"the single control beside the composer". Its region walk was bounded by
a hop count rather than by the composer's actual region, and six hops
reaches `<body>` on an ordinary page. So when the composer's own
container held no control, the fallback took the single control from THE
WHOLE DOCUMENT - a sidebar button - and bound it as the send control.
`healthCheck` then reported `failures: []`.

**A loud, blocking send-control failure was converted into a silently
green adapter bound to an unrelated control.** Once submit interception
lands, the real send control is not in the bound set, its click is never
intercepted, and unmasked text is sent while every component reports
health OK. That is exactly the silent-wrong-element failure the four
constructions above exist to prevent - reintroduced by a change whose
entire purpose was to repair that subsystem.

Three things about how it got in are worth more than the bug itself:

1. **It had passing tests.** The suite covered the shapes its author had
   thought of, and a walk escaping to `<body>` was not one of them.
2. **It had a clean typecheck and a written justification.** The
   justification was sincere and wrong.
3. **Review-by-reasoning did not catch it - including mine.** It was
   caught by an adversarial review that REPRODUCED the failure in jsdom
   against the real adapter rather than reasoning about the code. The
   distinction is the whole lesson: reasoning finds the cases you can
   imagine, execution finds the ones you cannot.

**What it changes about the constructions.** Nothing in their design,
which held - constructions #1 and #2 would still have blocked a wrong
COMPOSER. What it changes is where the boundary of their protection sits:
they govern the composer, and the SEND CONTROL had no equivalent rule
until this incident. It has one now (the same ambiguity rule), because
binding the wrong send control has the same consequence as resolving the
wrong composer - a send that is never intercepted.

**The general lesson for anyone repairing this subsystem:** a change that
widens what a strategy may match is a change to the wrong-element surface
even when it is aimed at a different element, and it deserves the same
adversarial treatment as a change to the composer resolver. Widening is
never locally safe.

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

### D34f - Thirteen defects in checking code, and they fall into three shapes (M9)

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
10. The READING line asserted "no strategy matched one - the selectors are
    stale" without ever consulting the resolver, on a page where the
    composer had resolved (D34g).
11. The diagnostic's send-icon probe still matched only the attribute
    forms after the adapter gained ligature matching, so it could report
    "no send icon" on a page where the adapter was matching one (D34k).
12. A comment above `CONTROL_SELECTOR` asserted that "a wider net that
    catches two candidates fails hard rather than guessing" - true of
    `resolveUnique`, false of `findSendButtons`, in the comment
    justifying the widening (D34k).

13. The icon ancestor table was gated on "no icon has an enclosing
    control", so it printed on a broken page and went silent on a working
    one - withholding the evidence from the reading that needed it
    (D34t).

**THREE SHAPES, and the count is now large enough to be a property of how
this code is written rather than a run of bad luck.**

- **GATES** (7, 8, 9, 13): the measuring code was correct and the rule
  deciding when to emit, believe or conclude was not.
- **CHECKING CODE DRIFTING FROM PRODUCTION** (2, 3, 6, 11): a probe or
  helper that no longer matched the thing it was checking.
- **UNTESTED ASSERTIONS** (5, 10, 12): a claim stated as verified in a
  place a reader would not re-derive it - a conclusion, a summary line, a
  comment.

**ITEMS 7, 8 AND 9 ARE THE SAME DEFECT.** Each is a GATE - a rule deciding
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


### D34l - The bound that did no safety work: a too-tight limit and a too-loose one look identical from outside (M9)

The Gemini send fix still did not resolve, and the cause was the repair
to the previous cause.

**What happened.** The adversarial review found the region walk reaching
`<body>` and binding a sidebar button as the send control. Two things
changed in response: an explicit stop at `body`/`documentElement`, and a
reduction of the hop bound from 6 to 4.

**Only the first was the fix.** The body stop is what prevents the
dangerous case. The hop count only prevents a pathological loop - it was
doing no safety work at all, and lowering it was a change made because
"tighten the bound" sounded like the lesson.

At 4 it failed the other way. An Angular composer sits five or six levels
below its toolbar container, so the walk terminated before reaching it
and returned nothing. **A bound that is too tight and one that is too
loose produce the same observable: the path returns nothing useful.** The
previous version failed loose, this one failed tight, and neither was
distinguishable from "there is no send control here".

**The bound is now a loop guard (20), not a semantic limit**, and the
semantic limits are named as what they are: the body stop above, and the
ambiguity rule below. A region large enough to hold several controls
refuses rather than choosing, so climbing further cannot bind the wrong
thing - it can only fail loudly. That is why raising the number is not
the widening D26 warns against: nothing about what may be MATCHED changed.

**The real fix is that the walk is now TRACED rather than trusted.** The
diagnostic reports every level it climbed, what each contained, why it
stopped, and which outcome the uniqueness rule produced. Without that,
the composer-anchored path failed indistinguishably from a marker clause
- both print `send-button: not-found` - while needing opposite repairs:

| outcome | means | fix |
| --- | --- | --- |
| `no-region`, stopped early | the walk never reached the toolbar | a bound or a traversal problem |
| `ambiguous` | the toolbar holds several controls | a DISCRIMINATOR, never a wider walk |
| `reached-body` | no toolbar between composer and body | the composer is not where we think |

**And the READING is now scoped by strategy family.** It previously said
"most likely ordinary selector rot" over a failure that included a
composer-anchored search which does not depend on markers at all. Rot
explains the marker clauses; it explains nothing about that one. Saying
it over the top of both is rule 7's second form - a cause asserted for a
failure the line did not examine - so the reading now states what each
family's failure does and does not imply.

**Full attribute VALUES are now reported for control candidates**, with
the same conservative content guard. Names alone were useless for the one
job the table exists for: a clause is written against
`data-test-id="send-button"`, and `data-test-id` on its own says only
that some test id exists. Every reading so far had elided exactly the
information needed to write the fix.

That guard existed in two files, which is the drift pattern that has
already produced two defects here. It is now defined once and imported.


### D34m - Discriminating the send control by what it IS, in shared code (M9)

The traversal fix worked and produced the correct failure: the
composer-anchored search found TWO controls in the region and refused. A
real composer toolbar holds send AND microphone AND attach, so several
controls is the NORMAL case - which means refusing every time makes the
whole fallback useless. What was missing is not a wider search but a way
to say which control IS the send control.

**Every rule is a positive property of sending.** None works by excluding
the microphone, and the constraint does real work: "not the mic" requires
knowing every control a toolbar might ever hold, and silently binds
whatever is added next. "Submits the form the composer is in" does not
degrade that way.

Ranked in the contract's own order of durability:

| Rule | Property | Why it ranks here |
| --- | --- | --- |
| `form-submit` | the control natively submits the form containing the composer | a PLATFORM relationship, not a naming convention - survives every rename, restyle and class-hash change, and `HTMLButtonElement.form` works even when the control sits outside the form in the DOM |
| `aria-controls` | the control declares that it acts on the composer | an explicit, locale-independent relationship that assistive technology already relies on; rare, but unambiguous when present |
| `send-icon` | the control is decorated as the send action | a convention rather than a relationship, and the ligature form lives in a text node machine translation can rewrite |

**REFUSAL REMAINS THE DEFAULT**, and it is pinned as hard as the
successes. A rule matching TWO candidates is passed over rather than
tie-broken - that is the same problem one level down, and choosing would
reintroduce exactly the tie-break the ambiguity rule forbids. If no rule
identifies exactly one, the adapter still fails loudly.

**It lives in shared code, not in gemini.ts**, and the reason is a
finding rather than a preference. Only Gemini has a composer-anchored
path, so only Gemini can currently REACH this ambiguity. But Claude
(`claude.ts:294`) and ChatGPT (`chatgpt.ts:342`) resolve their send
controls by MARKERS ALONE - which is not safety, it is the absence of a
fallback. Gemini's failure mode (markers rot, fall back, refuse) is
strictly better than theirs (markers rot, nothing). Both sites have
attach and microphone controls beside the composer, so the day either
gains a composer-anchored path it meets the identical two-control region
on day one.

The site-specific part - what a send icon looks like - is INJECTED rather
than reimplemented in shared code, because a copy of a site's rule living
in shared code is the drift that has already produced two defects here.

### D34n - An adjacent tightening is an unreviewed change carrying the review's authority (M9)

Recorded separately from the bug it caused, because the bug was cheap and
the pattern is not.

The adversarial review found the region walk reaching `<body>`. The fix
was a stop at `body`/`documentElement`. **I also reduced the hop bound
from 6 to 4** - a change nobody asked for, that did no safety work, and
that broke the very path the real fix existed to enable. The walk then
terminated before reaching the composer's toolbar, and the failure was
indistinguishable from the one it replaced.

**Why this shape is hard to catch.** It looks like diligence. It arrives
inside a change whose other half is genuinely required, in the same
commit, under the same justification, at a moment when the reviewer's
finding has just been vindicated and everything in its vicinity feels
endorsed. It inherits the authority of a review that never examined it.

The distinguishing question is narrow and worth asking every time:
**which specific defect does this line close?** For the body stop, the
answer names the finding. For the hop reduction, the honest answer was
"none - it felt like the same kind of thing", and that is the signal.

**The rule.** When review finds a defect, the fix is the specific change
that closes it. Adjacent tightenings adopted in the same spirit are
unreviewed changes, and they should be made separately, justified on
their own, and reviewed on their own - or not made.

A corollary worth stating, because it is what made the consequence
severe: **a bound tightened past correctness fails identically to one
left too loose.** Both return nothing useful. The previous version bound
the wrong control; this one bound none; neither was distinguishable from
"there is no send control here" without a trace. Where a bound cannot be
derived from the data, the instrument must report where it stopped.


### D34o - "First ancestor with any controls" is not "the composer's toolbar" (M9)

The traversal was fixed, the trace worked, and the conclusion drawn from
it was still wrong - by one step.

**What the reading showed.** The walk climbed rich-textarea ->
textarea-wrapper -> textarea-inner -> div -> div -> div, finding 0
controls at hops 0-4 and 2 at hop 5, and stopped there. The two controls
were "Upload & tools" and "Dictate", both inside
`simplified-input-menu-container`. All three discriminators returned 0.

**NEITHER OF THOSE CONTROLS SENDS ANYTHING.** The discriminators were
correct; the search space was wrong. That container is the attachment and
tools menu, and it sits BETWEEN the composer and the container holding
send - so the walk stopped one level short of the toolbar and never saw
the send button at all.

**The reading invited exactly the wrong repair.** "Two controls found, no
discriminator fired" reads as "we need a better discriminator", which is
a correct inference from a COUNT and a wrong conclusion about the PAGE. A
fourth rule written against those two controls would have identified
neither, because neither is the send control. Rule 7 again: the summary
named one cause for a result with two explanations, and the unstated one
was the true one.

**Two candidate repairs rejected before choosing.** "Keep climbing while
the controls found are all non-sending", and "require a region to contain
a discriminable control before accepting it", are the same rule. Both
climb PAST a send control that happens to carry no discriminable
property, and may then bind a discriminable non-send control higher up -
and `<mat-icon>send</mat-icon>` is the default glyph for share and export,
so such a control exists on this very page. Binding the wrong element
BECAUSE a rule fired is worse than refusing.

**Chosen: collect across every hop, then discriminate over the union.**
It cannot climb past the send control because it never stops, and the
ambiguity rule supplies the protection that stopping early used to give -
several controls satisfying the same rule is a refusal. The body stop and
the ambiguity rule are unchanged; no selector matches anything new.

**The weakest rule needed a locality bound, and it is structural rather
than a hop count.** `form-submit` and `aria-controls` both encode a
relationship TO THE COMPOSER, so collecting more widely cannot weaken
them. A send ICON is position-agnostic, so it is accepted only when the
control SHARES THE COMPOSER'S INPUT AREA: the smallest ancestor
containing both the control and the composer must not also contain the
transcript. Derived from the page's own landmarks, no magic number, and
it excludes exactly the share and export actions carrying the same glyph.

**`stoppedBecause: 'found-region'` was deleted rather than left
unreachable.** The walk now always climbs to the body, so termination
says nothing about the result, and keeping a value that can no longer
occur would be a claim the code does not support.

**Unresolved, from the same reading:** `mat-icon[fonticon="send"]` and
`[data-mat-icon-name="send"]` both return 0 while `mat-icon` returns 19.
The send icon uses neither attribute form, and the ligature clause was
not matching either. Counts could never say why, so the diagnostic now
reports the DISTINCT LIGATURE NAMES present - the send icon's real name
becomes readable rather than guessed at.

### D34p - Three readings were lost to pasting the tail of the block (M9)

Recorded as a procedure defect, because it cost more than any single code
defect in this milestone.

The diagnostic block is long: strategy tables, probe table, editable and
control candidates, the region hop table, discriminator attempts, and
several READING lines. What gets copied out of a console viewport is the
TAIL - which is the conclusion, not the evidence it rests on.

**Twice that produced a confident wrong diagnosis** requiring another
round-trip to undo: once the region trace was believed absent when it had
been emitted and truncated, and once a summary line was read without the
table that contradicted it.

The manual procedure now says to SAVE THE WHOLE BLOCK TO A FILE and read
it from there rather than copying from the viewport, and lists what a
capture must contain to be worth anything.

The general lesson matches this milestone's other findings: an instrument
that reports richly is useless if the transport truncates it, and the
truncation is invisible at BOTH ends - the reader sees a complete-looking
block, and the author sees a conclusion that appears unsupported by
evidence that was in fact produced.


### D34q - The send icon is named `arrow_upward`, and the collection still cannot see its control (M9)

Two findings from one full capture, and the order they are fixed in
matters.

**The send icon is `arrow_upward`, not `send`.** The capture reported
`mat-icon ligature names present: arrow_upward, mic, plus` - three icons
for three controls, where `plus` is Upload & tools, `mic` is Dictate, and
`arrow_upward` is send. **Every marker clause and the ligature clause
search for the token `send`, which does not exist on this page.** That is
the entire marker-clause failure and it is a one-line change.

**It is deliberately NOT fixed yet.** Fixing the icon name first would
leave the marker clause matching while the composer-anchored path still
cannot see the control - which looks like success and leaves the fallback
broken. The fallback is the thing that exists for the day the markers rot
again, so verifying it against a control that is actually present is the
whole point.

**When it is fixed, the locality bound matters MORE, not less.**
`arrow_upward` is a GENERIC glyph: a scroll-to-top, a collapse, an expand
control can all carry it, whereas `send` was at least send-shaped. The
input-area test - the nearest common ancestor of control and composer
must not contain the transcript - is what keeps that from binding, and it
was introduced when the icon was believed to be `send`. It is now doing
more work than it was designed for, which is worth re-checking rather
than assuming.

**Second finding: collect-across-all-hops landed, and changed nothing.**
The hop table climbs all 20 levels and `controlsFound` is 2 at every hop
from 5 onward, with a control table listing only Upload & tools and
Dictate - while the probe table in the same reading counts 12 buttons.

Read from the code: `controlsFound` per step is that hop's SUBTREE count,
not carried and not accumulated; `collected` accumulates across hops with
dedup; and `discriminateSendControl` receives the accumulated set. **Both
halves work.** The defect is upstream of both - `controlsBeside` returns
2 even at the top of the tree, so the union is also 2, and the
discriminators reporting 0/0/0 is consistent with never having seen the
send button.

**Which stage loses the other ten cannot be determined from the code**,
and the candidates need opposite fixes: a selector that never matched the
control, versus a visibility test that discarded it. So the reading now
carries the whole chain - `rawMatched -> afterComposerExclusions ->
afterRenderedFilter -> newlyCollected -> runningTotal` per hop, a
document-wide census of what matches `CONTROL_SELECTOR` and how much of
it is rendered, and an explicit warning when the walk's total is below
the page's rendered count.

**A live hypothesis the reading will settle.** For every distinct icon
name, the diagnostic now reports the enclosing control and whether
`CONTROL_SELECTOR` matches it at all. If `arrow_upward` sits inside
something that is neither a `<button>` nor `[role="button"]`, it is
invisible to every clause however well the walk works - and that would
explain both findings at once.


### D34r - SCOPED: the "not exposed as a control" finding is the LANDING PAGE only (M9)

**CORRECTION FIRST.** This entry was written as "RESOLVED: Gemini's send
control is not exposed as a control at all". That claim is scoped to the
LANDING PAGE and is UNVERIFIED for a conversation page. It is corrected
here rather than edited away, because it is the third confident diagnosis
of this symptom to be wrong and the pattern is the useful part.

**What the reading actually showed, and where.** `plus`, `mic` and
`arrow_upward` all reported `enclosingControl: NONE`. But the container
was `initial-input-area-container`, and the editable surface in the same
reading was a bare `<textarea class="placeholder">` sitting at
`div < div < body < html`. That is Gemini's PRE-CONVERSATION HOME STATE.
The real composer sits roughly twenty hops deep under `input-area-v2`,
as the later reading in the same log shows.

**So the finding stands for the landing page and says nothing about the
conversation page**, where `gem-icon-button`, `gem-icon` and
`input-area-v2` are all present and both other controls (Add files,
Dictate) resolve as real `<button>` elements. The send control may well
be a button in that state too.

**`CONTROL_SELECTOR` is not changed on the strength of a landing-page
reading**, and the branch criteria in this entry stand unchanged: a named
custom element or durable attribute means a narrow positive addition;
nothing durable means a permanent limitation recorded in
ADAPTER-VERIFICATION.md, SPEC's limitations and the README, with the
accessibility observation stated plainly.

**The walk is correct and needs no further work.** The chain columns
prove it rather than suggest it: raw 2 at hops 5-16, 5 at
`side-navigation-v2`, 6 at `main`; the not-composer and rendered filters
reduce to 2 accumulated; `runningTotal` monotonic; document census 8
matched / 3 rendered, consistent throughout. Collect-across-all-hops
landed and works.

**The `arrow_upward` finding is RETIRED as a cause.** It was real - the
icon is named `arrow_upward`, not `send` - but it cannot be the
explanation: the ligature clause looks *inside a control*, and there is
no control for it to look inside. Fixing the name would have changed
nothing, and would have looked like a fix.

**THIS IS THE THIRD DISTINCT DIAGNOSIS OF THE SAME SYMPTOM**, and that is
the part worth keeping:

| # | Diagnosis | Why it was wrong |
| --- | --- | --- |
| 1 | stale marker selectors | the instrument could not see that the region was wrong |
| 2 | wrong region (walk stopped at the tools menu) | the instrument could not see that the control was unmatchable |
| 3 | **the control is not exposed as a control** | resolved by the per-icon enclosing-control probe, in ONE reading |

The first two were not careless. Each was the best available reading of
the evidence the instrument could produce AT THAT TIME, and each was
corrected by adding the next layer of visibility rather than by thinking
harder. **The per-icon enclosing-control probe took one reading to
resolve what two rounds of selector reasoning had not.**

The general lesson, which is the milestone's recurring one in its
sharpest form: **when a diagnosis is wrong twice, the fault is usually
the instrument's reach, not the reasoning.** The productive move each
time was to ask what the instrument could not see, never to propose
another cause within what it already showed.

**What the adapter can promise changes, and that is item 2.** If the send
control's only affordance is a JavaScript listener, no selector can find
it - and neither can a screen reader. That is a finding about Gemini's
accessibility, not a selector to write harder, and it would mean the
composer-anchored fallback cannot work on this site by any means
available to a content script.

**The probe that answers it** now reports, for every icon whose enclosing
control is missing, the full ancestor chain with each element's durable
affordances: tag, custom-element status, role, tabindex, aria-label
presence, form association, pointer cursor, inline handler, disabled
state.

**What it deliberately cannot report, stated because the absence is the
point:** listeners attached with `addEventListener` are not observable
from a content script - `getEventListeners` is devtools-only - and both
Angular and React attach that way. So "has a click handler" is missing by
necessity. If an ancestor has no role, no durable tag, no tabindex and no
form association, the control is exposed by nothing that a selector or an
assistive technology can find, and that is the answer rather than a gap
in the probe.

**CONTROL_SELECTOR IS NOT CHANGED YET.** Per D26, a change to what may be
matched is a change to the wrong-element surface, and the last widening
reintroduced the body-walk failure. The addition must describe a control
POSITIVELY - a named custom element such as `gem-icon-button`, or a
distinguishing attribute. "Any element containing a mat-icon" would sweep
in every decorated div on the page and is refused in advance.

### D34s - NOTED, not chased: the region is wider than intended (M9)

The second reading collected "New Chat" - a SIDEBAR control - into the
composer's region. The hop limit is admitting controls from well outside
the composer's toolbar.

Harmless today, because the ambiguity rule refuses whenever more than one
candidate satisfies a rule, and nothing has yet satisfied one. It stops
being harmless the moment a discriminator fires: a rule that identifies
exactly one control across an over-wide region can identify one that is
nowhere near the composer.

The input-area test (the nearest common ancestor of control and composer
must not contain the transcript) already bounds the send-icon rule. It
does NOT bound `form-submit` or `aria-controls`, which were left
unbounded deliberately because both encode a relationship to the composer
- and that reasoning holds. What is unbounded is the COLLECTION, not the
rules.

Recorded rather than fixed because fixing it now would be an adjacent
tightening of exactly the kind D34n warns about: it closes no observed
defect, and the last such change broke the path it was meant to protect.
Revisit when a discriminator actually fires.


### D34t - The evidence was withheld from the reading that needed it, for the third time (M9)

The icon ancestor table printed for the landing-page reading and NOT for
the painted conversation reading, which is the one that mattered.

**Cause:** it was gated on `unmatched.length > 0` - emitted only when
some icon had NO enclosing control. On a conversation page where Add
files and Dictate are real `<button>` elements, nothing is unmatched, so
nothing printed.

**The gate encoded a wrong assumption about when the evidence is
interesting:** that ancestors matter only when nothing encloses the icon.
The opposite is closer to true. When something DOES enclose it, that
enclosing control is exactly what a positive clause gets written against
- so the reading suppressed the data precisely when it was most usable.

**Third instance of this family.** D34d gated forensics on composer
resolution, so a send-only failure emitted nothing. D34e gated the
reading on an element count that could contradict the probes. This gated
ancestors on a condition that is false whenever the page is working
normally. Each time the instrument went quiet on the case that mattered,
and each time the gate looked reasonable when written.

**Fixed by removing the gate, not by widening its condition.** Ancestors
now print for every icon - three icons, one small table each, no cost
worth gating for. That is the same repair D34e needed: a gate that
withholds evidence should be deleted unless it is paying for something.

**A new column that separates two failures which looked identical.**
`enclosingControlInCollectedSet` reports whether the enclosing control is
in the set the composer-anchored walk actually collected.
`matchedByControlSelector` alone could be TRUE while the walk never
reached that control, and "not a control" versus "a control the
collection missed" need completely different fixes. The reading now says
which.


### D34u - RESOLVED: Gemini renders no send control while the composer is empty. The adapter was correct throughout (M9)

Verified live: `healthCheck` ok, no failures, composer, response-root and
send-button all resolved - **with text in the composer**.

**Gemini does not render a send control when the composer is empty.**
Every prior reading was taken on an empty composer, so the element was
ABSENT, not unmatchable. `gemini/composer-in-send-region` matching 2/1
here against 0/0 previously corroborates it independently: that strategy
is anchored on the send control, so it can only match when one exists.

**All outstanding Gemini diagnoses are withdrawn. No selector fix, no
`CONTROL_SELECTOR` change, no walk change. The adapter was correct
throughout.**

**FOUR CONFIDENT DIAGNOSES OF ONE SYMPTOM, ALL WRONG:**

| # | Diagnosis | What was actually wrong with it |
| --- | --- | --- |
| 1 | stale marker selectors | the markers were fine; the element was absent |
| 2 | wrong region (walk stopped at the tools menu) | the region was fine; the element was absent |
| 3 | icon named `arrow_upward`, not `send` | true, and irrelevant - no control existed to carry it |
| 4 | not exposed as a control by the site | landing-page state only; on a conversation page with text it is a normal control |

Each was the best available reading of the evidence at the time, and each
was corrected by adding visibility rather than by reasoning harder. But
the thing that finally resolved it was not another instrument - **it was
reading the page in the state where the element exists.**

**The lesson, which supersedes the one recorded in D34r.** D34r concluded
"when a diagnosis is wrong twice, the fault is usually the instrument's
reach". That was right about diagnoses 1 and 2 and wrong as a general
rule. Diagnoses 3 and 4 were made with an instrument that could see
everything it needed to; what was missing was the PAGE STATE. Better
instruments cannot compensate for measuring in a state where the thing
under test does not exist.

**The corrected form: before diagnosing an absent element, establish that
the element should be present in the state you are looking at.** Four
rounds went to answering "why can we not find it" when the answer to "is
it there" had never been asked.

### D34v - CONFIRMED and WIDENED: two adapters report DEGRADED for correctly-absent elements (M9)

D34i recorded that a momentarily disabled composer must not put the
adapter into DEGRADED. The Gemini resolution widens it from a state to a
CLASS, and makes it considerably more urgent.

| Adapter | State | Element correctly absent | Current behaviour |
| --- | --- | --- | --- |
| ChatGPT | mid-generation | composer is disabled | DEGRADED |
| Gemini | **composer empty** | **send control not rendered** | **DEGRADED** |

**An empty composer is the default state of every page load.** So Gemini
currently reports DEGRADED to every user, on every visit, until they type
their first character. That is not an edge case; it is the first thing
anybody sees.

**The health model needs a distinction it does not have:** "I cannot find
this element" versus "this element is not applicable in the current
state". Today both produce `not-found`, and `not-found` produces
DEGRADED.

**Blocking in either state guards an action that is impossible.** A
disabled composer cannot send. A page with no send control cannot send by
clicking one. The block buys no safety and costs the entire user-facing
impression - the same argument as D34i, now with two instances.

**This joins the M9 blocker set, which is now four.** The set is stated
in full, once, under "Status after M9 adapters" - four items, one shared
surface, one shared distinction, and the build order that follows from
them. It is NOT restated here: two copies of a list drift apart, and
checking code drifting from what it describes is one of this batch's
recurring defects (D34f).

**The safety constraint, unchanged and load-bearing:** the
not-applicable state must be entered only on POSITIVE evidence that the
element is absent BY DESIGN in this state - never on a bare `not-found`.
A missing composer masquerading as an inapplicable one would undo
fail-closed entirely. For Gemini the positive evidence is available and
cheap: the composer is empty, so no send control is expected.

### D34w - The English-aria-label dependency is real, uneven, and was invisible in two of three adapters (M9)

Gemini matched its send control live ONLY via an English `aria-label`, so
a Turkish, German or any localised Gemini would fail today. Checked
across all three adapters rather than assumed:

| Adapter | English clauses | Locale-independent clauses | Status |
| --- | ---: | --- | --- |
| ChatGPT | **0 of 3** | test id, element id, native submit | clean |
| Claude | **2 of 4** | `data-testid`, `type="submit"` | **latent** |
| Gemini | 1, last resort | markers + icons - **all failed live** | **active** |

So it is not a uniform cross-adapter gap, and reporting it as one would
have been wrong. ChatGPT has no such clause at all.

**The sharper finding is that it was UNOBSERVABLE in two of the three.**
Claude and ChatGPT resolved their send controls with a single
`querySelector` over a joined selector - one match, no record of which
clause produced it. Gemini's dependency was visible only because that
adapter reports provenance. **Claude could have had the identical
dependency and nothing would have said so.**

Claude's clauses are now split by locale dependence and `healthCheck`
warns when only the English ones match. The union is unchanged - nothing
about what matches was altered. ChatGPT's absence of an English clause is
now stated in the file rather than left implicit, so adding one later is
a visible decision rather than a convenience.

**Gemini's active dependency belongs with the i18n work**, not with
selector maintenance: the fix is a locale-independent marker on the send
control, and there is nothing to write until Google provides one or the
composer-anchored path can reach it.


### D37 - The injected surface: one host, three contents, built before any of them (M9)

First batch of the content-script flow. The surface alone; detection is
not wired to it.

**Built to serve all three contents rather than shaped around whichever
landed first.** The review panel, the degraded state and the
not-applicable state are the same host with different contents, and all
four M9 blockers close against it - so `surfaceState.ts` was written
before any rendering existed. Shaping the host around the review panel
and retrofitting the other two would have produced a panel-with-special-
cases rather than a surface.

**WHERE IT ATTACHES: `<body>`, positioned over the composer - not inserted
beside it.** SPEC asks for "a compact panel above the composer", which
reads as an instruction to insert into the composer's parent. That is
exactly where it would be destroyed: ProseMirror, Quill and Angular all
own those subtrees and reconcile foreign nodes away. The dangerous part
is that they do it on their own schedule, so an inserted panel WORKS IN
TESTING and vanishes mid-session.

So the host attaches to `<body>` and is positioned from the composer's
bounding rect, recomputed on scroll (captured, since scroll does not
bubble) and resize. If the page removes it anyway, a MutationObserver
re-attaches it - a panel that silently disappeared would leave the
extension believing it had warned the user.

**SHADOW MODE IS CLOSED.** Open would let the host page read the panel
through `element.shadowRoot`. The panel lists which ENTITY TYPES were
found in the user's text - never the values, but the classification is
itself something the page should not have, and the page is precisely the
party this extension exists to withhold information from. Closed costs
nothing: the class holds the root, and assistive technology traverses
closed roots regardless of mode.

**`all: initial` on `:host`, deliberately blunt.** Shadow encapsulation
gives one half of SPEC's requirement for free - nothing leaks out. It
does NOT give the other half: INHERITED properties still cross the
boundary. `font-family`, `color`, `line-height`, `letter-spacing`,
`direction` and `visibility` all inherit from the host element, so a site
with `body { letter-spacing: 3px }` restyles the panel without ever
selecting it. A list of individual resets is a list somebody has to keep
complete, and its failure mode is silent and site-specific. `all: initial`
cannot be incomplete.

**THEME FOLLOWS THE PAGE, NOT THE OPERATING SYSTEM.** The obvious
implementation is `prefers-color-scheme`, and it answers a different
question. All three sites have their own theme switcher, and a user
running ChatGPT in dark mode on a light OS is entirely ordinary - the OS
preference would put a bright card in the middle of a dark conversation,
which is the exact failure SPEC's requirement guards against. So the
page's rendered background is sampled, walking up from the composer
(a site can paint its conversation area differently from `<body>`, and
the panel sits by the composer), and luminance is computed by WCAG's
formula rather than a channel average - perceived brightness is not the
mean, and getting it wrong puts light text on a light panel. The OS
preference remains only as a fallback for when nothing opaque can be
sampled.

**ACCESSIBILITY DECISIONS, and the two that were not obvious:**

- The review panel is `role="dialog"` with **`aria-modal="false"`**. It
  demands an answer, so it is a dialog - but focus is NOT trapped.
  Trapping focus inside a panel floating over somebody's chat takes the
  page away from them, and the user may legitimately want to go back and
  edit rather than answer.
- The degraded state is `role="alert"` with `aria-live="assertive"` and
  **does not take focus**. It can appear while the user is mid-sentence;
  moving the caret would be worse than the problem it reports. A screen
  reader announces it without the user having to go looking.
- Escape is bound on the SHADOW ROOT, not the document. A global Escape
  handler would steal the key from the page.
- Focus is captured before a blocking panel opens and restored when it
  closes, so it is never stranded on a panel that no longer exists.

**INACTIVE RENDERS NOTHING AT ALL.** Not a badge, not a "waiting"
indicator. The element is absent by design; there is no problem to report
and no action to offer. A persistent indicator on every page load is
noise a user learns to ignore, and that is precisely how a real warning
gets missed later.

**The safety constraint is enforced by construction, not discipline.**
`Inapplicable` is a branded type with no public constructor. The only two
ways to make one - `sendControlNotExpected` and
`composerTemporarilyDisabled` - each REQUIRE a live, connected element in
hand plus the positive condition, and both return `null` when it does not
hold. **There is no path from a failure to this state**: a `not-found`
has no element to pass.

Two further guards, because "positive evidence" alone is not enough:

- **A partial explanation is not an explanation.** `explainsEveryFailure`
  requires the evidence to cover EVERY failed target. If the composer is
  empty (so no send control is expected) but the response root has ALSO
  gone missing, the adapter really has lost the page - one legitimate
  inapplicability must not silence an unrelated real failure.
- **An empty failure list returns false**, not vacuous true. Otherwise
  `every` over nothing would report a healthy page as INACTIVE.

**English-only strings**, per the milestone split; catalogues are M10.


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

## Status after M9 adapters

> **SUPERSEDED IN PART - read "Status after the M9 content-script batches"
> below for the current picture.** This section was written when the adapter
> layer closed and the content-script batch had not started. Its account of the
> adapters still stands. Its BLOCKER TABLE does not: D34i, D34v and D36 have
> since been closed or half-closed, and the "build order" it prescribes has
> been carried out. It is kept unedited because the reasoning that chose that
> build order is worth reading in the state it was decided in.

**Not the milestone close.** M9's content-script batch is still open. The
adapter layer is done and is summarised here while it is fresh.

Three adapters — claude.ts, chatgpt.ts, gemini.ts — on a shared contract,
plus the MV3 manifest, a two-pass build wired into the root script, a
shipped diagnostic, and a live-verification procedure. **982 tests.** All
three VERIFIED-WORKING live on 2026-08-29.

**What the layer actually guarantees.** SPEC calls selector resilience the
highest-risk area, and the answer is not better selectors — it is that a
WRONG selector cannot cause a silent leak. Four independent constructions
(D26): ambiguity is a hard failure rather than a tie-break; the element
detection ran on must be the same NODE the user's own submit event
resolves to; an element nobody has typed into cannot be bound; and every
write is read back. The selectors are the part allowed to be wrong.

That held. It was also **breached once, by its own repair** — a
region-walk fix reached `<body>` and bound a sidebar button while
`healthCheck` reported clean, which is precisely the silent-wrong-element
failure the constructions exist to prevent. It was caught by adversarial
review that REPRODUCED the failure rather than reasoned about it, and the
send control now carries the composer's ambiguity rule, because binding
the wrong send control has the same consequence as resolving the wrong
composer.

**The dominant finding of the batch is about instruments, not adapters.**
The extension shipped SILENT: injecting correctly, resolving correctly,
degrading correctly, and telling nobody — the only observable was a badge
that is empty on a healthy page. SPEC's strongest requirement is that
silent failure be impossible by construction, and it was unverifiable
until `diagnostics.ts` and `debug.ts` existed. **An unverifiable
requirement is not a requirement.**

Building that instrument then produced most of the batch's defects.
Thirteen were found in CHECKING code rather than production code (D34f),
falling into three shapes that recurred: gates that encoded an unmeasured
assumption about which condition would hold; checking code that drifted
from the production predicate it was checking; and assertions stated as
verified in places a reader would not re-derive them — a summary line, a
comment. Standing rules 7 and 8 came out of this batch and are the
durable part.

**Live verification found what fixtures structurally cannot (D35).** Every
fixture test passed throughout. Live found one real selector failure, one
state-model defect that would have degraded the extension through most of
a user's session, and **four wrong diagnoses of a single Gemini symptom**
— all four resolved not by a better instrument but by reading the page in
the state where the element exists (D34u). Fixtures encode a working
state and can never detect that the site has moved, or that the extension
is wrong about the site in any way that depends on it being live.

**What is NOT done, and is deliberately absent rather than stubbed:**
submit interception. Detection is not wired in, and an interceptor with
nothing behind it could only block every send or wave every send through.
The gate it will call (`verifyBinding`) is built and tested; the caller
arrives with detection.

### The M9 blocker set — four items, one surface, one distinction

Stated together because they were found separately and must not be built
separately. **Three of the four need the same state distinction, and all
four need the same injected in-page surface.** Building them in any other
order means building that surface once and that distinction three times.

| | Blocker | What is wrong |
| --- | --- | --- |
| **D29** | programmatic fills are blocked | a composer filled by a restored draft, a URL prefill or a SUGGESTION CHIP raises no editing event, so the input witness never sees it and the send is blocked. Suggestion chips are a first-run path on two sites |
| **D34i** | ChatGPT mid-generation | the composer is disabled while a response streams, `isEditableSurface` rejects it, and the adapter reports DEGRADED |
| **D34v** | Gemini with an empty composer | no send control is rendered at all, so `not-found` fires — and an empty composer is the default state of EVERY page load |
| **D36** | SPEC's visible degraded state does not exist | the only observables are a console diagnostic (off by default for store installs) and a toolbar badge; there is no in-page UI and nothing blocks sends |

**THE SHARED DISTINCTION** (D34i, D34v, D36): the health model cannot tell
*"I cannot find this element"* from *"this element is not applicable in
the current state"*. Both produce `not-found`, and `not-found` produces
DEGRADED. Blocking in the not-applicable states guards actions that are
already impossible — a disabled composer cannot send, and a page with no
send control cannot send by clicking one — so the block buys zero safety
and costs the entire user-facing impression.

Its safety constraint is load-bearing and unchanged: the not-applicable
state is entered ONLY on positive evidence that the element is absent BY
DESIGN in this state, never on a bare `not-found`. A missing composer
masquerading as an inapplicable one would undo fail-closed entirely.

**THE SHARED SURFACE** (all four): an injected shadow-DOM host. SPEC
requires all injected UI inside a shadow DOM, and M9 owns the review UI.
The review panel, the degraded state, and D29's confirm-and-send path are
the same host with different contents.

**Build order for the content-script batch, and the reason it is not
negotiable:** the injected surface FIRST, then detection wired to it,
then the send gate. Detection first and the surface last leaves all four
blockers open until the end of the milestone, which is where scope gets
cut.

### D38 - Adversarial review of the surface: what it found, and what the fixes actually were (M9)

Twelve findings across four groups. Recorded here rather than only in the
diff because three of them are about the DIFFERENCE between a check that
holds and a check that appears to hold, which is a shape that recurs.

**Group 1 - the state model let a caller reach INACTIVE without observing
anything.** Four separate paths, all closed in `surfaceState.ts`:

1. *The emptiness predicate was asserted by the caller, not observed.*
   `sendControlNotExpected(composer, text)` verified the ELEMENT and then
   trusted a `text` argument with no established relationship to it. A caller
   passing a live composer and `''` produced evidence about a composer that
   had text. It now takes a reader and CALLS IT with the element it just
   checked. A predicate whose input the caller supplies is not an
   observation.
2. *The disabled observer was not bound to the failure it explained.* It took
   a loose element, so it could describe a different node than the one that
   failed - evidence about something else entirely. `ResolutionFailure` now
   carries `rejectedCandidate` (populated only for `invariant`, the
   found-then-rejected case), and the observer reads the element off the
   failure. A consequence worth naming: an adapter whose strategies filter
   uneditable nodes out INSIDE `find()` reports `not-found`, carries no
   candidate, and the observer correctly refuses. Gemini's do that; ChatGPT's
   do not. The refusal is right - with no rejected candidate there is nothing
   to have observed.
3. *Coverage was decided on the target alone, so evidence could explain
   failure KINDS it contradicts.* "This site renders no send control while the
   composer is empty" would have explained an AMBIGUOUS send control - two
   were found, so they plainly exist. That is the ambiguity the whole adapter
   layer exists to make loud, silenced by evidence asserting the opposite.
   Each reason now whitelists the kinds it may explain.
4. *Nothing related evidence to the health report in TIME.* Evidence cached at
   page load could explain a failure detected minutes later, on a page that
   had since changed completely. They must now come from the same synchronous
   pass (250ms, generous for a slow layout, far too small for a cache), and
   evidence stamped AFTER the check is rejected too - it cannot have informed
   a decision that preceded it.

Also in this group: `surfaceStateFor` branched on `health.ok`, but nothing in
`HealthReport` constrains `ok` and `failures` to agree. A self-contradictory
report now resolves to DEGRADED rather than to whichever field was consulted
first. And the inactive state carries the full evidence LIST rather than
`[0]`, because indexing reports an item that may have explained nothing.

**Group 2 - the isolation claim was weaker than the comment said.** The
stylesheet wrote `all: initial` on `:host` and the header claimed it reset
every inherited property "in one stroke". Two errors:

- *The cascade, not the property.* The ENCAPSULATION CONTEXT step is evaluated
  BEFORE specificity, and for NORMAL declarations the OUTER tree wins. So any
  page rule matching the host - a bare `*` at specificity zero - defeated
  everything the panel declared. Dark-mode extensions and user stylesheets
  ship `* { ... !important }` as a matter of course. Beyond restyling, such a
  page could override `position: fixed` (dropping the host into flow as the
  last child of `<body>`, lengthening page scroll - the panel breaking the
  HOST, the other half of SPEC line 293) or `display: none` on the hidden
  state (an empty bordered band pinned over the composer, swallowing clicks).
  Every structural declaration is now `!important`, which reverses that step.
- *`all` is not quite "all".* It resets every property EXCEPT `direction` and
  `unicode-bidi`, both of which inherit and both of which cross the boundary.
  An RTL host would have mirrored the panel. Both pinned explicitly.

The test for this was a substring check for `all: initial` - present, and
losing. It now asserts that each structural property carries `!important`,
and says in its own comment that it reads the STYLESHEET rather than the
rendering, because jsdom implements no cascade for shadow trees and a
computed-style assertion there would pass whatever the CSS said.

**Group 3 - stacking, positioning and cost.**

- `z-index: 2147483000` loses to `2147483647`, and a `transform`, `filter`,
  `contain` or `will-change` on `<body>` or `<html>` takes the
  fixed-positioning containing block away entirely. Both are closed by the
  TOP LAYER: the host is a `popover="manual"`, whose containing block is the
  viewport and which paints above every stacking context in the document.
  "manual" rather than "auto" because an auto popover light-dismisses on an
  outside click, and a panel blocking a send must not vanish because the user
  clicked the page behind it. Feature-detected and the result RECORDED rather
  than assumed, because the fallback is a real behavioural difference.
- `reposition()` early-returned only for `hidden`, so every scroll event on an
  INACTIVE page - the default state of every page load until the user types -
  forced two synchronous layouts of a page we do not own. Guarded on
  visibility, and coalesced to one measurement per frame.
- No viewport clamping: a composer off the left edge or wider than the window
  produced a panel partly unreachable, with no scrollbar to reach it because
  the host is fixed. Clamped, with a readable-width floor.

**Group 4 - accessibility, where the panel changed state.**

- *ARIA was overwritten, never reset.* Each renderer set only what it cared
  about, so `review -> degraded` left `role="dialog"`'s `aria-label` in place
  and the alert was announced as "review what will be masked before sending" -
  a label for a panel that was no longer there, read out INSTEAD of the
  failure that replaced it. `review -> hidden` left `role="dialog"` on a
  `display: none` panel. Semantics are now cleared before the branch.
- *Focus was taken on every render, not on transitions.* Toggling an item
  re-renders the list, so each revert dragged the user off the button they had
  just pressed. Focus now moves only on the transition INTO review.
- *Focus was returned only when the panel hid*, so `review -> degraded` left
  the user inside a live region with nothing to operate, and `destroy()`
  stranded them on `<body>`. Both restore now.
- Per-item toggles all had the same accessible name when two detections shared
  an entity type; the position is appended, after the visible text, per WCAG
  2.5.3.
- The reverted-item de-emphasis used `opacity`, which composites and put 13px
  text below AA - the item the user chose to keep unmasked was the hardest to
  read. Now a solid muted colour.
- `.panel:focus` (not `:focus-visible`), because the panel is focused
  PROGRAMMATICALLY and `:focus-visible` is not guaranteed to match that: the
  indicator would have been missing at exactly the moment focus moved
  somewhere the user did not put it.

### D38a - The detached composer: D34i arriving at the surface layer (M9)

Not in the review's findings; called out separately and confirmed real.

The panel is positioned from the composer's bounding rect, so it depends on
that element being resolved AND connected. On all three sites it is replaced
mid-session - Gemini on SPA navigation, ChatGPT on a conversation switch.

What happened before the fix is worse than a crash. **A detached element still
answers `getBoundingClientRect()`, with all zeros.** Nothing throws. The
zero-rect branch is indistinguishable from "no anchor was ever set", so the
panel silently moved to its bottom-centre fallback and stayed there for the
rest of the session, because nothing in the system would ever notice the
anchor had died. A blocking review panel would have gone on pointing at
nothing, next to a composer it no longer tracked, while every component
reported success.

Three decisions:

1. **The surface detects, but does not re-resolve.** Resolution belongs to the
   adapter; a surface that went looking for a new composer would be a second,
   unaudited implementation of the thing D26's four constructions exist to
   make safe. It checks `isConnected` before every measurement and reports
   `onAnchorLost` once, and the owner re-resolves and calls `setAnchor` again.
2. **A lost anchor never hides a visible panel.** The fallback position is
   used and the panel STAYS UP. Hiding a blocking panel because we lost track
   of an element is fail-open: the send it was guarding would proceed
   unreviewed.
3. **`setAnchor` refuses a detached element outright.** Accepting one would
   defer the discovery to the next measurement and then report the loss as if
   it had just happened, when in fact the caller handed over a dead node.

The same reasoning covers the HOST being removed: re-attachment is now bounded
at 20, with `onSurfaceLost` reported at the bound. Unbounded re-attachment
against a page that removes unknown children on a schedule is a mutation loop
that never settles; and past the bound the surface is showing nothing and can
no longer claim to have warned anyone, which the owner must treat as blocking.

### D38b - No test file in the repository was typechecked (M9)

Found while fixing a review finding, and larger than the finding.

The review noted that `surface-state.test.ts` had a `@ts-expect-error` pinning
the fact that the branded `Inapplicable` type cannot be satisfied by an object
literal - the construction that stops a caller declaring a failure "not
applicable" without observing anything - and that the test did not test it: the
literal's `reason` widened to `string`, so the assignment failed for the wrong
reason and would have failed identically with the brand removed.

Underneath that: every package's tsconfig includes only `src/**/*.ts`, so
`tsc -b` never looked at a test file at all. The directive was not merely
weak, it was never evaluated - and `@ts-expect-error` fails loudly when the
error it expects does not occur, which is precisely the signal being thrown
away.

Fixed at the root: `tsconfig.test.json` (noEmit, not a project reference,
since `composite` requires emit and there is nothing to emit from tests) is
now part of `npm run typecheck`. Turning it on found three real type errors in
existing tests, each of which had been invisible:

- a forensics fixture missing two required fields, hidden because the spread
  of a `Partial<>` made everything optional;
- an `it.each` table whose second column - the adapter each URL must select -
  the callback never took, so the column asserted nothing. It is now asserted;
- a test that `delete`d `elementsFromPoint` off the shared jsdom document
  instead of restoring the original, which would fail a later test for a
  reason having nothing to do with itself.

The brand test was then verified BY VARYING THE CONDITION rather than
asserted: removing `readonly [InapplicableBrand]: true` fails the build with
`TS2578: Unused '@ts-expect-error' directive`, and restoring it passes.
### D39 - Detection wired to the surface, read-only (M9)

SPEC's content-script flow, steps 1 and 5. Steps 2-4 (submit interception,
the write-back, the send gate) are absent, not stubbed.

**The composition lives in the extension, not in core.** `analyze.ts` holds no
detection logic - every stage is core's. What it owns is the ORDER and what is
threaded between stages: resolve overlaps BEFORE calibrating and scoring
exposure (an unresolved set double-counts every overlap, so one credential
covered by three detectors would inflate the score threefold and appear three
times in the panel), then calibrate, then apply the profile, then mask, then
compute exposure. The playground has its own composition and it is
deliberately a different one - Stage 1 alone against a text area.

**Surrogates come from the masker, not from `chooseSurrogate`.** The masker is
what enforces the two properties a DISPLAYED surrogate must already have:
consistency through the session vault, and the collision check that stops a
surrogate from containing the value it replaces. Calling the generator
directly would show the user one string and substitute another.

**A reported detection with no surrogate throws rather than being skipped.** It
would be a detection the user cannot revert and one that will be substituted
anyway, so `entities.length !== reported.length` is a hard error.

### D39a - Why `findings` is a fourth state and not the review panel (M9)

The review panel is a blocking question: it takes focus, offers Cancel and
"Mask and send", and exists because a send is waiting on an answer. None of
that is true in this batch - there is no send gate - so rendering it would
mean two buttons that silently do nothing and a panel claiming a protection
that is not running. SPEC's no-stubs rule applies to UI as much as to
functions.

So `findings` is its own state: same host, same grouped list, same per-item
reverts (those record a real decision, held in the session, which the gate
will read), no actions. It is `role="region"` rather than `role="alert"` or
`role="dialog"`, and it does not take focus - it appears and updates while
someone is writing a message, so an alert would interrupt them on every
keystroke that changed the count and a dialog would announce a question
nobody asked.

It also says, in the panel, that sends are not intercepted. That string is
not an apology for an unfinished build; it is the difference between a panel
that reports and a panel that lies. A user reading "3 items to mask" and then
sending unmasked text is the exact failure mode this project treats as
critical, arriving as a UI string.

### D39b - The composer is re-resolved on every pass, never remembered (M9)

D34i and D38a at the controller. The composer is re-resolved on the health
poll, on navigation, and immediately whenever the surface reports it lost its
anchor. When the NODE IDENTITY changes:

  - the input listener is re-bound (bound to the composer rather than the
    document, so the site's own search box does not trigger analysis);
  - the surface's anchor is replaced;
  - **the session is cleared** - the vault held originals from a message the
    user has left, and a revert decided about that message is not a decision
    about this one.

Reverts are keyed by VAULT ID, which derives from the value rather than from
position. Typing a sentence above a detection shifts every offset below it, so
a position-keyed revert would silently transfer the user's decision to a
different detection.

Analysis is generation-counted. It is asynchronous, so two runs can be in
flight and the slower one can finish last; without the counter a result
computed from text the user has already replaced would overwrite the result
computed from what they are looking at.

### D39c - Fail-closed with nothing yet to close (M9)

SPEC: "Any detection error, timeout, or adapter failure blocks the send."
There is no gate, so nothing here can block. What it can do - and must - is
refuse to look successful. Every failure path sets DEGRADED, which is the same
state an adapter failure produces and the state the gate will read.

The controller test caught this being wrong on the first attempt: the composer
was resolved and READ one line above the try block, so an adapter that threw
on read produced an unhandled rejection and left the panel showing whatever it
had been showing - on a page where nothing had been found yet, an empty panel.
"Found nothing" and "could not look" are indistinguishable to a user and only
one of them is safe. Every adapter call is now inside the guard, `refresh()`
is guarded too (an adapter throwing there would have taken the health poll
down with it, after which nothing would ever re-check the page), and the
debounced call reports a rejection rather than voiding it.

Stale results are dropped on failure as well, or the next revert would
re-render a panel describing an analysis known to be wrong.

### D39d - The NER worker is the one part of step 1 that is absent (M9)

Reported rather than quietly skipped, because SPEC lists it in the same
sentence as the three things that are done.

It is not a wiring problem. The qualified model (BENCHMARKS.md M6:
xlm-roberta-base-ner-hrl, q8) is a ~280 MB asset, and it has to run WASM. A
content script is subject to the HOST PAGE's CSP for WASM compilation, and
`'wasm-unsafe-eval'` in this manifest applies to extension pages, not to
content scripts - so the model cannot run where detection currently runs. The
options are the service worker (evicted routinely, which would discard a warm
280 MB model) or an offscreen document, which needs the `offscreen`
permission. The manifest requests `storage` and nothing else, and
PERMISSIONS.md justifies that list; adding to it is a decision, not an
implementation detail. Hence a batch of its own.

Two constructions keep the absence from passing unnoticed:

  - `analyzeText`'s `ner` argument is REQUIRED and nullable. Stage 2 cannot be
    reached by forgetting it.
  - `stagesRun` is DERIVED from that argument, never declared, so an analysis
    cannot claim Stage 2 ran when no engine was passed. The send gate must
    refuse to ship while it is null, and this is the field that makes the
    refusal checkable rather than remembered.

### D39e - MEASURED, not fixed: 74% of the content script is a stage that cannot run (M9)

Wiring detection took `content.js` from a small script to **4,613,033 bytes**.
Three base64 string literals account for 3,386,068 of them: the M7 Bloom-filter
gazetteers (762,502 / 342,031 / 308,524 entries).

They are consulted only for PERSON / ORG / LOCATION candidates, and only Stage
2 produces those - so in a build with `ner: null` the gazetteers are never
decoded. The Bloom sets themselves decode lazily on first use, so no decode
happens; but the base64 still ships and is materialised as strings when the
module evaluates, in every tab, on all three sites.

NOT fixed here, deliberately. When NER lands the gazetteers are needed, so
this is not waste in the finished product - it is a question about where
detection should run, and the answer is entangled with D39d's offscreen-
document decision. Fixing it now would be choosing that architecture through a
size optimisation.

What was measured: the byte counts above, from the built bundle, and the
structural fact that `isGazetteerType` gates every lookup. What was NOT
measured: page-load impact in a real browser. A `vm.Script` compile timing was
taken and discarded as meaningless - V8 pre-parses and compiles function
bodies lazily, so the number describes the measurement rather than the load.

### D39f - `labelOf` moved into core; the masker widened to PipelineCandidate (M9)

Two small changes made because the alternative was a lie in a type or a
duplicate in a map.

`labelOf` was in `packages/web`. The extension's panel must name the same types
the same way, and two label maps drift the moment a type is added to one of
them - which is directly against the "adding a national identifier touches
exactly one new file" property. Moved to core (pure string work, no
environment), and web now imports it rather than keeping a copy.

`maskOriginal` and `resolveForMasking` took `readonly Stage1Candidate[]`.
Neither reads the `stage` discriminant, and the two candidate shapes are
otherwise identical - `Stage2Candidate extends Omit<Stage1Candidate, 'stage'>`.
Typing them to Stage 1 alone was the narrower claim, not the safer one: it
silently excluded PERSON / ORG / LOCATION, the entities SPEC most wants
surrogates for. `resolveForMasking` is generic in the candidate type so callers
that pass Stage 1 candidates still get Stage 1 candidates back.

### D39g - The fixture that detected nothing (M9)

Recorded because it nearly shipped as a passing test.

The first version of `detection.test.ts` used the obvious values -
`jane.doe@example.org`, card `4111 1111 1111 1111`. Both are RESERVED
DOCUMENTATION VALUES. The detectors find them and correctly mark them
`sensitive: false`, the analyzer correctly declines to offer masking for them,
and the test asserted against an empty entity set. Every assertion about
leakage, about surrogates never containing originals, about calibrated
confidence, would have passed vacuously.

Fixture values are now GENERATED with core's own seeded generators, which
produce valid-and-not-reserved instances by construction.

One observation from that first run, left as an observation: `4111 1111 1111
1111` was reported as a Japanese `NATIONAL_ID` at 0.94 - it passes the My
Number mod-11 check, and the credit-card detector's correct "known test value"
suppression means nothing outranks it. Pre-existing core behaviour, surfaced
by wiring rather than caused by it. Not chased here.
### D40 - The verification findings, ranked. The largest is that no test file was ever typechecked (M9)

D34f collected thirteen defects in checking code and drew the right lesson from
their shapes. This ranks that family, because the three added since are not
peers of the thirteen - one of them is the reason a whole class of check could
not have worked at all.

**RANK 1. NO TEST FILE IN THIS REPOSITORY WAS EVER TYPECHECKED.**

Every package's tsconfig includes only `src/**/*.ts`. `tsc -b` never looked at
a test. Consequences, in increasing order of seriousness:

- Type errors in tests surfaced only if they happened to break at run time.
- Every `@ts-expect-error` across 1,065 tests was **inert**. The directive's
  whole value is that it fails loudly when the error it expects does not
  occur; never being evaluated, it could only ever pass.
- The specific casualty found: `surface-state.test.ts` asserted that the
  branded `Inapplicable` type has no structural escape hatch - the
  construction that stops a caller declaring a failure "not applicable"
  without having observed anything. It asserted nothing. Worse, when the
  directive WAS finally evaluated, the assignment failed because `reason`
  widened to `string`, so it would have passed with the brand removed.

Enabling `tsconfig.test.json` immediately found three existing tests asserting
nothing: a forensics fixture missing two required fields (hidden because a
`Partial<>` spread made everything optional), an `it.each` table whose second
column the callback never took, and a test that `delete`d a standard method off
the shared jsdom document instead of restoring it.

This outranks the thirteen because those were individual checks that were
wrong. This was a mechanism that could not work, for a class of check, across
the entire suite, for the life of the project - and its failure mode was
silence.

**The standard it sets.** The brand test was then verified by REMOVING THE
BRAND and watching the build fail with `TS2578: Unused '@ts-expect-error'
directive`, then restoring it and watching it pass. That is what every check on
this list should have had: not "the test passes", but "the test fails when the
thing it checks is broken". Applied since, as a matter of course - the Stage 2b
move and the chunk cache were each verified by mutating the implementation and
confirming the specific tests fail (three mutants each; one survived and
exposed a test that passed for the wrong reason, below).

**RANK 2. THE WASM BENCHMARK FETCHED ITS RUNTIME FROM A CDN**, so every WASM
latency figure it published described a build that does not ship - in a project
whose first non-negotiable is zero runtime network access. Recorded in full at
D40b, because it was found later and its own story is worth reading.

**RANK 3. RESERVED DOCUMENTATION VALUES ARE RIGHT FOR LIVE DOM PROBES AND
WRONG FOR DETECTION FIXTURES.**

The first `detection.test.ts` used `jane.doe@example.org` and card
`4111 1111 1111 1111` - the obvious, responsible choices, and the same
instinct that is correct when building a page fixture. For a DETECTION fixture
they are exactly wrong, and for the same reason they are right elsewhere: the
detectors recognise them as documentation values and correctly mark them
`sensitive: false`, so the analyzer correctly declines to offer masking.

Every assertion in that file - that the panel never carries an original value,
that surrogates are consistent across runs, that confidence is calibrated, that
overlaps are not double-counted - ran against an **empty entity set** and
passed. A whole file of green tests about nothing.

Fixtures are now built with core's own seeded generators, which produce
valid-and-not-reserved instances by construction. The general rule: a fixture
for code that DETECTS sensitive values must contain values that are sensitive,
and "safe to write down" and "exercises the code" are in direct tension here in
a way they are not anywhere else in this repo.

**RANK 4. A TEST THAT PASSED BECAUSE ITS CLOCK MOVED WITH THE DEADLINE.**

The chunk cache's "a cache hit does not consume the inference deadline" test
mocked `Date.now()` to a fixed point far in the future. It passed - and it
passed just as well with the deadline checked BEFORE the cache lookup, which is
the defect it exists to catch. `recognize()` computes its own deadline from
`Date.now()`, so freezing the clock moves the deadline along with it and
expires nothing. The mock now advances after the first read. Found by mutation,
not by reading.

### D40a - NOTED, not chased: known-test-value suppression is scoped to one detector (M9)

Surfaced while wiring detection, verified rather than assumed, and left alone.

`4111 1111 1111 1111` - the canonical Visa test card - is reported as a
Japanese `NATIONAL_ID` at 0.94 calibrated confidence. Demonstrated:

```
CREDIT_CARD    detector=credit-card              sensitive=false
NATIONAL_ID    detector=national-id-jp-my-number sensitive=true
after resolveOverlaps over the SENSITIVE set:
  survives: NATIONAL_ID (national-id-jp-my-number)
```

**The finding is not "a false positive". It is where the suppression lives.**
`TEST_CARDS` is a `ReadonlySet` private to `creditCard.ts`, and
`sensitive: !TEST_CARDS.has(pan)` marks only the CREDIT_CARD candidate. There
is no registry of "values known to be documentation values". So a string one
detector knows to be a test value stays fully available for every other
detector to claim - and overlap resolution then actively prefers the claimant
that thinks it is sensitive, because "a non-sensitive candidate must never
displace one that would otherwise be masked" is the right rule for every other
case.

`sensitive: false` reads as a statement about the STRING and is a statement
about ONE DETECTOR'S READING of the string. That is the same shape as the
send-control finding: eleven clauses across three adapters shared one
unexamined assumption - a literal `<button>` tag - which the tier ladder made
look like independent fallback coverage. A property that reads as global and is
local.

**Low severity, and not chased now.** The consequence is a documentation value
being masked, which costs the user a surrogate they did not need - not a real
value being sent in the clear. The fix is a cross-detector suppression pass,
which is Stage 4 work with its own eval implications, and doing it inside a
wiring batch would put an unmeasured change into the scoring path.
### D40b - RANK 2, retrospectively: the WASM benchmark fetched its runtime from a CDN (M9)

Found while making the IPC comparison like-for-like, and large enough to sit
directly under the typechecking finding in D40.

`bench/wasm-latency` never set `env.backends.onnx.wasm.wasmPaths`. Left unset,
onnxruntime-web resolves its `.wasm` binaries from `cdn.jsdelivr.net`.
Confirmed by watching the network:

```
http://localhost:5202/hfmodels/.../onnx/model_quantized.onnx
https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.../dist/ort-wasm-simd-threaded.asyncify.wasm
```

**Two consequences.**

First, every WASM latency figure this harness published - the M9 numbers in
BENCHMARKS.md, and the WASM side of D30's WebGPU comparison - was measured
against a runtime downloaded at run time rather than the one the extension
bundles. The harness's own header says it exists because "the shipped
configuration cannot be measured from Node even in principle", and it was then
measuring a different unshipped configuration. D30's WASM-versus-WebGPU
CONCLUSION is unaffected - both sides fetched the same way, and the gap was
4-5x - but the absolute numbers describe a build nobody ships.

Second, and worse in kind: **a benchmark in a project whose first
non-negotiable is zero runtime network access was silently network-dependent.**
Nothing failed. Nothing warned. The only reason it surfaced at all is that the
extension - which cannot reach the network - was 3.1x faster on the cold path,
and a measurement that much better than its comparison is a defect report about
the measurement rather than a result.

The harness now serves the binaries from `node_modules/onnxruntime-web/dist`
over a local route and logs the resolved `wasmPaths`, so the same silence
cannot happen twice. The offscreen document reports its resolved backend in
`OffscreenStatus` for the same reason: a runtime that silently falls back is a
large latency difference and is invisible unless it is read back and printed.

### D41 - Stage 2 runs in an offscreen document. The lifetime was verified before anything was built on it (M9)

The decision was made externally: NER goes in an offscreen document, and the
service-worker option is closed - MV3 evicts an idle service worker after ~30 s
and model load is measured in seconds, so eviction would charge the user that
cost on a keystroke, repeatedly. What follows is the verification the decision
was conditional on, and what building it actually cost.

**VERIFIED FIRST, IN A REAL BROWSER** (`packages/extension/scripts/offscreen-probe`,
Edge 151.0.4129.107, 8 cores, results committed beside the scripts):

| claim | measured |
| --- | --- |
| Survives idle with state intact | **Yes at 45 / 120 / 300 / 600 s.** Same module-evaluation nonce throughout, and 64 MB of touched memory still checksummed correctly. |
| `crossOriginIsolated` inside it | **true**, and a Web Worker created there inherits it |
| Can compile WebAssembly | **Yes** |
| Content script can reach it directly | **Yes**, no service-worker hop on the message path |
| IPC round trip, no work behind it | **p50 1.2-2.0 ms**, near-flat from 0 to 20,000 characters |
| Reads packaged files not in `web_accessible_resources` | **Yes** - three such files fetched, all 200 |

`hasDocument()` alone could not have answered the first row: it cannot tell
"still resident" from "torn down and quietly re-created". The nonce can.

**RESIDENCY IS A CURRENT BEHAVIOUR, NOT A CONTRACT - and this is the finding
the decision most needs.** Chrome documents that only `AUDIO_PLAYBACK` sets a
lifetime limit and that "all other reasons don't set lifetime limits", and in
the Chromium source every other reason maps to an `EmptyLifetimeEnforcer` whose
`IsActive()` returns `true` unconditionally. But `TerminateDocument()` exists
and is unused, and Chrome DevRel has said on the record that they expect to
"add more checks to ensure offscreen documents are closed when they are no
longer being used".

So the code treats the document as something that can vanish: the recognizer
re-provisions on EVERY call (a cheap no-op when it is there), and a send is
blocked while the model is unavailable rather than proceeding unchecked.
**If Chrome does start closing idle offscreen documents, the model-load cost
returns to the user's critical path and the placement decision needs
revisiting.** That is reported, not worked around.

**THE CONTROL THAT REFUTED THE OTHER READING.** The idle probe also observed
the service worker never restarting across ten minutes, which reads as "the
offscreen document keeps it alive". Running the identical idle wait with NO
offscreen document showed the service worker still did not restart - so the
observation is an artefact of the debugger the test is driven through, and the
probe can say nothing about service-worker eviction. Reported as unmeasured.
(The Chromium source says the opposite of the naive reading anyway:
`ProcessManager::CanKeepalive()` returns false for `ViewType::kOffscreenDocument`.)

### D41a - A content script cannot compile WebAssembly under a host page's CSP. Measured (M9)

This is the load-bearing claim for the `offscreen` permission, so it is
measured rather than asserted. A probe compiled a minimal WebAssembly module
from inside a content script's OWN ISOLATED WORLD, on host pages serving three
policies:

| host page CSP | `new WebAssembly.Module(...)` in the content script |
| --- | --- |
| none | compiles |
| `script-src 'self'; object-src 'none'` | **throws** |
| `script-src 'nonce-...' 'strict-dynamic' 'unsafe-inline' https:` | **throws** |

The third is the shape Gemini actually serves (captured 2026-08-29: its
`script-src` carries `'unsafe-eval'` but no `'wasm-unsafe-eval'`). ChatGPT and
Claude refuse a plain header fetch, so their exact policies are unread; the
`self-only` row is the general case and does not depend on which of the three
is being visited.

An earlier probe compiled WASM successfully in a page and proved nothing: it
ran in the page's MAIN world, which is a different world with a different
policy. The isolated-world result is the one that bears on this.

`crossOriginIsolated` is also false in a content script's world, so even where
compilation succeeds the runtime is held to one thread - a second, independent
reason the model cannot live there.

### D41b - A named port, not runtime.sendMessage, and that is a privacy decision (M9)

`chrome.runtime.sendMessage` from a content script fires `onMessage` in EVERY
frame of the extension - Chrome documents it in those words. The payload on
this channel is the user's composer text, unredacted, because that is what the
model has to see. Broadcasting it would deliver the plaintext to an open popup
and to the options page (M10 adds both) as well as to the offscreen document.
It never leaves the extension's own origin, so it is not a leak; it is the
wrong shape for a tool whose premise is that this text reaches as few places as
possible.

A named port narrows delivery, with one rule making it exact: **exactly one
context may accept `NER_CHANNEL`**. Chrome specifies that when several
listeners respond, the first wins and the others are discarded silently, with
no defined ordering across contexts - and under fail-closed, losing that race
is a blocked send with no diagnosis. So the race must not exist.

The consequence worth stating plainly: **the service worker never receives
composer text.** It provisions the document and nothing else. The only contexts
that ever hold the text are the content script that read it and the offscreen
document that classifies it.

### D41c - One crossing per recognize, not one per chunk (M9)

The obvious boundary is `TokenClassifier`: proxy `classify()` and leave the
engine in the content script. It is the wrong one. The engine windows a
document into ~400-character chunks, so a 2,000-character message is seven
crossings instead of one - and each would carry the model's raw token
predictions back, which for a 400-character chunk is a hundred-odd
`{label, score, piece}` objects, far more data than the handful of spans they
decode to.

So the whole engine lives offscreen and the boundary is `recognize()`.
Alignment, decoding and the per-call deadline stay with the model. `runStage2`
and `detect` were changed to take a `NerRecognizer` interface rather than the
concrete `NerEngine`, which is also what keeps `engine.ts` - and therefore the
gazetteers it now pulls in - out of the content script's bundle.

**Two deadlines, deliberately.** The engine's own budget bounds inference. It
cannot help if the offscreen document dies mid-call, the port closes, or the
message is simply never answered: no timer on the far side would ever fire. So
the near side imposes its own, strictly larger, and treats its expiry as it
treats an error. The far side's deadline produces a useful diagnosis ("too
slow"); the near side's only ever means "did not answer", which is worse.

### D41d - The provisioning race, found by measuring rather than by reading (M9)

The first benchmark run failed with `Could not establish connection. Receiving
end does not exist.` The content script asked the service worker to create the
offscreen document and connected immediately, without waiting - and
`chrome.runtime.connect` to an absent receiver fails exactly that way.

The production path had the same race, and it would have shown up as a
detection error on every fresh page load, self-healing on a later retry, which
is the kind of intermittent failure that gets attributed to something else.

Fixed at both ends: the service worker replies only AFTER the document exists
(it previously returned `undefined`, closing the channel without an answer),
and the recognizer owns its own provisioning and awaits it before connecting.
Running that on every call rather than once is what also covers the document
disappearing later, which D41 says must be assumed.

### D41e - Two bundling findings, both from watching it fail (M9)

**A hand-picked list of ORT WASM variants is a guess about someone else's
hardware.** Four `ort-wasm-*` builds ship - plain, jsep, jspi, asyncify - and
which one loads is decided at run time by feature detection. Four were copied
by name; the runtime asked for `ort-wasm-simd-threaded.asyncify.mjs`, which was
not among them, and Stage 2 failed with "no available backend found". All four
are now copied by enumerating the directory. ~77 MB beside a 278 MB model is
the cheaper mistake than shipping the wrong one.

**onnxruntime-web has a non-bundled variant behind an export condition.** The
default embeds its `.wasm` binaries as base64 `data:` URIs - two literals
totalling 62 MB inside a 68 MB `offscreen.js`, which the document must parse
before the model can begin loading, and which were never reachable because
`env.backends.onnx.wasm.wasmPaths` points at the copied files. Selecting
`onnxruntime-web-use-extern-wasm` in the build's resolve conditions took
`offscreen.js` from **68,146,827 to 5,235,629 bytes**.

Vite's `assetsInlineLimit: 0` was tried first and changed nothing, because the
inlining is inside the distributed package rather than something the bundler
chose. That is recorded because the wrong hypothesis cost a build cycle and the
right one was one export-map read away.
### D41f - The IPC cost, measured. And a 3x cold-path gap left OPEN (M9)

Both paths re-measured after wiring, in the same machine state, at window 400
on 2,000-character documents - the same benchmark on both sides of the process
boundary (`bench/ipc-latency/run.py`).

| | in page (pre-IPC) | offscreen, via port | delta |
| --- | ---: | ---: | ---: |
| cold p50 | 638 ms | **~205 ms** | -433 ms |
| cold p95 | 714 ms | ~452 ms | |
| **incremental p50** | **97 ms** | **~104 ms** | **+7 ms** |
| incremental p95 | 204 ms | ~213 ms | +9 ms |
| per inference | 91 ms | ~29 ms | |
| model load, paid once | 4,184 ms | 7,440-8,366 ms | |

The offscreen figures are the median across five runs (cold p50 196.7 / 204.3 /
216.7 / 219.6 / 220; incremental p50 100.5 / 100.9 / 104.9 / 109.2 / 109.3).

**THE IPC COST ITSELF IS 0.4-0.5 ms p50**, measured directly with a `status`
call that does no model work, near-flat from 0 to 20,000 characters of payload.
One crossing per analysis, not one per chunk (D41c). Against a ~200 ms cold
path that is **0.25%**, and against the ~100 ms incremental path **0.5%**.

**The incremental path - the one SPEC's "pressing send is instant" rests on -
is unchanged within noise: +7 ms.** That is the number the wiring was at risk
of ruining, and it did not.

**THE COLD PATH IS 3x FASTER THROUGH IPC, AND THAT IS NOT REPORTED AS A WIN.**
A measurement far better than the thing it is compared against is a defect
report about the comparison. Chasing it found one real defect - the harness was
fetching its runtime from a CDN (D40b) - and fixing that changed the load time
from 21,296 ms to 4,184 ms and the inference time not at all: 640.9 ms before,
638 ms after.

So the gap survives a like-for-like comparison, and these explanations are
REFUTED rather than untested:

- *Different weights.* Both load `model_quantized.onnx`; the extension has no
  other file to load. Confirmed by watching the harness's network.
- *Different runtime source.* Local versus CDN moved load time by 17 seconds
  and inference by 3 ms.
- *Different ORT variant.* Both use asyncify. The extension's was established
  by accident: shipping only two variants failed with a request for
  `ort-wasm-simd-threaded.asyncify.mjs`. The harness's is in the CDN URL it
  fetched.
- *Different work.* Both produce 7 chunks over the same 2,576 characters (core
  snaps to word boundaries, so 378x6+308 against 400x6+176).
- *Cache pollution on the offscreen side.* The first version of the benchmark
  warmed on `docs[0]` and then measured it, reporting 1.1 ms for a
  2,000-character document. Fixed by warming on a document outside the measured
  set and dropping the port between samples; cold `min` is now 182 ms.
- *Different threading.* Both report 8 threads and `crossOriginIsolated: true`;
  both report `proxy: false`.

**LEFT OPEN, DELIBERATELY.** D27 is this project's record of what attributing a
4-6x latency swing to a plausible-sounding cause on a single co-occurrence
costs, and the correction that followed. There is no candidate here that has
been tested and held. Naming one now would be that mistake with better
manners.

What it does NOT affect: the decision, which was made on eviction cost and
CSP, not on speed; the incremental figure, which is the interactive one and is
flat; and the IPC overhead, which is isolated and small. What it DOES affect is
BENCHMARKS.md's cold-path numbers, which describe the in-page harness and are
now known to be pessimistic by roughly 3x relative to what the extension does -
in the safe direction, but wrong.

**One instrumentation attempt failed and is recorded because its failure mode
is instructive.** `OffscreenStatus` briefly reported which runtime files the
document had fetched, read from `performance.getEntriesByType('resource')`. It
returned an empty array every time: onnxruntime-web fetches inside a Web
Worker, which has its own Resource Timing buffer. A field that can only ever
report "nothing was fetched" reads as evidence and is an artefact of where it
was measured, so it was removed rather than kept and caveated.
### D42 - The send gate, verified live, and the one thing that is NOT confirmed (M9)

Run in a real browser against the shipped package, with the real offscreen
document and the real model: `packages/extension/scripts/verify-send-gate.py`.
The origin is real and the response is not - Playwright fulfils
`https://claude.ai/**` from the committed fixture - because the content script
is declared for three origins, and adding a localhost match to verify would
mean verifying a manifest that does not ship.

**CONFIRMED END TO END:**

  - a sensitive IBAN typed with real key events is DETECTED (findings panel);
  - pressing Enter is INTERCEPTED - the page's own bubble-phase handler
    recorded ZERO sends, so the message never reached it;
  - the REVIEW panel opens and blocks;
  - confirming WRITES THE MASKED TEXT BACK: the composer afterwards reads
    `please wire it to GB97BFDE26054573938622 today`, and the original
    `GB33BUKB20201555555555` is gone.

**NOT CONFIRMED, and stated as such: the release.** After the write the gate
refuses with `readback-mismatch` - "Wrote 83 characters but read back 109" -
so the message stays in the composer, masked, unsent. The value never left;
this is fail-closed doing its job. But "only the masked version leaves the
composer" is not demonstrated, because on this fixture nothing leaves it.

**The cause, as far as it is established.** `writeEditableText` selects the
editable's contents and calls `execCommand('insertText')`. On this DOM the
insert does not replace everything the selection covered: 26 characters of the
composer's decorative whitespace structure survive alongside the inserted
text, so the readback is 109 against the 83 written and `equivalentAfterWrite`
- which forgives only line-ending form and trailing whitespace - correctly
refuses.

NOT FIXED HERE. The fix changes the shared write path that all three adapters
use, so it needs its own verification on all three rather than a change made
in the tail of the session that found it. Two candidate directions, neither
yet tested: clear the composer as a separate step before inserting, or compare
the readback in a form that tolerates structural whitespace the editor owns.
The second is the more dangerous of the two and would need its counterexample
first - a loosened comparison is how a write that did not take starts passing.

### D42a - Two defects the live run found that no test would have (M9)

Both were invisible to the suite because both are about what a HUMAN reads.

**The degraded panel discarded the reason it was given.** `renderDegraded`
took only the failure TARGETS and printed one fixed sentence: "This site's
layout changed, so the extension can no longer find the parts of the page it
needs." That was true of its only caller when it was written, the adapter
health check. The send gate then became a second caller with refusals like
"your message is masked and ready, press send again" and "masking did not
remove an IBAN" - and every one of them rendered as a claim that the SITE was
broken. Not a vaguer version of the truth: a different and false one, which
tells the user to do nothing when there is something they can do.

Found by reading a screenshot. The panel is inside a closed shadow root, so
its text is not reachable from the page, and the assertions that existed
checked the states rather than the sentences.

**The refusal dropped `write.detail`.** The gate reported `(readback-mismatch)`
and nothing else, when the write path had already produced the diagnosis -
which reason, and the lengths involved, never the content. The one screen that
could explain a failed write was printing the least useful half of what it had.
Surfacing it is what turned "the write failed" into "83 written, 109 read
back", which is the whole difference between a symptom and a cause.
### D43 - The write path: source indentation is not content (M9)

D42 left the send gate masking correctly and then refusing to send, with
`readback-mismatch`. D42's stated cause was wrong, and finding that out was
the useful part.

**What the defect actually was.** A pretty-printed editable holds
whitespace-only TEXT NODES between its block children - the newline and spaces
from the HTML source. They render as nothing, and they are real nodes.

**FIRST MEASUREMENT, AND WHY IT LIED.** `scripts/probe-write-strategies.py`
tried five ways of replacing an editable's contents against the DOM shapes all
three adapters resolve, and reported that every one of them - including the one
that ships - was already exact. That was a defect in the probe: it built its
shapes from MINIFIED markup, which has no indentation text nodes, so it could
not reproduce the thing it was written to measure. Rebuilt with the fixtures'
actual whitespace, the same probe reports that NONE of
selectNodeContents+insertText, +delete, selectAll+insertText, +delete, or
selectAllChildren+delete removes them: every one leaves 72 characters where 46
were written. Chrome gives collapsed whitespace no editable position, so a
selection over the contents does not cover it. There is no execCommand that
does this.

**THE FIX IS ON BOTH SIDES, and the second half is the one worth remembering.**
Stripping the nodes before the write took the readback from 109 to 83 against
83 written - the same length, and still not the same string. The read was
still reporting the indentation AS CONTENT, so the masked text carried it and
writing it back inserted literal spaces where structural whitespace had been.
Fixing only the write made the numbers agree while the strings still differed,
which looks like progress and is not.

`isFormattingWhitespace` is now one predicate used by BOTH `readEditableText`
and `writeEditableText`. A whitespace-only text node among ELEMENT children is
inter-block source formatting; whitespace inside a block, and an editable whose
content is text alone, are untouched, so a composer legitimately holding spaces
still reads as holding them.

**THE READBACK COMPARISON WAS NOT TOUCHED.** It still forgives only line-ending
form and trailing whitespace. Loosening it would have made every one of these
runs pass without the write ever being fixed, which is exactly how a write that
did not take starts silently passing.

**Verified live, all three adapters** (`scripts/verify-send-gate.py`, exit 0):
each intercepts a real trusted Enter with the page's own handler firing zero
times, opens the review panel, and on confirm releases a message whose IBAN is
a surrogate. `GB33BUKB20201555555555` reached no page.

### D43a - NOTED: the fixtures misrepresent the DOM they snapshot (M9)

The indentation this decision is about does not exist on the real sites.
ProseMirror and Quill both serialise their own DOM without it. It exists in the
FIXTURES because they are pretty-printed HTML snapshots, and the formatting
became content the moment it sat inside a contenteditable.

So the bug the fixtures exposed is one the real sites would probably never have
produced - and the fixtures are more hostile than the thing they model, which
is the safe direction for a test to be wrong in. Left as it is: making the
fixtures faithful would remove a case the shared write path now handles, and
the handling is cheap. Recorded because a future reader comparing a fixture to
a real page will otherwise find the difference and wonder which is authoritative.
### D44 - Streaming restoration in the DOM, and why it is not core's Restorer (M9)

SPEC step 8. Core already has a `Restorer` and it is the wrong shape for this,
which is worth saying rather than leaving a reader to wonder why a second one
exists.

Core's is a LINEAR stream processor whose central guarantee is that it HOLDS
BACK a suffix which could still turn out to be a surrogate. That needs control
over what is rendered. Here the SITE renders: by the time a mutation is
observed the characters are already on screen, and there is nothing to hold.

So `DomRestorer` reaches the same properties by different means:

  - HOLD ON PARTIAL becomes DO NOTHING ON PARTIAL. A half-arrived surrogate
    does not match, so it is not replaced, and a later mutation completes it.
    Not replacing is already the safe direction, so nothing needs holding.
  - LONGEST MATCH FIRST is kept exactly - a surrogate that is a prefix of a
    longer one must never steal its match.
  - IDEMPOTENCE is free for core's own reason: the masker guarantees originals
    are collision-distinct from every surrogate. It matters more here, because
    sites re-render streaming markdown and the same node is visited repeatedly.

**IT DOES NOT FAIL CLOSED, and that is deliberate.** Everything else in the
controller blocks on failure. Restoration is a DISPLAY concern: if it fails the
user sees a surrogate where their own value should be - visible, and safe.
Escalating that to the blocking degraded state would take a cosmetic problem
and use it to stop the user sending anything. The difference is direction: the
gate protects data on its way OUT, where failure is a leak; restoration renders
data that is already home, where failure is an inconvenience.

**Where it refuses to write**: never inside an editable (an original the user
could send back), never inside our own panel (which shows surrogates on
purpose), never a detached node. The editability test is the ADAPTERS' own
`isEditableSurface`, not a local `isContentEditable` check - jsdom does not
implement that property, so a local test returns undefined and the guard
silently stops guarding. A test caught exactly that by restoring into a
contenteditable it was supposed to refuse.

**Known limitation, pinned by a test rather than left to be discovered**: a
surrogate SPLIT ACROSS TEXT NODES is not restored. Joining them means
rewriting the site's element structure while it streams into it, which is a
larger risk than the failure it prevents - and that failure is visible and
safe. A debounced settle pass re-scans the subtree once mutations stop, which
catches the transient splits that markdown re-rendering merges anyway.

The restorer is rebuilt whenever the session's vault is replaced. A restorer
built once would go on holding a vault nobody else uses - wrong, and a way to
keep cleared originals alive.
### D45 - The paste guard is early warning, and everything about it follows from that (M9)

SPEC line 288: "Submit-time remains the enforcement gate; paste guard is early
warning layered on top." Every decision here is that sentence applied.

  - **It does not preventDefault.** The paste happens exactly as asked. A guard
    that swallowed the paste to inspect it would be a gate, and there already
    is one.
  - **It is dismissible**, because ignoring it has to be safe - and it is, since
    the send gate catches everything the notice mentioned. A test dismisses the
    notice and then asserts the gate still blocks.
  - **Its failures are NOT escalated.** A failed paste summary reports and
    stops. Blocking the surface over a missing early warning would turn a
    convenience into an obstacle, and costs the user nothing the gate will not
    catch. This is the second deliberate exception to fail-closed, alongside
    restoration (D44), and for the same reason: neither is on the path where
    failure means a leak.
  - **`role="status"`, polite**, not an alert. It appears immediately after an
    action the user took; an assertive region interrupts a screen reader
    mid-word to announce something they are already expecting.

**The counts come from the PASTED TEXT, analysed separately, INTO ITS OWN
VAULT.** Reading the composer afterwards would count what was already there and
report it as newly pasted, which is not what "in what you just pasted" claims.
The separate vault matters more: registering these surrogates in the session
vault would mint entries for values that may never survive into a sent message,
leaving the restorer hunting for surrogates nobody ever sent.

**"Mask now" runs the gate's own apply-certify-write, minus the release.** A
value masked from the notice is masked under exactly the checks a sent message
gets. It does not send - that is the whole distinction from the gate.

**`lastReleasedText` became `lastMaskedText`, and now covers both writers.**
The hazard is not about releasing; it is about having written. A
format-preserving surrogate is by construction a VALID identifier, so
re-analysing text we masked detects the surrogates and masks them again -
a surrogate for a surrogate. Both the gate's confirm and "Mask now" set it, and
a test sends after "Mask now" to pin that the second pass leaves the text alone.

**Surface ownership gained a third owner.** `idle | gate | paste`: a notice the
user has not answered must not be overwritten by the debounced findings list
~180 ms later, which is the same defect the gate hit in D42a. A late-arriving
paste summary also yields to a gate already in progress, so an early warning
can never push a blocking decision off the screen.
### D27b - D27a is FLAGGED, not resolved, and the flag says which (M9)

D27a records a state this machine enters in which inference is 4-5x slower,
cause unknown. Its candidate list is all HOST instrumentation - OEM power
profiles, Defender scans, thermal limits - and every one of them needs the
anomaly to recur on demand, which it has not since. Waiting for that before
taking any further measurement was the wrong trade, and so was continuing to
take measurements that cannot say which state produced them.

**A machine-speed canary** (`bench/machine-canary.mjs`) now runs before and
after every latency run and is recorded ON the result. It is a deterministic
integer-mixing loop: no allocation, no I/O, no WASM, no model. It shares
nothing with what the benchmarks measure except the CPU, so a canary that slows
when the benchmark slows points at the MACHINE rather than at the code under
test.

  - `bench/calibrate-canary.mjs` establishes this machine's healthy cost.
    Baseline 2.2989 ms, 1.12x spread across kept rounds.
  - `bench/check-canary.mjs` scores a reading and exits 1 when degraded.
  - Threshold: 2.0x baseline - above ordinary variance, below the 4-5x D27a
    recorded, so it catches the state with room on both sides.

**Three things it deliberately does NOT do.**

It does not stop a run. A degraded measurement is still worth having; what must
not happen is comparing it against a healthy one without that being visible, so
the verdict travels with the number instead of gating it.

It does not report a missing calibration as healthy. An uncalibrated machine
scores `unknown`, because a baseline nobody has taken must not read as one that
passed.

**And it does not claim to be a diagnosis.** The canary detects "this machine
is slower than its own calibrated baseline". Whether that is the SAME condition
as D27a's inference slowdown is UNCONFIRMED and stays so until the anomaly
recurs and the canary is observed firing during it. It is a necessary condition
being tested, not an explanation. D27a remains open.

**Verified by varying the condition, not asserted**: with the baseline set to a
value the machine cannot meet, the check reports `degraded` at ratio 4.465 and
exits 1; restored, it reports `healthy` at 1.012 and exits 0.

One thing the calibration itself taught: its first run REFUSED, on a 1.38x
spread against a 1.35x limit, carried entirely by one preempted round. The fix
was to trim the slowest rounds before judging steadiness - a more robust
statistic - and explicitly NOT to loosen the limit. Trimming applies to
calibration only; the degradation check trims nothing, because there the slow
readings are the signal.
### D46 - A fresh clone can build the extension (M9)

The model is ~280 MB and is not in the repository. `build.mjs` warned about
what was missing, which is the right shape of failure - but there was no
documented way to satisfy it, so a fresh clone could not produce a working
extension at all. That is a hard blocker for M11's "production build verified
loading unpacked in Chrome", and far cheaper to close now than to rediscover
then.

`npm run ext:fetch-model` fetches it, and the build's warning now NAMES that
command rather than only describing the problem.

**This does not weaken the zero-network claim.** SPEC's non-negotiable is zero
RUNTIME network access - nothing outbound after install. This is the build-time
step that does the bundling; it runs on a developer's machine and never in the
extension. `packages/core`'s classifier already draws the same line, with
`allowRemoteModels` documented "build-time tooling ONLY".

**What actually protects the build is the digests, not the pin.** The revision
is a pinned commit on a content-addressed repo, so the URL cannot quietly serve
different weights - but every file is additionally verified against a SHA-256
in `model.manifest.json`, and those were computed FROM THE CACHE the M6 model
benchmark and every latency figure since were measured against. So the check is
not "did we get what the repo serves today" but "did we get the bytes this
project's published numbers describe". A mismatch DELETES the file and exits
non-zero; leaving it would mean the next build silently packages unverified
weights, which is exactly what a truncated download looks like.

`--write-manifest` is a separate mode on purpose. One command that both
downloaded and rewrote the digests it verifies against could only ever agree
with itself.

**Verified by varying the condition, three ways**: all files present reports
4 verified and exits 0; a deleted file is downloaded, verified and reported as
fetched; a manifest digest the real file cannot match deletes the download and
exits 1.

One self-inflicted note worth keeping: the first attempt to add the "Run: npm
run ext:fetch-model" line wrote a literal newline into a JS string and broke
`build.mjs` outright. It was caught immediately because the very next thing run
was the build - which is the argument for running the thing you just edited
rather than the thing you think you edited.

## Status after M9

**M9 IS CLOSED.** The extension detects, intercepts, reviews, masks, verifies,
sends, and restores — confirmed working end to end on all three target sites,
against their real editors.

**1,171 tests**; typecheck covers source and test files; lint clean; the
extension builds and loads. Every figure here was taken with its own exit code
checked.

SPEC's M9: "Extension: manifest, adapters, content script, review UI, streaming
restoration in the DOM. Paste guard; review panel shows the document exposure
score." All of it ships.

### Verified live, all three, against real editors

| site | method | result |
| --- | --- | --- |
| Gemini | harness (`scripts/verify-live-site.py`, exit 0) | real Quill accepts the masked write and it survives 7 s of reconciliation |
| ChatGPT | human, real account | masked surrogate **released into a real sent message**; the original never reached the page |
| Claude | human, real account | send intercepted, reviewed, masked, released |

The methods are not equivalent evidence and the table says which is which. The
harness is repeatable on demand; the human results are point-in-time
observations by a person with real credentials, which is the strongest evidence
available for a site that cannot be automated — and automating the two
logged-in sites was abandoned deliberately rather than worked around (D49's
Cloudflare reasoning).

### The whole content-script flow

| step | where |
| --- | --- |
| 1. identify site, load adapter, healthCheck, warm the recognizer | `content.ts`, `adapters/` |
| 2. intercept the submit before the page acts | `controller.onSubmit` |
| 3. run detection on what is about to be sent | `analyze.ts` + offscreen NER |
| 4. mask, certify, verified write, release | `sendGate.ts` |
| 5. review panel, grouped by type, with the exposure score | `ui/surface.ts` |
| 8. restore surrogates as the response streams | `detection/restore.ts` |
| paste guard | `controller.onPaste` |

**One surface, five contents**: hidden, findings, paste, review, degraded.
Closed shadow root, top layer, theme sampled from the page, positioning driven
through custom properties because `all: initial !important` outranks inline
styles from the outer tree (D48).

**Stage 2 runs in an offscreen document** with the gazetteers beside it:
`content.js` 4,613,033 → 1,269,540 bytes, one IPC crossing per analysis at
0.4–0.5 ms p50, incremental path 97 → ~104 ms.

**Zero runtime network confirmed by observation, not by reading config** (D45a):
the extension's own service worker is asked to fetch three external origins and
all three are refused, with a same-origin control proving the probe can tell
blocked from allowed.

### The blocker set, all four closed

| | |
| --- | --- |
| **D29** programmatic fills | CLOSED (D47). The block became a question: "Check this is your message", action relabelled "Protect and send". Only `no-input-witness` becomes a question; every other binding failure still refuses. |
| **D34i** ChatGPT mid-generation | CLOSED at the health model; detached-node half fixed at the surface (D38a). |
| **D34v** Gemini empty composer | CLOSED at the health model. |
| **D36** no visible degraded state | CLOSED. It exists, renders, and blocks. |

### What M9 corrected about itself

Six things this milestone published or believed were wrong when it started, and
each is recorded corrected rather than quietly restated:

- **The latency harness fetched its runtime from a CDN** (D40b) — in a project
  whose first non-negotiable is zero runtime network access.
- **No test file in the repository was typechecked** (D40). Every
  `@ts-expect-error` in the suite was inert.
- **A detection fixture used reserved documentation values** (D40), so a whole
  file asserted against an empty entity set.
- **The panel was never positioned** (D48) — top-left corner of every page, for
  three batches, in every screenshot.
- **The paint gate counted our own element as evidence the page had painted**
  (D49) — circular, and it could never report NOT PAINTED.
- **The region walk and the uniqueness test used two different admission
  rules** (D50), which is what made every Claude send fail.

### Carried into M10, none of it closed

- **Send-button selectors depend on an English `aria-label`** on all three
  sites. Every locale-independent clause fails, so on a non-English interface
  nothing matches and pointer sends become undecidable. The extension warns
  about this in its own diagnostic on every load, and it is invisible to anyone
  testing in English. **This is M10's problem**: it is an i18n defect in
  disguise, and M10 is the i18n milestone.
- **D27a** — the unexplained 4–5× machine slow state. FLAGGED, not resolved
  (D27b): a canary records the machine's state on every latency measurement.
- **D41f** — the extension's cold path measures 3× faster than the in-page
  harness under matched conditions, six candidate causes refuted, none named.
- From M8, untouched: **GENERIC_SECRET recall 55.4%**, TAX_ID recall 91.2%, one
  over-confident calibration bucket, thin mid-range calibration, **p50 latency
  255.8 ms against a 250 ms budget**.
- **D40a** — known-test-value suppression is scoped to one detector.
- **The transient DEGRADED on claude.ai** is real and correctly reported by the
  console; the panel suppresses it for 2500 ms (D49). Not a defect, but the
  console remains chatty during page load.

### The shape of what went wrong, across the whole milestone

Nearly every defect M9 found was a CHECK THAT LOOKED LIKE IT HELD. The
brand-forgery test that never compiled. The benchmark that measured a CDN. The
probe built from minified markup that could not reproduce the bug it existed to
find. The positioning assertion that passed in jsdom while the browser computed
zero. The paint gate that measured itself. The request log that saw 124
requests and none from the extension, and would have passed.

None of these failed loudly. Each reported success. What caught every one was
running the check against a condition where it should FAIL and confirming that
it did — now the default here, and why the brand test, the canary, the model
fetcher, the write path, the zero-network probe and the region walk were each
verified by breaking them on purpose.

### D47 - D29 closed: the block became a question (M9)

The gate refused a composer the user never typed into. Correct - the input
witness (D26 construction #3) exists to reject an element that might be a decoy
holding text while the real composer holds something else - and useless on a
path two of the three sites offer on first run: a restored draft, a URL
prefill, a suggestion chip.

**Only ONE binding failure became a question, and the ordering is what makes
that safe.** `verifyBinding` checks in sequence, so reaching `no-input-witness`
means everything before it PASSED: the event resolved to exactly one editable,
that element IS the one detection ran on, and it is still in the document. The
single unknown is whether the user typed the text - which is undecidable from
the DOM and perfectly decidable by the person reading the screen.

Every other code still refuses outright, because each means we do not know
WHICH element is being submitted, and no question to a user can establish that:
`undecidable`, `identity-mismatch`, `detached`.

The panel gains a notice - "Check this is your message... PrivacyShield did not
see you type it" - and the primary action is relabelled **"Protect and send"**.
The label is the answer to the question above it; "Mask and send" would read as
the same routine confirmation as every other send, which is exactly what this
is not.

**It asks even when nothing sensitive was found.** "Is this your message" is a
different question from "is there anything in it", and releasing because the
answer to the second is no would skip the first entirely - which is the whole
hole D29 describes.

`InputWitness.creditUserConfirmation` is deliberately NOT `creditOwnWrite`.
That method's contract is that it is only ever called after a binding check has
already passed, which is what makes it unable to launder an unwitnessed
element. This one is called precisely when that check did not pass, so reusing
the other would have made its comment false and its guarantee unenforceable.

### D48 - The panel was never positioned, for the whole send-gate batch (M9)

Found by looking at a screenshot from a real site, not by a test.

`styles.ts` declares `all: initial !important` on `:host`. For IMPORTANT
declarations the INNER tree beats the outer one - the rule that file's own
header explains at length - and an inline style on the host is outer-tree. So
the stylesheet written to protect the panel was overruling the panel's own
position. `position: fixed` with no offsets resolves to the static position,
and the panel rendered at the TOP-LEFT CORNER of every page instead of above
the composer.

It is in every screenshot taken across the send gate, the write-path fix and
the first live run. Nobody looked: the assertions were about STATE and TEXT -
`data-state`, the words in the panel - and none of them asked WHERE.

**The first fix did not work either**, and could not have been caught by the
unit tests. Setting the inline styles `!important` loses to `:host !important`
for the same inner-beats-outer reason. jsdom resolves no cascade, so a test
asserting `style.getPropertyPriority('left') === 'important'` passed while the
browser computed `left: 0px`. Measured directly, in isolation: with
`:host { all: initial !important }`, an inline `left: 400px !important`
computes to `0px`.

**Custom properties are the channel that works**, and for a reason already
written down in the same file: `all` does not reset them, which is why the
palette survives. `styles.ts` now consumes `left: var(--ps-left, auto)
!important` and the surface writes `--ps-left`. Measured: `--ps-left: 400px`
computes to `left: 400px`, in both the anchored and the fallback branch.

The tests now assert the custom properties AND that the stylesheet consumes
them - setting a property no rule reads is inert, and would have passed the
first version of these assertions.

### D43a - CLOSED for one site of three, against a real editor (M9)

gemini.google.com serves a real Quill editor WITHOUT LOGIN, which is what made
this checkable at all. `scripts/verify-live-site.py`, exit 0:

  - the extension attaches to the real page;
  - a composer filled without any editing event is INTERCEPTED and asks (D29);
  - confirming writes the surrogate into real Quill, which ACCEPTS it;
  - and it SURVIVES 7 s of the editor's own reconciliation - the question a
    fixture cannot answer, because a fixture has no editor.

Nothing was sent: every POST is aborted at the network layer before the confirm
step, and the run reports how many it blocked (10).

**claude.ai and chatgpt.com remain unverified live.** claude.ai sits behind a
challenge; chatgpt.com's logged-out page carries only a marketing textarea, not
the real ProseMirror composer. Both need credentials. Stated plainly rather
than presented as three-site coverage.

One thing the live run found in passing, NOT chased: on the logged-out Gemini
page the SEND CONTROL does not resolve - the composer-anchored search finds
seven controls in the region and refuses. The send gate does not depend on it
(it binds through the submit event, not a send selector), so the gate works
regardless; but healthCheck reports a `send-button` failure. Whether the
logged-IN page still resolves it is unverified since 2026-08-29.
### D50 - The Claude send refusal: one mechanism, two admission rules (M9)

Live on claude.ai, 2026-09-02, on a fully settled page with the composer
visible and text typed in: the send was refused as `undecidable` - "the submit
event did not resolve to exactly one editable element, so which text is about
to be sent cannot be established."

**What the page actually contains.** Six editable-ish elements beside the
composer:

  - FIVE `<input>` decoys, each carrying `aria-hidden="true"` ON ITSELF
    (levelsUp 0) and zero-size. One is
    `class="absolute -z-10 h-0 w-0 overflow-hidden opacity-0 select-none"`.
  - ONE `div[role="textbox"].tiptap.ProseMirror` - the real composer, not
    hidden, genuinely editable.

**The defect.** `composerRegionOf` walked up from the send button and stopped
at the first ancestor containing a send button and
`querySelector('textarea, input, [contenteditable="true"]')`. A zero-size
`aria-hidden` decoy satisfies that selector perfectly well. So the walk
answered "a composer is in here" about a container holding only decoys -
and `editableWithinRegion` then applied the FULL composer invariants, found
nothing admissible, and returned null.

One mechanism, two different notions of "editable", disagreeing. The button
submit path therefore had no origin composer, and `verifyBinding` correctly
refused a send it could not attribute.

The same line had been visible in every reading and was not read:
`claude/composer-in-send-region 0/0` - the region-based composer strategy
finding nothing, on a page where the composer was plainly there.

**The fix is one rule, named.** `isAdmissibleComposer` is now exported from
binding.ts, and both the region walk's stopping condition and
`editableWithinRegion` use it. A container qualifies as the composer region
only if it holds something that would actually be ADMITTED.

**What was deliberately NOT changed, and why each.**

`REGION_HOP_LIMIT` stays at 8. The stopping condition was wrong; raising a
bound at the same time would make it impossible to say which change did the
work - standing rule 8, which this project earned once already at D34n.
`lastComposerRegionWalk()` now reports `found` / `hop-limit` / `reached-root`
with a hop count, so if the bound IS the next constraint the next reading says
so with a number instead of a null.

`originComposerOfKeyEvent` keeps the LOOSE test, and tightening it would be
actively dangerous. It answers a different question - "is this keystroke
plausibly a send at all" - and its answer decides whether the event is
INTERCEPTED. When it returns null the adapters do not call back, so the
keystroke is never intercepted and THE PAGE SENDS. It is the one place in this
system where a stricter check fails OPEN rather than closed. A composer
transiently failing an invariant must still have its Enter intercepted;
whether the send is then allowed is `verifyBinding`'s decision, made with the
strict rule.

**Verified by varying the condition.** With the stopping condition reverted to
the loose test, the new regression suite reproduces the live failure exactly:
the walk stops at the decoy container and `editableWithinRegion` returns null.
With the fix, the region resolves to the container holding the real composer
and the uniqueness test returns it. The suite also pins that two admissible
composers in one region still refuse - the uniqueness guarantee is not
weakened by any of this.

### D50a - The transient DEGRADED on claude.ai is real, and the paint fix worked (M9)

Three console blocks became two after D49's paint-gate fix, and the remaining
DEGRADED is a different thing from the one that was removed.

  before   reading #1 at   7 ms, 126 elements,  0 controls, 1 custom -> PAINTED
  after    reading #1 at  15 ms, 764 elements, 39 controls, 0 custom -> PAINTED

`0 custom elements` is the fix: our own `privacyshield-surface` no longer
counts as evidence that the page painted. The 126-element shell reading is gone
entirely.

What remains is a LEGITIMATE reading of a genuinely painted page - 764
elements, 39 controls, response-root resolved - on which the composer really
was inside an `aria-hidden` subtree at 15 ms and really was not 450 ms later.
claude.ai marks it hidden during hydration.

**The console still reports it, and that is correct.** The console emits on
every verdict change by design (D31/D32): seeing a bad reading superseded by a
good one is what it is for. The 2500 ms grace period (D49) governs the PANEL,
which is what the user sees. The two are driven by different code paths -
`renderDiagnostic` on a verdict change, `detection.refresh()` for the surface -
and only the second should be quiet about a page still assembling itself.
### D51 - The region walk stopped three hops short, and the bound was doing the wrong job (M9)

Every button send on claude.ai was refused as `undecidable`, on pages where
the composer resolved cleanly from three other strategies. In-the-moment
instrumentation (D50b) produced the decisive reading:

    button:no-region x3, "the region uniqueness test NEVER RAN"
    hasAdmissibleComposer: false at ALL 8 hops
    hasSendButton: false, false, false, then true from hop 3

**The hypothesis that reading suggests is wrong, and was disproved by
construction rather than argument.** "False the entire climb" reads like the
composer being a SIBLING or COUSIN that climbing can never reach - so a tree
was built with the composer in a completely separate branch, meeting the button
only 12 hops up. The walk reported exactly the live shape (hop-limit, composer
never seen) while `querySelectorAll` on the common ancestor found it
immediately.

`querySelectorAll` on an ancestor covers EVERY descendant, including branches
that are siblings lower down, and any two connected nodes share an ancestor. So
climbing always reaches the composer eventually. It was never unreachable; the
walk stopped short.

**Two causes, both fixed, and only one of them was the bound.**

1. `hasSendButton` used `querySelector` alone, which searches DESCENDANTS. It
   was false while standing ON the send button and on the nodes inside it that
   a click actually originates from - three hops of an eight-hop budget spent
   before the walk had cleared the control. Now `matches() || querySelector()`.

2. The bound was 8 and the two elements share no ancestor within it.

**The bound is no longer what keeps the region tight, and that is the real
change.** The walk halts at the FIRST ancestor holding both a send button and
an admissible composer, so it returns the tightest such container that exists.
The old comment feared "a region spanning the whole page would make
editableWithinRegion's uniqueness test meaningless" - but a page-spanning
region can only be returned when that genuinely IS the tightest ancestor
containing both, and `editableWithinRegion` still refuses when more than one
admissible composer is inside it. Fail-closed now rests on the uniqueness test,
which is where it belongs, instead of on a number that also happened to break
the feature. 64 is a loop backstop for a pathological DOM, not a design
parameter.

**Verified by breaking it.** With the bound put back to 8, the distant-branch
test fails with exactly the live symptom - region null. Restored, it finds the
common ancestor and the uniqueness test returns the composer. A separate test
pins that two admissible composers in the tightest container still refuse, so
the guarantee the bound was mistakenly carrying is demonstrably carried
elsewhere.

**Not yet confirmed live.** This is the fix the evidence names; whether
claude.ai now completes a send is a separate claim, and it is the user's next
reproduction that establishes it.
### D52 - The Claude diagnosis, consolidated: four defects behind one symptom (M9)

Recorded as one entry because the individual fixes (D49, D50, D50a, D50b, D51)
read as unrelated, and the useful thing is the SHAPE they share: every one was
a check that reported confidently about something it could not actually see.

**The symptom, unchanged across six rounds.** On claude.ai, a real send was
refused as `undecidable` - "the submit event did not resolve to exactly one
editable element" - on a page where a forced diagnostic run seconds later
showed the composer resolving cleanly from three separate strategies with
healthCheck ok. A refusal that contradicts the state before it and the state
after it is explained by neither.

**Defect 1: the paint gate counted our own element as evidence the page had
painted** (D49). `paintEvidence` summed custom elements, and
`privacyshield-surface` is mounted by this extension on every page before
anything is measured - so `painted` was true BY CONSTRUCTION and the gate could
never report NOT PAINTED once we had attached. It declared a 126-element shell
PAINTED at 7 ms on the strength of "1 custom element", which was us. Circular
evidence. Excluding our own host removed one of the three console readings
entirely.

**Defect 2: one mechanism, two admission rules** (D50). `composerRegionOf`
stopped at the first ancestor holding a send button and
`querySelector('textarea, input, [contenteditable="true"]')`. claude.ai renders
FIVE zero-size `aria-hidden` decoy inputs beside its composer, and every one
satisfies that selector. So the walk answered "a composer is in here" about a
container holding only decoys, and `editableWithinRegion` then applied the FULL
invariants, found nothing admissible, and returned null.
`isAdmissibleComposer` is now one exported rule used by both.

**Defect 3: two paths silently wiped a standing degraded warning** (D49). When
the composer was empty, and again when analysis found nothing, `analyse()` set
a bare `hidden` - overwriting the health verdict about 180 ms after it
appeared. Both are statements about the MESSAGE being made to override a
statement about the PAGE. Same shape as D42a, where the debounced analysis
overwrote the gate's refusal.

**Defect 4: the walk stopped three hops short, and the bound was doing the
wrong job** (D51). `hasSendButton` used `querySelector` alone, which searches
DESCENDANTS - so it was false while standing ON the send button and on the
nodes inside it that a click originates from, spending three hops of an
eight-hop budget before the walk had cleared the control. And the button and
composer share no ancestor within 8 hops of each other. The bound is now a loop
backstop; tightness comes from halting at the first ancestor holding both, and
fail-closed comes from the uniqueness test rather than from a number that also
broke the feature.

### What actually moved the diagnosis forward

**Instrumenting the decision, not the moments around it.** Five rounds of
readings were taken BEFORE or AFTER the refusal, and all of them disagreed with
it. The round that solved it put the capture inside `editableWithinRegion` and
the region walk - the code that literally decides "exactly one or not" - and
recorded what each saw as it decided. That produced `button:no-region` and "the
uniqueness test NEVER RAN" in one reading, which eliminated three of four
candidate causes immediately.

**Testing a hypothesis by construction instead of arguing about it.** The
final reading - `hasAdmissibleComposer` false at all 8 hops - reads like a
composer that climbing can never reach, a sibling or cousin rather than a
descendant. That is a reasonable inference and it is wrong. Building the tree
it describes, with the composer in a separate branch meeting the button 12 hops
up, reproduced the live shape exactly while `querySelectorAll` on the common
ancestor found the composer immediately. `querySelectorAll` covers every
descendant including branches that are siblings lower down, and any two
connected nodes share an ancestor. Ten minutes of construction settled what
would otherwise have been a plausible argument for redesigning the walk in the
wrong direction.

**Owning a gap in my own instrumentation.** The round-4 decision table promised
that `lastComposerRegionWalk` would report the outcome and hop count, and it
was never wired into the refusal renderer - so a trace containing everything
else could not answer the one question it was built for. That cost a round
trip, and saying so was cheaper than explaining the missing data away.

**The reading that was there all along.** `claude/composer-in-send-region 0/0`
appeared in every diagnostic from the first, on pages where three other
strategies matched 1/1. The region-based strategy finding nothing WAS the bug,
visible for six rounds, in output that was being read for other things.

### D53 - i18n: what the type system enforces, and what it cannot (M10)

SPEC.md: "Extension UI internationalized via chrome.i18n with English plus at
minimum Spanish, German, French, Portuguese, Turkish, Japanese, Hindi, and
Arabic (with RTL layout support)."

**The catalogues are TypeScript; `_locales/*/messages.json` is generated.**
`chrome.i18n` is the mechanism SPEC names and it is the right one - the browser
picks the locale, and the Chrome Web Store reads the same files for the
listing. But it has one failure mode that matters more in this UI than
anywhere else: `getMessage` answers a key it does not know with an EMPTY
STRING. No warning, no key name, nothing. A mistyped key or a locale missing an
entry is a BLANK BUTTON on the panel whose entire job is to tell someone their
data is about to leave.

So the catalogues live in `src/i18n/`, where `Catalogue` is a total
`Record<MessageKey, ...>` and a locale missing a key does not compile, and
`scripts/build.mjs` generates the JSON. Type safety at author time, the
platform's own format at run time, one source of truth. `t()` is typed to
`MessageKey`, so the typo case is a compile error before it can be a runtime
one, and English is bundled as the floor so the worst case is legible English
rather than nothing.

**Plurals are `Intl.PluralRules`, not one/other.** `chrome.i18n` has no plural
support at all, and the usual workaround - a `.one` key and an `.other` key -
is wrong for most of the languages SPEC requires. Arabic has SIX categories and
uses every one of them (zero, one, two for the dual, few for 3-10, many for
11-99, other for 100+). Japanese has one. Turkish does not mark the plural
after a numeral at all. `plural()` asks Intl for the category and looks up that
form, falling back to `other`, which every language defines; the generator
emits one chrome key per category the locale actually supplies. Arabic
generates 122 keys where English generates 73, and Japanese 97 - that spread is
the design working, not an inconsistency.

**Entity labels are `Partial` while messages are total, and the difference is
the floor.** A missing message renders as nothing. A missing entity label falls
back to `labelOf()` in core, which DERIVES "Credit card" from `CREDIT_CARD` -
real text, always. Requiring all 34 would make nine catalogues restate IBAN,
JWT, VIN and SWIFT/BIC, which are the same word in every one of them, and would
break D4's rule that adding a national identifier touches exactly one new file.
`entityLabel()` replaced `labelOf()` at the single site that builds a review
item, so the review groups and the paste summary were both localised by one
change.

**The RTL defect was mine, and D38 introduced it.** `ui/styles.ts` pinned
`direction: ltr !important` on the host, because `all: initial` does not reset
`direction` or `unicode-bidi` and an RTL host page would otherwise mirror the
panel. That reasoning is sound and the value was wrong: for an Arabic-speaking
user it welded a left-to-right panel in place with our own stylesheet, with
`!important` guaranteeing nothing downstream could undo it - the one part of
their browser that refused to mirror. The hardening requirement was never
"ltr", it was "the PAGE does not decide". The direction now comes from
`isRtl()` on the extension's own locale and keeps the `!important`. A test
asserts both directions and fails if `ltr` is hardcoded again.

**The eight translations must not ship without native review.** They are
machine-generated. Every locale file says so in its header and this entry says
so here, because "it compiles and the tests pass" is exactly the condition
under which a wrong translation ships quietly. The tests check structure -
placeholder budgets, plural completeness, no copy-pasted English - and
structure is not meaning. THIS IS A RELEASE BLOCKER, not a nicety.

**Known gap, deliberately not closed in this batch.** The ~20
`ResolutionFailure.detail` sentences produced by the adapters are rendered
straight into the degraded panel and are still English, so a non-English user
gets a translated title above an English explanation. Closing it means turning
each `detail` from a string into a key plus arguments, which touches every
refusal site on the fail-closed path - the code least suited to being churned
alongside a copy retrofit. Scoped and carried, not forgotten.

**The leak check, and why it exists.** Translations reach the page through
`chrome.i18n`, which hands back only the locale the browser is set to, so
`content.js` carries English and nothing else. `src/i18n/locales/index.ts` says
that in a comment; `scripts/build.mjs` is what makes it true, failing the build
if a translated string appears in the content script - the same reasoning that
keeps the gazetteers out of it. A claim about what links is worth exactly as
much as the check that enforces it. Verified by adding the import on purpose:
build exits 1 naming all eight locales, exits 0 with it removed. content.js
grew 1,276,157 to 1,283,093 bytes, which is English plus the lookup code.

**Verified by breaking it, per the standing rule.** The English fallback (4
tests fail when `t()` stops falling back), the placeholder-budget check (a `$3`
in Spanish where English supplies `$1`), the plural expansion (generator
emitting only `other`), the RTL pin (hardcoding `ltr` again), and the leak
check. Each was watched failing before it was trusted passing.

### D54 - Storage, the session log, and the popup: what is written and what is asked for (M10)

**What may go to disk, and what the third non-negotiable actually forbids.**
SPEC's rule is "originals live in memory only ... never storage.local". That is
about DETECTED VALUES - text lifted out of a message someone was writing. Two
things SPEC itself requires do live in `chrome.storage.local`, and neither is
that: SETTINGS, which the Options page exists to persist, and LOCAL INSIGHTS,
which SPEC defines as "counts only ... satisfying the no-plaintext-persistence
rule by construction". `src/storage/area.ts` is the single place the extension
touches storage, so the whole persistent surface is three method signatures and
one comment.

One caveat is recorded rather than hidden: the allowlist and denylist are
user-typed strings, and someone will type their own email address into "never
mask these". That is persisted plaintext they chose to persist, in their own
profile, which is a different thing from the extension quietly retaining what
it detected - but it is not nothing, and the Options page has to say so where
they type it.

**Fail-closed, applied to configuration.** `chrome.storage.local` returns
`any`. What comes back was written by an older version, or by a settings import
from a forum post, or by nothing. So every field is PARSED, not cast: unknown
values are discarded and the default replaces them, and the defaults are the
protective position - detection on, every site on, balanced. A corrupt store
degrades to protecting MORE.

`enabledFor()` is the one question the content script asks and it answers TRUE
unless storage explicitly and validly says otherwise. A read that throws, a
missing key, `disabledSites: null`, `disabledSites: "chatgpt"` - all of them
protect the site. Turning protection off has to be a decision someone actually
made. The tests assert this by feeding five malformed shapes and requiring the
site stay protected in every one; casting instead of parsing fails them.

The content script also PROTECTS FIRST AND READS THE PREFERENCE AFTER. Storage
is async and `start()` is not, so there is a window either way. Starting
enabled and switching off spends it protecting a site the user disabled;
waiting for storage spends it unprotected on a site they did not. Only one of
those two mistakes can leak.

**Insights records less than it could.** It is the only part of the extension
that writes a history, so what it leaves out is the design:

| kept | left out | why |
| --- | --- | --- |
| family (`secret`, `financial`) | the TYPE | "3 identity" instead of "3 US_NPI" - the narrower label hints at a profession or a medical situation, and SPEC asks for categories |
| month (`2026-09`) | any finer timestamp | an event log reconstructs working hours from counts alone |
| a count | the site | a per-site count is a browsing trail, which PERMISSIONS.md refuses on exactly these grounds |
| 24 months | anything older | a record that follows someone indefinitely |

`reset()` REMOVES the key rather than writing `{}` over it: an empty object
left behind is still a record that the extension was used. The test asserts the
stored blob does not contain the string `US_NPI` or `HEALTH_DATA` after
recording them, which is a check on the bytes rather than on the intent.

**The session log and Insights look alike and are governed differently.** The
log lives in the content script, dies with the tab session, and is therefore
allowed to be finer: per-TYPE counts, a timestamp per run, a confidence
histogram. It hangs off `DetectionSession` so `clear()` drops it with the
vault - the popup reporting the previous conversation's counts is exactly the
leak the session boundary exists to prevent - and `sessionSummary()` returns a
SNAPSHOT so nothing outside can hold a reference that survives.

The exposure aggregate is a PEAK and a MEAN, never a sum. The score is 0-100
for one document; adding them produces a number with no ceiling and no meaning.
The popup leads with the peak, because a single 90 matters more than an average
flattened by twenty harmless messages.

**The popup asks the tab who it is rather than reading its URL.** The obvious
implementation is `chrome.tabs.query` and `tab.url`, which needs the `tabs`
permission - the URL of every tab in every window, for a status line. Instead
the popup sends one message to the active tab and lets whoever is running there
answer with its own site id; a site with no content script does not answer, and
that silence IS the "does not run here" state. `tabs.query` is still used for
the tab ID, which needs no permission and carries nothing. Verified against the
real claude.ai: the reply is `{siteId, enabled, health, session}` and the test
fails on any fifth field.

**Quick Redact refuses rather than under-masks.** The tempting shortcut is to
let it run Stage 1 alone when the model is unavailable - it is a utility, not a
gate, so "some masking" looks better than none. It is worse than at the send
gate, because there is no review panel: the user copies the output and pastes
it into Slack believing it is clean, and a name Stage 2 would have caught goes
out with this extension's assurance behind it. So it checks `missingStages`
exactly as the gate does and shows a refusal in place of an output.

It also carries only the error's NAME, not its message. `${name}: ${message}`
is safe for the errors core raises - `DetectorError` deliberately keeps the
cause off its own message - but that is a convention, not a construction, and
the stack under this call includes the tokenizer and the ONNX runtime, whose
messages this project does not author. A library that quoted the input in an
error would put the user's text into a DOM node through the failure path. The
test asserts the value is absent from `detail` using an error message that
contains it. **The same pattern exists elsewhere on the failure path** -
`content.ts` and the controller both surface `${name}: ${message}` - and is
NOT changed here: it sits on the fail-closed path, the fix is the same three
lines in each place, and it deserves its own reviewed batch rather than riding
along with a popup.

**Two things moved because a second consumer appeared.** `familyOf` went to
core beside `labelOf`, for the reason already recorded there: "two maps drift
the moment a type is added to one of them", and Insights is now the second
surface that groups the same types. And `types.ts` declared a
`SensitivityProfile` string union that `index.ts` shadows with the profile
OBJECT from `fuse/profiles.ts` - unreachable through the public API, while
still being the first definition a reader finds by name. It is what made the
popup pass a string where an object was wanted. Removed; `ProfileName` already
was that union.

**Verified in a real browser, not in jsdom** (`scripts/verify-popup.py`). The
extension is loaded unpacked into Edge and the popup driven at its real 380px
width: no CSP violation, no uncaught error, a non-empty body (a CSP failure
produces an empty one and would let every later assertion pass vacuously),
roving tabindex with arrow keys, and Quick Redact masking a real address and a
checksummed IBAN out of the output. In Arabic it renders `dir=rtl`, Arabic tab
labels, and - for exactly two items - `أُخفي عنصران`, the DUAL form. That is
`Intl.PluralRules('ar').select(2) === 'two'` selecting a form no one/other
scheme has, in a browser, end to end.

**Three mistakes this batch made, all of the same shape.** The first test input
used `rene.dupont@example.org`; SPEC has the email detector classify RFC 2606
reserved domains as NON-SENSITIVE, so the check asserted that nothing happened
and then reported that nothing happening was fine - the same trap a detection
fixture fell into in M8 (D40). The second used a fixed 4-second wait that raced
the 6,568 ms cold model load and produced a different verdict on two
consecutive runs of identical code. The third printed "All popup checks passed"
while a check it had been asked to run was silently absent, and the summary now
prints NOT RUN and refuses the word "all". Every one of them was a green result
that meant nothing, which is the failure mode M9 catalogued and this batch
reproduced three more times.

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
