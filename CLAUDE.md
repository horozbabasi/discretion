# CLAUDE.md

## Orientation

privacyshield is a browser extension that detects and redacts sensitive information (PII, credentials, secrets) in text before it reaches AI chat interfaces (ChatGPT, Claude, Gemini). Everything runs client-side in the browser — no backend, no server-side detection, no telemetry.

- **SPEC.md** is authoritative for design. Read it before starting any milestone.
- **ARCHITECTURE.md** records decisions made while implementing SPEC.md and the reasoning behind them — append to it, don't just read it.
- **CLAUDE.md** (this file) is working conventions only. It does not restate SPEC.md.

**Milestones are built strictly one at a time**, tests passing, before the next starts. **M1-M8 complete; M9 in progress.** Verified 2026-09-02: **1,091 tests across 67 files**, typecheck (source AND test files) and lint all clean, each confirmed by its own exit code.

### Complete

- **M1-M3** - Stage 0 normalization with exact bidirectional offset maps; Stage 1 with 113 validated detectors; the eval package with a seeded corpus, hard negatives, metrics, error analysis and regression gates (baseline in `packages/eval/reports/baseline.md`, floors in `packages/eval/gates.config.json`, enforced by `npm test`).
- **M4** - session vault with capability-gated plaintext access, format-preserving surrogate substitution with recorded token fallback, streaming-safe restoration, egress guard (D11-D13).
- **M5** - `packages/web` playground: live Stage 0-1 detection with highlights and hover cards, masked output with a surrogate/token toggle, corpus-generated multilingual examples, fail-closed UI (D14).
- **M6** - Stage 2 multilingual NER. 14-run model benchmark published in BENCHMARKS.md; selected `jiting/xlm-roberta-base-ner-hrl_onnx` at q8, pinned by revision. Injected-classifier integration with alignment, chunking and a fail-closed deadline (D16-D17).
- **M7** - Stage 3 context scoring; Stage 2b gazetteers (1.41 M entries as Bloom filters at 3.2 MB - a data-protection decision as much as a size one); Stage 2c built, measured, and REMOVED under its own criterion (D18-D20). Four rounds of adversarial suppression review ran 562 executed inputs and found a leak in every rule, including identifiers un-redacted inside HTML/XML markup. Exit criterion met: hard-negative false positives 332 -> 190.
- **M8** - Stage 4 fusion, isotonic per-type calibration (held-out ECE 2.63% vs 12.33% raw, fitted on splits PROVED disjoint), explanations, sensitivity profiles, exposure score (D21-D24). Stage 0 digit folding closed a silent un-redaction: recall in six native-digit languages 66.17% -> 99.75%. Overlap resolution discharged M7's deferrals by REASSIGNMENT, not elimination - total false positives 2,991 -> 246.

### M9 - in progress

**Landed:**
- MV3 manifest with per-permission justifications (`packages/extension/PERMISSIONS.md`), two-pass vite build wired into the root `npm run build`, verified by actually loading the extension in a browser (`scripts/verify-loads.py`). Permissions are exactly `["offscreen", "storage"]`; there are no web-accessible resources.
- Three site adapters on a shared contract, all **VERIFIED-WORKING live 2026-08-29**. The state each was verified in is part of the result: Gemini renders no send control while the composer is empty, and ChatGPT disables its composer mid-generation. Policy and its limits: `packages/extension/ADAPTER-VERIFICATION.md`.
- The injected surface (D37, D38, D38a): closed shadow root, top-layer popover, four contents - hidden / findings / review / degraded - theme sampled from the page rather than the OS, and an anchor treated as borrowed because all three sites replace the composer mid-session.
- Detection wired to the surface, **READ-ONLY** (D39). Stages 0-4 composed for the extension; detections grouped by type with calibrated confidence, an explanation, and per-item reverts. Nothing is written to the composer.
- NER runs in an **offscreen document**, and the gazetteers moved with it (D41). `content.js` 4,613,033 -> 1,230,588 bytes. The IPC crossing is 0.4-0.5 ms p50, one per analysis, and the incremental path went 97 -> ~104 ms.

