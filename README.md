# Discretion

**Finds passwords, keys, card numbers and ID numbers in what you type into
ChatGPT, Claude and Gemini, and masks them before you send.**

Everything runs on your device. After it's installed, the extension makes no
network requests of any kind: not for detection, not for telemetry, not to
update a word list. There's no account and nothing to sign in to.

<!-- DEMO GIF PLACEHOLDER: the review panel intercepting a send on a real
     site. Needs a signed-in session to record; see STORE-LISTING.md. -->

---

## The problem

People paste things into AI chats that they'd never post on a public forum: a
production API key while debugging, a customer's IBAN while drafting an email,
a colleague's phone number, a patient's record. Once it's sent, it's gone, and
"I'll remember not to" isn't a real safeguard.

The usual fixes have their own problems. A server-side scanner means sending
the secret to one more party. A regex blocklist misses anything it wasn't told
about and over-blocks the things it was. And an enterprise DLP appliance isn't
something an individual can install.

## What it does

1. Watches the message box on the three supported sites.
2. When you send, checks the text using validated identifiers, a local
   multilingual model for names and places, and context scoring around both.
3. Shows what it found, grouped by type, each with a calibrated confidence and
   an explanation of which evidence fired.
4. Replaces what you approve with realistic stand-ins, checks that the message
   box really contains the masked text, and only then lets the message go.
5. Puts your real values back into the reply as it streams in, so the
   conversation still reads correctly.

