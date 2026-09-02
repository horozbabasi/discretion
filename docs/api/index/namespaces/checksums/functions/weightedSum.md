[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / weightedSum

# Function: weightedSum()

> **weightedSum**(`digits`, `weights`): `number` \| `null`

Defined in: [packages/core/src/checksums/weighted.ts:34](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/weighted.ts#L34)

Σ(digitᵢ × weightᵢ).

Returns `null` when there are fewer weights than digits, which is always a
programming error rather than bad user input. Extra trailing weights are
ignored so a scheme can declare the full weight vector including the check
position and pass only the payload digits.

## Parameters

### digits

readonly `number`[]

### weights

readonly `number`[]

## Returns

`number` \| `null`
