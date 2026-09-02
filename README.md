# PrivacyShield

**Finds passwords, keys, card and ID numbers in what you type into ChatGPT,
Claude and Gemini — and masks them before you send.**

Everything runs on your device. The extension makes no network request of any
kind after it is installed: not for detection, not for telemetry, not to update
a word list. There is no account and nothing to sign in to.

<!-- DEMO GIF PLACEHOLDER — the review panel intercepting a send on a real
     site. Needs a signed-in session to record; see STORE-LISTING.md. -->

---

## The problem

People paste things into AI chat that they would never paste into a public
forum: a production API key while debugging, a customer's IBAN while drafting
an email, a colleague's phone number, a patient's record. The text is gone the
moment it is sent, and "I'll remember not to" is not a control.

The usual answers are worse than the problem. A server-side scanner means
sending the secret to one more party. A regex denylist misses everything it was
not told about and blocks half of what it was. An enterprise DLP appliance is
not something an individual can install.

## What it does

1. Watches the composer on the three supported sites.
2. When you send, it checks the text — validated identifiers, a local
   multilingual model for names and places, and context scoring around both.
3. Shows you what it found, grouped by type, each with a calibrated confidence
   and an explanation of which evidence fired.
4. Replaces what you approve with realistic stand-ins, verifies the composer
   really contains the masked text, and only then lets the send through.
5. Puts your real values back into the reply as it streams in, so the
   conversation still reads correctly.

**If it cannot check, it stops the message.** A detection error, a timeout, or
a page whose layout it no longer recognises all block the send and say so. It
never treats "could not look" as "found nothing".

## Install

**From the Chrome Web Store** — not yet published. See `STORE-LISTING.md` for
the submission draft and the blockers still in front of it.

**Unpacked, from source:**

```sh
git clone https://github.com/horozbabasi/privacyshield
cd privacyshield
npm ci
npm run ext:fetch-model    # ~280 MB, verified against recorded SHA-256 digests
npm run build
```

Then `chrome://extensions` → Developer mode → Load unpacked →
`packages/extension/build`.

