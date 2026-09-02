[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / foldDigits

# Function: foldDigits()

> **foldDigits**(`text`): [`TransformStepResult`](../interfaces/TransformStepResult.md) \| `null`

Defined in: [packages/core/src/transforms/foldDigits.ts:95](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/transforms/foldDigits.ts#L95)

Fold every non-ASCII decimal digit to ASCII.

Most blocks are BMP and fold one code unit to one, leaving offsets
untouched. A few are astral (Osmanya, Brahmi, mathematical digits) and fold
a surrogate PAIR to a single character, so this is not a 1:1 transform and
goes through `MappedTextBuilder` rather than assuming equal lengths — the
same machinery NFKC's expansions use.

## Parameters

### text

`string`

## Returns

[`TransformStepResult`](../interfaces/TransformStepResult.md) \| `null`
