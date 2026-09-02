[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / ibanCheckDigits

# Function: ibanCheckDigits()

> **ibanCheckDigits**(`countryCode`, `bban`): `string` \| `null`

Defined in: [packages/core/src/checksums/mod97.ts:71](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/mod97.ts#L71)

The two IBAN check digits for a country code and BBAN with no check digits
yet. Returns a zero-padded two-character string, or `null` on bad input.

Used by the test-vector generators and, from M4, by IBAN surrogate
substitution — SPEC.md requires a substituted IBAN to have a "valid
checksum, same country".

## Parameters

### countryCode

`string`

### bban

`string`

## Returns

`string` \| `null`
