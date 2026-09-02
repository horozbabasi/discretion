[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / weightedSum

# Function: weightedSum()

> **weightedSum**(`digits`, `weights`): `number` \| `null`

Defined in: [packages/core/src/checksums/weighted.ts:34](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/weighted.ts#L34)

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
