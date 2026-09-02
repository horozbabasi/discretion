[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / decodeEntities

# Function: decodeEntities()

> **decodeEntities**(`text`, `predictions`, `aligned`): [`NerSpan`](../interfaces/NerSpan.md)[]

Defined in: [packages/core/src/ner/merge.ts:57](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/merge.ts#L57)

Decode predictions + aligned spans into merged entity spans.

## Parameters

### text

`string`

### predictions

readonly [`TokenPrediction`](../interfaces/TokenPrediction.md)[]

### aligned

readonly [`AlignedPiece`](../interfaces/AlignedPiece.md)[]

## Returns

[`NerSpan`](../interfaces/NerSpan.md)[]
