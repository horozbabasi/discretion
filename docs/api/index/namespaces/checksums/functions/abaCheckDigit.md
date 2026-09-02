[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / abaCheckDigit

# Function: abaCheckDigit()

> **abaCheckDigit**(`payload`): `number` \| `null`

Defined in: [packages/core/src/checksums/aba.ts:37](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/aba.ts#L37)

The final ABA check digit for the first eight digits of a routing number.
Returns `null` if the payload is not exactly eight digits.

## Parameters

### payload

`string`

## Returns

`number` \| `null`
