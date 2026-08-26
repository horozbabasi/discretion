# CLAUDE.md

## Orientation

privacyshield is a browser extension that detects and redacts sensitive information (PII, credentials, secrets) in text before it reaches AI chat interfaces (ChatGPT, Claude, Gemini). Everything runs client-side in the browser — no backend, no server-side detection, no telemetry.

- **SPEC.md** is authoritative for design. Read it before starting any milestone.
- **ARCHITECTURE.md** records decisions made while implementing SPEC.md and the reasoning behind them — append to it, don't just read it.
- **CLAUDE.md** (this file) is working conventions only. It does not restate SPEC.md.

**Milestones are built strictly one at a time**, tests passing, before the next starts. Currently: **M1-M3 complete** (Stage 0 normalization; Stage 1 with 113 detectors; the eval package with seeded corpus, hard negatives, metrics, error analysis, and regression gates — baseline published in `packages/eval/reports/baseline.md`, floors in `packages/eval/gates.config.json` enforced by `npm test`). M4 complete (session vault with capability-gated plaintext access, format-preserving surrogate substitution with recorded token fallback, streaming-safe restoration, egress guard — ARCHITECTURE.md D11–D13). M5 complete (packages/web playground: live Stage 0–1 detection with highlights and hover cards, masked output with surrogate/token toggle, corpus-generated multilingual examples, fail-closed UI, browser-smoke-verified — ARCHITECTURE.md D14). M6 (Stage 2 NER: model benchmarking and Web Worker integration) is next and has not started — `packages/extension` is still a placeholder. Milestones now run M1–M12: a post-M5 scope amendment (ARCHITECTURE.md D15) added M12 (post-launch npm publication of core) and new deliverables to M6–M11. `npm.cmd run eval` regenerates the baseline report. `npm.cmd run web:dev` serves the playground at http://localhost:5173.

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
