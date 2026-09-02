[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / TokenClassifier

# Interface: TokenClassifier

Defined in: [packages/core/src/ner/types.ts:30](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L30)

The injected model runtime.

## Properties

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/ner/types.ts:32](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L32)

Identifies the model in candidate metadata, e.g. 'distilmbert-ner-hrl@q8'.

***

### maxInputChars

> `readonly` **maxInputChars**: `number`

Defined in: [packages/core/src/ner/types.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L39)

Safe per-call input size in CHARACTERS. Text longer than this must be
windowed by the caller: transformer runtimes silently truncate past
their token limit, and silent truncation would be silent fail-open.
The floor of one token per character (CJK) makes chars the safe unit.

## Methods

### classify()

> **classify**(`text`): `Promise`\<readonly [`TokenPrediction`](TokenPrediction.md)[]\>

Defined in: [packages/core/src/ner/types.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L41)

Classify one window of text. Pieces arrive in input order.

#### Parameters

##### text

`string`

#### Returns

`Promise`\<readonly [`TokenPrediction`](TokenPrediction.md)[]\>
