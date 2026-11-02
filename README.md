# Discretion

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

## Status

As of September 2026, the extension is at 0.1.0 and the npm packages are at
0.1.1.

- The extension works on ChatGPT, Claude and Gemini. It isn't on the Chrome
  Web Store, so you have to build it from source. It was tested end to end on
  all three sites in early September 2026: Gemini with an automated harness,
  ChatGPT and Claude by hand on real accounts.
- The popup and options page work: per-site toggle, Quick Redact, Local
  Insights, sensitivity levels, per-type toggles and custom patterns.
- `@discretion/core` and `@discretion/data` are on npm. 0.1.1 has the same
  code as 0.1.0 and was only republished so its provenance points to a commit
  that still exists (see the [changelog](packages/core/CHANGELOG.md)).
- The playground runs locally, so you can try detection and masking without
  installing the extension.
- The Chrome Web Store listing and package are ready
  ([STORE-LISTING.md](STORE-LISTING.md),
  [SUBMISSION.md](packages/extension/SUBMISSION.md)) but haven't been
  submitted.
- The UI is English only for now. Eight more languages are translated but
  won't ship until a native speaker reviews them (see [Languages](#languages)).

## Install and run

### Extension

You'll need Node.js (the repo pins 24.18.0 in `.nvmrc`), Chrome 116 or newer,
and space for a ~280 MB model download.

```sh
git clone https://github.com/horozbabasi/discretion
cd discretion
npm ci
npm run ext:fetch-model    # ~280 MB, verified against recorded SHA-256 digests
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, click "Load unpacked"
and select `packages/extension/build`. On Windows, if PowerShell blocks `npm`,
use `npm.cmd` instead.

After that, just use ChatGPT, Claude or Gemini as usual. If a message contains
something sensitive, a review panel opens before it's sent. Choose what to
mask, and the message goes out with stand-in values. The toolbar popup has the
per-site toggle, Quick Redact and Local Insights; everything else is on the
options page ([Configuration](#configuration)).

Unpacked extensions don't update automatically. To update, `git pull`, run the
steps above again from `npm ci`, then hit reload on `chrome://extensions`.

