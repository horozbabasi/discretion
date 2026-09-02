[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mrzCharValue

# Function: mrzCharValue()

> **mrzCharValue**(`ch`): `number` \| `null`

Defined in: [packages/core/src/checksums/icao9303.ts:19](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/icao9303.ts#L19)

Character value under the MRZ scheme: digits are themselves, letters are
10 + their alphabet position, '<' is 0. Returns null for anything else.

## Parameters

### ch

`string`

## Returns

`number` \| `null`