If it can't check, it stops the message. A detection error, a timeout or a page
layout it no longer recognises all block the send, with a message saying why.
It never treats "couldn't look" as "found nothing".

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
[Size](#size).

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

`chatgpt.com`, `claude.ai` and `gemini.google.com`. Those three are the only
entries in `host_permissions`. For anything else, Quick Redact lets you mask
text without the extension needing access to more sites.

## Known limitations

### What it doesn't protect

- Attachments: files, images and screenshots aren't checked.
- Other apps: anything you send from your email client or Slack isn't touched
  unless you run it through Quick Redact first.
- Text before you send it: the site's own JavaScript can read the message box
  while you type. Only what you send gets masked.
- Everything: detection misses things. `GENERIC_SECRET` recall is 55.4%, so
  always look at the review panel.
- The sites themselves: it protects what you send to them, but it doesn't
  protect you from the service you're choosing to talk to.
- Two send paths: if page script submits a form with `form.submit()`, no event
  fires, so the extension never sees it. Clicks on a send button the site
  adapter doesn't recognise aren't checked either. See ARCHITECTURE.md D57,
  D57a, D57b and D63.

It's not a certified security product and comes with no compliance guarantees.

### Other limitations

- It's not on the Chrome Web Store, so there are no automatic updates (see
  [Install and run](#install-and-run)).
- The UI is English only until the other eight languages are reviewed (see
  [Languages](#languages)).
- A site redesign can break things. Each site has an adapter that finds the
  message box and the send button. If the adapter can't find the message box
  anymore, sending is blocked with a warning. If the send button changes,
  clicks on the new button aren't checked.
- Loading the model takes 7.4 to 8.4 s, once. After that, checking a
  2,000-character paste took between about 205 ms and 691 ms (p50) on a fast
  laptop, depending on the benchmark, and nobody knows yet why the two numbers
  differ. Expect it to be slower on an average laptop (see
  [Performance](#performance)).
- It takes about 364 MB once installed, almost all of it the model (see
  [Size](#size)).
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
and choosing the name. For each milestone I wrote a rough but working first
version of the code, and I did the hands-on testing on the live sites with my
own accounts.

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
│ normalisation     │  offset map, so a span found in normalised text
└─────────┬─────────┘  maps back to the exact original bytes to replace.
          │            Homoglyph folding, invisible stripping, digit folding.
          ▼
┌───────────────────┐
│ Stage 1           │  113 detectors. Every identifier is validated, not
│ validated         │  just matched: Luhn for cards, mod-97 for IBAN, real
│ identifiers       │  phone parsing. A wrong checksum doesn't match.
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Stage 2  (+2b)    │  Multilingual NER for names, organisations and places,
│ local NER model   │  in an offscreen document because a content script
└─────────┬─────────┘  can't compile WebAssembly under the host page's CSP.
          │            Bundled gazetteers back it up.
          ▼
┌───────────────────┐
│ Stage 3           │  Trigger proximity, structural position and negative
│ context scoring   │  rules. "test key" or a docs example scores
└─────────┬─────────┘  differently from the same string in production text.
          │
          ▼
┌───────────────────┐
│ Stage 4           │  Overlap resolution, isotonic calibration and the
│ fusion            │  sensitivity profile's thresholds.
└─────────┬─────────┘
          │
          ▼
  review panel → masked write → verified readback → your send
```

The whole pipeline lives in `packages/core` and doesn't depend on any
particular environment, so the same code runs in the extension, the playground
and the eval harness.

## Privacy guarantees

| guarantee | how it's enforced |
| --- | --- |
| No runtime network access | `connect-src 'self'` in the manifest CSP, so the browser enforces it |
| Fail closed | Any error, timeout or element it can't resolve blocks the send |
| No plaintext persistence | Detected values live in one in-memory object per tab session and are dropped when you navigate away |
| Nothing the page can read | The injected UI is in a closed shadow root, and the panel shows entity types, never values |
| No `innerHTML` | Every node is built programmatically, and a test checks the whole tree on every commit |

### Check the zero-network claim yourself

You don't have to take this on trust. Run:

```sh
python packages/extension/scripts/verify-live-site.py
```

It asks the extension's own service worker to fetch three external origins and
records what happens. All three are refused. A same-origin control request
checks that the probe can actually tell a blocked request from an allowed one;
without it, a probe that couldn't see anything would report the same clean
result.

To check by hand, open DevTools on any supported site, filter the Network tab
to the extension's origin, and use the extension as normal.

## Detection quality

These numbers come from a seeded synthetic corpus of 2,600 documents (2,000
labelled plus 600 hard negatives, seeds `0xc0ffee` and `0xbeef`) with 6,645
ground-truth entities across 25 languages and 11 document types. To reproduce
them, run `npm run eval -- --ner jiting/xlm-roberta-base-ner-hrl_onnx --dtype q8`.

Because the corpus is synthetic, read these numbers with care. The entity
values come from generators and the sentences around them are templates, so
recall is an upper bound (the generator and the detector agree by design) and
precision is optimistic. Real text will behave differently.

### Before and after Stage 4

The eval reports Stages 0-3. The extension also runs Stage 4 (overlap
resolution and calibration), which changes the results a lot for the weakest
types. Both tables are below, since showing only the better one would be
misleading.

Stages 0-3, as the eval reports them. This covers 34 of the 35 entity types:
`DATE_OF_BIRTH` has no Stage 1 detector and no corpus coverage, so it's
available in the options page but doesn't appear here. The full table is in
`packages/eval/reports/stage2-baseline.md`.

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

What Stage 4 does to the weakest types (measured at M8; the inputs above
reproduce these figures exactly):

| type | precision | false positives | recall |
| --- | ---: | ---: | ---: |
| GENERIC_SECRET | 2.0% → **100%** | 2,075 → **0** | 56.8% → 55.4% |
| POSTAL_CODE | 23.5% → **100%** | 224 → **0** | 75.8% → 72.5% |
| URL_WITH_CREDENTIALS | 33.6% → **100%** | 140 → 0 | held |
| IP_ADDRESS | 87.8% → **100%** | 32 → 0 | held |
| NATIONAL_ID | 68.2% → **81.2%** | 268 → 112 | 100% → 98.0% |
| TAX_ID | 46.0% → **56.3%** | 149 → 80 | 100% → 91.2% |
| **all Stage 1 types** | | **2,991 → 246 (-92%)** | |

Most of that drop comes from reassigning findings rather than removing them. A
`GENERIC_SECRET` false positive is usually a real secret that a more specific
detector also matched, and overlap resolution gives it to the more specific
one.

### Known weak spots

- `GENERIC_SECRET` recall is 55.4%, so roughly two in five generic
  high-entropy secrets get missed. That's a detection gap rather than an
  overlap issue, and it's been open since M7.
- `TAX_ID` recall drops from 100% to 91.2% after fusion.
- `POSTAL_CODE` is the weakest type that ships.
- One calibration bucket is over-confident, and the mid-range has thin
  coverage.

### Per language

F1 for names, organisations and places (PERSON, ORG and LOCATION) across 25
languages:

| | best | worst | floor |
| --- | --- | --- | --- |
| F1 | uk 96.4 · ro 96.3 · nl 95.9 | ja 82.0 · hi 84.4 · ar 85.3 | no language below 82.0 |

The full table is in `packages/eval/reports/stage2-baseline.md`.

### Calibration

Confidence scores are calibrated with isotonic regression on a split that's
proven to be disjoint from the evaluation split. Expected calibration error is
2.63%, compared with 12.33% for the raw detector scores, so when the panel says
80%, it's close to 80%.

### The model

| | |
| --- | --- |
| model | `jiting/xlm-roberta-base-ner-hrl_onnx` |
| revision | `478a2a3e99ef680e4a107c80a7d0c59d51f185ae` (content-addressed, so the pin fixes the exact bytes) |
| quantization | q8, measured as lossless against fp32 on this corpus |
| weights | 265.8 MiB (`model_quantized.onnx`) plus a 16.3 MiB tokenizer |
| licence | afl-3.0, inherited from `Davlan/xlm-roberta-base-ner-hrl` |

It was picked over three alternatives because it had the best macro F1 (87.8)
and the highest per-language floor, and it also happened to be the second
fastest. DistilBERT would have saved 143 MB but cost 26 macro F1 points. The
full comparison, methodology and per-language results are in `BENCHMARKS.md`.

Every model file is checked against a recorded SHA-256 when it's downloaded, so
you get exactly the bytes the published numbers were measured on, not just
whatever the model repo serves today.

### Size

About 364 MB installed, almost all of it the model. Since the model runs on
your device, it has to be stored there. That's well under the Chrome Web
Store's 2 GB package limit, and SPEC puts accuracy ahead of size: the smaller
alternative that was measured scored 26 F1 points lower.

## The exposure score

Each message gets a score from 0 to 100, shown on the review panel and
summarised in the popup. It isn't a count. Each finding is weighted by how
severe its type is, so one private key outranks five postal codes, and the
score levels off instead of growing forever. The severity weights and the
reasoning behind them are a data file in `packages/data`, and a property test
makes sure adding a finding can never lower the score.

The popup shows the peak and the average for the session, never a sum, because
the score is 0 to 100 per message and adding scores together wouldn't mean
anything.

## Quick Redact

Quick Redact is a box in the popup. Paste any text, get it back masked, and
copy it wherever you want, like an email, a ticket or Slack. Paste the reply
back into the same box and your real values are restored.

This is how `host_permissions` can stay limited to three sites while the tool
is still useful everywhere else.

The mapping between your text and its stand-ins only lives in memory while the
popup is open, and it's gone when the popup closes. The UI tells you this where
you use it.

It follows the same fail-closed rule as the send check: if the second
detection stage didn't run, it gives you no output at all instead of a partly
masked string you might paste somewhere thinking it's safe.

## Local Insights

Local Insights counts what you've protected, by category and month.

It only stores counts: never a value, never any text, never which site, and no
timestamp more precise than a month. It keeps two years of data, and the reset
button deletes the record instead of overwriting it with zeros. The idea is to
show you that the protection is working instead of it running silently.

## Configuration

The options page (`chrome://extensions` → Discretion → Details → Extension
options) has these settings:

| | |
| --- | --- |
| Sensitivity | Minimal, Balanced or Strict. Strict catches more and asks more often. |
| Replacement style | Realistic stand-ins, or labels like `[EMAIL_1]`. |
| Per-type toggles | All 35 entity types, each with its own switch. Everything is on unless you turn it off. |
| Never / always mask | Two lists, one entry per line. They're saved on your device as you type, and the page tells you so, because a list like this can itself contain something sensitive. |
| Your own patterns | Regular expressions, with a live tester that runs the real engine. A pattern that doesn't compile is rejected right away instead of being saved in a disabled state. |
| Phone region | For numbers written without a country code. Without it, a number in national format can't be validated at all. |
| Settings file | Export and import. The file contains your two lists in plain text, and the page warns you before you save it. |

Settings save as soon as you change them, and there's no Save button on
purpose. On a privacy tool, a change that looks applied but isn't is worse than
one that saves without asking.

The popup also has a per-site toggle, which takes effect in an open tab without
reloading it.

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

Plurals go through `Intl.PluralRules` instead of a simple one/other pair:
Arabic has six plural categories and uses all of them, Japanese has one, and
Turkish doesn't mark the plural after a number at all.

## Performance

SPEC.md sets the budget at p50 under 250 ms and p95 under 600 ms for a
2,000-character input on a mid-range laptop, not counting model warmup, and
asks for the measured numbers to be published here.

All numbers below come from the development laptop (Intel Core Ultra 7 258V).
It's faster than the mid-range laptop the budget assumes, so expect slower
results on typical hardware.

| path | p50 | p95 | source |
| --- | ---: | ---: | --- |
| Stages 0-3, no model (Node, native CPU) | 10.6 ms | 13.1 ms | `packages/eval` latency bench |
| Stages 0-3 + NER (Node, native CPU) | 255.8 ms | 354.9 ms | `packages/eval` latency bench |
| Extension: cold check of 2,000 characters | ~205 ms | ~452 ms | ARCHITECTURE.md D41f |
| Extension: re-check after one edit | ~104 ms | ~213 ms | ARCHITECTURE.md D41f |
| Extension: model load (once) | 7.4 to 8.4 s | | ARCHITECTURE.md D41f |

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

## Non-goals

These are settled decisions. "Roadmap" means it could happen later if someone
deliberately picks it up; "rejected" means it won't happen.

| | | why |
| --- | --- | --- |
| Attachment and file scanning | roadmap | Intercepting files is heavy and fragile right now, so the limitation is stated clearly instead of being half implemented. |
| More chat sites | roadmap | Quick Redact already covers other sites without extra host permissions, and keeping permissions minimal is a big part of why the extension can be trusted. |
| Exporting the vault or unmask mapping | rejected | An unmask file would itself be a secret. Keeping it in memory only is intentional. |
| Accounts, sync or any cloud component | rejected | It would break the zero-network design that everything else depends on. |

## Roadmap

| | |
| --- | --- |
| **Next** | Native-speaker review of the eight machine-translated languages so they can ship. |
| **Then** | The unrecognised-button send path (ARCHITECTURE.md D57b). The obvious fix would also catch the *stop* button, because "no send button found" is also true the whole time a response is streaming, so it needs care. The `form.submit()` path can't be closed without injecting script into the page's main world, which this extension won't do. |
| **Then** | `GENERIC_SECRET` recall, the weakest published number in the project. |

## Using the engine on its own

The detection and masking engine is a standalone library that doesn't depend
on the extension. It doesn't use the DOM or Node built-ins, and it makes no
network requests.

```js
import { protect, restore } from '@discretion/core';

const result = await protect('Wire it to DE44500105175407324931.');
// result.maskedText   -> a different, checksum-valid IBAN
// result.entities     -> what was found, with calibrated confidence
// restore(reply, result.vault) -> the originals back

```

The full guide, including the fail-closed rules callers need to follow, is in
[`packages/core/README.md`](packages/core/README.md). There's also a generated
API reference in [`docs/api/`](docs/api/), and the versioning policy is in
[`VERSIONING.md`](VERSIONING.md).

It's on npm (`npm install @discretion/core`). Running
`npm run verify:consumer` packs the real tarballs, installs them into an empty
project outside this repo, and runs the documented examples against them.

## Docs in this repo

| file | what it's for |
| --- | --- |
| `SPEC.md` | The design spec. Everything else follows it. |
| `ARCHITECTURE.md` | Every non-obvious decision, with the reasoning and measurements behind it. It's long; the most useful parts are where something turned out to be wrong. |
| `BENCHMARKS.md` | Model selection, methodology, per-language results and the full latency write-up. All numbers are measured. |
| `SECURITY.md` | The guarantees, how to check each one yourself, and how to report a vulnerability. |
| `packages/extension/PERMISSIONS.md` | Why the extension needs each permission. |
| `packages/extension/ADAPTER-VERIFICATION.md` | What the offline test fixtures can and can't tell you about a live site. |
| `DEVELOPMENT.md` | Conventions, open issues and known pitfalls for working on the code. |
| `STORE-LISTING.md` | Draft Chrome Web Store listing (not submitted). |

## Development

It's a monorepo with five packages:

| package | what it is |
| --- | --- |
| `packages/core` | The detection pipeline. It doesn't depend on any environment (`"types": []`, and eslint bans DOM and Node globals in it), so the same code runs in the extension, the playground and the eval harness. |
| `packages/data` | Data tables the engine uses: Unicode confusables, trigger lexicons, gazetteers, severity weights and the fitted calibration model. Committed to the repo. |
| `packages/eval` | Seeded corpus, hard negatives, metrics, error analysis and regression gates. |
| `packages/extension` | The Chrome MV3 extension. |
| `packages/web` | The playground, for trying things out before installing. |

The library supports Node 20 and later (see `engines`). For development, use
the version pinned in `.nvmrc` (24.18.0).

```sh
npm install
npm run build      # tsc project-references build
npm test           # vitest (unit + property + fuzz)
npm run lint
npm run bench      # normalization throughput benchmark
```

### Regenerating the Unicode confusables table

`packages/data/src/confusables.ts` is generated and committed, so neither the
build nor anything at runtime touches the network. You only regenerate it
occasionally, on purpose:

```bash
npm run generate -w @discretion/data
```

This downloads
<https://www.unicode.org/Public/security/latest/confusables.txt> and needs Node
22.6 or later for native TypeScript type stripping (the `.nvmrc` version is
fine; Node 20 isn't). To use a different source, set `CONFUSABLES_URL`, for
example to a numbered version directory once Unicode publishes one for this
release, or to a local file if you're offline.

The generated module records the Unicode version and the SHA-256 of the source
file it was built from. Unicode serves the current release from `latest/`
before it publishes a numbered directory, so there's no stable versioned URL to
pin; the hash acts as the pin instead. To check whether upstream has changed,
re-run the generator and compare `CONFUSABLES_SOURCE_SHA256`.

## Evaluation

`npm run eval` builds a seeded synthetic corpus (25 languages, 11 document
types, plus hard negatives) and writes the Stage 1 baseline to
`packages/eval/reports/baseline.md`. Minimum accuracy per type is set in
`packages/eval/gates.config.json`, and a regression test checks it on every
`npm test` run, so a change that makes accuracy worse fails the build.

Keep in mind the corpus is synthetic. Entity values come from generators, the
sentences are templates, and the hard negatives are built from fixed
categories. The numbers measure the detectors against this corpus, not
real-world text, so treat them as an upper bound on recall (the generators and
detectors agree by design) and a rough, optimistic guide to precision.
Real-world results will differ. Stage 3 context scoring and Stage 4 fusion are
what turn the raw detector numbers into the shipped ones, and the two tables in
[Detection quality](#detection-quality) show both.

## Licensing

MIT, see [LICENSE](LICENSE). `@discretion/core` and `@discretion/data` are
published to npm. The other workspace packages are marked `"private": true`
because they aren't published; that has nothing to do with the license.

The bundled Unicode data is redistributed under the Unicode License v3, and the
required copyright and permission notice is in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
