# CLAUDE.md

## Orientation

privacyshield is a browser extension that detects and redacts sensitive information (PII, credentials, secrets) in text before it reaches AI chat interfaces (ChatGPT, Claude, Gemini). Everything runs client-side in the browser — no backend, no server-side detection, no telemetry.

- **SPEC.md** is authoritative for design. Read it before starting any milestone.
- **ARCHITECTURE.md** records decisions made while implementing SPEC.md and the reasoning behind them — append to it, don't just read it.
- **CLAUDE.md** (this file) is working conventions only. It does not restate SPEC.md.

**Milestones are built strictly one at a time**, tests passing, before the next starts. Currently: **M1 complete** (monorepo, tooling, shared types, Stage 0 normalization with offset maps). M2 (Stage 1 validators) is next and has not started — `packages/eval`, `packages/extension`, `packages/web` are still placeholder workspaces.

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
- **Detector registry** (Stage 1, M2 — not yet implemented): each detector will declare id, entity type, region, candidate pattern, validator, base confidence, in its own file. Adding a national identifier must touch exactly one new file — `EntityType` is already modeled as families rather than per-country members for this reason (ARCHITECTURE.md D4).
- **Tests**: flat layout under `packages/<pkg>/test/*.test.ts`, not colocated with `src/`. `test/helpers.ts` centralizes invisible/combining-mark constants and `assertNormalizationInvariants` — reuse it rather than re-deriving invariants per test.
- **Property + fuzz tests use fast-check**: `*.property.test.ts` asserts invariants (round-trip, idempotency, single-script never folds, substitution-safety) over generated inputs; `*.fuzz.test.ts` runs a seeded PRNG (mulberry32) for thousands of iterations over biased "soup" generators, and prints a pasteable `U+XXXX`-escaped repro + seed on failure. New transforms need both, not just unit tests.
- **`spec-conformance.test.ts`** quotes the governing SPEC.md rule in each test's comment so spec drift fails the build — follow this pattern for new spec-derived rules.

## Skills in `.claude/skills/`

Only three remain, kept deliberately — use each only in its stated scope, not incidentally:

- **`clean-code`** — active on all code work, every milestone.
- **`frontend-design`** — M5 playground, M9 review panel, M10 popup/options only.
- **`webapp-testing`** — M5 onward, once there's a browser surface to test.

## Working rules

- Read SPEC.md before starting any milestone.
- Record every non-obvious judgement call in ARCHITECTURE.md with reasoning, not just the decision.
- Commit at the end of each milestone with a descriptive summary of what was built and measured.
- Report deviations from instructions explicitly — don't silently adapt.
- If SPEC.md contradicts itself, flag it and ask rather than quietly picking a reading. This has already caught two real issues.

## Traps already discovered

- **Homoglyph folding must stay selective.** It fires only on a script-minority token inside otherwise-dominant-script text, never on a dominant-script tie (ARCHITECTURE.md D3). Blanket folding destroys legitimate non-Latin text.
- **ZWNJ is linguistically meaningful**, not noise — required in Arabic-script and several Indic scripts for correct letter-joining. Stripping it corrupts the text. Preservation depends on the scripts of both neighbors (ARCHITECTURE.md D1) — see `shouldPreserveZwnj` in `stripInvisibles.ts`.
- **ZWJ inside emoji sequences is structural**, same reasoning as ZWNJ — don't strip it either.
- **NFKC must re-run after folding**, not just before it — a fold can produce a sequence that itself needs normalizing, and skipping the second pass breaks idempotency.
- **The fi-ligature-in-Greek-token bug**: fuzz-found case where folding a stray Latin `i` inside a Greek-dominant token to U+037A (GREEK YPOGEGRAMMENI) was individually valid, but U+037A's own NFKC form is a space + combining mark — changing tokenization and breaking idempotency. Fix: every candidate fold target is now rejected unless it's NFKC-stable (`normalize('NFKC') === itself`) and matches `/^[\p{L}\p{M}\p{N}]+$/u`. Lesson: per-character fold safety isn't enough — the replacement's own normalization behavior has to be checked too.
