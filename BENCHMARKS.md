# BENCHMARKS

Accuracy work as a published, readable document — per SPEC.md this is a standing
deliverable: written at M6, extended at M7 and M8 as those stages change the
numbers. Every number here is measured, none asserted. The raw per-run reports
(including false-positive/false-negative samples) live in
`packages/eval/reports/ner-bench/`, and every run is reproducible from a fixed
seed.

---

## M6 — Stage 2 NER model selection

### Task

Select the multilingual token-classification model that Stage 2 ships with. The
model must recognize PERSON, ORG, and LOCATION across the languages and scripts
Stage 0 already handles, run fully client-side under ONNX Runtime via
Transformers.js, and be bundled with the extension (zero runtime network
access). Selection criterion per SPEC.md: **measured F1 across languages and
scripts, not size**.

### Candidates

| model | architecture | params | license | notes |
| --- | --- | --- | --- | --- |
| `Xenova/distilbert-base-multilingual-cased-ner-hrl` | DistilBERT | 134 M | afl-3.0 (base: Davlan) | ONNX conversion of `Davlan/distilbert-base-multilingual-cased-ner-hrl` |
| `Xenova/bert-base-multilingual-cased-ner-hrl` | mBERT | 177 M | afl-3.0 (base: Davlan) | ONNX conversion of `Davlan/bert-base-multilingual-cased-ner-hrl` |
| `jiting/xlm-roberta-base-ner-hrl_onnx` | XLM-RoBERTa base | 277 M | afl-3.0 (base: Davlan) | ONNX conversion of `Davlan/xlm-roberta-base-ner-hrl` |
| `benederbabo/xlm-roberta-large-ner-hrl-onnx` | XLM-RoBERTa large | 559 M | afl-3.0 (base: Davlan) | ONNX conversion of `Davlan/xlm-roberta-large-ner-hrl` |
| `onnx-community/xlm-roberta-large-finetuned-conll03-english-ONNX` | XLM-RoBERTa large | 559 M | MIT (base: FacebookAI) | English-only fine-tune; included as a cross-lingual-transfer reference |

The Davlan `ner-hrl` family is fine-tuned on ten high-resource languages
(per its model card: Arabic, German, English, Spanish, French, Italian,
Latvian, Dutch, Portuguese, Chinese); every other language in our corpus is
zero-shot transfer through the base model's multilingual pretraining.

**Excluded before benchmarking:** `Babelscape/wikineural-multilingual-ner` —
strong reported multilingual quality, but licensed cc-by-nc-sa-4.0
(non-commercial), incompatible with redistribution in an MIT-licensed
extension.

### Methodology

- **Corpus**: 1,200 labeled documents + 300 hard negatives from the M3 eval
  generator (seed `20260827`, hard-negative seed `20260827 ^ 0xbad`),
  extended in M6 with seeded PERSON/ORG/LOCATION planting across all 25
  languages and 9 scripts. NER ground truth: **823 spans in 549 documents**
  (542 PERSON, 163 ORG, 118 LOCATION). Same generator, seeding, and document
  kinds as the M3 Stage 1 baseline.
- **Pipeline**: each document goes through Stage 0 normalization, then
  `runStage2` (chunking at the model's 400-char window with 96-char overlap,
  piece-to-character alignment, IOB decode, span mapping back to original
  offsets). What is scored is the full production path, not raw model output.
- **Scoring**: the exact M3 scorer, filtered to PERSON/ORG/LOCATION on both
  sides. A prediction is a true positive if it overlaps a same-type
  ground-truth span. `precision` = matched predictions / predictions;
  `recall (partial)` = ground-truth spans overlapped by a same-type
  prediction; `recall (exact)` = exact-boundary matches; F1 is the harmonic
  mean of precision and partial recall. No tuning against the corpus — the
  first run of each model is the reported run.
- **Runtime**: Transformers.js 4.2.0 on onnxruntime-node (CPU execution
  provider), Node 24.18.0, Windows 11. Browser (WASM) latency will differ and
  is measured at M9; the CPU numbers are used for *relative* comparison only.
- **Reproduce**: `npm.cmd run build`, then
  `node packages/eval/dist/ner/benchCli.js --model <repo> --dtype <dtype> --docs 1200 --negatives 300`.

### Results

