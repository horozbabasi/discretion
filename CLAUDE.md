# CLAUDE.md

## Orientation

privacyshield is a browser extension that detects and redacts sensitive information (PII, credentials, secrets) in text before it reaches AI chat interfaces (ChatGPT, Claude, Gemini). Everything runs client-side in the browser — no backend, no server-side detection, no telemetry.

- **SPEC.md** is authoritative for design. Read it before starting any milestone.
- **ARCHITECTURE.md** records decisions made while implementing SPEC.md and the reasoning behind them — append to it, don't just read it.
- **CLAUDE.md** (this file) is working conventions only. It does not restate SPEC.md.

**Milestones are built strictly one at a time**, tests passing, before the next starts. **M1-M10 COMPLETE — the extension protects, and now has a popup, an options page, nine locales and an accessibility audit. M11 (eval run, benchmarks, docs, store listing) NOT STARTED.** Verified 2026-09-02: **1,255 tests / 79 files**, typecheck (source AND test files), lint and build all clean, each confirmed by its own exit code.

**M10 closed with three items OPEN. None may be reported as done.**

1. **The eight non-English catalogues are machine-generated and unreviewed.** Structurally validated by tests, semantically unverified by any native speaker. **A release blocker; stays flagged through M11** (D53).
2. **A pointer send is not intercepted when the send control cannot be resolved** (D57). All three adapters `return` silently when a click does not match their send selector, so the page sends the ORIGINAL text — fail-open, with no other net behind it and with `healthCheck` blocking nothing. MEASURED 2026-09-02: no leak today (Gemini resolves via a locale-independent clause in Turkish, ChatGPT has no English clause at all, Claude's sit behind two). TWO MORE ROUTES to the same silent fall-through (D57a): an icon in a nested shadow root inside the button, which `closest` cannot see past; and `isComposing` — every adapter drops an Enter with it set, which can only be true for an IME user (Japanese, Chinese, Korean), and only `claude.ts` records that it happened. So the Enter path is NOT the safe harbour it first appeared. A fourth route: there is NO `submit` listener anywhere in the extension, so a programmatic `form.requestSubmit()`/`form.submit()` is untouched. Ctrl+Enter and Cmd+Enter ARE intercepted (only `shiftKey` is excluded). The adversarial audit's `trace:claude` agent FAILED on a connection error, so the Claude click path has one reader, not two. The fix is designed and ~10 lines per adapter; carried to M11 because its dangerous failure mode is spurious firing during page load, verifiable only against signed-in sessions on two of the three sites. `scripts/probe-send-locale.py` re-runs the measurement; `test/unrecognised-send-control.test.ts` pins the gap and is written to FAIL when the fix lands.
3. **"Screen-reader tested" is covered only for the accessibility TREE** — nobody has used these pages with NVDA, VoiceOver or Orca (D56).

**THIS MACHINE HAS TWO CHECKOUTS.** `C:\Users\Pc\dev\privacyshield` is the live one and holds all work from M2 onward. `C:\Users\Pc\OneDrive\Desktop\privacyshield` is frozen at M1 (`f4c9a6f`) with `packages/extension` still an empty placeholder, and some tooling reports it as the working directory. Run `git log --oneline -1` before trusting the tree you are in.

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

- **The SEND GATE** (D42, D43): intercept before the page acts, `verifyBinding`, fresh analysis, required-stages refusal, review, mask, certify, verified write, then a one-shot replay of the user's own action. Confirmed live on all three adapters - intercepted, masked, released, original never reaching the page.
- **Streaming restoration** in the response (D44), and the **paste guard** (D45) as early warning with a one-tap "Mask now".

**Remaining before M9 closes:**
- **D29's confirm-and-send path.** The gate now refuses a composer the user never typed into, which is correct and is a bad first-run experience. See the blocker set below.
- **Live-site verification of the write-back.** Confirmed against committed fixtures; not yet against the real ProseMirror/Quill instances (D43a).

Read `src/adapters/types.ts`'s header before touching any adapter — the four constructions (D26) are what make it safe for selectors to be wrong. They were breached ONCE, by their own repair (D34k), so a change that widens what a strategy may match is a wrong-element-surface change even when aimed at a different element.

**THE M9 BLOCKER SET.** Closed out in ARCHITECTURE.md "Status after the M9 content-script batches". Current state:
- **D29** - **OPEN, AND NOW USER-VISIBLE.** It was a prediction while nothing intercepted sends; since the gate landed it is behaviour. A composer filled by a restored draft, a URL prefill or a SUGGESTION CHIP raises no editing event, `verifyBinding` returns `no-input-witness`, and the send is REFUSED - fail-closed working as designed, and a bad first-run experience on a path two of three sites offer prominently. The fix was chosen before it was needed (D28 option d): convert the silent block into a visible "protect and send" confirmation in the review panel, which now exists.
- **D34i** - **CLOSED at the health model.** ChatGPT's disabled mid-generation composer is now positive evidence of by-design absence (`composerTemporarilyDisabled`), bound to the element the resolution actually rejected. Its detached-node half arrived at the surface layer and was fixed there (D38a).
- **D34v** - **CLOSED at the health model.** Gemini's empty-composer case is `sendControlNotExpected`, which reads the composer's text itself rather than trusting a caller's claim about it.
- **D36** - **CLOSED.** The visible degraded state exists and renders, and since the send gate landed it also blocks.
The distinction all three rest on - **"cannot find this element" versus "not applicable in this state"** - is BUILT, in `src/ui/surfaceState.ts`. INACTIVE is entered only on positive evidence that an element is absent by design, never on a bare `not-found`; the evidence is a branded type with no public constructor, each observer must hold a live connected element, each reason whitelists the failure KINDS it may explain, and evidence must be contemporaneous with the health check it explains. Adversarial review found four ways round it and all four are closed (D38).

**NEXT: D29's confirm-and-send path**, which is what M9 still owes along with live-site verification of the write-back on all three sites (D43a). Everything SPEC lists for M9 is otherwise built: the send gate, streaming restoration, and the paste guard all landed. Two constraints on the gate remain load-bearing - it refuses to release while `stagesRun` is missing a required stage, and `verifyBinding` is called rather than bypassed. Do not touch M10 until those two close.

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
