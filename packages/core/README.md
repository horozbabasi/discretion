# @privacyshield/core

Finds sensitive values in text — credentials, card and bank numbers, national
and tax IDs, contact details, names — and replaces them with realistic
stand-ins you can reverse later.

It runs entirely in-process. **The package makes no network requests**, has no
DOM dependency and no Node built-in dependency, so the same code runs in
Node, a browser, a worker, Deno or Bun.

```bash
npm install @privacyshield/core
```

---

## Quick start

```js
import { protect, restore } from '@privacyshield/core';

const message = 'Wire it to DE44500105175407324931 and use key sk_live_7f3Kq2mNpX8vC1bWzR4tY6.';

const result = await protect(message, { seed: 42 });

console.log(result.maskedText);
// Wire it to DE47770612720573428586 and use key AIzauyqgh8Oh57cbKOykXCGFCF3tvgjsKhc_kVd.

console.log(result.entities.map((e) => `${e.type} -> ${e.surrogate}`));
// [ 'IBAN -> DE47770612720573428586', 'API_KEY -> AIzauyqgh8Oh57cbKOykXCGFCF3tvgjsKhc_kVd' ]

// Send result.maskedText wherever it needs to go. When the reply comes back:
console.log(restore(result.maskedText, result.vault).restoredText === message);
// true
```

The surrogates are **format-preserving**: an IBAN is replaced by a different
IBAN that passes the same checksum, a card number by a card number that passes
Luhn. Text that had to look like an IBAN downstream still does.

The output above is what this actually prints with `seed: 42`. Drop the seed
and the stand-ins differ every run.

---

## What it detects

113 detectors across 34 entity types, in ten families: secrets, financial,
identity, health, document, contact, person, location, network, other.

Identifiers are **validated, not pattern-matched**. A card number must pass
Luhn, an IBAN must pass mod-97, a national ID must pass its own country's
check digit, a phone number must parse as a real number in some region. Then
the surrounding text is scored, so `sk_test_...` in a code fence is treated
differently from the same shape in a sentence about production.

```js
import { detectableEntityTypes } from '@privacyshield/core';

console.log(detectableEntityTypes().length); // 34
```

