[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / TokenPrediction

# Interface: TokenPrediction

Defined in: [packages/core/src/ner/types.ts:16](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L16)

One model token prediction, in input order, special tokens excluded.

## Properties

### label

> `readonly` **label**: `string`

Defined in: [packages/core/src/ner/types.ts:18](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L18)

Raw model label, e.g. 'B-PER', 'I-ORG', 'O'.

***

### piece

> `readonly` **piece**: `string`

Defined in: [packages/core/src/ner/types.ts:26](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L26)

The token's surface piece as the runtime reports it: WordPiece
continuations keep their '##' prefix; SentencePiece markers ('▁') may
or may not be present — the aligner handles both.

***

### score

> `readonly` **score**: `number`

Defined in: [packages/core/src/ner/types.ts:20](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L20)

Model softmax score for that label.
