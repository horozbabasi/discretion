[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / modString

# Function: modString()

> **modString**(`numeric`, `modulus`): `number` \| `null`

Defined in: [packages/core/src/checksums/mod97.ts:28](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/mod97.ts#L28)

Remainder of a decimal string modulo `modulus`, for arbitrarily long input.

Processes at most 13 new digits per step. The running remainder is below
`modulus` (≤ 97 here, but the bound holds for any modulus under 10^4), so
`remainder × 10^13 + chunk` stays well under Number.MAX_SAFE_INTEGER.

Returns `null` if the string is empty or contains a non-digit.

## Parameters

### numeric

`string`

### modulus

`number`

## Returns

`number` \| `null`