Confidence is **calibrated against a held-out set**, so 0.8 means roughly 80%
— expected calibration error 2.63%, against 12.33% for the raw scores. Full
per-type precision and recall are in
[BENCHMARKS.md](https://github.com/horozbabasi/privacyshield/blob/main/BENCHMARKS.md),
including the types that do badly.

---

## It fails closed, and that is your contract too

If a detector throws or detection times out, `protect()` **rejects**. It does
not return an empty result.

That is deliberate and it is the single most important thing to get right when
you integrate it:

```js
// WRONG. This turns every failure into "nothing sensitive here".
let result;
try {
  result = await protect(message);
} catch {
  result = { maskedText: message, entities: [] }; // ← now you send the original
}

// RIGHT. Not being able to check is not the same as having checked.
const result = await protect(message); // let it throw, and stop
```

Being unable to look is not evidence that there was nothing to find. If you
cannot mask, do not send.

---

## Reversing it

`protect()` returns the `vault` that holds the originals. `restore()` needs it.

```js
import { protect, restore, Vault } from '@privacyshield/core';

// One vault across a whole conversation, so a value seen twice gets the same
// stand-in and a reply mentioning it can still be restored.
const vault = new Vault();

const first = await protect('My IBAN is DE44500105175407324931.', { vault });
const second = await protect('Again: DE44500105175407324931', { vault });
console.log(first.entities[0].surrogate === second.entities[0].surrogate); // true

const reply = `Received ${first.entities[0].surrogate}, thanks.`;
console.log(restore(reply, vault).restoredText);
// Received DE44500105175407324931, thanks.
```

The vault holds plaintext originals **in memory**. Do not serialise it to
disk, a database, or a log. If you keep one per user session, clear it when
the session ends.

For streamed responses use the `Restorer` class, which buffers across chunk
boundaries so a surrogate split between two chunks is still replaced:

```js
import { Restorer } from '@privacyshield/core';

const restorer = new Restorer(vault);
for await (const chunk of stream) process.stdout.write(restorer.push(chunk));
process.stdout.write(restorer.finish()); // the tail - do not drop it
```

---

## Choosing what gets reported

Three profiles, differing in which families they cover and how much confidence
they demand:

```js
await protect(message, { profile: 'minimal' });  // secrets and financial only
await protect(message, { profile: 'balanced' }); // default
await protect(message, { profile: 'strict' });   // adds health, location, orgs, dates
```

Finer control:

```js
await protect(message, {
  // Never report these exact values; always report those.
  lists: { allow: ['support@example.com'], deny: ['Project Gemstone'] },

  // Turn individual types off.
  typeAllowed: (type) => type !== 'PERSON',

  // Needed for identifiers that are ambiguous without a country. A phone
  // number in national form cannot be validated at all without this - it is
  // not a confidence penalty, the detector reports nothing.
  defaultRegion: 'DE',

  // '[EMAIL_1]' style instead of realistic stand-ins.
  mode: 'token',

  // Fixed seed makes the run reproducible.
  seed: 42,
});
```

A type excluded by `typeAllowed` is **not masked** — it is not reported and
not replaced. That is the honest consequence of switching it off.

---

## Names, organisations and places (optional)

Stages 0, 1, 3 and 4 run with no model. Recognising *names* needs Stage 2, a
multilingual transformer that this package does **not** depend on, because it
pulls in the ONNX runtime — over 200 MB — and most callers do not need it.

```bash
npm install @huggingface/transformers   # only if you want Stage 2
```

```js
import { protect, NerEngine } from '@privacyshield/core';
import { createTransformersClassifier } from '@privacyshield/core/ner-transformers';

const classifier = await createTransformersClassifier({
  model: 'jiting/xlm-roberta-base-ner-hrl_onnx',
  dtype: 'q8',
  cacheDir: './models',
  // Leave false in production and bundle the weights yourself. `protect()`
  // never reaches the network; this flag is the one place the TOOLING can.
  allowRemoteModels: false,
});

const ner = new NerEngine(classifier, { timeBudgetMs: 5_000 });
await ner.warmup();

const result = await protect(message, { ner });
console.log(result.stagesRun.includes('stage2-ner')); // true
```

`stagesRun` is derived from what actually ran, not declared. If it does not
contain `'stage2-ner'`, names were not looked for — check it rather than
assuming.

Per-language F1 ranges from 82.0 (Japanese) to 96.4 (Ukrainian) across 25
languages; the model weights are not shipped in this package.

---

## Adding your own detector

Adding one is a single object. It joins the same validation, context scoring
and fusion as the built-ins.

```js
import { registerDetector, CONFIDENCE, GLOBAL_REGION, valid, invalid } from '@privacyshield/core';

registerDetector({
  id: 'acme-employee-id',
  entityType: 'NATIONAL_ID',
  regions: [GLOBAL_REGION],
  pattern: /\bACME-\d{7}\b/gu,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Acme internal employee number.',
  validate: ({ match }) => {
    const digits = match[0].slice('ACME-'.length);
    const sum = [...digits].reduce((acc, d) => acc + Number(d), 0);
    return sum % 7 === 0 ? valid({ confidence: CONFIDENCE.MAXIMUM }) : invalid('checksum');
  },
});
```

**`ctx.text` is the whole normalized document, not the matched substring.** The
match is `ctx.match[0]`, or `ctx.text.slice(ctx.start, ctx.end)`. Slicing
`ctx.text` as though it were the match is the easiest mistake to make here, and
it fails quietly: the validator rejects everything and the detector simply
never reports.

`entityType` must be an existing `EntityType`; the union is closed so that
profiles, severity weights and surrogate strategies stay total. Values of a
type with no format-preserving generator fall back to a bracket token
(`[NATIONAL_ID_1]`) rather than an invented stand-in.

---

## Working with offsets

`protect()` handles this for you. If you use the lower-level stages, the rule
matters: detection runs on **normalized** text (invisible characters stripped,
NFKC applied, homoglyphs folded), and offsets into it are not offsets into
your original string.

```js
import { normalize, runStage1, mapNormalizedSpan } from '@privacyshield/core';

const normalization = normalize(original);
for (const candidate of runStage1(normalization, {})) {
  // Widens correctly when a span lands inside an NFKC expansion. Never index
  // the offset map directly for a range.
  const [start, end] = mapNormalizedSpan(normalization, candidate.start, candidate.end);
  console.log(original.slice(start, end));
}
```

`ProtectedEntity.originalStart` / `originalEnd` are already in the original
string's coordinates.

---

## What it will not do

- **It misses things.** `GENERIC_SECRET` recall is 55.4%; `TAX_ID` is 91.2%.
  It is a safety net, not a guarantee, and it is not a compliance control.
- **It flags harmless things.** Review before acting on it in anything
  automated.
- **It does not read files, images or PDFs.** Text in, text out.
- **It does not do structured redaction of documents** — no PDF or DOCX
  rewriting, no bounding boxes.
- **It has no server component and never will.** There is nothing to
  configure, no key, no account, and no request to block at your firewall.

The measured numbers behind all of this, including where it does badly, are
published in
[BENCHMARKS.md](https://github.com/horozbabasi/privacyshield/blob/main/BENCHMARKS.md).
Nothing above is asserted without a measurement behind it.

---

## Performance

On the reference machine, Stages 0–3 over a 2 KB document: **p50 10.6 ms**.
With Stage 2 enabled: **p50 255.8 ms**, almost all of it inference.

Measured with a machine-health canary that marks a run degraded when the
machine itself is slow, so published figures are not compared against numbers
taken under load. See
[BENCHMARKS.md](https://github.com/horozbabasi/privacyshield/blob/main/BENCHMARKS.md).

---

## API surface and stability

`protect()` is the supported entry point. Every pipeline stage is also
exported for callers who want one — `normalize`, `runStage1`, `detect`,
`resolveOverlaps`, `calibrate`, `decide`, `maskOriginal`, `computeExposure`.

`mask()` is **not** a smaller `protect()`. It runs Stage 1 only, with no
context scoring, calibration or profile decision. It exists for the Stage-1
baseline in the evaluation harness.

Versioning policy, including what 0.x means here:
[VERSIONING.md](https://github.com/horozbabasi/privacyshield/blob/main/VERSIONING.md).

## Licence

MIT. Unicode data under the Unicode licence — see `THIRD_PARTY_NOTICES.md` in
`@privacyshield/data`.
