[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / luhnValid

# Function: luhnValid()

> **luhnValid**(`value`): `boolean`

Defined in: [packages/core/src/checksums/luhn.ts:26](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/luhn.ts#L26)

Validate a digit string against Luhn.

`value` must already be stripped of separators and contain only ASCII
digits; anything else returns `false`. A single digit is rejected: a
one-character "identifier" carries no payload, and accepting "0" would make
every scheme that closes with Luhn match a bare zero.

## Parameters

### value

`string`

## Returns

`boolean`