The download is big because the model runs on your machine; see
[Size](#size-and-why).

### Playground

```sh
npm ci
npm run web:dev    # http://localhost:5173
```

### As a library

```sh
npm install @discretion/core
```

See [Using the engine on its own](#using-the-engine-on-its-own).

## Supported sites

`chatgpt.com`, `claude.ai`, `gemini.google.com`. Exactly these three, in
`host_permissions`, and nothing else. Quick Redact covers every other
destination without widening that list, which is the point.

## Known limitations

### What it doesn't protect

- **Attachments.** Files, images and screenshots are not inspected.
- **Other applications.** Anything you send from your email client or Slack is
  untouched unless you put it through Quick Redact first.
- **What you type, before you send it.** The site's own JavaScript can read the
  composer as you type. Only what you *send* is masked.
- **Everything.** Detection misses things. `GENERIC_SECRET` recall is 55.4% and
  is printed here rather than rounded away. Read the review panel.
- **The sites themselves.** This protects what you send *to* them; it is not a
  defence against the service you are deliberately talking to.
- **Two send paths.** If page script submits a form with `form.submit()`, no
  event fires, so the extension never sees it. Clicks on a send button the
  site adapter doesn't recognise aren't checked either. See ARCHITECTURE.md
  D57–D57b and D63.

It is not a certified security product and carries no compliance guarantee.

### Other limitations

- It's not on the Chrome Web Store, so there are no automatic updates (see
  [Install and run](#install-and-run)).
- The UI is English only until the other eight languages are reviewed (see
  [Languages](#languages)).
- A site redesign can break things. Each site has an adapter that finds the
  message box and the send button. If the adapter can't find the message box
  anymore, sending is blocked with a warning. If the send button changes,
  clicks on the new button aren't checked.
- Loading the model takes 7.4–8.4 s, once. After that, checking a
  2,000-character paste took between about 205 ms and 691 ms (p50) on a fast
  laptop, depending on the benchmark, and nobody knows yet why the two numbers
  differ. Expect it to be slower on an average laptop (see
  [Performance](#performance)).
- It takes about 364 MB once installed, almost all of it the model (see
  [Size](#size-and-why)).
- The accuracy numbers come from a synthetic test set, so real-world accuracy
  will be different and probably lower (see
  [Detection quality](#detection-quality)).
- The accessibility tree has been audited, but nobody has tried it with a
  screen reader (NVDA, VoiceOver or Orca) yet.

## How this was built

I built Discretion with a lot of help from Claude Code, Anthropic's AI coding
agent. The models I used over the course of the project were Claude Opus 4.8,
Opus 5, Fable 5 and Sonnet 5.

My part was picking the problem and making the product and design decisions,
such as dropping the original homomorphic encryption design in favour of local
masking, making it a consumer browser extension instead of an enterprise tool,
and choosing the name. For each milestone I wrote a rough but working
first version of the code, and I did the hands-on testing on the live sites
with my own accounts.

Claude Code debugged and enhanced that code at every milestone, and wrote most
of the documentation (including the decision log in ARCHITECTURE.md), the
commit messages and the machine translations.

### Why the commits don't credit Claude

By default, Claude Code adds a `Co-Authored-By: Claude` line to every commit it
makes, and 161 of the first 162 commits had one. In September 2026 I rewrote
the history to remove them. I see AI models as tools and assistants, not
authors. The creative work and a considerable share of the labour were mine,
and I didn't think Claude should get authorship credit for the project. Newer
commits don't have the line either, including ones made with Claude Code, so
this section is where that help is disclosed instead.

Rewriting the history changed every commit ID, which is why both npm packages
were republished as 0.1.1
([ARCHITECTURE.md D66](ARCHITECTURE.md#d66---history-rewritten-and-011-republished-so-provenance-still-resolves)).

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
file in `packages/data`, and a property test pins monotonicity — adding a
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

The options page (`chrome://extensions` → Discretion → Details → Extension
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

## Languages

There are translations for English, Spanish, German, French, Portuguese,
Turkish, Japanese, Hindi and Arabic (with right-to-left layout), but only
English ships right now.

The eight non-English translations are machine-generated and haven't been
reviewed by a native speaker. Tests check the structure (placeholders, plural
forms, no leftover English), but they can't tell whether a translation
actually means the right thing. So each language stays out of the build until
a native speaker checks its 21 safety-critical strings (review sheets are in
[`docs/translation-review/`](docs/translation-review/)). Until then, a browser
set to one of those languages gets the English UI.

Plurals go through `Intl.PluralRules` rather than a one/other pair: Arabic has
six categories and uses every one, Japanese has one, and Turkish does not mark
the plural after a numeral at all.

## Performance

SPEC.md sets the budget as **p50 under 250 ms and p95 under 600 ms for a
2000-character input on a mid-range laptop, excluding model warmup**, and
requires the measured numbers to be published here.

All numbers below come from the development laptop (Intel Core Ultra 7 258V).
It's faster than the mid-range laptop the budget assumes, so expect slower
results on typical hardware.

| path | p50 | p95 | source |
| --- | ---: | ---: | --- |
| Stages 0–3, no model (Node, native CPU) | 10.6 ms | 13.1 ms | `packages/eval` latency bench |
| Stages 0–3 + NER (Node, native CPU) | 255.8 ms | 354.9 ms | `packages/eval` latency bench |
| Extension: cold check of 2,000 characters | ~205 ms | ~452 ms | ARCHITECTURE.md D41f |
| Extension: re-check after one edit | ~104 ms | ~213 ms | ARCHITECTURE.md D41f |
| Extension: model load (once) | 7.4–8.4 s | – | ARCHITECTURE.md D41f |

The budget isn't counted as met yet. The Node run misses the p50 target by
5.8 ms. The extension run is faster, but it's also about 3× faster than the
same workload in the in-page benchmark, and nobody has found out why, so it
isn't treated as a pass. Pasting is the slow case, since none of the pasted
text is cached yet.

NER runs before the message is sent even though it's the slowest step. Running
it afterwards would let people's names through, and those are the most common
personal data in chat messages (D25).

Before trusting any latency number in this repo, run
`node bench/check-canary.mjs`. The machine sometimes gets into an unexplained
slow state, and numbers taken during it aren't valid (D27a).

The full write-up (browser runtimes, why WebGPU was dropped, why the NER window
stays at 400 characters, and the budget analysis) is in
[BENCHMARKS.md](BENCHMARKS.md#latency-against-the-spec-budget).

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
| **Next** | Native-speaker review of the eight machine-translated languages so they can ship. |
| **Then** | The unrecognised-button send path (ARCHITECTURE.md D57b). The obvious fix would also catch the *stop* button, because "no send button found" is also true the whole time a response is streaming, so it needs care. The `form.submit()` path can't be closed without injecting script into the page's main world, which this extension won't do. |
| **Then** | `GENERIC_SECRET` recall, the weakest published number in the project. |

## Using the engine on its own

The detection and masking engine is a standalone library, independent of the
extension. It has no DOM dependency, no Node built-in dependency, and makes no
network requests.

```js
import { protect, restore } from '@discretion/core';

const result = await protect('Wire it to DE44500105175407324931.');
// result.maskedText   -> a different, checksum-valid IBAN
// result.entities     -> what was found, with calibrated confidence
// restore(reply, result.vault) -> the originals back

```

Full guide, including the fail-closed contract a caller has to honour:
[`packages/core/README.md`](packages/core/README.md). Generated API reference:
[`docs/api/`](docs/api/). Version policy: [`VERSIONING.md`](VERSIONING.md).

It's on npm: `npm install @discretion/core`.
`npm run verify:consumer` packs the real tarballs, installs them into an empty
project outside this repository, and runs the documented examples against
them.

## Reading the repository

| file | what it is for |
| --- | --- |
| `SPEC.md` | Authoritative for design. Everything else answers to it. |
| `ARCHITECTURE.md` | Every non-obvious judgement call, with the reasoning and the measurement behind it. Long, and the interesting parts are the ones that record being wrong. |
| `BENCHMARKS.md` | Model selection, methodology, per-language results. Every number measured, none asserted. |
| `SECURITY.md` | The guarantees, how to verify each yourself, and the disclosure process. |
| `PERMISSIONS.md` | One justification per permission, written when the reasoning was fresh. |
| `ADAPTER-VERIFICATION.md` | What the offline fixtures can and cannot tell you about a live site. |
| `DEVELOPMENT.md` | Conventions, open issues and known pitfalls for working on the code. |
| `STORE-LISTING.md` | Draft Chrome Web Store listing (not submitted). |

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
npm run generate -w @discretion/data
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

MIT — see [LICENSE](LICENSE). `@discretion/core` and `@discretion/data` are
published to npm. The other workspace packages are marked `"private": true`
because they aren't published; that has nothing to do with the license.

The bundled Unicode data is redistributed under the Unicode License v3; the
required copyright and permission notice is reproduced in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
