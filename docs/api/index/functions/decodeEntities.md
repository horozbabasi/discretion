[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / decodeEntities

# Function: decodeEntities()

> **decodeEntities**(`text`, `predictions`, `aligned`): [`NerSpan`](../interfaces/NerSpan.md)[]

Defined in: [packages/core/src/ner/merge.ts:57](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/merge.ts#L57)

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
