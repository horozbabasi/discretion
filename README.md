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
   native CPU. The extension runs onnxruntime-web on WASM. M9 has since
   measured that, and the gap is not marginal: 697 ms against 255.8 ms on the
   same machine and the same input, on mains power. See below.

So the honest statement is: **the p50 budget is missed under conditions
favourable on both axes.** The measured 5.8 ms gap is a lower bound, and the
production gap is larger by an amount this project has not yet measured.
Reporting it as "a 2.3% miss" would understate it.

p95 clears at 354.9 ms against 600 ms, and the same two factors work against
it, so that margin was never as comfortable as it looked — the browser
measurement below confirms it does not survive the runtime change.

The cost is the NER model, not the rest of the pipeline: Stages 0–3 alone
finish in about a twentieth of the budget.

The mechanism is chunking. Stage 2 windows input at 400 characters, a bound
set at M6 by the model's 512-token limit under the worst case of one token per
character (CJK). A 2000-character input is therefore about six inference
windows. For Latin-script text 400 characters is far below 512 tokens, so most
windows are underfilled and the input pays for more inferences than it needs.
Widening the window was expected to be a straightforward win; M9 measured it
across four sizes and found it is a tradeoff rather than a win, which is why
the window stayed at 400. See "The windowing tradeoff" below.

Two things this number is **not**:

- It is not the browser number. These are onnxruntime-node on CPU. The
  extension runs onnxruntime-web on WASM, and the two differ by a lot; the
  next section measures the one that ships.
- It is not what the user waits for while typing. SPEC puts NER inference in a
  dedicated Web Worker, so the main-thread row governs UI responsiveness, and
  detection is debounced and cached by content hash as the user types.

### What actually ships: the browser measurement (M9)

**onnxruntime-node cannot measure the shipped configuration, even in
principle.** The Node build of Transformers.js offers `dml`, `webgpu` and
`cpu` execution providers and has no WASM provider at all. Every number in the
table above is therefore native CPU, which the extension never uses. Measuring
the real thing needs a real browser, so the benchmark in `bench/wasm-latency/`
runs the identical workload — same model, same q8 weights, same 2000-character
inputs, same machine, warmup discarded — under Edge with cross-origin
isolation enabled so WASM threading is actually available (8 threads).

Two paths are measured, because they pull the window size in opposite
directions and a single figure hides that:

- **Cold** — a full 2000-character document with nothing cached. What a paste
  costs. This is the path SPEC's budget is written against.
- **Incremental** — one character edited, every unchanged chunk served from
  the content-hash cache. The interactive steady state while someone types.

| window | chunks | cold p50 | cold p95 | incremental p50 | incremental p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 400 (shipped) | 7 | 3022 ms | 3305 ms | **442 ms** | 997 ms |
| 600 | 4 | 2425 ms | 2528 ms | 598 ms | 1290 ms |
| 800 | 3 | 2192 ms | 2481 ms | 763 ms | 1577 ms |
| 1200 | 2 | **1923 ms** | 2100 ms | 1045 ms | 1849 ms |

Measured on battery power, Balanced power scheme (see below). 15 samples per
cell. Across three independent runs the window-400 cold p50 landed at 3022,
3024 and 3056 ms — a spread of 34 ms, about 1%.

**Latency depends on power state by more than it depends on anything we
changed.** The same benchmark, on the same machine, on mains power, measured
**p50 697 ms / p95 805 ms** at window 400 and **p50 520 ms / p95 566 ms** at
window 1200 — 4.4x faster than the battery figures above. This was caught by
chasing a discrepancy rather than averaging it: the older benchmark file,
byte-identical apart from its sample count, reproduced the battery numbers
rather than its own earlier result, which ruled out the harness.

Consequently every figure here names its power state, and the tables are not
directly comparable to any published number that does not. The incremental
path has so far been measured **only on battery**; the mains column for it is
outstanding and will be filled before release rather than divided down from
the battery figure.

### The windowing tradeoff, and why the window stays at 400

Larger windows make the cold path faster and the interactive path slower, and
the four measured points show the crossover clearly: going from 400 to 1200
buys 1099 ms on a paste and costs 603 ms on every debounced keystroke burst.
Per character, a 1200-char window is about 1.35x more efficient — fewer, larger
inferences amortise the per-inference overhead — but incremental cost is *per
window*, so a bigger window means redoing more characters for the same edit.

**Cold and incremental want different sizes, and the window stays at 400**,
for three reasons:

1. **The interactive path is the one that runs continuously.** A paste is one
   discrete event that can show progress. Typing is not.
2. **The budget applies to the interactive path.** At submit time with a warm
   cache, only the changed chunks are re-inferred, which is the incremental
   column — 442 ms on battery, and the mains measurement of that column is the
   one that decides whether the budget is met at all.
3. **Two window sizes would cost the entire cache.** The content-hash cache is
   keyed on chunk text, so 400-char and 1200-char chunks are disjoint cache
   populations. Mixing them within one document yields *zero* reuse: the first
   keystroke after a paste would re-infer the whole document. Avoiding that
   needs a per-document pinned window — a mode that must be right every time
   or the result is worse than either option alone. That is a real complexity
   cost for a benefit only the paste path sees.

A further constraint: 400 is the M6 bound (512 tokens at the worst case of one
token per character for CJK). 1200 is safe only for Latin script, so a global
1200 would require script-aware sizing — a second mode, on top of the first.

An edit inside the 96-character overlap invalidates two chunks rather than
one; measured, that happens on 27% of edits at window 400 and 7% at 1200.

### The budget: a reported miss, with a stated reason

Against SPEC's 250 ms p50 / 600 ms p95, on the shipped runtime and the shipped
window:

| | measured | budget | |
| --- | ---: | ---: | --- |
| cold p50, mains | 697 ms | 250 ms | **2.8x over** |
| cold p95, mains | 805 ms | 600 ms | **1.3x over** |
| incremental p50, battery | 442 ms | 250 ms | **1.8x over** |
| incremental p95, battery | 997 ms | 600 ms | **1.7x over** |

**This is reported as a miss, not treated as a target to move.** SPEC
authorises exactly that: where a budget cannot be met, the miss is published
with its reason rather than the number being managed until it fits.

The reason is a design decision that is not up for renegotiation: **NER runs
on the blocking path, by design.** Making it advisory — showing results after
the send, or sending if inference has not finished — would meet the budget
immediately and destroy the guarantee. NER is the only detector for an entire
entity class. Stage 1 validates identifiers by checksum and the gazetteers
cover known names and places; neither catches an ordinary private
individual's name, which is the most common PII in chat prose and the thing
this product exists to protect. Advisory NER would block on a famous name and
pass the name of the person actually at risk. Nor can it be made coherent:
results after send mean the data has already left, and send-if-not-finished
makes the leak a race on typing speed.

Fail-closed is not a latency tradeoff. The full reasoning is ARCHITECTURE.md
D25; the power-state finding is D27.

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
