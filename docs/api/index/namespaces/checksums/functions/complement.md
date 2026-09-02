[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / complement

# Function: complement()

> **complement**(`sum`, `modulus`): `number`

Defined in: [packages/core/src/checksums/weighted.ts:106](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/weighted.ts#L106)

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
