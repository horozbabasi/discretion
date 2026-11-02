# Development notes

## Orientation

Discretion is a browser extension that detects and redacts sensitive information (PII, credentials, secrets) in text before it reaches AI chat interfaces (ChatGPT, Claude, Gemini). Everything runs client-side in the browser — no backend, no server-side detection, no telemetry.

- **SPEC.md** is authoritative for design. Read it before starting any milestone.
- **ARCHITECTURE.md** records decisions made while implementing SPEC.md and the reasoning behind them — append to it, don't just read it.
- **DEVELOPMENT.md** (this file) is working conventions only. It does not restate SPEC.md.

Milestones are built one at a time, and tests have to pass before the next one starts. M1–M12 are done. The extension works on all three sites and has a popup, an options page, a submit backstop and an accessibility audit, and a fresh clone builds and loads it. `@discretion/core` and `@discretion/data` 0.1.1 are on npm, published with provenance by `.github/workflows/publish.yml`. The extension isn't on the Chrome Web Store: the listing and package are ready (`STORE-LISTING.md`, `packages/extension/SUBMISSION.md`) but haven't been submitted. Last recorded run (2026-09-03): 1,312 tests in 85 files, no typecheck or lint errors.

### Open items

None of these are fixed yet; don't mark any of them as done.

1. **Eight locales aren't reviewed, so they don't ship.** The build enforces this: `reviewStateOf()` drops any locale without a sign-off, `REVIEW_SIGNOFFS` is empty, and only `_locales/en` ships (D61: launch in English only). A sign-off means a person who reads the language has checked the 21 safety-critical strings. **Never add one based on a machine translation, a model's opinion of its own output, or a translation back into English.** The review sheets are in `docs/translation-review/` (21 keys, about 254 words each). Sign-offs store a digest, so changing a covered string drops the locale again. Claude Code wrote the translations, so its own AI-assisted pass over the 21 strings (`docs/translation-review/FINDINGS-ai-pass.md`, three findings) only looked for defects and doesn't count as a sign-off: a model can't catch its own systematic mistakes. None of the findings have been fixed, because rewriting a translation without a reviewer is just more machine translation.
2. **Two send paths aren't covered** (D57, D57a, D57b, D63). `form.submit()` doesn't fire any event, so no listener can see it. That one will stay open, because closing it would need main-world script injection, which the extension doesn't do. Clicks on a send button the adapter doesn't recognise also get through: all three adapters just `return` when a click doesn't match their send selector. The obvious fix would also catch the stop button, since "no send button found" is also true the whole time a response is streaming. Already closed: `form.requestSubmit()`/native submission (the submit backstop) and the `isComposing` Enter (D63, tested on real logged-in sessions). `packages/extension/scripts/probe-submit-routes.py` tries all five paths in a real browser and serves as a regression check.
3. **D27a is still open**: the unexplained slow-machine state. Run `node bench/check-canary.mjs` before trusting any latency number in this repo (D27b, D58).
4. **The cold-path latency gap is still open.** The extension's offscreen path measures about 3x faster than the in-page harness, and none of the explanations tested so far hold up (D41f).
5. **Screen-reader testing only covers the accessibility tree.** Nobody has used these pages with NVDA, VoiceOver or Orca (D56).
6. **The trademark isn't cleared, and the docs shouldn't say it is** (D65). No trademark register was searched: web search can't reach USPTO TESS or EUIPO, and a search engine finding nothing doesn't mean the register is clear. The search did turn up DiscreetTab, a privacy browser extension; the names share a root and both are privacy extensions. I decided to go ahead anyway and accept the risk. The packages are already published and npm has no rename, so renaming now means deprecating and republishing.

## Environment

- Node and `gh` are installed outside the usual locations but are already on PATH, so invoke them by name. (Paths omitted: this file is public.)
- PowerShell execution policy blocks `.ps1` wrappers. Use `npm.cmd` / `npx.cmd`, not bare `npm`/`npx`.
- LF line endings are pinned repo-wide via `.gitattributes` (`* text=auto eol=lf`) — don't fight this on a Windows checkout.
- Node version pinned via `.nvmrc` (24.18.0).
- This machine also has an old checkout stuck at M1 (`f4c9a6f`), and some tools report that one as the working directory. Run `git log --oneline -1` first to make sure you're in the right one.

