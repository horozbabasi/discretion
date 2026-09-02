[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / NerEngine

# Class: NerEngine

Defined in: [packages/core/src/ner/engine.ts:41](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/engine.ts#L41)

What Stage 2 needs from whatever performs recognition.

An interface rather than the concrete `NerEngine` because the engine may not
be in the same PROCESS as the pipeline. The extension runs the model in an
offscreen document - a content script cannot compile WebAssembly under the
host page's policy - so its Stage 2 is a proxy that forwards `recognize`
across a message port and returns the spans that come back.

Declared here, next to the span it returns, so that `runStage2` and
`detect` can name it without importing `engine.ts`. That matters: engine.ts
pulls in Stage 2b and therefore the gazetteers, and a value import of it
from the pipeline would link 3.4 MB of Bloom filters into every bundle that
runs detection, including the one that has no model at all.

## Implements

- [`NerRecognizer`](../interfaces/NerRecognizer.md)

## Constructors

### Constructor

> **new NerEngine**(`classifier`, `options?`): `NerEngine`

Defined in: [packages/core/src/ner/engine.ts:48](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/engine.ts#L48)

#### Parameters

##### classifier

[`TokenClassifier`](../interfaces/TokenClassifier.md)

##### options?

[`NerEngineOptions`](../interfaces/NerEngineOptions.md) = `{}`

#### Returns

`NerEngine`

## Accessors

### id

#### Get Signature

> **get** **id**(): `string`

Defined in: [packages/core/src/ner/engine.ts:55](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/engine.ts#L55)

Model identity, recorded on every candidate this produces.

##### Returns

`string`

Model identity, recorded on every candidate this produces.

#### Implementation of

[`NerRecognizer`](../interfaces/NerRecognizer.md).[`id`](../interfaces/NerRecognizer.md#id)

## Methods

### recognize()

> **recognize**(`text`, `cache?`): `Promise`\<[`NerSpan`](../interfaces/NerSpan.md)[]\>

Defined in: [packages/core/src/ner/engine.ts:77](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/engine.ts#L77)

Recognize entities in (normalized) `text`.

`cache` is passed IN rather than owned here because its keys are the
user's text: it must live and die with one session, and this engine is
shared across every session in the process. See chunkCache.ts.

#### Parameters

##### text

`string`

##### cache?

[`ChunkCache`](ChunkCache.md)

#### Returns

`Promise`\<[`NerSpan`](../interfaces/NerSpan.md)[]\>

#### Implementation of

[`NerRecognizer`](../interfaces/NerRecognizer.md).[`recognize`](../interfaces/NerRecognizer.md#recognize)

***

### warmup()

> **warmup**(): `Promise`\<`void`\>

Defined in: [packages/core/src/ner/engine.ts:60](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/engine.ts#L60)

One tiny inference so model init cost is paid before first real use.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`NerRecognizer`](../interfaces/NerRecognizer.md).[`warmup`](../interfaces/NerRecognizer.md#warmup)