**Remaining:**
- **Submit interception, the masked write-back, and the SEND GATE** - SPEC's content-script steps 2-4. All three adapters expose `onSubmitIntent`; nothing calls it. Absent rather than stubbed, deliberately: an interceptor with no gate behind it can only block every send or wave sends through while looking like protection.
- **Streaming restoration in the DOM.** `observeResponseStream` exists on all three adapters; nothing consumes it.
- **The paste guard.** Not started.
- The `review` state is built and tested but has no driver - only the send gate can raise it. Until then the surface shows `findings`, which says in the panel that sends are not intercepted.

Read `src/adapters/types.ts`'s header before touching any adapter — the four constructions (D26) are what make it safe for selectors to be wrong. They were breached ONCE, by their own repair (D34k), so a change that widens what a strategy may match is a wrong-element-surface change even when aimed at a different element.

**THE M9 BLOCKER SET.** Stated in full in ARCHITECTURE.md "Status after M9 adapters", which still describes all four as open - it predates the content-script batch. Current state:
- **D29** - **OPEN.** Programmatic fills (restored drafts, URL prefills, SUGGESTION CHIPS) raise no editing event, so the input witness never sees them and the send would be blocked. A first-run path on two sites. The candidate fix is the confirm-and-send path in the review panel, which needs the send gate; it closes with the gate, not before.
- **D34i** - **CLOSED at the health model.** ChatGPT's disabled mid-generation composer is now positive evidence of by-design absence (`composerTemporarilyDisabled`), bound to the element the resolution actually rejected. Its detached-node half arrived at the surface layer and was fixed there (D38a).
- **D34v** - **CLOSED at the health model.** Gemini's empty-composer case is `sendControlNotExpected`, which reads the composer's text itself rather than trusting a caller's claim about it.
- **D36** - **HALF.** SPEC's visible degraded state now exists and is what a detection or adapter failure renders. Nothing blocks sends, because there is no send gate; that half closes with it.
The distinction all three rest on - **"cannot find this element" versus "not applicable in this state"** - is BUILT, in `src/ui/surfaceState.ts`. INACTIVE is entered only on positive evidence that an element is absent by design, never on a bare `not-found`; the evidence is a branded type with no public constructor, each observer must hold a live connected element, each reason whitelists the failure KINDS it may explain, and evidence must be contemporaneous with the health check it explains. Adversarial review found four ways round it and all four are closed (D38).

**NEXT: the send gate.** It is what closes D29 and D36's remaining half, and it is the last thing standing between detection and protection. Two constraints on it, both load-bearing: it must refuse to ship while `analyzeText`'s `ner` argument can be null - `stagesRun` is DERIVED from that argument, which is what makes "Stage 2 ran" a claim the code can support - and node-identity binding (`verifyBinding`) is already built and tested, waiting for its caller. Still to do in M9 after that: streaming restoration in the DOM, and the paste guard.

Diagnostic: **Ctrl+Alt+Shift+P** re-runs it in a state that does not survive a reload — typed composer, mid-generation, post-paste, which is where the remaining findings live. Before diagnosing an ABSENT element, establish it should be present in the state you are looking at: four confident Gemini diagnoses were wrong because every reading was taken on an empty composer (D34u).

Milestones run M1–M12: a post-M5 scope amendment (ARCHITECTURE.md D15) added M12 (post-launch npm publication of core) and new deliverables to M6–M11. `npm.cmd run eval` regenerates the Stage 1 baseline; add `-- --ner jiting/xlm-roberta-base-ner-hrl_onnx --dtype q8` for the combined Stage 1+2 run with NER gate enforcement (model cached in gitignored `.hf-cache/`). `npm.cmd run web:dev` serves the playground at http://localhost:5173.

## Environment (this machine)

