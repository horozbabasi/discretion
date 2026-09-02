[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / NerRecognizer

# Interface: NerRecognizer

Defined in: [packages/core/src/ner/types.ts:82](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L82)

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

## Properties

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/ner/types.ts:84](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L84)

Model identity, recorded on every candidate this produces.

## Methods

### recognize()

> **recognize**(`text`): `Promise`\<[`NerSpan`](NerSpan.md)[]\>

Defined in: [packages/core/src/ner/types.ts:88](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L88)

Spans in the given text's own coordinates.

#### Parameters

##### text

`string`

#### Returns

`Promise`\<[`NerSpan`](NerSpan.md)[]\>

***

### warmup()

> **warmup**(): `Promise`\<`void`\>

Defined in: [packages/core/src/ner/types.ts:86](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L86)

Pay initialization cost before first real use.

#### Returns

`Promise`\<`void`\>
