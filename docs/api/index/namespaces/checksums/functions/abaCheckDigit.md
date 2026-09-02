[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / abaCheckDigit

# Function: abaCheckDigit()

> **abaCheckDigit**(`payload`): `number` \| `null`

Defined in: [packages/core/src/checksums/aba.ts:37](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/aba.ts#L37)

The final ABA check digit for the first eight digits of a routing number.
Returns `null` if the payload is not exactly eight digits.

## Parameters

### payload

`string`

## Returns

`number` \| `null`