- Node lives at `C:\Users\Pc\tools\node`, `gh` at `C:\Users\Pc\tools\gh\bin` — both already on user PATH.
- PowerShell execution policy blocks `.ps1` wrappers. Use `npm.cmd` / `npx.cmd`, not bare `npm`/`npx`.
- LF line endings are pinned repo-wide via `.gitattributes` (`* text=auto eol=lf`) — don't fight this on a Windows checkout.
- Node version pinned via `.nvmrc` (24.18.0).

Commands, from repo root:
- Build: `npm.cmd run build` (`tsc -b`)
- Typecheck: `npm.cmd run typecheck` (`tsc -b --force`)
- Test: `npm.cmd test` (`vitest run`); watch: `npm.cmd run test:watch`
- Lint: `npm.cmd run lint` (`eslint .`)
- Fetch the NER model (REQUIRED before the first extension build; ~280 MB into
  gitignored `.hf-cache/`, pinned revision, SHA-256 verified):
  `npm.cmd run ext:fetch-model`
- Bench: `npm.cmd run bench` (builds, then runs `packages/core/dist/bench/normalization.bench.js`)

## Non-negotiables (SPEC.md — never violate)

1. **Zero runtime network access.** No outbound request of any kind after install. Everything ships bundled at build time.
2. **Fail closed.** Any detection error, timeout, or adapter failure blocks the send. Fail-open is a critical bug, not a degraded mode.
3. **No plaintext persistence.** Originals live in memory only, per-tab-session, cleared on nav-away/close. Never `storage.local`/`localStorage`/`IndexedDB`. Never log or console-print a sensitive value, even in debug builds.
4. **No stubs.** Every function fully implemented — no TODOs, no placeholders.
5. **No detector ships without eval coverage.** Precision/recall/F1 measured and published, never asserted.

## Code conventions (from M1)