Commands, from repo root:
- Build: `npm.cmd run build` (`tsc -b`, then the playground and extension bundles)
- Typecheck: `npm.cmd run typecheck` (`tsc -b --force`)
- Test: `npm.cmd test` (`vitest run`); watch: `npm.cmd run test:watch`
- Lint: `npm.cmd run lint` (`eslint .`)
- Fetch the NER model (REQUIRED before the first extension build; ~280 MB into
  gitignored `.hf-cache/`, pinned revision, SHA-256 verified):
  `npm.cmd run ext:fetch-model`
- Bench: `npm.cmd run bench` (builds, then runs `packages/core/dist/bench/normalization.bench.js`)
- Eval: `npm.cmd run eval` regenerates the Stage 1 baseline; add `-- --ner jiting/xlm-roberta-base-ner-hrl_onnx --dtype q8` for the combined Stage 1+2 run with NER gate enforcement (model cached in gitignored `.hf-cache/`)
- Playground: `npm.cmd run web:dev` serves it at http://localhost:5173

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
- **Adapters**: read the header of `packages/extension/src/adapters/types.ts` before changing any adapter. The four constructions in it (D26) are what keep things safe when a selector is wrong. They've been broken once, by a fix to themselves (D34k), so any change that widens what a strategy can match counts as a wrong-element change, even if it targets a different element. The send gate depends on two checks: it won't release while `stagesRun` is missing a required stage, and `verifyBinding` must be called, not skipped.
- **Surface state**: only switch to INACTIVE when there's positive evidence the element is missing by design, never on a plain `not-found` (`packages/extension/src/ui/surfaceState.ts`, D38).

## Publishing the library (from M12)

`packages/core` and `packages/data` are published to npm (currently 0.1.1). Every other workspace is `private: true` and should stay that way.

- **The public surface is exactly what `packages/core/src/index.ts` exports**, and `packages/core/test/public-api.test.ts` PINS it. Adding or removing an export fails that test on purpose: decide the version consequence, write the CHANGELOG entry, then update the pin - in that order. The same test walks the compiler AST and fails if a type named in a public signature is not itself exported, which is a defect `tsc` never reports.
- **`VERSIONING.md` is stricter than 0.x requires: a MINOR bump is the breaking one.** Detection behaviour is part of the contract - a change to what the engine detects ships with its measured before-and-after, not with an adjective.
- **`protect()` is the supported entry point.** `mask()` is NOT its smaller sibling: it runs Stage 1 only, with no context scoring, calibration or profile decision. Do not reach for it by name.
- **Never add a runtime dependency to core without checking what it drags in.** `@huggingface/transformers` is an OPTIONAL PEER because it pulls `onnxruntime-node`; an empty project installing core gets 20 MB, not 220 MB. `verify-standalone-consumer.sh` asserts the ONNX runtime is ABSENT, which is how that stays true.
- **The examples in `packages/core/examples/` are executed against the packed tarball**, not merely linted. They assert rather than only print - a script that prints something wrong still exits 0. If you change the API, run `npm run verify:consumer` before believing the docs.
- **Regenerate the API reference with `npm run docs:api`** after any surface change; `docs/api/` is committed.
- Detector edits require an eval re-run diffed against the COMMITTED reports in `packages/eval/reports/` - `git diff` on those files is the before-and-after, so never regenerate them casually.
- **Releases go through `.github/workflows/publish.yml`.** It won't publish locally, so every version's provenance links back to its source commit. It has published 0.1.0 and 0.1.1. The provenance check retries for up to 200 s because the registry is slow to show a new version. Rewriting history breaks that link for every earlier version (D66).

## Store submission and translations (from M13)

- The extension hasn't been submitted to the Chrome Web Store. The prepared listing and package are in `STORE-LISTING.md` and `packages/extension/SUBMISSION.md`.
- **The build ships `_locales/en` only, and that is deliberate.** `packages/extension/src/i18n/reviewed.ts` holds the gate. Do not add a `REVIEW_SIGNOFFS` entry without a named human who reads that language having gone through `docs/translation-review/<locale>.md`. Regenerate the sheets with `node packages/extension/scripts/make-review-sheets.mjs`.
- **Direction comes from `ui.dir`, not from the UI language.** `chrome.i18n.getUILanguage()` and `@@bidi_dir` both report what the browser is SET to, which diverges from what actually loaded once a locale is dropped. Anything that needs the reading direction must ask `isRtl()`.
- **Store assets are generated, not hand-made**: `make-panel-screenshot.py` then `make-store-assets.py`, output in `packages/extension/store-assets/`. Any value shown in a promotional image must be MEASURED output of `protect()` - the first tile draft depicted a format-preserving API-key swap the engine does not actually do.
- **Never composite the panel over anything resembling one of the three sites.** The panel screenshot is cropped to the panel for that reason: a capture of a fixture served from `chatgpt.com` would be a fabricated record of the product running where it did not.
- **Live-site probes use `.live-profile`, which the user logs into BY HAND** via `login-profile.py`. No script types, reads or stores a credential, and none may attempt a bot challenge. The profile is gitignored - never commit session data.
- **Run `probe-ime-live.py` with `--control`.** Without it, "nothing was sent" is indistinguishable from "nothing could have been sent", which is exactly how it once reported a pass against the logged-out landing page. D63 in ARCHITECTURE.md covers how to attach (start a browser with `--remote-debugging-port` and a non-default `--user-data-dir`, then log in by hand) and why the control has to check that its own Enter isn't a composing one.

