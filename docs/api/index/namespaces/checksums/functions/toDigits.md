[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / toDigits

# Function: toDigits()

> **toDigits**(`value`): `number`[] \| `null`

Defined in: [packages/core/src/checksums/digits.ts:24](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/digits.ts#L24)

Parse a string of ASCII digits into numeric digit values.

Returns `null` if the string is empty or contains any non-digit character.
Deliberately rejects non-ASCII digits (Arabic-Indic ٤, fullwidth ４, …):
Stage 0 normalization already folds fullwidth forms to ASCII, and a
genuinely non-ASCII digit run is not an identifier in any scheme we
validate.

## Parameters

### value

`string`

## Returns

`number`[] \| `null`
