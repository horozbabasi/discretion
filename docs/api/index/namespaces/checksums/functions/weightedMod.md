[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / weightedMod

# Function: weightedMod()

> **weightedMod**(`digits`, `weights`, `modulus`): `number` \| `null`

Defined in: [packages/core/src/checksums/weighted.ts:48](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/weighted.ts#L48)

Σ(digitᵢ × weightᵢ) mod `modulus`.

Returns `null` on a weight/digit length mismatch or a non-positive modulus.

## Parameters

### digits

readonly `number`[]

### weights

readonly `number`[]

### modulus

`number`

## Returns

`number` \| `null`
