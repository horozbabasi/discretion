[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / isRepdigit

# Function: isRepdigit()

> **isRepdigit**(`digits`): `boolean`

Defined in: [packages/core/src/checksums/digits.ts:101](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/digits.ts#L101)

True when every digit is identical ("0000000000", "1111111111").

Repdigits pass several national checksums by construction (a weighted sum
of identical digits often lands on a valid remainder) yet are never issued.
Schemes that exclude them say so in their own validator.

## Parameters

### digits

readonly `number`[]

## Returns

`boolean`
