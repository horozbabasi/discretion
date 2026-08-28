# PrivacyShield

Local-first PII detection and masking.

> **Status: milestone M3.** This README is a placeholder; it gets written properly at M11.

Monorepo layout:

- `packages/core` — detection pipeline library (M1: shared types, script detection, Stage 0 normalization with an exact bidirectional offset map)
- `packages/data` — generated Unicode data (M1: confusables table)
- `packages/eval` — evaluation harness (M3: seeded corpus, hard negatives, metrics, error analysis, regression gates)
- `packages/extension` — browser extension (placeholder)
- `packages/web` — web playground (placeholder)

## Development

The library targets Node 20+ (`engines`). Development uses the version pinned
in `.nvmrc` (24.18.0).

```sh
npm install
npm run build      # tsc project-references build
npm test           # vitest (unit + property + fuzz)
npm run lint
npm run bench      # normalization throughput benchmark
```

### Regenerating the Unicode confusables table

`packages/data/src/confusables.ts` is generated and **committed**, so neither
the build nor the runtime ever touches the network. Regeneration is a
deliberate, occasional step:

```bash
npm run generate -w @privacyshield/data
```

This **fetches over the network** from
<https://www.unicode.org/Public/security/latest/confusables.txt>, and requires
Node 22.6+ for native TypeScript type stripping (the `.nvmrc` version
satisfies this; Node 20 does not). Set `CONFUSABLES_URL` to override the
source — a numbered version directory once Unicode publishes one for this
release, or a local file for offline regeneration.

The generated module records the Unicode version and the **SHA-256 of the
source bytes** it consumed. Unicode serves the current release from
`latest/` before publishing a numbered directory for it, so there is no
stable versioned URL to pin; the digest is the pin. Re-run the generator and
compare `CONFUSABLES_SOURCE_SHA256` to detect upstream drift.

## Evaluation

`npm run eval` builds a seeded synthetic corpus (25 languages, 11 document
types, hard negatives) and writes the Stage 1 baseline to
`packages/eval/reports/baseline.md`. Per-type accuracy floors live in
`packages/eval/gates.config.json` and are enforced by the regression test in
every `npm test` run — a change that regresses accuracy fails the build.

**The corpus is synthetic.** Entity values are generator-made, carrier
sentences are templates, and the hard negatives are constructed categories.
The published numbers measure the detectors against this corpus, not against
real-world text; treat them as an upper bound on recall (generators and
detectors agree by construction) and a rough, optimistic guide to precision.
Real-world performance will differ, and the context-free detector numbers in
particular will not survive contact with real documents until Stage 3
context scoring (M7) exists.

## Performance

SPEC.md sets the budget as **p50 under 250 ms and p95 under 600 ms for a
2000-character input on a mid-range laptop, excluding model warmup**, and
requires the measured numbers to be published here.

Measured on an Intel Core Ultra 7 258V (8 logical cores, 31 GB RAM), Node
24.18.0 on Windows, over 200 inputs of exactly 2000 characters built from the
eval corpus, with 30 warmup iterations discarded:

| path | p50 | p95 | p99 | budget |
| --- | ---: | ---: | ---: | --- |
| Stages 0–3 (pattern, gazetteer, context) | **10.6 ms** | **13.1 ms** | 15.1 ms | within, by ~20× |
| Stages 0–3 + Stage 2 NER | **255.8 ms** | **354.9 ms** | 601.6 ms | **p50 missed — see below** |

Reproduce with `node packages/eval/dist/bench/latency.js --samples 200
--ner jiting/xlm-roberta-base-ner-hrl_onnx --dtype q8`.

### The p50 miss, and which way the error runs

The combined path misses the p50 budget by 5.8 ms as measured — but 2.3% is
the *floor* on the miss, not its size. **Two known factors both push the
production number higher than this**, and neither is speculative:

1. **The hardware is above the reference point.** SPEC says "mid-range
   laptop". This was measured on an Intel Core Ultra 7 258V — Lunar Lake,
   2024, the second-highest tier in Intel's mobile Core Ultra line, the part
   used in premium thin-and-lights. A genuinely mid-range machine (a Core
   Ultra 5, or any older generation) is slower. By how much is not measured
   here and is not guessed at.
2. **The runtime is the faster one.** These numbers are onnxruntime-node on
   native CPU. The extension runs onnxruntime-web on WASM, which is typically
   slower for transformer inference. M9 measures the real target.

So the honest statement is: **the p50 budget is missed under conditions
favourable on both axes.** The measured 5.8 ms gap is a lower bound, and the
production gap is larger by an amount this project has not yet measured.
Reporting it as "a 2.3% miss" would understate it.

p95 clears comfortably at 354.9 ms against 600 ms, and has the same two
factors working against it, so that margin should not be treated as
comfortable either until M9 measures the browser.

The cost is the NER model, not the rest of the pipeline: Stages 0–3 alone
finish in about a twentieth of the budget.

The mechanism is chunking. Stage 2 windows input at 400 characters, a bound
set at M6 by the model's 512-token limit under the worst case of one token per
character (CJK). A 2000-character input is therefore about six inference
windows. For Latin-script text 400 characters is far below 512 tokens, so most
windows are underfilled and the input pays for more inferences than it needs —
sizing the window by the input's script would cut the inference count roughly
threefold. That is an M9 change, measured there rather than asserted here.

Two things this number is **not**:

- It is not the browser number. These are onnxruntime-node on CPU; the
  extension runs onnxruntime-web on WASM, which is typically slower. M9
  measures the real target.
- It is not what the user waits for while typing. SPEC puts NER inference in a
  dedicated Web Worker, so the main-thread row governs UI responsiveness, and
  detection is debounced and cached by content hash as the user types.

### Not comparable: the eval's per-document latency

`packages/eval/reports/` reports p50 115 ms per document, which measures a
different thing — the corpus's documents are p50 164 and p95 347 characters,
far shorter than the 2000-character benchmark input, and that figure includes
NER. The two numbers should not be read against each other or against the
budget; only the table above is measured as SPEC specifies.

## Licensing

MIT — see [LICENSE](LICENSE). The workspace packages are marked
`"private": true` because they are not published to npm, which is independent
of the project's license.

The bundled Unicode data is redistributed under the Unicode License v3; the
required copyright and permission notice is reproduced in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