The download is large and that is a deliberate trade — see
[Size](#size-and-why).

## Supported sites

`chatgpt.com`, `claude.ai`, `gemini.google.com`. Exactly these three, in
`host_permissions`, and nothing else. Quick Redact covers every other
destination without widening that list, which is the point.

## What it does NOT protect

Stated before the feature list, because a security tool that oversells itself
is worse than one that does not exist.

- **Attachments.** Files, images and screenshots are not inspected.
- **Other applications.** Anything you send from your email client or Slack is
  untouched unless you put it through Quick Redact first.
- **What you type, before you send it.** The site's own JavaScript can read the
  composer as you type. Only what you *send* is masked.
- **Everything.** Detection misses things. `GENERIC_SECRET` recall is 55.4% and
  is printed here rather than rounded away. Read the review panel.
- **The sites themselves.** This protects what you send *to* them; it is not a
  defence against the service you are deliberately talking to.
- **Four send routes**, of which one is permanently open: a form submitted by
  `form.submit()` from page script fires no event any listener can see. See
  ARCHITECTURE.md D57b.

It is not a certified security product and carries no compliance guarantee.

## How it works

```
  your keystrokes
        │
        ▼
┌───────────────────┐
│ Stage 0           │  Unicode normalisation with an exact, reversible
│ normalisation     │  offset map — so a span found in normalised text
└─────────┬─────────┘  maps back to the exact original bytes to replace.
          │            Homoglyph folding, invisible stripping, digit folding.
          ▼
┌───────────────────┐
│ Stage 1           │  113 detectors. Every identifier is VALIDATED, not
│ validated         │  matched: Luhn for cards, mod-97 for IBAN, real
│ identifiers       │  phone parsing. A wrong checksum does not match.
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Stage 2  (+2b)    │  Multilingual NER for names, organisations, places,
│ local NER model   │  in an offscreen document because a content script
└─────────┬─────────┘  cannot compile WebAssembly under the host page CSP.
          │            Bundled gazetteers corroborate.
          ▼
┌───────────────────┐
│ Stage 3           │  Trigger proximity, structural position, negative
│ context scoring   │  rules. "test key" and a docs example score
└─────────┬─────────┘  differently from the same string in production prose.
          │
          ▼
┌───────────────────┐
│ Stage 4           │  Overlap resolution, isotonic calibration, and the
│ fusion            │  sensitivity profile's thresholds.
└─────────┬─────────┘
          │
          ▼
  review panel → masked write → verified readback → your send
```

The whole pipeline is `packages/core` and has no environment dependency: the
same code runs in the extension, the playground and the eval harness.

## Privacy guarantees

| guarantee | how it is enforced |
| --- | --- |
| No runtime network access | `connect-src 'self'` in the manifest CSP — the browser enforces it, not our good intentions |
| Fail closed | Any error, timeout or unresolvable element blocks the send |
| No plaintext persistence | Detected values live in one in-memory object, per tab session, dropped on navigation |
| Nothing the page can read | Injected UI is in a **closed** shadow root; the panel names entity types, never values |
| No `innerHTML` | Every node is constructed programmatically; a test sweeps the tree on every commit |

### Verify the zero-network claim yourself

Do not take it on trust — the whole point is that you do not have to.

```sh
python packages/extension/scripts/verify-live-site.py
```

It asks the extension's own service worker to fetch three external origins and
records what happens. All three are refused, and a **same-origin control**
proves the probe can tell a blocked request from an allowed one — without that
control, a probe that could see nothing at all would report the same clean
result.

By hand: open DevTools on any supported site, filter Network to the extension's
origin, and use it.

## Detection quality

Measured on a seeded synthetic corpus of **2,600 documents** (2,000 labelled +
600 hard negatives, seeds `0xc0ffee`/`0xbeef`) carrying **6,645 ground-truth
entities** across 25 languages and 11 document types. Reproduce with
`npm run eval -- --ner jiting/xlm-roberta-base-ner-hrl_onnx --dtype q8`.

**The corpus is synthetic**, and that bounds what these numbers mean: entity
values are generator-made and carrier sentences are templates, so recall is an
upper bound (generator and detector agree by construction) and precision is
optimistic. Real text will differ.

### Two tables, because the pipeline has two halves

The eval reports **Stages 0–3**. The shipped extension additionally runs
**Stage 4** — overlap resolution and calibration — which changes the picture
substantially for the weakest types. Both are given, because quoting only the
better one would be the kind of thing this project exists not to do.

**Stages 0–3, as the eval reports them** (34 of the 35 entity types —
`DATE_OF_BIRTH` has no Stage 1 detector and no corpus coverage, so it is
offered in the options page and does not appear here; full table in
`packages/eval/reports/stage2-baseline.md`):

| type | P | R | F1 |
| --- | ---: | ---: | ---: |
| IBAN, PHONE, JWT, PRIVATE_KEY, MAC_ADDRESS, PASSPORT_MRZ, VIN, VAT_NUMBER, CONNECTION_STRING, AU_BSB, BR_AGENCIA, IN_IFSC, UK_SORT_CODE, SWIFT_BIC | 100% | 100% | **100%** |
| CRYPTO_WALLET | 98.7% | 100% | 99.4% |
| EMAIL | 99.0% | 100% | 99.5% |
| COORDINATES | 100% | 97.4% | 98.7% |
| CREDIT_CARD | 96.8% | 100% | 98.4% |
| STREET_ADDRESS | 95.9% | 100% | 97.9% |
| API_KEY | 95.8% | 99.6% | 97.6% |
| PERSON | 98.0% | 97.1% | 97.5% |
| HEALTH_DATA | 92.9% | 100% | 96.3% |
| CA_TRANSIT_NUMBER | 88.9% | 100% | 94.1% |
| IP_ADDRESS | 87.8% | 100% | 93.5% |
| ORG | 88.1% | 85.9% | 87.0% |
| US_NPI | 75.0% | 100% | 85.7% |
| NATIONAL_ID | 68.2% | 100% | 81.1% |
| LOCATION | 63.3% | 99.1% | 77.3% |
| TAX_ID | 46.0% | 100% | 63.0% |
| US_ROUTING_NUMBER | 35.7% | 100% | 52.6% |
| URL_WITH_CREDENTIALS | 33.6% | 100% | 50.4% |
| POSTAL_CODE | 23.5% | 75.8% | 35.9% |
| DRIVERS_LICENSE | 20.0% | 100% | 33.3% |
| **GENERIC_SECRET** | **2.0%** | **56.8%** | **3.8%** |

**What Stage 4 then does to the worst of them** (measured at M8, and the
inputs above reproduce its published figures exactly):

| type | precision | false positives | recall |
| --- | ---: | ---: | ---: |
| GENERIC_SECRET | 2.0% → **100%** | 2,075 → **0** | 56.8% → 55.4% |
| POSTAL_CODE | 23.5% → **100%** | 224 → **0** | 75.8% → 72.5% |
| URL_WITH_CREDENTIALS | 33.6% → **100%** | 140 → 0 | held |
| IP_ADDRESS | 87.8% → **100%** | 32 → 0 | held |
| NATIONAL_ID | 68.2% → **81.2%** | 268 → 112 | 100% → 98.0% |
| TAX_ID | 46.0% → **56.3%** | 149 → 80 | 100% → 91.2% |
| **all Stage-1 types** | — | **2,991 → 246 (−92%)** | — |

Most of that is **reassignment, not elimination**: a `GENERIC_SECRET` false
positive is usually a real secret that a more specific detector also matched,
and overlap resolution gives it to the specific one.

### The failures that ship

- **`GENERIC_SECRET` recall 55.4%.** Roughly two in five generic
  high-entropy secrets are missed. A detection gap, not an overlap one, open
  since M7 and published rather than smoothed over.
- **`TAX_ID` recall 91.2%** after fusion, down from 100% before it.
- **`POSTAL_CODE`** is the weakest type that ships.
- **One over-confident calibration bucket**, and thin coverage in the
  mid-range.

### Per-language

Names, organisations and places, 25 languages, PERSON/ORG/LOCATION only:

| | best | worst | floor |
| --- | --- | --- | --- |
| F1 | uk 96.4 · ro 96.3 · nl 95.9 | ja 82.0 · hi 84.4 · ar 85.3 | **no language below 82.0** |

Full table in `packages/eval/reports/stage2-baseline.md`.

### Confidence means something

Calibrated with isotonic regression on a split proved disjoint from the
evaluation split: **expected calibration error 2.63%**, against 12.33% for the
raw detector scores. When the panel says 80%, it is close to 80%.

### The model

| | |
| --- | --- |
| model | `jiting/xlm-roberta-base-ner-hrl_onnx` |
| revision | `478a2a3e99ef680e4a107c80a7d0c59d51f185ae` — content-addressed, so the pin fixes the exact bytes |
| quantization | q8, **measured lossless** against fp32 on this corpus |
| weights | 265.8 MiB (`model_quantized.onnx`) + 16.3 MiB tokenizer |
| licence | afl-3.0, inherited from `Davlan/xlm-roberta-base-ner-hrl` |

Chosen over three alternatives on **best macro F1 (87.8) with the highest
per-language floor**, and it happened to be the second-fastest too. DistilBERT
would have saved 143 MB and cost 26 macro F1 points. Full matrix, methodology
and per-language results in `BENCHMARKS.md`.

Every file is verified against a recorded SHA-256 at fetch time, so the check
is not "did we get what the repo serves today" but "did we get the bytes this
project's published numbers describe".

### Size, and why

**~364 MB installed**, almost all of it the model. The model runs on your
device, so it has to be on your device. The Chrome Web Store package limit is
2 GB, so it fits with room; SPEC ranks accuracy above size, and the measured
alternative was 26 F1 points worse.

## The exposure score

Each message gets a 0–100 score, shown on the review panel and aggregated in
the popup. It is not a count: it weights each finding by the severity of its
type, so one private key outranks five postal codes, and it saturates rather
than growing without bound. Severity weights and their rationale are a data
file in `packages/core`, and a property test pins monotonicity — adding a
finding can never lower the score.

The popup reports a session **peak** and **mean**. Never a sum: the score is
0–100 for one document, and adding them produces a number with no meaning.

## Quick Redact

A box in the popup. Paste anything, get it back masked, copy it wherever you
like — email, a ticket, Slack. Paste the reply back into the same box and your
real values are restored.

This is what lets `host_permissions` stay at three origins while the tool
remains useful everywhere else.

The mapping between your text and its stand-ins lives in memory for as long as
the popup is open and is gone when it closes. The UI says so where you use it.

It applies the same fail-closed rule as the send gate: if the second detection
stage did not run, it produces **no output at all** rather than a partly-masked
string you would paste somewhere trusting it.

## Local Insights

A count of what you have protected, by category, by month.

Counts only — never a value, never any text, never which site, and no
timestamp finer than a month. Two years are kept and the reset button removes
the record rather than writing zeroes over it. The point is to make ongoing
protection visible instead of silent.

## Configuration

The options page (`chrome://extensions` → PrivacyShield → Details → Extension
options) covers:

| | |
| --- | --- |
| Sensitivity | Minimal / Balanced / Strict. Strict catches more and asks more often. |
| Replacement style | Realistic stand-ins, or labels like `[EMAIL_1]`. |
| Per-type toggles | All 35 entity types, individually. Everything is on unless you switch it off. |
| Never / always mask | Two lists, one entry per line. **Saved on your device as you type them** — the page says so, because a denylist can itself hold something sensitive. |
| Your own patterns | Regular expressions, with a live tester that runs the real engine. A pattern that does not compile is refused at the input, not stored disabled. |
| Phone region | For numbers written without a country code. Without it, a national-format number cannot be validated at all. |
| Settings file | Export and import. The file contains your two lists in plain text, and the page warns before you save it. |

Settings save as you change them. There is no Save button, deliberately: a
change that looks applied and is not is worse on a protection tool than a
surprise write.

The popup additionally has a **per-site toggle**, which takes effect in an open
tab without a reload.

## Nine languages

The UI is available in English, Spanish, German, French, Portuguese, Turkish,
Japanese, Hindi and Arabic, with right-to-left layout.

> **The eight non-English catalogues are machine-translated and have not been
> reviewed by a native speaker.** Structure is enforced by tests — placeholder
> budgets, plural categories, no copy-pasted English — but structure is not
> meaning. This is a release blocker, recorded as one, not a nicety.

Plurals go through `Intl.PluralRules` rather than a one/other pair: Arabic has
six categories and uses every one, Japanese has one, and Turkish does not mark
the plural after a numeral at all.

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
   measured that, and the gap is not marginal: 691 ms against 255.8 ms on the
   same machine and the same input. See below.

So the honest statement is: **the p50 budget is missed under conditions
favourable on both axes.** The measured 5.8 ms gap is a lower bound, and the
production gap is larger by an amount this project has not yet measured.
Reporting it as "a 2.3% miss" would understate it.

p95 is 354.9 ms against 600 ms on this runtime, but that margin does not
survive the runtime change: **on the runtime that actually ships, BOTH
percentiles miss.** See the browser measurement below. No figure in this
document should be read as "p95 is within budget".

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
principle.** The Node build of Transformers.js offers `dml`, `webgpu` and `cpu`
execution providers and has no WASM provider at all. Every number in the table
above is therefore native CPU, which the extension never uses. Measuring the
real thing needs a real browser, so the benchmark in `bench/wasm-latency/` runs
the identical workload — same model, same q8 weights, same 2000-character
inputs, same machine, warmup discarded — under Edge with cross-origin isolation
enabled so WASM threading is actually available (8 threads).

Two paths are measured, because they pull the window size in opposite
directions and a single figure hides that:

- **Cold** — a full 2000-character document with nothing cached. What a paste
  costs. This is the path SPEC's budget is written against.
- **Incremental** — one character edited, every unchanged chunk served from
  the content-hash cache. The interactive steady state while typing.

Three consecutive sweeps; each cell shows all three runs, so the run-to-run
spread is visible rather than hidden behind a tilde.

| window | chunks | cold p50 (3 runs) | cold p95 | incremental p50 | incremental p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 400 (shipped) | 7 | 562 / 887 / **691** | 620 / 1053 / 751 | 79 / 124 / **112** | 165 / 299 / 237 |
| 600 | 4 | 423 / 743 / **549** | 512 / 878 / 611 | 118 / 168 / **156** | 203 / 383 / 335 |
| 800 | 3 | 401 / 660 / **532** | 442 / 873 / 624 | 142 / 220 / **192** | 272 / 476 / 385 |
| 1200 | 2 | 385 / 627 / **501** | 434 / 1090 / 607 | 210 / 310 / **286** | 388 / 649 / 601 |

Bold is the median of the three runs. **Measurement conditions**, recorded by
the harness on every run: Intel Core Ultra 7 258V, Windows, Edge headless, on
battery at 76%, `% Processor Performance` 81–85%, CPU otherwise idle.

**The run-to-run spread is ±29%** on the window-400 cold p50 (562–887 ms across
three runs), on an idle machine with conditions recorded. That is large enough
that a single number misrepresents the measurement, which is why all three runs
are shown in every cell rather than a median with a tilde in front of it.

**A known unexplained state invalidates any figure measured while it is
active** — see below.

### The measurement conditions are part of the result

An earlier version of this section published figures roughly 4–6x slower than
these, and attributed the difference to running on battery rather than mains.
**That attribution was wrong**, and the correction is worth stating because it
changes how these numbers should be read.

The slow figures were real and reproducible — three runs, and an A/B against a
byte-identical older harness confirmed the benchmark code was not the cause. But
the explanation was an inference from a single co-occurrence: the machine was
observed on battery and observed to be slow, so battery was named as the cause.
A later direct test refuted it — on battery at 76%, the same benchmark runs at
691 ms, matching the earlier "mains" figure of 697 ms almost exactly. The fast
state is the normal state; the slow runs were an anomaly whose cause was never
captured and is still not established.

The benchmark now records power line status, battery level, clock speeds, CPU
load and `% Processor Performance` on every run, and published figures quote
them. Those proxies are not a complete description of a machine's power state.
They are enough to notice that two runs happened in different states, which is
the thing that was missing.

**This remains OPEN, not solved.** The slow state reproduced three consecutive
times, so it will recur, and **any latency figure measured while it is active is
invalid** — it is roughly 4-5x slower, far outside the ±29% normal spread.
Anyone re-running this benchmark should compare against the conditions above
before trusting a result. Candidates and how to tell them apart are recorded in
ARCHITECTURE.md D27a.

Full account: ARCHITECTURE.md D27 and D27a.

### WebGPU was measured and rejected

The model could in principle run on the GPU instead of WASM. Measured on this
machine's real adapter (`intel / xe-2lpg`, an Arc 140V), in a headed browser so
no software rasteriser is involved, paired back-to-back against WASM in the
same machine state:

| runtime | cold p50 @ window 400 | incremental p50 | per inference |
| --- | ---: | ---: | ---: |
| WASM, 8 threads | 533–691 ms | 80–112 ms | ~85 ms |
| WebGPU, real GPU | 2931 / 2938 ms | 424–769 ms | ~420 ms |

**WebGPU is 4–5x slower here, not faster.** The model ships q8-quantized, and
onnxruntime-web's WebGPU backend has limited int8 matmul coverage — operators it
cannot run on the GPU fall back to CPU per-operator, and each fallback costs a
tensor round-trip across the GPU/CPU boundary. Paying GPU dispatch overhead plus
CPU compute plus transfer cost is a straightforward way to be slower than
well-threaded WASM SIMD.

It would have been rejected even if it had won narrowly: WebGPU availability
depends on browser, GPU, driver and enterprise policy, so it could only ever be
an opportunistic accelerator with a WASM fallback beside it — two inference
runtimes to ship, validate and debug. WASM is the single runtime.

### Why the window stays at 400

Larger windows make the cold path faster, so widening to 1200 looked like a
straightforward win. It is not, and the reason that decides it is **correctness,
not speed** — it would hold even if 1200 were free.

**A 1200-character CJK chunk exceeds the model's 512-token limit.** Feed the
model 1200 characters of Chinese and the input is **truncated at 512 tokens** —
the tail is never seen, and nothing reports an error. Every entity past the cut
goes undetected.

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


That is silent under-detection for an entire class of users, in their own
languages, while every component reports success. It is the same failure class
as the Arabic-Indic digit bug closed at M8, where identifiers written in
non-ASCII digits matched no detector at all and the pipeline reported a clean
document. **A global 1200 is a bug, not a tradeoff.**

If windowing is ever revisited it has to be **script-aware from the start** —
the window size is a function of the tokenizer's behaviour on the input's
script, and the only safe global value is the one that holds for the worst
script. The table also shows what a script-aware design could safely do: about
700 characters for Chinese against about 2300 for Latin. The cold-path win is
available, but only per script, never as a global bump.

The latency tradeoff is real too, and it points the same way:

- **Cold and incremental want opposite sizes.** 400 -> 1200 buys 190 ms on a
  cold paste (691 -> 501) and costs 174 ms on every debounced keystroke burst
  (112 -> 286). Larger windows are more efficient per character — fewer
  inferences, overhead amortised — but incremental cost is per *window*, so a
  bigger window redoes more characters per edit. The cold gain is 1.38x; the
  incremental loss is 2.55x.
- **Two window sizes would cost the entire cache.** The content-hash cache is
  keyed on chunk text, so 400-char and 1200-char chunks are disjoint
  populations. A document using both would get *zero* reuse across them: the
  first keystroke after a paste would re-infer everything. Avoiding that needs
  a per-document pinned window — a mode that must be correct every time or the
  result is worse than either option alone.

An edit inside the 96-character overlap invalidates two chunks rather than one;
measured, that happens on 27% of edits at window 400 and 7% at 1200.

Full reasoning: ARCHITECTURE.md D28.

### Two requirements, measured separately

SPEC states two different performance requirements, and they are easy to
conflate. They are kept apart here because conflating them would let the
easier one launder the harder one's result.

**The budget (SPEC line 238):** *"p50 under 250ms and p95 under 600ms for a
2000-character input on a mid-range laptop, excluding model warmup."* A
2000-character input is the **cold path**: nothing cached, every chunk
inferred.

| | median of 3 runs | all 3 runs | budget | |
| --- | ---: | :--- | ---: | --- |
| cold p50 | 691 ms | 562 / 887 / 691 | 250 ms | **missed, 2.8x over** |
| cold p95 | 751 ms | 620 / 1053 / 751 | 600 ms | **missed, 1.25x over** |

**Both percentiles miss.** Conditions: Intel Core Ultra 7 258V, Edge headless,
battery 76%, `% Processor Performance` 81–85%, CPU idle. The run spread on the
p50 is **±29%** (562–887 ms) on an otherwise idle machine with conditions
recorded, so the median alone misrepresents this measurement — every place the
figure appears states the spread with it.

**The interactive requirement (SPEC line 241):** *"Incremental detection as the
user types, debounced, with results cached by content hash so pressing send is
instant."* A separate requirement about the steady state while typing, which
the incremental measurement speaks to.

| | median of 3 runs | all 3 runs | |
| --- | ---: | :--- | --- |
| incremental p50 | 112 ms | 79 / 124 / 112 | one or two chunks re-inferred per edit |
| incremental p95 | 237 ms | 165 / 299 / 237 | |

Same conditions and the same caveat: the spread is wide relative to the median.
At 112 ms an edit is re-analysed well inside a debounce interval, so this
requirement is met on the measured machine. SPEC attaches no number to
"instant", so this is reported as a measurement rather than scored against a
threshold.

**The interactive number does not convert the budget miss into a pass.** The
budget is stated against a 2000-character input, and that is the cold path.
Measuring the interactive path instead and reporting the better number would be
answering a different question from the one SPEC asked.

### Pasting pays the full cold cost

Worth stating plainly, because the phrase "cached by content hash" invites the
opposite assumption: **the cache is cold for every chunk after a paste.** The
cache is keyed on chunk text, so pasted content — which by definition has never
been seen before — produces no cache hits at all. Not fewer hits: none.

So paste-then-send pays the full cold cost, and paste-then-send is one of the
most common real flows this extension exists for: someone pastes a log, a
config file, or an email thread, and presses send. That path is the paste
guard's path, and it is the one the budget's 691 ms describes.

The incremental figures apply to sustained typing, where each edit invalidates
one or two chunks out of seven. They do not apply to the first send after a
paste.

### The budget miss is reported, not resolved

**This is published as a miss rather than treated as a target to move.** SPEC
line 242 authorises exactly that: *"If a budget is missed, say so and explain
why rather than removing the target."*

The reason is a design decision that is not up for renegotiation: **NER runs on
the blocking path, by design.** Making it advisory — showing results after the
send, or sending if inference has not finished — would meet the budget
immediately and destroy the guarantee.

NER is the only detector for an entire entity class. Stage 1 validates
identifiers by checksum and the gazetteers cover known names and places;
neither catches an ordinary private individual's name, which is the most common
PII in chat prose and the thing this product exists to protect. Advisory NER
would block on a famous name and pass the name of the person actually at risk.
Nor can it be made coherent: results after send mean the data has already left,
and send-if-not-finished makes the leak a race on typing speed.

Fail-closed is not a latency tradeoff. The full reasoning is ARCHITECTURE.md
D25; the power-state finding is D27; the window decision is D28.

### Not comparable: the eval's per-document latency

`packages/eval/reports/` reports p50 115 ms per document, which measures a
different thing — the corpus's documents are p50 164 and p95 347 characters,
far shorter than the 2000-character benchmark input, and that figure includes
NER. The two numbers should not be read against each other or against the
budget; only the table above is measured as SPEC specifies.

## Non-goals — decided, not open

Recorded so they are never silently relitigated. **Roadmap** means possible
later by deliberate decision; **rejected** means permanent.

| | | why |
| --- | --- | --- |
| Attachment and file scanning | roadmap | Interception is heavy and fragile today. The limitation is stated plainly instead of half-implemented. |
| More chat sites than the three | roadmap | Quick Redact already covers other destinations without widening host permissions, and minimal permissions **is** the trust claim this product depends on. |
| Exporting the vault / unmask mapping | **rejected, permanently** | An unmask file is itself a secret. Memory-only is the feature, not a limitation to fix. |
| Accounts, sync, any cloud component | **rejected, permanently** | Contradicts the zero-network claim that everything else rests on. |

## Roadmap

| | |
| --- | --- |
| **Next** | Native review of the eight machine-translated locales — a release blocker. A privacy-policy URL and the remaining store assets. |
| **Then** | The three send routes still open (ARCHITECTURE.md D57b), of which the unrecognised-control one needs care: the obvious fix would intercept the *stop* button, because "no send control resolves" is also every moment a response is streaming. |
| **Then** | `GENERIC_SECRET` recall, the weakest published number in the project. |
| **Later** | `packages/core` published as a standalone library (M12) — explicit exports, semver, docs written for someone who has never seen this repo. |

## Reading the repository

| file | what it is for |
| --- | --- |
| `SPEC.md` | Authoritative for design. Everything else answers to it. |
| `ARCHITECTURE.md` | Every non-obvious judgement call, with the reasoning and the measurement behind it. Long, and the interesting parts are the ones that record being wrong. |
| `BENCHMARKS.md` | Model selection, methodology, per-language results. Every number measured, none asserted. |
| `SECURITY.md` | The guarantees, how to verify each yourself, and the disclosure process. |
| `PERMISSIONS.md` | One justification per permission, written when the reasoning was fresh. |
| `ADAPTER-VERIFICATION.md` | What the offline fixtures can and cannot tell you about a live site. |
| `STORE-LISTING.md` | Submission draft, and the blockers in front of it. |

## Development

Monorepo layout:

| package | what it is |
| --- | --- |
| `packages/core` | The detection pipeline. Environment-agnostic — `"types": []`, and eslint bans DOM and Node globals inside it — so the same code runs in the extension, the playground and the eval harness. |
| `packages/data` | Generated Unicode data (the confusables table), committed. |
| `packages/eval` | Seeded corpus, hard negatives, metrics, error analysis, regression gates. |
| `packages/extension` | The Chrome MV3 extension. |
| `packages/web` | The playground — the try-before-installing surface. |

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
Real-world performance will differ. Stage 3 context scoring and Stage 4
fusion both exist now and are what turn the context-free detector numbers
into the shipped ones; the two tables above give both.

## Licensing

MIT — see [LICENSE](LICENSE). The workspace packages are marked
`"private": true` because they are not published to npm, which is independent
of the project's license.

The bundled Unicode data is redistributed under the Unicode License v3; the
required copyright and permission notice is reproduced in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