## Scope amendments (post-M5 — SPEC.md, ARCHITECTURE.md D15)

Standing decisions a session must know before touching these areas:

- **Core is a standalone npm library** (`@discretion/core`). M12 made it publishable and it was first published on 2026-09-03. Its public API is supported: no extension- or playground-specific exports, no accidental breaking changes, and every export documented.
- **Exposure score is an M8 deliverable** — calibrated confidence only, no uncalibrated preview earlier. Binding constraints: explainable by construction (report decomposes into named contributions) and a monotonicity property test. Severity weights are a reviewed data file in `packages/data` with per-category rationale, never code constants.
- **Paste guard (M9):** early warning at paste time; submit stays the only enforcement gate, fail-closed unchanged.
- **Quick Redact (M10):** popup masking/restoring for any destination with zero added host permissions — the three-sites permission claim must survive it. Playground UI is the reference implementation.
- **Local Insights (M10):** persisted counts by category only — never values, never text. Counts may use storage; values never.
- **BENCHMARKS.md** is a standing deliverable from M6, extended at M7/M8.
- **Non-goals are recorded in SPEC.md** — attachment scanning and more sites are roadmap; vault export and any cloud component are rejected permanently. Do not relitigate.

## Working rules

**Standing rule 8: when a review finds a bug, fix that bug and nothing else.** Extra "while I'm here" tightening hasn't been reviewed, but it rides on the review's approval. For each changed line, ask which bug it fixes. If the answer is "none, it just felt related", do it separately or not at all (example: ARCHITECTURE.md D34n).

**Standing rule 7: a claim should only say what was actually tested, whether it's in a check, a summary or a comment.** The same mistake has turned up in all three:

- **A check** has to be computed from the data it checks, not from a separate proxy that can disagree with it. If a check is wrong, remove the proxy instead of tuning it; tuning just moves the point where it's wrong.
- **A summary** steers attention. An untested conclusion stops people looking, the same way a wrong diagnosis does, and it's more likely to be believed because it reads like a considered verdict.
- **A comment or doc** is something readers won't re-check. It should describe what this code does, not what the author assumed the rest of the system guarantees. If a comment claims a safety property, a test should pin it, or the comment should name the function that enforces it. Wrong comments last the longest: a console line gets re-read on every run, but a comment survives every refactor that doesn't touch it.

The bugs found in checking code rather than production code are collected in ARCHITECTURE.md D34f and ranked in D40; the comment example is D34k.

**Standing rule 6: repeating a measurement isn't replicating it, and naming a cause you haven't varied is worse than naming none.** Repeating a run in the same sitting rules out noise, not machine state. Change the conditions (power, temperature, load) or just say the cause is unknown. Don't name a cause only because you saw it alongside the effect (example: ARCHITECTURE.md D27, D27a).

- **Never `git commit --amend` a commit that's already on origin.** Add a follow-up commit instead. A force-pushed rewrite is the one mistake in this workflow you can't undo, because it destroys commits other clones may not have fetched. Amend as much as you like before pushing, never after. If a pushed commit's message or content is wrong, fix it with another commit. (The one deliberate full-history rewrite, which removed Claude Code's co-author trailers, is written up in ARCHITECTURE.md D66.)
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
- **Before debugging a missing element, check that it should exist in the state you're looking at.** Four confident Gemini diagnoses were wrong because every reading was taken with an empty composer (D34u). **Ctrl+Alt+Shift+P** re-runs the diagnostic in states that don't survive a reload: text in the composer, mid-generation, right after a paste.
