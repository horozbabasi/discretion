[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / isRepdigit

# Function: isRepdigit()

> **isRepdigit**(`digits`): `boolean`

Defined in: [packages/core/src/checksums/digits.ts:101](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/digits.ts#L101)

True when every digit is identical ("0000000000", "1111111111").

Repdigits pass several national checksums by construction (a weighted sum
of identical digits often lands on a valid remainder) yet are never issued.
Schemes that exclude them say so in their own validator.

## Parameters

### digits

readonly `number`[]

## Returns

`boolean`
