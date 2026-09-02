[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / iso7064PureCheckValue

# Function: iso7064PureCheckValue()

> **iso7064PureCheckValue**(`values`, `modulus`, `radix`): `number`

Defined in: [packages/core/src/checksums/iso7064.ts:46](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/iso7064.ts#L46)

The check value for a payload under a pure ISO 7064 system.

Returns a number in `[0, modulus)`. Callers map it to a character according
to their scheme's alphabet (10 → 'X' for MOD 11-2, for instance).

## Parameters

### values

readonly `number`[]

### modulus

`number`

### radix

`number`

## Returns

`number`
