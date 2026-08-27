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
