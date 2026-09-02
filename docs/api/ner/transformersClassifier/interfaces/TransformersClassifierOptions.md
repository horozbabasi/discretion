[**@privacyshield/core**](../../../README.md)

***

[@privacyshield/core](../../../README.md) / [ner/transformersClassifier](../README.md) / TransformersClassifierOptions

# Interface: TransformersClassifierOptions

Defined in: [packages/core/src/ner/transformersClassifier.ts:22](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L22)

## Properties

### allowRemoteModels?

> `readonly` `optional` **allowRemoteModels?**: `boolean`

Defined in: [packages/core/src/ner/transformersClassifier.ts:30](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L30)

Allow downloading missing models. Build-time tooling ONLY.

***

### cacheDir?

> `readonly` `optional` **cacheDir?**: `string`

Defined in: [packages/core/src/ner/transformersClassifier.ts:28](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L28)

Where model files live (bundle dir in production, cache in tooling).

***

### dtype?

> `readonly` `optional` **dtype?**: `string`

Defined in: [packages/core/src/ner/transformersClassifier.ts:26](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L26)

Weight precision: 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | ….

***

### id?

> `readonly` `optional` **id?**: `string`

Defined in: [packages/core/src/ner/transformersClassifier.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L39)

Short id for candidate metadata; defaults to model@dtype.

***

### maxInputChars?

> `readonly` `optional` **maxInputChars?**: `number`

Defined in: [packages/core/src/ner/transformersClassifier.ts:45](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L45)

Per-window character budget. Default 400: the models' 512-token limit
divided by the worst-case one-token-per-character ratio (CJK), with
headroom for specials and subword expansion of unusual codepoints.

***

### model

> `readonly` **model**: `string`

Defined in: [packages/core/src/ner/transformersClassifier.ts:24](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L24)

HF repo id, e.g. 'Xenova/distilbert-base-multilingual-cased-ner-hrl'.

***

### revision?

> `readonly` `optional` **revision?**: `string`

Defined in: [packages/core/src/ner/transformersClassifier.ts:37](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/transformersClassifier.ts#L37)

Pinned repo revision (commit hash). HF commits are content-addressed,
so a pinned revision pins the exact model bytes — the integrity story
for build-time bundling. Default 'main' is acceptable only in
exploratory tooling.
