[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / weightedMod

# Function: weightedMod()

> **weightedMod**(`digits`, `weights`, `modulus`): `number` \| `null`

Defined in: [packages/core/src/checksums/weighted.ts:48](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/weighted.ts#L48)

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
