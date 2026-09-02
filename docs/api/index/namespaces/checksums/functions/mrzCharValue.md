[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mrzCharValue

# Function: mrzCharValue()

> **mrzCharValue**(`ch`): `number` \| `null`

Defined in: [packages/core/src/checksums/icao9303.ts:19](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/icao9303.ts#L19)

Character value under the MRZ scheme: digits are themselves, letters are
10 + their alphabet position, '<' is 0. Returns null for anything else.

## Parameters

### ch

`string`

## Returns

`number` \| `null`