Full matrix (14 runs attempted: 10 succeeded, 4 fp16 runs failed to load — see
[Quantization](#quantization)). P/R = precision / partial recall, in %.

| model | dtype | PERSON P/R/F1 | ORG P/R/F1 | LOCATION P/R/F1 | macro F1 | p50/p95 ms | weights |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| distilbert-hrl | q8 | 89.0/84.5/**86.7** | 38.6/74.2/**50.8** | 35.4/77.1/**48.5** | 62.0 | 19.7/52.1 | 135 MB |
| distilbert-hrl | int8 | 89.0/85.4/**87.2** | 39.5/70.6/**50.7** | 37.9/78.8/**51.2** | 63.0 | 18.4/47.3 | 135 MB |
| distilbert-hrl | fp32 | 87.9/86.0/**86.9** | 34.6/74.2/**47.2** | 36.0/77.1/**49.1** | 61.1 | 37.3/95.9 | 539 MB |
| bert-hrl (mBERT) | q8 | 94.4/91.3/**92.8** | 54.4/77.3/**63.8** | 44.7/86.4/**59.0** | 71.9 | 34.8/82.0 | 178 MB |
| bert-hrl (mBERT) | int8 | 94.0/91.5/**92.7** | 57.7/76.7/**65.9** | 46.6/86.4/**60.5** | 73.0 | 30.7/68.3 | 178 MB |
| bert-hrl (mBERT) | fp32 | 95.1/92.6/**93.9** | 52.4/76.1/**62.1** | 44.5/86.4/**58.8** | 71.6 | 69.4/171.3 | 709 MB |
| **xlmr-base-hrl** | **q8** | **99.0/97.6/98.3** | **80.9/88.3/84.4** | **67.4/100/80.5** | **87.8** | **30.1/63.8** | **279 MB** |
| xlmr-base-hrl | fp32 | 98.3/99.3/**98.8** | 76.8/92.0/**83.7** | 61.7/100/**76.3** | 86.3 | 61.7/143.1 | 1,110 MB |
| xlmr-large-hrl | q8 | 95.4/100/**97.7** | 85.3/95.7/**90.2** | 56.7/100/**72.4** | 86.7 | 85.6/186.7 | 561 MB |
| xlmr-large-conll03-en | q8 | 67.4/98.9/**80.1** | 31.8/98.8/**48.1** | 38.4/100/**55.5** | 61.3 | 83.3/258.5 | 562 MB |

Observations:

- **Larger is not better here.** XLM-R *large* (HRL) loses to XLM-R *base* on
  macro F1 (86.7 vs 87.8) at ~2.8× the latency and 2× the size. Its ORG score
  is the best in the matrix (90.2), but its LOCATION precision collapse
  (56.7%) costs it more than the ORG gain buys.
- **The English-only fine-tune collapses on multilingual input** (macro 61.3,
  precision in the 30s–60s despite near-perfect recall), confirming that the
  fine-tune's language coverage matters far more than backbone size —
  cross-lingual transfer from pretraining alone is not enough.
- **DistilBERT's 40% size saving costs ~26 macro-F1 points** vs XLM-R base.
  Not a viable trade for a privacy tool where a miss is a leak.
- The xlmr repos publish only `model.onnx` (fp32) and `model_quantized.onnx`
  (q8) — no int8 file, hence the missing rows.
- The conll03 run's wall time includes one extreme outlier (a single document
  at 3,707 s — consistent with the machine sleeping mid-run overnight);
  its percentiles (p50 83 ms, p99 607 ms) are unaffected.

### Quantization

Per SPEC.md, unquantized weights were evaluated alongside quantized; quantized
ships only if the loss is negligible. Measured macro-F1 deltas, q8 vs fp32:

- distilbert-hrl: 62.0 vs 61.1 (**q8 +0.9**)
- bert-hrl: 71.9 vs 71.6 (**q8 +0.3**); int8 73.0 (+1.4)
- xlmr-base-hrl: 87.8 vs 86.3 (**q8 +1.5**)

Quantization loss is not just negligible — on this corpus the quantized
weights score *slightly higher* in all three pairs (per-type deltas are mixed
in sign and within noise; e.g. xlmr-base fp32 has better PERSON F1, q8 better
ORG/LOCATION). q8 ships with a clear conscience: **4.0× smaller, ~2× faster,
no measured quality cost**.

**fp16 does not run on the onnxruntime CPU execution provider** — all four
fp16 runs failed at model load, in two distinct ways, recorded verbatim:

- distilbert, mBERT, and the conll03 conversion (fused-graph failure —
  shown for distilbert; the conll03 error is identical on its `/roberta/`
  graph):
  `Exception during initialization: onnxruntime::graph_utils::GetIndexFromName itr != node_args.end() was false. Attempting to get index by a name which does not exist:InsertedPrecisionFreeCast_/distilbert/embeddings/LayerNorm/Constant_output_0 for node: /distilbert/embeddings/LayerNorm/Mul/SimplifiedLayerNormFusion/`
- xlm-roberta-large-hrl (graph type-check failure):
  `Load model from …\model_fp16.onnx failed: Type Error: Type (tensor(float16)) of output arg (_to_copy_2) of node (node__to_copy_2) does not match expected type (tensor(float)).`

fp16 is therefore ruled out on runtime grounds, not quality grounds; the
unquantized comparison uses fp32.

### Per-language F1

All 25 corpus languages, q8 runs (PERSON/ORG/LOCATION pooled). The winner's
worst languages are named, not hidden: **ja 80.7, th 82.5, he/hi 87.2** —
Japanese and Thai lack word spacing and sit outside the HRL fine-tune's ten
languages, making them zero-shot in the hardest conditions.

| lang | distil q8 | mBERT q8 | **xlmr-base q8** | xlmr-large q8 | conll03-en q8 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ar | 48.1 | 62.7 | **93.1** | 93.1 | 84.6 |
| cs | 86.6 | 98.3 | **93.3** | 96.7 | 72.9 |
| da | 88.9 | 95.7 | **97.2** | 94.1 | 66.0 |
| de | 80.7 | 88.7 | **94.7** | 91.2 | 58.8 |
| el | 58.7 | 87.6 | **96.9** | 97.9 | 74.0 |
| en | 57.9 | 58.6 | **92.1** | 88.6 | 64.8 |
| es | 90.4 | 91.9 | **93.6** | 88.6 | 75.3 |
| fa | 83.1 | 93.7 | **98.6** | 97.4 | 73.5 |
| fi | 62.9 | 78.6 | **94.9** | 91.4 | 69.8 |
| fr | 70.2 | 81.4 | **89.2** | 87.7 | 62.3 |
| he | 81.8 | 75.8 | **87.2** | 89.4 | 64.0 |
| hi | 41.3 | 65.0 | **87.2** | 88.1 | 54.7 |
| it | 76.5 | 80.0 | **93.4** | 98.5 | 71.1 |
| ja | 67.5 | 76.7 | **80.7** | 82.8 | 55.4 |
| ko | 26.6 | 78.1 | **92.3** | 88.6 | 73.8 |
| nl | 83.6 | 85.7 | **97.9** | 93.2 | 63.4 |
| pl | 82.8 | 82.8 | **92.9** | 90.6 | 63.3 |
| pt | 93.9 | 96.9 | **95.8** | 95.4 | 68.1 |
| ro | 84.9 | 98.5 | **96.9** | 92.5 | 73.8 |
| ru | 86.5 | 84.2 | **97.1** | 87.2 | 70.8 |
| sv | 85.3 | 85.7 | **88.9** | 85.7 | 62.5 |
| th | 37.9 | 36.4 | **82.5** | 85.7 | 67.1 |
| tr | 52.1 | 67.7 | **92.3** | 94.9 | 74.7 |
| uk | 84.8 | 91.3 | **97.7** | 95.5 | 58.7 |
| zh | 81.6 | 85.7 | **93.9** | 98.0 | 65.8 |

XLM-R base q8 has no language below 80 F1. Every other candidate has at least
one language in the 20s–60s.

### What the precision numbers actually mean

The winner's LOCATION precision (67.4%) looks weak until every false positive
is classified against the *full* ground truth (all entity types, not just the
NER three). Winner, all 956 NER predictions on the benchmark corpus:

| prediction type | FPs | overlapping other-type ground truth | true FPs (no overlap with anything) |
| --- | ---: | --- | ---: |
| PERSON | 6 | 4 on ORG, 2 on EMAIL | **0** |
| ORG | 36 | 8 on PERSON, 6 on SWIFT_BIC, 3 on STREET_ADDRESS, 3 on POSTAL_CODE | **16** |
| LOCATION | 58 | **52 on STREET_ADDRESS**, 3 on EMAIL, 2 on SWIFT_BIC, 1 on PERSON | **0** |

- 90% of LOCATION "false positives" are the model correctly finding the city
  or country *inside a street address* — the span is sensitive, the type label
  differs. The scoring is kept strict anyway (no credit for cross-type hits);
  the penalty is equal across all candidates, so the ranking stands.
- Only **16 of 956 predictions (1.7%) are genuine hallucinations** — all ORG,
  none PERSON or LOCATION.
- **Zero false positives on the 300 hard-negative documents** (UUIDs, hashes,
  order numbers, timestamps, code snippets, etc.).

Cross-type overlap resolution (which detection wins when spans collide) is
deliberately deferred to fusion in M8; this analysis is recorded so that work
starts from measured facts.

### Selection

**`jiting/xlm-roberta-base-ner-hrl_onnx`, q8**, pinned to revision
`478a2a3e99ef680e4a107c80a7d0c59d51f185ae` (2024-10-09). Hugging Face
revisions are content-addressed commits, so the pin fixes the exact model
bytes — the integrity anchor for build-time bundling. License afl-3.0
(inherited from `Davlan/xlm-roberta-base-ner-hrl`).

Why, in order of weight:

1. **Best macro F1 in the matrix** (87.8), with the highest per-language floor
   (no language below 80).
2. **Second-fastest run** (p50 30 ms/doc on CPU) — only DistilBERT is faster,
   and it is 26 macro-F1 points worse.
3. **q8 measured lossless** against fp32 on this corpus, so the 279 MB
   quantized weights ship instead of the 1.1 GB fp32 weights.
4. Beats both large models on quality while being half their size and ~3×
   their speed — the accuracy-first criterion and the practical one agree.

### Size cost

Bundled Stage 2 payload: **~296 MB** (278.7 MB `model_quantized.onnx` +
17.1 MB `tokenizer.json` + ~2 KB config). This is by far the largest asset in
the extension. The only hard ceiling is the Chrome Web Store package limit of
**2 GB** (developer.chrome.com/docs/webstore/publish) — the bundle fits with
wide margin. Per SPEC.md, accuracy outranks size; the 143 MB that DistilBERT
would save is not worth −26 macro F1.

### The shipped configuration, measured on the official eval corpus

After selection, the full pipeline (Stage 1 + Stage 2 with the selected
model) was re-run on the standing eval corpus — 2,600 documents (2,000
labeled + 600 hard-negative, seeds `0xc0ffee`/`0xbeef`), now carrying
1,393 planted NER spans (923 PERSON, 259 ORG, 211 LOCATION). Reports:
`packages/eval/reports/stage2-baseline.md` (with the full per-language
table) and `.json`. First run of the configuration, no tuning:

| type | precision | recall (partial) | recall (exact) | F1 |
| --- | ---: | ---: | ---: | ---: |
| PERSON | 98.7% | 98.5% | 89.7% | 98.6% |
| ORG | 80.0% | 88.4% | 72.2% | 84.0% |
| LOCATION | 59.1% | 100.0% | 99.1% | 74.3% |

Per-language F1 spans 80.5 (th) to 97.6 (uk) — worst: Thai 80.5,
Hindi 84.5, Arabic 85.8; no language below 80. Every Stage 1 metric is
unchanged from the Stage-1-only baseline run on the same corpus (per-type
scoring is independent and fusion does not exist until M8), and the
regression floors in `gates.config.json` (`nerPerType`) now bind:
PERSON ≥ .95 precision / .90 partial recall, ORG ≥ .70/.75,
LOCATION ≥ .55/.90 — all passing.

**Effect on the M3 NATIONAL_ID/TAX_ID collision problem** (67.2% / 54.6%
precision from overlapping digit-identifier candidates): numerically
none, and measured rather than assumed — NATIONAL_ID and TAX_ID
precision, recall, and false-positive counts are identical to the M3
baseline in the combined run, and a direct span-overlap count found
**0 of 651** NATIONAL_ID/TAX_ID predictions overlapping any Stage 2
prediction (digit identifiers and name spans never collide). What Stage
2 *adds* to that story is the new cross-type overlap family documented
above (LOCATION-over-STREET_ADDRESS and ORG's identifier confusions),
which lands in the same M8 overlap-resolution work — noted here, not
fixed, per the milestone boundary.

### Caveats, stated plainly

- The corpus is synthetic (the M3 generator with seeded NER planting). It
  spans 25 languages, 9 scripts, and 5 document kinds, but it is not
  naturally-occurring text; absolute numbers will differ on wild data. The
  comparison between models is on identical input, so the *ranking* is the
  reliable product here — same standard as the M3 Stage 1 baseline.
- Stage 2 confidence is the raw model softmax, uncalibrated until M8. It is
  reported as `rawConfidence` and must not be read as a probability.
- Latency was measured on onnxruntime-node's CPU execution provider. Browser
  WASM numbers (the real deployment target) are measured at M9 when the model
  moves into the extension's Web Worker.
- Load time in these runs conflates first-run network download with ONNX
  session init; clean cold-start load in the browser is an M9 measurement.

---

## M7 — Stage 3 context scoring

> **SUPERSEDED BY THE M8 CORPUS CHANGE — every per-type figure in this section
> predates Stage 0 decimal-digit folding (ARCHITECTURE.md D21).** The fold made
> identifiers written in Arabic-Indic, Devanagari, Bengali and Thai digits
> detectable at all, and the corpus now plants native digits in six languages
> plus a `native-digit-noise` hard-negative category. Both the numerator and
> the denominator moved, so these numbers describe a corpus that no longer
> exists. They are kept, labelled, rather than silently replaced — the M7
> conclusions they support are still sound, and the measured cost of the fold
> is published in the M8 section below. The republished baseline follows the
> full re-run.


This section is written as the stage is built and is extended when Stage 2b
and Stage 2c land. The numbers below are Stage 1 + Stage 3 on the standing
eval corpus — 2,600 documents (2,000 labeled + 600 hard-negative, seeds
`0xc0ffee`/`0xbeef`) — scored with the eval's own scorer. Stage-1 figures
reproduce the committed M3 baseline exactly, so every comparison is
like-for-like.

### GENERIC_SECRET — an open failure, published rather than smoothed over

SPEC.md requires GENERIC_SECRET to need "a Shannon entropy threshold AND an
assignment-context signal". Implemented literally, with an exception that
leaves a candidate alone when another detector's positive identification
already covers the span (ARCHITECTURE.md D19):

| | precision | recall | false positives |
| --- | ---: | ---: | ---: |
| Stage 1 baseline | 3.1% | 100% | 2236 |
| Suppress on missing context | 3.8% | 56.9% | 1046 |
| Shipped: with overlap deferral (first measurement) | 1.8% | 56.9% | 2230 |
| **Shipped: current** | **1.9%** | **56.9%** | **2130** |

The 1.8% row predates the M7 error-taxonomy rules; `data-uri-payload` then
removed 100 base64-blob false positives. **1.9% / 56.9% / 2130 is the current
measured figure.** Both rows are shown because both numbers were published.

Residual precision is BELOW the Stage 1 baseline. That is the honest number
and it is not a typo: the overlap deferral gives back exactly the false
positives that are explained by another detector — those are Stage 4's to
resolve, not Stage 3's — while recovering none of the lost recall.

**The failure mode**, diagnosed by inspecting every suppressed span rather
than inferred. All of them have no overlapping detection at all, so the
exception cannot reach them. They are secrets introduced by LABELING LANGUAGE
in prose, across languages:

- `У справі вказано <secret> як ідентифікатор` (Ukrainian — "as identifier")
- `档案中登记的识别号是 <secret>` (Chinese — "the identification number on file is")
- `Asiakirjoissa tunnisteena on <secret>` (Finnish — "as identifier in the documents")

None is an assignment and none matches an API_KEY trigger, so SPEC's
conjunction excludes them by construction.

**Why it is not fixed here.** Letting a labeling phrase ("identifier",
"reference", "token") count as context would reopen the correlation-identifier
false-positive class that the M7 suppression review had just closed — request
id, trace id, span id and idempotency key are introduced by exactly that
language and are not secrets. Stage 3 can only make a binary suppress-or-allow
call, so it cannot price that trade; Stage 4 weighs evidence instead of gating
on it, which is the right machinery for a signal that is real but weak.

**Status: REOPENED AT M8.** Open scope at M7, and now M8's to resolve — the
overlap deferral parked JWT segments, API keys and crypto wallets for Stage 4
explicitly, and the recall gap was deferred to fusion because fusion weighs
evidence rather than making a binary suppress-or-allow call.

### Where Stage 3 does work

| type | precision | false positives | recall |
| --- | ---: | ---: | ---: |
| EMAIL | 81.3% → **98.5%** | 148 → 10 | 100% held |
| POSTAL_CODE | 5.9% → **14.1%** | 922 → 353 | 72.5% held |
| NATIONAL_ID | 67.2% → **71.8%** | 294 → 236 | 100% held |
| all types | — | **4017 → 2062 (−49%)** | no loss except GENERIC_SECRET |

TAX_ID (54.6%) and URL_WITH_CREDENTIALS (37.6%) are unchanged, as expected:
their errors are cross-type overlap — TAX_ID cross-scheme collisions,
URL_WITH_CREDENTIALS against CONNECTION_STRING — which is Stage 4 resolution
and deliberately not Stage 3's to fix.

### Stage 2b — gazetteers

1.41 M entries bundled at 3.2 MB as Bloom filters (ARCHITECTURE.md D20 for why
filters rather than name lists): 762,502 person names and 342,031
organisations from Wikidata (CC0), 308,524 places from GeoNames (CC BY 4.0).
`cities500` and ParaNames were both excluded — the first on precision, the
second because its data licence is stated inconsistently across its own
sources.

A filter never returns a false negative; its only error mode is a false
positive. Parameters: **14.38 bits per entry, k=10 probes, implying 0.1000%**.
Measured over 200,000 distinct random tokens: **0.1000%** (PERSON), 0.1040%
(LOCATION), 0.0875% (ORG) — at target, not over-provisioned. That asymmetry is
what makes it safe to treat a hit as corroboration, which is the weight SPEC.md
assigns it.

An earlier revision of this document reported 0.000%. That was a broken probe,
not a good filter: its PRNG lost precision above 2^53 and generated only 1,731
distinct tokens from 20,000 draws, which at 0.1% predicts under two hits. It is
corrected here rather than quietly restated, and the regression test now checks
its own sample distinctness before checking a rate.

### Stage 2c — built, measured, and removed

SPEC.md specifies a verification pass over an ambiguous confidence band, and
requires it be removed if it does not improve results. It does not.

Method: re-inference over a recentred context window — chosen because a second
bundled model measured *worse* at M6, and the gazetteer is already consumed by
Stage 3. Measured over 861 documents, verification on versus off:

| | PERSON | ORG | LOCATION |
| --- | ---: | ---: | ---: |
| precision, off → on | 99.0% → 99.0% | 80.2% → 80.2% | 55.3% → 55.3% |
| false positives | 3 → 3 | 22 → 22 | 55 → 55 |

Identical, to the candidate. 1.28% of candidates entered the band (45 of 3,505;
39 confirmed, 6 refuted) for **+10.5% wall-clock**.

The reason is structural, and it is the useful part of the result: Stage 2c
only adjusts confidence, and this eval scores every emitted prediction
regardless of confidence. A pure confidence adjustment is invisible to it by
construction, so the stage cannot be evaluated until Stage 4 applies profile
thresholds. Removed rather than shipped off-by-default, because unmeasured
machinery in the pipeline is exactly what SPEC's rule exists to prevent.

### M7 exit criterion — precision on hard negatives

SPEC.md names this as what M7 must report. Full pipeline (Stages 0–3 with the
gazetteers) against the Stage 1 baseline, same 2,618-document corpus and seeds:

| hard-negative category | Stage 1 | with Stage 3 | change |
| --- | ---: | ---: | ---: |
| base64-blob | 100 | **0** | −100 |
| labeled-examples | 67 | **50** | −17 |
| checksum-failures | 65 | **59** | −6 |
| placeholder-code | 37 | **18** | −19 |
| order-numbers | 47 | 47 | 0 |
| version-numbers | 15 | 15 | 0 |
| hex-artifacts | 1 | 1 | 0 |
| **total (all 7 categories)** | **332** | **190** | **−42.8%** |

The seven rows sum to the totals exactly: 100+67+65+37+47+15+1 = 332, and
0+50+59+18+47+15+1 = 190. The two zero-change rows at the bottom —
`version-numbers` (15) and `hex-artifacts` (1) — carry 16 false positives in
both columns and are easy to skip when checking the arithmetic by eye.

`order-numbers` is unchanged **by design**: the reference-noun rule is a
penalty rather than a suppression, because in medical and legal documents a
case or claim number IS the sensitive record identifier. Confidence moves;
emission does not, and this eval does not threshold on confidence.

### Full per-type results, Stages 0–3

| type | Stage 1 | with Stage 3 | false positives |
| --- | ---: | ---: | ---: |
| EMAIL | 81.3% | **98.5%** | 148 → 10 |
| POSTAL_CODE | 5.9% | **20.0%** | 922 → 232 |
| NATIONAL_ID | 67.2% | **71.8%** | 294 → 236 |
| API_KEY | 92.3% | **95.9%** | 39 → 20 |
| SWIFT_BIC | 88.2% | **100%** | 10 → 0 |
| PERSON | — | 98.7% | 13 |
| ORG | — | 80.0% | 60 |
| LOCATION | — | 59.1% | 147 |
| GENERIC_SECRET | 3.1% | **1.9%** | see the open failure above |

### POSTAL_CODE — the weakest type that ships, carried into M8

At **20.0%** precision it is much improved — 5.9% at the Stage 1 baseline, 922
false positives down to 232 — and it is still the weakest type in the pipeline
by a wide margin. It is named here rather than left in the table because a
reader scanning per-type numbers should not have to notice it.

Why it resists Stage 3. A postal code is a short digit run whose only
distinguishing evidence is a per-country format table with no checksum behind
it, so nothing about the value itself can corroborate it. Stage 3 removed the
errors that context CAN settle — ports after a host, digits inside phone
numbers, lab reference intervals, bracketed ranges — and what remains is
genuinely ambiguous text: bare digit groups that match some country's format
and sit in no informative context.

Recall is also capped at 72.5% and unchanged by Stage 3, a Stage 1 fragment
guard behaviour recorded at M3.

This is **open M8 scope**, alongside GENERIC_SECRET. Calibration is the right
machinery: a type whose evidence is weak by nature should carry a low
calibrated confidence and fall below a profile threshold, rather than being
argued into a binary suppress-or-allow decision it cannot support.

### Everything else, unchanged and expected

Unchanged and expected: TAX_ID (54.6%), URL_WITH_CREDENTIALS (37.6%),
DRIVERS_LICENSE (26.3%), US_ROUTING_NUMBER (41.7%). Every one is a cross-type
overlap — TAX_ID cross-scheme collisions, URL_WITH_CREDENTIALS against
CONNECTION_STRING — which is Stage 4 resolution and deliberately outside
Stage 3's remit. LOCATION's 59.1% is dominated by the same effect measured at
M6: its false positives are largely correct city names sitting inside
STREET_ADDRESS ground truth.

---

## M8 — Stage 0 digit folding: what it bought and what it cost

Stage 0 now folds every Unicode decimal digit to ASCII (ARCHITECTURE.md D21).
Before it, an identifier written in Arabic-Indic, Extended Arabic-Indic,
Devanagari, Bengali or Thai digits matched nothing at all — a Turkish national
identity number, an Iranian phone number, a Hindi Aadhaar number, a Thai
national ID and a Bengali credit card each returned **zero detections**.

Both halves of the trade are reported. Measured on the 2,600-document corpus
with the fold off and on, changing nothing else.

### What it bought

| language group | GT spans | recall off | recall on | change |
| --- | ---: | ---: | ---: | ---: |
| native-digit languages (ar, fa, ur, hi, bn, th) | 804 | 66.17% | 99.75% | **+33.58pp** |
| every other language | 4,425 | 99.44% | 99.44% | +0.00pp |

Per type, recall rises across essentially the whole detector set: PHONE
93.1→100%, IBAN 93.8→100%, JWT 95.1→100%, PASSPORT_MRZ 93.8→100%, VIN
95.1→100%, MAC_ADDRESS 92.0→100%, VAT_NUMBER 92.6→100%, CRYPTO_WALLET
91.0→100%, IN_IFSC 92.3→100%, API_KEY 93.9→99.6%, COORDINATES 89.6→97.4%.

### What it cost

Folding native digits to ASCII means every digit-run heuristic now fires on
text it previously could not see, so a precision cost is expected. The
`native-digit-noise` hard-negative category was added to measure exactly this,
and it is the whole of the new hard-negative cost:

| hard-negative category | fold off | fold on | change |
| --- | ---: | ---: | ---: |
| **native-digit-noise** | 0 | **121** | **+121** |
| base64-blob | 92 | 92 | 0 |
| checksum-failures | 71 | 71 | 0 |
| labeled-examples | 60 | 60 | 0 |
| order-numbers | 51 | 51 | 0 |
| placeholder-code | 33 | 33 | 0 |
| version-numbers | 8 | 8 | 0 |
| hex-artifacts | 3 | 3 | 0 |
| **total** | **318** | **439** | **+121** |

Overall: predictions 8,756 → 9,335 (+579), false positives 3,728 → 4,037
(+309). Per-type precision, for the types the fold moved:

| type | precision off → on | FP off → on |
| --- | ---: | ---: |
| TAX_ID | 52.3% → **46.0%** | 113 → 149 |
| NATIONAL_ID | 65.8% → **64.4%** | 286 → 318 |
| CREDIT_CARD | 98.0% → 96.8% | 3 → 5 |
| IP_ADDRESS | 88.4% → 87.8% | 29 → 32 |
| POSTAL_CODE | 7.4% → **6.7%** | 839 → 962 |
| HEALTH_DATA | 93.0% → 92.9% | 29 → 32 |
| GENERIC_SECRET | 3.3% → 3.3% | 2,065 → 2,174 |

### The judgement

The cost is real and concentrated in the types that were already weakest —
TAX_ID, POSTAL_CODE, GENERIC_SECRET — which are the same types M8's fusion and
calibration exist to improve, and whose residual errors are cross-type overlap
rather than shape errors. The benefit is that an entire class of identifier
stops being invisible for six languages' users.

A missed identifier is a leak; a false positive is a visible annoyance the
user can dismiss. The fold trades the second for the first, and does it on the
users the multilingual work exists to serve. It is also strictly *reversible*
in a way the alternative is not: precision is what calibration and fusion are
for, whereas an input class the pipeline cannot see cannot be recovered
downstream at all.

### Republished baseline — Stages 0–3, post-fold

**This supersedes every per-type figure in the M7 section.** Same corpus size
and seeds (2,000 labeled + 600 hard-negative, `0xc0ffee`/`0xbeef`), but the
corpus itself changed with the digit fold, so this is a new measurement rather
than a comparable re-run.

Scope, stated precisely because the next stage depends on it: **Stages 0–3 plus
the Stage 2b gazetteers, and NOT Stage 4.** Overlap resolution is built and
tested (ARCHITECTURE.md D22) but deliberately not wired into `detect()` — SPEC
places resolution in Stage 4 alongside fusion, and its effect is measured
together with fusion rather than folded in here. That makes these numbers the
pre-calibration input: **the distribution Stage 4 must be fitted against.**

| type | precision | recall | FP |
| --- | ---: | ---: | ---: |
| CONNECTION_STRING, IBAN, JWT, MAC_ADDRESS, PASSPORT_MRZ, PHONE, PRIVATE_KEY, SWIFT_BIC, UK_SORT_CODE, VAT_NUMBER, VIN, IN_IFSC, AU_BSB, BR_AGENCIA | 100% | 100% | 0 |
| EMAIL | 99.0% | 100% | 6 |
| CRYPTO_WALLET | 98.7% | 100% | 8 |
| PERSON | 98.0% | 97.1% | 20 |
| CREDIT_CARD | 96.8% | 100% | 5 |
| STREET_ADDRESS | 95.9% | 100% | 8 |
| API_KEY | 95.8% | 99.6% | 20 |
| HEALTH_DATA | 92.9% | 100% | 32 |
| ORG | 88.1% | 85.9% | 34 |
| IP_ADDRESS | 87.8% | 100% | 32 |
| US_NPI | 75.0% | 100% | 1 |
| NATIONAL_ID | 68.2% | 100% | 268 |
| LOCATION | 63.3% | 99.1% | 125 |
| TAX_ID | 46.0% | 100% | 149 |
| US_ROUTING_NUMBER | 35.7% | 100% | 9 |
| URL_WITH_CREDENTIALS | 33.6% | 100% | 140 |
| POSTAL_CODE | 23.5% | 75.8% | 224 |
| DRIVERS_LICENSE | 20.0% | 100% | 12 |
| GENERIC_SECRET | 2.0% | 56.8% | 2,075 |

**Recall is now 100% for 26 of 34 types** — the digit fold is most of that.
The exceptions are POSTAL_CODE (75.8%, a Stage 1 fragment-guard behaviour
recorded at M3), GENERIC_SECRET (56.8%, D19), and the three NER types, which
are model-limited.

**The four weakest types are all overlap-driven, and all four are what Stage 4
is for.** GENERIC_SECRET at 2.0%, URL_WITH_CREDENTIALS at 33.6%, TAX_ID at
46.0%, POSTAL_CODE at 23.5%. The overlap census already showed where those
false positives go: 2,047 of 2,053 GENERIC_SECRET overlaps have a validated
type covering the same characters, and URL_WITH_CREDENTIALS loses 140 of 140
equal-span contests to CONNECTION_STRING. Resolution addresses them by
construction; the numbers for that land with fusion.

---

## M8 — Stage 4: overlap resolution and calibration

### The split, stated first because the numbers mean nothing without it

The calibration curve is **fitted and evaluated on disjoint documents**.

| split | seeds | documents | observations |
| --- | --- | ---: | ---: |
| fit | `0x5a1701` / `0x5a1702` | 2,620 | 5,551 |
| held out | `0xd15101` / `0xd15102` | 2,442 | 5,416 |

Different seeds are **not sufficient on their own**, and assuming they were
would have leaked. The hard-negative builders are templated with only a few
random fields, so short negatives collide across seeds: the first run shared
**91 identical documents**, and at 2,000 documents per split it was **181**.
Those are now dropped from the held-out split explicitly, and the harness
prints the count and asserts zero overlap on every run. Reproduce with
`node packages/eval/dist/bench/calibration.js --fit 2000 --eval 2000`.

### Method

**Isotonic regression, fitted per entity type**, over ten score bins, with
pool-adjacent-violators enforcing monotonicity. Chosen over Platt scaling for
two reasons: the raw scores are a base confidence plus additive Stage 3
contributions, so there is no reason to expect a logistic shape and a
two-parameter family would impose one; and the fitted model is a step function
whose steps are empirical precisions, so "0.8 means 80%" is readable off the
table rather than inferred from coefficients.

Per type because the types are not comparable — a validated IBAN and a
shape-only postal code carry the same raw score and mean different things,
which is exactly what calibration removes. Types with fewer than 200
observations fall back to a pooled curve rather than fitting noise; 8 types
cleared that bar.

Prediction is **piecewise constant**, the standard isotonic prediction. An
earlier revision interpolated between step midpoints to smooth the output;
because the steps are coarse where data is sparse, that systematically pulled
predictions toward the step below and left the model under-confident through
0.7–0.8. Removing the embellishment improved held-out ECE from 3.90% to 2.63%.

### The reliability curve, on held-out documents

| predicted | observed | samples | gap |
| ---: | ---: | ---: | ---: |
| 2.7% | 5.6% | 18 | +2.9 |
| 30.9% | 16.9% | 77 | −14.0 |
| 48.3% | 62.8% | 113 | +14.5 |
| 68.0% | 82.7% | 133 | +14.7 |
| 86.0% | 98.1% | 320 | +12.1 |
| 97.8% | 99.0% | 4,755 | +1.2 |

**Expected calibration error: 2.63%, against 12.33% for the raw scores** — a
4.7× improvement.

SPEC's own test, "a confidence of 0.8 empirically means roughly 80%
precision", checked on held-out data:

| calibrated confidence | observed precision | candidates |
| ---: | ---: | ---: |
| 0.50 | 62.8% | 113 |
| 0.70 | 82.7% | 133 |
| 0.80 | 100.0% | 134 |
| 0.90 | 96.7% | 604 |

### Where this is honest rather than flattering

The curve is **conservative, not accurate, in the middle**. Every mid-range
bucket runs 12–15 points *above* what it predicts, so a candidate reported at
0.68 is right about 83% of the time. That errs in the safe direction — the
tool under-claims rather than over-claims — but it is not what calibration is
supposed to deliver, and it should not be described as though it were.

The cause is distribution, not method: **4,755 of 5,416 held-out observations
sit in the top bucket**, because most surviving candidates are checksum-
validated. The mid-range bins that most need resolution are the ones with the
least data to fit. More corpus depth in the 0.3–0.8 band is the fix, and it is
M8-second-half work rather than something to paper over by retuning bins until
the table looks better.

One bucket runs the other way: 30.9% predicted against 16.9% observed, on 77
samples. That is over-confidence, the direction that matters, and it is small
and sparse but real.
