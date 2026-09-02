[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / complement

# Function: complement()

> **complement**(`sum`, `modulus`): `number`

Defined in: [packages/core/src/checksums/weighted.ts:106](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/weighted.ts#L106)

The common "complement" closing rule: `(modulus − (sum mod modulus)) mod
modulus`.

Extracted because getting the outer `mod` wrong is the classic bug — when
the remainder is 0 the complement must be 0, not `modulus`.

## Parameters

### sum

`number`

### modulus

`number`

## Returns

`number`
