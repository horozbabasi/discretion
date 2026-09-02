[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / toNumericString

# Function: toNumericString()

> **toNumericString**(`value`): `string` \| `null`

Defined in: [packages/core/src/checksums/digits.ts:74](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/digits.ts#L74)

Expand every character of `value` to its base-36 value and concatenate the
decimal representations, the transformation IBAN mod-97 requires.

"GB82" → "161182"  (G=16, B=11, 8, 2)

Returns `null` if any character is not alphanumeric.

## Parameters

### value

`string`

## Returns

`string` \| `null`
