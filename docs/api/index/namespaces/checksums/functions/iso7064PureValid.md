[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / iso7064PureValid

# Function: iso7064PureValid()

> **iso7064PureValid**(`payloadValues`, `checkValue`, `modulus`, `radix`): `boolean`

Defined in: [packages/core/src/checksums/iso7064.ts:60](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/iso7064.ts#L60)

Verify a payload plus its check value under a pure ISO 7064 system.

The standard verification processes the payload with the multiplying
recurrence, then adds the check value once and requires a result of 1.

## Parameters

### payloadValues

readonly `number`[]

### checkValue

`number`

### modulus

`number`

### radix

`number`

## Returns

`boolean`
