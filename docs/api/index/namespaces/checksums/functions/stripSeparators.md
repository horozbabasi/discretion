[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / stripSeparators

# Function: stripSeparators()

> **stripSeparators**(`value`, `separators?`): `string`

Defined in: [packages/core/src/checksums/digits.ts:42](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/digits.ts#L42)

Remove every character in `separators` from `value`.

Identifiers are routinely written with grouping punctuation (`4111 1111
1111 1111`, `123-45-6789`, `AB-12-CD`). Detectors strip before validating
and keep the raw span for offset reporting.

## Parameters

### value

`string`

### separators?

`string` = ' \t-.–—/'

## Returns

`string`
