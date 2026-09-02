[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / luhnCheckDigit

# Function: luhnCheckDigit()

> **luhnCheckDigit**(`payload`): `number` \| `null`

Defined in: [packages/core/src/checksums/luhn.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/luhn.ts#L39)

The Luhn check digit for a payload that does NOT yet include one.

Returns `null` if the payload is not all digits. Used by the test-vector
generators — and later by M4's surrogate substitution, which must emit
replacement values that still pass the validator.

## Parameters

### payload

`string`

## Returns

`number` \| `null`