- **TS strict, all the way**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`/`noUnusedParameters`, `verbatimModuleSyntax`. `packages/core` additionally sets `"types": []` and eslint bans DOM/Node globals (`window`, `fetch`, `node:*`, etc.) inside it — core must stay environment-agnostic.
- **Offset-map contract** (`packages/core/src/offsetMap.ts`): every transform reports an `Int32Array` mapping normalized-index → original-index, composed across the pipeline via `composeMaps`. This is what lets a span found in normalized text be mapped back to the exact original span for redaction — get it wrong and redaction targets the wrong text. Use `mapNormalizedSpan()` to widen spans landing inside an NFKC expansion; never index the map directly for a range.
- **Transform composition**: each transform is `(text: string) => TransformStepResult | null` (`null` = identity, a no-alloc fast path). `normalize()` composes them in a fixed order: `stripInvisibles → nfkc (to fixpoint) → foldHomoglyphs → nfkc (to fixpoint, only if a fold fired) → normalizeWhitespacePunct`. Build output via the shared `MappedTextBuilder`, not ad-hoc string surgery.
- **Detector registry** (Stage 1, implemented in M2): detectors self-register (`registerDetector`) from one file each under `src/detect/detectors/<family>/`; the runner enforces the pattern-without-validator-caps-at-LOW rule and resolves original-text spans. Read `src/detect/AUTHORING.md` (2KB) before writing a detector — it is the whole contract, including the test standard and the D10 mutation-property policy.
- **Tests**: flat layout under `packages/<pkg>/test/*.test.ts`, not colocated with `src/`. `test/helpers.ts` centralizes invisible/combining-mark constants and `assertNormalizationInvariants` — reuse it rather than re-deriving invariants per test.
- **Property + fuzz tests use fast-check**: `*.property.test.ts` asserts invariants (round-trip, idempotency, single-script never folds, substitution-safety) over generated inputs; `*.fuzz.test.ts` runs a seeded PRNG (mulberry32) for thousands of iterations over biased "soup" generators, and prints a pasteable `U+XXXX`-escaped repro + seed on failure. New transforms need both, not just unit tests. fast-check's global seed is pinned (`test/setup.fastcheck.ts`, wired via vitest `setupFiles`) so property failures reproduce; never gate a commit on piped test output — the pipe eats vitest's exit code.
- **`spec-conformance.test.ts`** quotes the governing SPEC.md rule in each test's comment so spec drift fails the build — follow this pattern for new spec-derived rules.

## Skills in `.claude/skills/`

Developer-local tooling: `.claude/` is gitignored and not part of the repo (ARCHITECTURE.md D6), so a fresh clone will not have these. Where present, use each only in its stated scope, not incidentally:

- **`clean-code`** — active on all code work, every milestone.
- **`frontend-design`** — M5 playground, M9 review panel, M10 popup/options only.
- **`webapp-testing`** — M5 onward, once there's a browser surface to test.

## Scope amendments (post-M5 — SPEC.md, ARCHITECTURE.md D15)

Standing decisions a session must know before touching these areas:

- **Core is a future standalone npm library (M12).** From M6 on, its public API is a supported surface: nothing extension- or playground-specific in core's exports, breaking changes are deliberate decisions, every export documented.
- **Exposure score is an M8 deliverable** — calibrated confidence only, no uncalibrated preview earlier. Binding constraints: explainable by construction (report decomposes into named contributions) and a monotonicity property test. Severity weights are a reviewed data file in `packages/data` with per-category rationale, never code constants.
- **Paste guard (M9):** early warning at paste time; submit stays the only enforcement gate, fail-closed unchanged.
- **Quick Redact (M10):** popup masking/restoring for any destination with zero added host permissions — the three-sites permission claim must survive it. Playground UI is the reference implementation.
- **Local Insights (M10):** persisted counts by category only — never values, never text. Counts may use storage; values never.
- **BENCHMARKS.md** is a standing deliverable from M6, extended at M7/M8.
- **Non-goals are recorded in SPEC.md** — attachment scanning and more sites are roadmap; vault export and any cloud component are rejected permanently. Do not relitigate.

## Working rules

**Standing rule (8): when review finds a defect, the fix is the specific change that closes it.** Adjacent tightenings adopted in the same spirit are UNREVIEWED changes carrying the review's authority, and they are hard to catch because they look like diligence — they arrive in the same commit, under the same justification, at the moment the reviewer's finding has just been vindicated. Ask of every line: **which specific defect does this close?** If the honest answer is "none, it felt like the same kind of thing", make it separately or not at all. The instance: a review found a region walk reaching `<body>`; the fix was a stop at `body`, and the hop bound was ALSO cut 6→4, which did no safety work and broke the path the real fix existed to enable (ARCHITECTURE.md D34n).

**Standing rule (7): a claim must assert only what it actually tested — in a gate, in a summary, and in a comment.** Three forms of the same defect, found three times:

- **A GATE** must be DERIVED from the data it gates, never from a parallel proxy that can disagree with it. Fix a bad gate by removing the proxy, not by retuning it — retuning only moves the point at which it lies.
- **A SUMMARY** is a gate on ATTENTION. Stating an untested conclusion stops the reader looking exactly as a wrong diagnosis does, and is likelier to be believed because it reads as a considered verdict rather than as one more number.
- **A COMMENT OR DOC** is a claim the reader will not re-derive. It must describe what THIS code does, not what its author believed the surrounding subsystem guarantees. **Where a comment asserts a safety property, that property must be pinned by a test, or the comment must name the function that enforces it.** A wrong comment is the most durable of the three: a console line is re-read every run, a comment survives every refactor that does not touch it.

Twelve defects have now been found in checking rather than production code (ARCHITECTURE.md D34f). The gate instances each encoded an unmeasured assumption about which condition would hold, and each was wrong in a different direction — one concluded when it should not have, one stayed silent when it should have spoken, one refused when it should have concluded. The comment instance (D34k) claimed "a wider net that catches two candidates fails hard rather than guessing" directly above the code being widened: true of `resolveUnique`, false of `findSendButtons`, and sitting in the exact place a reader goes to verify the claim.

**Standing rule (6): repetition is not replication, AND naming a condition you have not varied is worse than naming none.** Reproducing a measurement within one sitting controls for noise, not for machine state. Vary the condition — power, thermal, load — or state plainly that the cause is unidentified. Never name a cause you merely observed alongside the effect: a false explanation makes a result look rigorous and stops the next person looking. The amendment comes from getting this wrong — D27 published "latency varies 4.4x with mains vs battery" from a single co-occurrence and a direct test on battery refuted it. The still-unexplained slow state is recorded as OPEN in D27a rather than explained away, and any latency figure measured while it is active is invalid.


- **NEVER `git commit --amend` a commit that already exists on origin.** Add a follow-up commit instead. This happened once: an amend rewrote a pushed commit, the histories diverged, and it was recovered with `git reset --soft origin/main` (which preserves the work as staged changes) followed by a fresh commit. Nothing was force-pushed and nothing was lost — but **a rewrite that HAS been force-pushed is the one unrecoverable mistake available in this workflow**, because it destroys commits other clones may never have fetched. Amend freely before pushing; never after. If a pushed commit's message or content is wrong, the fix is another commit saying so.
- Read SPEC.md before starting any milestone.
- Record every non-obvious judgement call in ARCHITECTURE.md with reasoning, not just the decision.
- Commit at the end of each milestone with a descriptive summary of what was built and measured.
- **Within a large milestone, commit and push at every clean batch boundary** (full suite green), not only at milestone end. During M2, a session limit killed a 7-agent fan-out with 1,300+ lines of passing, uncommitted work in the tree — batch commits are the guard against repeating that.
- Detector authoring is done in **serial batches in the main session**, not parallel agent fan-outs. Batch authors read `packages/core/src/detect/AUTHORING.md` (the 2KB contract), not all of SPEC.md.
- Report deviations from instructions explicitly — don't silently adapt.
- If SPEC.md contradicts itself, flag it and ask rather than quietly picking a reading. This has already caught two real issues.

## Traps already discovered

- **Homoglyph folding must stay selective.** It fires only on a script-minority token inside otherwise-dominant-script text, never on a dominant-script tie (ARCHITECTURE.md D3). Blanket folding destroys legitimate non-Latin text.
- **ZWNJ is linguistically meaningful**, not noise — required in Arabic-script and several Indic scripts for correct letter-joining. Stripping it corrupts the text. Preservation depends on the scripts of both neighbors (ARCHITECTURE.md D1) — see `shouldPreserveZwnj` in `stripInvisibles.ts`.
- **ZWJ inside emoji sequences is structural**, same reasoning as ZWNJ — don't strip it either.
- **NFKC must re-run after folding**, not just before it — a fold can produce a sequence that itself needs normalizing, and skipping the second pass breaks idempotency.
- **The fi-ligature-in-Greek-token bug**: fuzz-found case where folding a stray Latin `i` inside a Greek-dominant token to U+037A (GREEK YPOGEGRAMMENI) was individually valid, but U+037A's own NFKC form is a space + combining mark — changing tokenization and breaking idempotency. Fix: every candidate fold target is now rejected unless it's NFKC-stable (`normalize('NFKC') === itself`) and matches `/^[\p{L}\p{M}\p{N}]+$/u`. Lesson: per-character fold safety isn't enough — the replacement's own normalization behavior has to be checked too.
- **Transformers.js silently truncates past 512 tokens** — no error, the tail of the input is simply never scanned, which in this project is a silent fail-open. Stage 2 chunks at a character budget before the tokenizer ever sees the text (`chunk.ts`); never feed the pipeline unchunked input.
- **XLM-R CoNLL fine-tunes emit IOB1** (entities open with `I-`, not `B-`), and the token-classification pipeline returns pieces with no character offsets. The decoder handles IOB1+IOB2; offsets come from `alignPieces`, never from the pipeline.
- **fp16 ONNX models do not load on the onnxruntime CPU execution provider** (two failure classes, verbatim in BENCHMARKS.md). Unquantized comparisons run at fp32; don't burn time retrying fp16 on CPU.
